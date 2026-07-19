/**
 * `document.upload.upload` controller
 *
 * Stage 2 of the document repository: lets an authenticated site user
 * (session held by the Next.js frontend) upload a PDF straight into the
 * protected "Documents" media-library tree, under a per-category subfolder.
 *
 * This deliberately bypasses the stock content-API `POST /api/upload`
 * route: that route force-assigns every uploaded file to Strapi's built-in
 * "API Uploads" folder and ignores `fileInfo.folder` entirely, so a file
 * uploaded through it can never land inside (or under) the protected
 * "Documents" root — see the stage 2 gotcha in
 * `docs/document-repository.md`. Calling
 * `strapi.plugin('upload').service('upload').upload()` directly is the only
 * way to control the destination folder.
 *
 * Request contract (one-time-ticket direct upload — the browser now POSTs
 * straight to this CMS, bypassing the Next.js frontend entirely for the
 * file bytes; see `docs/document-repository.md` → "Site uploads"):
 *   - route param `:ticket` — an opaque, single-use, 10-minute-TTL ticket
 *     previously issued by `POST /documents/upload-tickets`
 *     (`api::document-upload-ticket.issue.issue`) while the frontend held
 *     the site user's session. The ticket IS the credential: redeeming it
 *     atomically (see `redeemTicket` below) is this controller's first
 *     step, and category/title/uploader identity all come from the
 *     redeemed ticket entity — nothing about them is read from this
 *     request itself anymore.
 *   - multipart file field `file` (exactly one, PDF only), parsed here by
 *     the CMS's formidable-backed `strapi::body` middleware (streamed to a
 *     temp file, never buffered whole — see config/middlewares.ts).
 *
 * All validations below are defensive: the frontend already checks
 * extension/size/category permissions before it ever issues a ticket, but
 * this endpoint is PUBLIC (the ticket is the only gate) and must not trust
 * the caller.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

// Hard ceiling. Uploads go straight from the browser to this CMS now (the
// ticket-based direct-upload flow — see the file header), so this CMS-side
// clamp — together with the `upload-ticket-gate` middleware's Content-Length
// check, formidable's `maxFileSize` (config/middlewares.ts), and the reverse
// proxy's `client_max_body_size` — is the real ceiling chain; the frontend
// never touches the file bytes at all anymore, so it cannot cap this lower.
// See docs/document-repository.md → "Configurable parameters".
const MAX_UPLOAD_MB_FALLBACK = 15;
const MAX_UPLOAD_MB_MIN = 1;
const MAX_UPLOAD_MB_MAX = 500;
const MAX_NAME_LENGTH = 255;
const PDF_MAGIC_BYTES = Buffer.from('%PDF-', 'ascii');
const ROOT_FOLDER_NAME = 'Documents';

// Module-level guards so a sustained misconfiguration (missing entry, or a
// persistently failing read) logs once instead of once per upload request —
// the upload endpoint can see meaningful traffic and this must not spam the
// logs. Reset on the next successful read so a real recovery is observable
// again if it later regresses.
let hasLoggedMissingSiteSetting = false;
let hasLoggedSiteSettingReadError = false;

/**
 * Resolves the effective max upload size (in MB) from the `site-setting`
 * single type, clamped to [1, 500]. Falls back to the safe default of 15 MB
 * whenever the single type has no entry yet or the read fails for any
 * reason — a config-read failure must never fail the upload itself.
 */
