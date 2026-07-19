/**
 * `upload-ticket-gate` middleware
 *
 * Anti-DoS gate in front of the public, ticket-redeeming
 * `POST /api/documents/upload/:ticket` route
 * (`src/api/document/controllers/upload.ts`). Without this middleware, an
 * ANONYMOUS client could send a well-formed multipart request carrying a
 * bogus, already-used, or expired ticket and force `strapi::body`
 * (formidable) to stream the ENTIRE request body — up to the 510 MB
 * formidable cap — to a temp file before the controller ever gets a chance
 * to reject it. That's a cheap way to burn disk I/O and temp-disk space on
 * an unauthenticated endpoint, repeatedly, for free.
 *
 * Two-gate design — read this before touching either half:
 *   - THIS middleware is the DoS gate. It runs BEFORE `strapi::body` ever
 *     parses a byte of the multipart body (global middlewares run, in
 *     array order, before the router dispatches to a controller — and
 *     `strapi::body` is itself one of these global middlewares — so
 *     placing this one earlier in `config/middlewares.ts`'s array
 *     guarantees it runs first; the same ordering fact
 *     `src/middlewares/document-access.ts` already relies on). It rejects
 *     an oversized Content-Length outright, and does a READ-ONLY
 *     pre-check of the ticket (missing/used/expired) — it deliberately
 *     does NOT redeem/burn the ticket itself.
 *   - The controller's atomic compare-and-swap (`redeemTicket()` in
 *     `src/api/document/controllers/upload.ts`) remains the CORRECTNESS
 *     gate — it's the only place a ticket is actually burned. Two
 *     concurrent requests carrying the same valid ticket both pass THIS
 *     middleware's pre-check (neither has burned it yet, so both look
 *     valid at that instant); exactly one of them then wins the
 *     controller's atomic redemption. That's expected, not a bug: this
 *     middleware only needs to keep formidable from running against an
 *     obviously-dead ticket, not to enforce single-use — the controller
 *     already guarantees that correctly.
 *
 * A small in-memory negative cache (for the ticket pre-check) was
 * considered and skipped on purpose: the pre-check is one indexed query
 * against a small, short-lived table (see `document-upload-ticket`'s
 * `deleteMany` sweep in `issue.ts`), so it's already cheap — adding a
 * cache here would just be complexity without a measurable win.
 */

import type { Core } from '@strapi/strapi';

// Only this one public, ticket-redeeming route — everything else is left to
// `next()` untouched. Base64url charset (`randomBytes(16).toString('base64url')`
// in `document-upload-ticket/controllers/issue.ts`): letters, digits, `-`, `_`.
const UPLOAD_PATH_RE = /^\/api\/documents\/upload\/([A-Za-z0-9_-]+)$/;

// Mirrors config/middlewares.ts's `strapi::body` -> `formidable.maxFileSize`
// (510 MB = 500 MB content ceiling + ~10 MB cushion for the multipart
// envelope). Keep these two constants in lockstep — see
// docs/document-repository.md -> "Configurable parameters" for the full
// ceiling chain this is one link of.
const MAX_CONTENT_LENGTH_BYTES = 510 * 1024 * 1024;

type UploadTicketRow = {
  used: boolean;
  expires_at: string | Date;
};

function invalidTicketResponse(ctx: any) {
  // Same shape and same "don't distinguish missing/used/expired" posture as
  // `invalidTicket()` in the controller — this is a pre-check for the exact
  // same credential, so it must not leak more than the controller already
  // refuses to.
  ctx.status = 404;
  ctx.body = {
    ok: false,
    error: 'invalid_ticket',
    message: 'unknown, used or expired upload ticket',
  };
}

export default (_config: Record<string, unknown>, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'POST') return next();

    const match = UPLOAD_PATH_RE.exec(ctx.path);
    if (!match) return next();

    const ticket = match[1];

    // --- Content-Length early gate — BEFORE any body handling. ---
    const contentLengthHeader = ctx.get('content-length');
    if (!contentLengthHeader) {
      ctx.status = 411;
      ctx.body = {
        ok: false,
        error: 'length_required',
        message: 'Content-Length header is required',
      };
      return;
    }

    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      ctx.status = 411;
      ctx.body = {
        ok: false,
        error: 'length_required',
        message: 'Content-Length header is invalid',
      };
      return;
    }

    if (contentLength > MAX_CONTENT_LENGTH_BYTES) {
      ctx.status = 413;
      ctx.body = { ok: false, error: 'file_too_large' };
      return;
    }

    // --- Ticket pre-check (read-only — see file header). ---
    try {
      const row = (await strapi.db
        .query('api::document-upload-ticket.document-upload-ticket')
        .findOne({ where: { ticket } })) as UploadTicketRow | null;

      if (!row || row.used || new Date(row.expires_at).getTime() <= Date.now()) {
        return invalidTicketResponse(ctx);
      }
    } catch (error) {
      // Fail CLOSED, not open — same posture as document-access.ts: a DB
      // error means we cannot vouch for the ticket, so deny rather than let
      // formidable run against an unverified credential.
      strapi.log.error(
        '[upload-ticket-gate] Ticket pre-check failed — denying request',
        error as Error
      );
      return invalidTicketResponse(ctx);
    }

    return next();
  };
};
