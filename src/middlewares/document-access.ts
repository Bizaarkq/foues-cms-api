/**
 * `document-access` middleware
 *
 * Gates reads of media files stored under the "Documents" root folder (and
 * its subfolders) in the media library. Everything else served from
 * `/uploads/` (images, magazine PDFs/pages, etc.) is left untouched — this
 * middleware only cares about the tree rooted at that one folder.
 *
 * Stage 1: the frontend is the only intended caller of protected files, via
 * a server-side download proxy that attaches `x-document-access-secret`
 * (never exposed to the browser). A request without a matching header gets
 * a plain 404 — never a 403 — so the existence of restricted documents is
 * not revealed to unauthorized callers.
 */

import type { Core } from '@strapi/strapi';
import path from 'node:path';
import crypto from 'node:crypto';

// Root-folder lookup rarely changes, so it keeps the original 5-minute TTL.
const ROOT_FOLDER_CACHE_TTL_MS = 5 * 60 * 1000;

// Split decision TTLs: a file moved INTO the Documents tree must lose its
// cached "unprotected" status quickly so it doesn't stay downloadable
// without the secret (confidentiality window) — "protected" decisions are
// safe to cache longer since a false-protected result only costs an extra
// (still-guarded) round-trip, never a leak.
const UNPROTECTED_DECISION_TTL_MS = 60 * 1000;
const PROTECTED_DECISION_TTL_MS = 5 * 60 * 1000;

const MAX_URL_CACHE_SIZE = 500;

type UrlCacheEntry = {
  protectedFile: boolean;
  expiresAt: number;
};

// URL -> "is this file under the Documents root" decision. Avoids a DB
// lookup per request for files that get requested repeatedly (PDF viewers
// re-fetch pages, browsers retry, etc.).
const urlCache = new Map<string, UrlCacheEntry>();

// The root folder rarely changes, so its resolution (and the "it doesn't
// exist yet" result) is cached separately from per-file decisions.
let rootFolderCache: { path: string | null; expiresAt: number } | null = null;

function getCachedDecision(url: string): boolean | undefined {
  const entry = urlCache.get(url);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    urlCache.delete(url);
    return undefined;
  }

  // Touch-on-hit: delete + re-set so Map insertion order approximates LRU
  // instead of FIFO — hot, repeatedly-requested entries stop being evicted
  // first just because they were cached earliest.
  urlCache.delete(url);
  urlCache.set(url, entry);

  return entry.protectedFile;
}

function setCachedDecision(url: string, protectedFile: boolean): void {
  if (urlCache.size >= MAX_URL_CACHE_SIZE) {
    // Map preserves insertion order — the first key is the oldest entry.
    const oldestKey = urlCache.keys().next().value;
    if (oldestKey !== undefined) urlCache.delete(oldestKey);
  }

  const ttl = protectedFile ? PROTECTED_DECISION_TTL_MS : UNPROTECTED_DECISION_TTL_MS;
  urlCache.set(url, { protectedFile, expiresAt: Date.now() + ttl });
}

async function resolveRootFolderPath(strapi: Core.Strapi): Promise<string | null> {
  if (rootFolderCache && rootFolderCache.expiresAt > Date.now()) {
    return rootFolderCache.path;
  }

  const root = (await strapi.db.query('plugin::upload.folder').findOne({
    where: { name: 'Documents', parent: null },
  })) as { path: string } | null;

  rootFolderCache = { path: root?.path ?? null, expiresAt: Date.now() + ROOT_FOLDER_CACHE_TTL_MS };
  return rootFolderCache.path;
}

/**
 * Constant-time secret comparison. Hashing both values first (fixed-length
 * digests) avoids `timingSafeEqual`'s length-mismatch throw and the length
 * information a raw string compare or bare timingSafeEqual could leak.
 */
function secretsMatch(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export default (_config: Record<string, unknown>, { strapi }: { strapi: Core.Strapi }) => {
  if (!process.env.DOCUMENT_ACCESS_SECRET) {
    strapi.log.warn(
      '[document-access] DOCUMENT_ACCESS_SECRET is not set — protected document downloads will be denied (404) until it is configured.'
    );
  }

  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return next();
    if (!ctx.path.startsWith('/uploads/')) return next();

    // `ctx.path` keeps whatever percent-encoding the request arrived with —
    // `plugin::upload.file.url` is stored decoded, so match on the decoded
    // form. Then normalize it: koa-static (which serves the file later)
    // normalizes paths like `/uploads//x.pdf`, `/uploads/./x.pdf`, or
    // `/uploads/%2e/x.pdf`, but a raw string-equality DB lookup on the
    // undecoded form would miss the match on these and fall through to
    // `next()`, still serving the protected file. Normalizing first closes
    // that bypass, and the normalized form is also used as the cache key.
    const decoded = decodeURIComponent(ctx.path);
    const requestedUrl = path.posix.normalize(decoded);

    if (requestedUrl.includes('..') || !requestedUrl.startsWith('/uploads/')) {
      // Fail closed on non-canonical paths rather than trying to resolve them.
      ctx.status = 404;
      return;
    }

    try {
      let isProtected = getCachedDecision(requestedUrl);

      if (isProtected === undefined) {
        const file = (await strapi.db.query('plugin::upload.file').findOne({
          where: { url: requestedUrl },
        })) as { folderPath?: string | null } | null;

        if (!file) {
          // Not a row Strapi's media library knows about — nothing to guard.
          return next();
        }

        const rootPath = await resolveRootFolderPath(strapi);

        if (!rootPath) {
          // "Documents" root doesn't exist yet (migration not run) — nothing
          // has been placed under protection.
          return next();
        }

        isProtected =
          file.folderPath === rootPath || (file.folderPath?.startsWith(`${rootPath}/`) ?? false);

        setCachedDecision(requestedUrl, isProtected);
      }

      if (!isProtected) return next();

      const secret = process.env.DOCUMENT_ACCESS_SECRET;
      const header = ctx.get('x-document-access-secret');

      if (typeof secret === 'string' && secret.length > 0 && secretsMatch(header, secret)) {
        return next();
      }

      // 404, not 403/401 — don't reveal that a restricted file exists at this URL.
      ctx.status = 404;
      return;
    } catch (error) {
      // Fail CLOSED, not open: a DB error means we cannot tell whether this
      // file lives under the protected root, so `return next()` here would
      // risk serving a restricted document to an unauthenticated request.
      // Deny instead and let the error surface in logs for investigation.
      strapi.log.error('[document-access] Lookup failed — denying request', error as Error);
      ctx.status = 404;
      return;
    }
  };
};