async function resolveMaxUploadMb(strapi: Core.Strapi): Promise<number> {
  try {
    const setting = (await strapi
      .documents('api::site-setting.site-setting')
      .findFirst()) as { max_upload_mb?: number } | null;

    if (!setting || typeof setting.max_upload_mb !== 'number') {
      if (!hasLoggedMissingSiteSetting) {
        strapi.log.debug(
          '[document.upload] site-setting has no entry yet — falling back to the default ' +
            `${MAX_UPLOAD_MB_FALLBACK} MB upload limit`
        );
        hasLoggedMissingSiteSetting = true;
      }
      return MAX_UPLOAD_MB_FALLBACK;
    }

    hasLoggedMissingSiteSetting = false;
    hasLoggedSiteSettingReadError = false;
    return Math.min(MAX_UPLOAD_MB_MAX, Math.max(MAX_UPLOAD_MB_MIN, setting.max_upload_mb));
  } catch (error) {
    if (!hasLoggedSiteSettingReadError) {
      strapi.log.warn(
        '[document.upload] failed to read site-setting for max_upload_mb — falling back to ' +
          `the default ${MAX_UPLOAD_MB_FALLBACK} MB upload limit`,
        error as Error
      );
      hasLoggedSiteSettingReadError = true;
    }
    return MAX_UPLOAD_MB_FALLBACK;
  }
}

type KoaFile = {
  filepath: string;
  originalFilename?: string | null;
  mimetype?: string | null;
  size: number;
};

type DocumentCategory = {
  id: number;
  documentId: string;
  slug: string;
  upload_enabled: boolean;
  requires_approval: boolean;
};

type UploadTicketEntity = {
  id: number;
  ticket: string;
  title: string | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  category: DocumentCategory | null;
};

type UploadFolder = { id: number };

function badRequest(ctx: any, error: string, message: string) {
  ctx.status = 400;
  ctx.body = { ok: false, error, message };
}

/**
 * Deliberately generic: a request whose ticket is missing, already used, or
 * expired all collapse to this same 404 shape — distinguishing them would
 * leak which case it was to a caller probing ticket strings.
 */
function invalidTicket(ctx: any) {
  ctx.status = 404;
  ctx.body = {
    ok: false,
    error: 'invalid_ticket',
    message: 'this upload ticket is missing, already used, or expired',
  };
}

/**
 * Atomically redeems (burns) a ticket: exactly one concurrent request for
 * the same ticket string may succeed.
 *
 * This bypasses `strapi.db.query(uid).update({ where, data })` (the
 * entity-manager's high-level update) on purpose — that call is NOT a
 * compare-and-swap primitive even though it looks like one. Verified
 * against `@strapi/database@5.41.1`'s entity-manager source
 * (`dist/entity-manager/index.js`): its `update()` runs
 * `SELECT * WHERE <where> LIMIT 1` first, and if that finds a row, the
 * actual `UPDATE` that follows is re-scoped to `.where({ id: <that row's
 * id> })` only — NOT re-scoped to the rest of the original `where` clause
 * (e.g. `used: false`) a second time. Two concurrent requests for the same
 * ticket can both pass the initial SELECT (neither has written yet) and
 * both then successfully UPDATE by id — a read-then-write race, not an
 * atomic conditional update. That would not guarantee "exactly one
 * concurrent request proceeds," which is a hard requirement for a
 * single-use credential.
 *
 * Instead, this runs a single raw SQL
 * `UPDATE ... WHERE ticket = ? AND used = false AND expires_at > ?`
 * directly through `strapi.db.connection` (knex) — the same low-level
 * approach `src/api/site-user/controllers/track-login.ts` already uses in
 * this codebase for its own atomicity requirement. A single UPDATE
 * statement is itself atomic at the database level, so no transaction
 * wrapper is needed here (unlike track-login.ts's insert+link, which is
 * two statements). Future maintainers: do NOT "simplify" this back to
 * `strapi.db.query().update()` — see above.
 */
async function redeemTicket(strapi: Core.Strapi, ticket: string): Promise<boolean> {
  const meta = strapi.db.metadata.get(
    'api::document-upload-ticket.document-upload-ticket'
  ) as unknown as { tableName: string; attributes: Record<string, { columnName: string }> };
  const col = (attr: string) => meta.attributes[attr].columnName;
  const knex = strapi.db.connection as any;
  const now = new Date();

  // Every dialect this project depends on resolves a plain `.update()`
  // (no `.returning()`) to a numeric affected-row count — verified against
  // knex@3.0.1's own dialect sources: MySQL/mysql2's
  // `lib/dialects/mysql/index.js`'s `processResponse` returns
  // `rows.affectedRows`; Postgres's `lib/dialects/postgres/index.js`
  // returns `resp.rowCount` for an `UPDATE`/`DELETE` command when no
  // `returning` was requested; SQLite's `lib/dialects/sqlite3/index.js`
  // returns `ctx.changes` for the `update` method under the same
  // condition. `.returning()` is only needed to get ROW DATA back (e.g. the
  // updated columns) — not to get the count this function relies on.
  const affectedRows = (await knex(meta.tableName)
    .where(col('ticket'), ticket)
    .andWhere(col('used'), false)
    .andWhere(col('expires_at'), '>', now)
    .update({ [col('used')]: true, updated_at: now })) as number;

  return affectedRows === 1;
}

