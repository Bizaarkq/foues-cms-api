/**
 * `document-upload-ticket.issue.issue` controller
 *
 * Issues a short-lived, single-use upload ticket. This is the piece that
 * moves session/role validation to the Next.js side of the direct-upload
 * contract: the frontend calls this endpoint (holding the site user's
 * session) once it has confirmed the user may upload to the requested
 * category, then hands the returned `ticket` to the browser, which POSTs
 * the file straight to this CMS's public `POST /documents/upload/:ticket`
 * route (see `src/api/document/controllers/upload.ts`) — no Next.js hop in
 * the middle for the file bytes themselves.
 *
 * This endpoint is auth-scoped (`DOCUMENT_TOKEN`), but the JSON body itself
 * is NOT authoritative — it travels from the frontend's
 * `app/api/documents/upload-ticket/route.ts` route handler, which is
 * trusted for holding the session, but not for the shape of the data it
 * forwards, so every field is defensively validated here exactly like
 * `document/controllers/upload.ts` already does for the same fields.
 */

import { randomBytes } from 'node:crypto';
import type { Core } from '@strapi/strapi';

const MAX_TITLE_LENGTH = 200;
const MAX_NAME_LENGTH = 255;

// 60 minutes, not 10: the 500 MB size ceiling (see
// docs/document-repository.md → "Configurable parameters") means a large
// file on a slow connection can legitimately take a while to finish
// uploading, and the ticket must still be valid (not yet expired) by the
// time `redeemTicket()` runs — which only happens AFTER formidable has
// fully streamed the body to a temp file. Rough math: a 500 MB file needs
// ~10 minutes at ~7 Mbps; 60 minutes covers connections down to
// ~1.2 Mbps. See docs/document-repository.md → "Known v1 gaps" for the
// residual gap below that speed.
const TICKET_TTL_MS = 60 * 60_000;
const STALE_TICKET_AGE_MS = 60 * 60_000; // 1 hour past expiry

// Same tolerance level as document/controllers/upload.ts's own check — this
// only rejects obvious garbage before it hits the entity validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DocumentCategory = {
  id: number;
  documentId: string;
  slug: string;
  upload_enabled: boolean;
};

function badRequest(ctx: any, error: string, message: string) {
  ctx.status = 400;
  ctx.body = { ok: false, error, message };
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async issue(ctx: any) {
    try {
      const body = (ctx.request.body ?? {}) as Record<string, unknown>;

      const categoryDocumentId = typeof body.category === 'string' ? body.category.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const uploadedByName =
        typeof body.uploaded_by_name === 'string'
          ? body.uploaded_by_name.trim().slice(0, MAX_NAME_LENGTH)
          : '';
      const uploadedByEmail =
        typeof body.uploaded_by_email === 'string' ? body.uploaded_by_email.trim() : '';

      if (!categoryDocumentId) {
        return badRequest(ctx, 'invalid_category', 'category is required');
      }

      if (!title || title.length > MAX_TITLE_LENGTH) {
        return badRequest(
          ctx,
          'invalid_title',
          'title is required and must be at most 200 characters'
        );
      }

      if (uploadedByEmail && !EMAIL_RE.test(uploadedByEmail)) {
        return badRequest(ctx, 'invalid_email', 'uploaded_by_email must be a valid email address');
      }

      const category = (await strapi
        .documents('api::document-category.document-category')
        .findOne({ documentId: categoryDocumentId })) as DocumentCategory | null;

      if (!category) {
        return badRequest(
          ctx,
          'category_not_found',
          'category does not resolve to an existing document category'
        );
      }

      if (!category.upload_enabled) {
        return badRequest(ctx, 'upload_not_enabled', 'this category does not accept uploads');
      }

      const ticket = randomBytes(16).toString('base64url');
      const expiresAt = new Date(Date.now() + TICKET_TTL_MS);

      await strapi.documents('api::document-upload-ticket.document-upload-ticket').create({
        data: {
          ticket,
          category: { connect: [{ documentId: category.documentId }] },
          title,
          uploaded_by_name: uploadedByName || undefined,
          uploaded_by_email: uploadedByEmail || undefined,
          expires_at: expiresAt,
          used: false,
        } as any,
      });

      // Opportunistic lazy cleanup instead of a scheduled job: this project
      // has no cron/scheduled-job infrastructure, and ticket rows are cheap
      // enough (small, short-lived) that piggybacking a cleanup sweep on
      // every issuance call keeps the table bounded without adding new
      // moving parts. Failure here must never fail or delay the response —
      // a missed sweep just means stale rows linger until the next call.
      try {
        await strapi.db.query('api::document-upload-ticket.document-upload-ticket').deleteMany({
          where: { expires_at: { $lt: new Date(Date.now() - STALE_TICKET_AGE_MS) } },
        });
      } catch (cleanupError) {
        strapi.log.warn(
          '[document-upload-ticket.issue] stale ticket cleanup failed',
          cleanupError as Error
        );
      }

      ctx.status = 200;
      ctx.body = { ok: true, ticket, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      strapi.log.error('[document-upload-ticket.issue] Unexpected failure', error as Error);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'internal_error' };
    }
  },
});