/**
 * Finds an upload folder by its find-criteria, creating it if missing.
 *
 * Handles the concurrent-first-upload race: two requests can both find no
 * existing folder and both call `folderService.create()` for the same
 * (name, parent) pair; the loser gets a unique-constraint error from the
 * DB. On create failure, re-run `findOne` — if the folder now exists (the
 * other request won the race) use it; otherwise the failure was for some
 * other reason and is rethrown.
 */
async function findOrCreateFolder(
  strapi: Core.Strapi,
  where: Record<string, unknown>,
  createData: Record<string, unknown>
): Promise<UploadFolder> {
  const existing = (await strapi.db
    .query('plugin::upload.folder')
    .findOne({ where })) as UploadFolder | null;
  if (existing) return existing;

  const folderService = strapi.plugin('upload').service('folder');
  try {
    return (await folderService.create(createData)) as UploadFolder;
  } catch (error) {
    const retried = (await strapi.db
      .query('plugin::upload.folder')
      .findOne({ where })) as UploadFolder | null;
    if (retried) return retried;
    throw error;
  }
}

/**
 * Reads the first `length` bytes of a temp file without loading the whole
 * thing into memory — this stays cheap (a handful of bytes) regardless of
 * whether the file itself is a few KB or up to the 500 MB ceiling.
 */
async function readMagicBytes(filepath: string, length: number): Promise<Buffer> {
  const handle = await fs.open(filepath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

/**
 * Best-effort discard of a formidable temp file. Called on every rejection
 * path below that has a parsed file sitting in `os.tmpdir()`, so an
 * anonymous/rejected/failed upload never leaves a temp file behind.
 *
 * ENOENT-tolerant and safe to call more than once or on a file that was
 * never fully written — ENOENT (already gone) is swallowed silently; any
 * other error is logged at debug level only (a cleanup failure must never
 * fail the response the caller already decided on).
 *
 * NOTE on formidable/koa-body's OWN cleanup (verified by reading
 * `formidable@2.1.5`'s `src/PersistentFile.js` and `src/Formidable.js`, and
 * `koa-body@6.0.1`'s `lib/utils/parse-with-formidable.js`, from this
 * monorepo's root `node_modules`): formidable DOES auto-unlink a temp file
 * when IT detects a parse-time error (`Formidable#_error()` calls
 * `PersistentFile#destroy()`, which does `this._writeStream.destroy()` +
 * `fs.unlink(this.filepath, () => {})`) — e.g. its own `maxFileSize` cap
 * being exceeded mid-stream, or the request aborting. But once `form.parse()`
 * finishes successfully (no formidable-level error), formidable's job is
 * done and koa-body (`parse-with-formidable.js`) never touches the temp
 * file again either — neither library revisits a successfully-parsed temp
 * file once control returns to the application. Every rejection this
 * controller makes AFTER a successful parse (invalid/expired ticket,
 * disabled category, wrong extension/MIME/signature, over the
 * site-setting size limit, etc.) is exactly the gap this helper closes.
 * Calling it defensively even on paths formidable might already have
 * cleaned up (e.g. a request-abort race) is intentional belt-and-braces —
 * it costs nothing since it's a no-op when the file is already gone.
 */
async function discardTempFile(strapi: Core.Strapi, file: KoaFile | null | undefined): Promise<void> {
  if (!file?.filepath) return;
  try {
    await fs.unlink(file.filepath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    strapi.log.debug(
      `[document.upload] failed to discard temp file ${file.filepath}`,
      error as Error
    );
  }
}

async function discardParsedFiles(strapi: Core.Strapi, files: KoaFile[]): Promise<void> {
  await Promise.all(files.map((file) => discardTempFile(strapi, file)));
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async upload(ctx: any) {
    // Formidable (config/middlewares.ts's `strapi::body`) has ALREADY fully
    // parsed the incoming multipart body — including streaming any file(s)
    // to a temp path — by the time this controller runs at all: body
    // parsing is a global middleware that runs before the router ever
    // dispatches to a controller (the `upload-ticket-gate` middleware,
    // which runs even earlier, has the fuller ordering writeup). That means
    // a temp file can already exist on disk even when the ticket itself
    // turns out to be invalid, so every parsed file is captured up front —
    // outside the try block, so it's reachable from the catch-all too —
    // and discarded on every rejection path below.
    const filesInput = ctx.request.files?.file;
    const parsedFiles: KoaFile[] = Array.isArray(filesInput)
      ? filesInput
      : filesInput
        ? [filesInput]
        : [];

    try {
      const ticketParam = typeof ctx.params?.ticket === 'string' ? ctx.params.ticket.trim() : '';
      if (!ticketParam) {
        await discardParsedFiles(strapi, parsedFiles);
        return invalidTicket(ctx);
      }

      const redeemed = await redeemTicket(strapi, ticketParam);
      if (!redeemed) {
        await discardParsedFiles(strapi, parsedFiles);
        return invalidTicket(ctx);
      }

      // Ticket is burned. Safe to read now — we're the sole owner of this
      // ticket string, no more redemption races to worry about for it.
      const ticketEntity = (await strapi.db
        .query('api::document-upload-ticket.document-upload-ticket')
        .findOne({
          where: { ticket: ticketParam },
          populate: ['category'],
        })) as UploadTicketEntity | null;

      if (!ticketEntity || !ticketEntity.category) {
        strapi.log.error(
          `[document.upload] redeemed ticket ${ticketParam} has no matching entity/category afterward`
        );
        await discardParsedFiles(strapi, parsedFiles);
        return invalidTicket(ctx);
      }

      const category = ticketEntity.category;
      const title = ticketEntity.title ?? '';
      const uploadedByName = (ticketEntity.uploaded_by_name ?? '').slice(0, MAX_NAME_LENGTH);
      const uploadedByEmail = ticketEntity.uploaded_by_email ?? '';

      // Re-check upload_enabled at redemption time — category config may
      // have changed since issuance. The ticket is already burned; per the
      // documented burn-on-failure behavior, a failure here just means the
      // client's form issues a fresh ticket on retry.
      if (!category.upload_enabled) {
        await discardParsedFiles(strapi, parsedFiles);
        return badRequest(ctx, 'upload_not_enabled', 'this category no longer accepts uploads');
      }

      if (parsedFiles.length !== 1) {
        // Covers both the 0-file and the 2+-file case — discard whatever
        // was parsed either way.
        await discardParsedFiles(strapi, parsedFiles);
        return badRequest(
          ctx,
          'invalid_file_count',
          'exactly one file must be uploaded under the "file" field'
        );
      }

      const file = parsedFiles[0];
      const originalName = file.originalFilename ?? '';
      const ext = path.extname(originalName).toLowerCase();

      if (ext !== '.pdf') {
        await discardTempFile(strapi, file);
        return badRequest(ctx, 'invalid_extension', 'file must have a .pdf extension');
      }

      if (file.mimetype !== 'application/pdf') {
        await discardTempFile(strapi, file);
        return badRequest(ctx, 'invalid_mime_type', 'file must have MIME type application/pdf');
      }

      const maxUploadMb = await resolveMaxUploadMb(strapi);
      const maxFileSizeBytes = maxUploadMb * 1024 * 1024;

      if (typeof file.size !== 'number' || file.size <= 0 || file.size > maxFileSizeBytes) {
        await discardTempFile(strapi, file);
        badRequest(
          ctx,
          'file_too_large',
          `file must be a non-empty PDF no larger than ${maxUploadMb} MB`
        );
        // The CMS limit is authoritative and read fresh per request; expose it
        // so the frontend can show the current ceiling even if its cached
        // site-settings copy is stale.
        (ctx.body as Record<string, unknown>).limit_mb = maxUploadMb;
        return;
      }

      const magic = await readMagicBytes(file.filepath, PDF_MAGIC_BYTES.length);
      if (!magic.equals(PDF_MAGIC_BYTES)) {
        await discardTempFile(strapi, file);
        return badRequest(
          ctx,
          'invalid_file_signature',
          'file content does not look like a valid PDF'
        );
      }

      // Root "Documents" folder: created by data migration
      // 011-document-repository-folder on first boot, but re-created here
      // defensively if it was somehow removed. findOrCreateFolder handles
      // the race between two concurrent first-uploads both finding it
      // missing and both trying to create it.
      const rootFolder = await findOrCreateFolder(
        strapi,
        { name: ROOT_FOLDER_NAME, parent: null },
        { name: ROOT_FOLDER_NAME, parent: null }
      );

      // Per-category subfolder, named by the category's slug — find or
      // create it under the root (same race handling).
      const categoryFolder = await findOrCreateFolder(
        strapi,
        { name: category.slug, parent: rootFolder.id },
        { name: category.slug, parent: rootFolder.id }
      );

      const uploadService = strapi.plugin('upload').service('upload');

      // `upload()` accepts `files` as a single koa file object or an array
      // (it normalizes internally — see @strapi/upload's services/upload.js
      // `Array.isArray(files) ? files : [files]`), so the raw koa file
      // object is passed through as-is.
      const [uploadedFile] = (await uploadService.upload({
        data: {
          fileInfo: {
            name: originalName,
            folder: categoryFolder.id,
          },
        },
        files: file,
      })) as Array<{ id: number; provider?: string; formats?: Record<string, unknown> }>;

      const status = category.requires_approval ? 'draft' : 'published';

      let created: { documentId: string };
      try {
        created = await strapi.documents('api::document.document').create({
          data: {
            title,
            file: uploadedFile.id,
            category: { connect: [{ documentId: category.documentId }] },
            uploaded_by_name: uploadedByName || undefined,
            uploaded_by_email: uploadedByEmail || undefined,
          } as any,
          status,
        });
      } catch (createError) {
        // The media file was uploaded successfully but the `document` entry
        // that references it failed to be created — without cleanup this
        // leaves an orphaned file sitting in the protected "Documents" tree
        // with nothing pointing at it. Log the orphan's id and category
        // regardless of whether the compensating deletion itself succeeds,
        // so it can be found manually if needed.
        strapi.log.error(
          `[document.upload] document.create failed after media upload succeeded — ` +
            `orphaned upload file id=${uploadedFile.id}, category slug=${category.slug}`,
          createError as Error
        );
        try {
          await uploadService.remove(uploadedFile);
        } catch (cleanupError) {
          strapi.log.error(
            `[document.upload] compensating removal of orphaned upload file id=${uploadedFile.id} ` +
              `(category slug=${category.slug}) also failed — manual cleanup required`,
            cleanupError as Error
          );
        }
        ctx.status = 500;
        ctx.body = { ok: false, error: 'internal_error' };
        return;
      }

      ctx.status = 200;
      ctx.body = {
        ok: true,
        published: status === 'published',
        documentId: created.documentId,
      };
    } catch (error) {
      // Best-effort cleanup for any rejection the code above didn't already
      // reach (e.g. folder creation or `uploadService.upload()` itself
      // throwing before the media file was fully persisted) — the upload
      // service was never (successfully) reached in that case, so the temp
      // file is still ours to discard. `discardTempFile` is idempotent and
      // ENOENT-tolerant, so this is also a safe no-op on paths above that
      // already discarded the file themselves.
      await discardParsedFiles(strapi, parsedFiles);
      strapi.log.error('[document.upload] Unexpected failure', error as Error);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'internal_error' };
    }
  },
});
