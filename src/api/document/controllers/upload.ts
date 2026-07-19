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
 * Multipart contract (sent by the frontend's Server Action):
 *   - file field `file` (exactly one, PDF only)
 *   - body fields `category` (a `document-category` documentId), `title`,
 *     `uploaded_by_name`, `uploaded_by_email`
 *
 * All validations below are defensive: the frontend Server Action already
 * checks extension/size/category permissions before it ever reaches here,
 * but this endpoint is a public auth-scoped route and must not trust the
 * caller.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_TITLE_LENGTH = 200;
const MAX_NAME_LENGTH = 255;
const PDF_MAGIC_BYTES = Buffer.from('%PDF-', 'ascii');
const ROOT_FOLDER_NAME = 'Documents';

// Same tolerance level as the site-user email check (lib/env.ts on the
// frontend and the signIn callback are the actual domain authorities) —
// this only rejects obvious garbage before it hits the entity validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type UploadFolder = { id: number };

function badRequest(ctx: any, error: string, message: string) {
  ctx.status = 400;
  ctx.body = { ok: false, error, message };
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
 * thing into memory — enough for a magic-bytes check on a file that could
 * be up to 15 MB.
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

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async upload(ctx: any) {
    try {
      const body = (ctx.request.body ?? {}) as Record<string, unknown>;

      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const categoryDocumentId = typeof body.category === 'string' ? body.category.trim() : '';
      const uploadedByName =
        typeof body.uploaded_by_name === 'string'
          ? body.uploaded_by_name.trim().slice(0, MAX_NAME_LENGTH)
          : '';
      const uploadedByEmail =
        typeof body.uploaded_by_email === 'string' ? body.uploaded_by_email.trim() : '';

      if (!title || title.length > MAX_TITLE_LENGTH) {
        return badRequest(
          ctx,
          'invalid_title',
          'title is required and must be at most 200 characters'
        );
      }

      if (!categoryDocumentId) {
        return badRequest(ctx, 'invalid_category', 'category is required');
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

      // Defense in depth: the frontend Server Action (which holds the
      // session) is the real gatekeeper for who may upload, but this route
      // is auth-scoped, not session-scoped, so it re-checks the category
      // itself never accepts uploads at all.
      if (!category.upload_enabled) {
        return badRequest(
          ctx,
          'upload_not_enabled',
          'this category does not accept uploads'
        );
      }

      const filesInput = ctx.request.files?.file;
      const files: KoaFile[] = Array.isArray(filesInput) ? filesInput : filesInput ? [filesInput] : [];

      if (files.length !== 1) {
        return badRequest(
          ctx,
          'invalid_file_count',
          'exactly one file must be uploaded under the "file" field'
        );
      }

      const file = files[0];
      const originalName = file.originalFilename ?? '';
      const ext = path.extname(originalName).toLowerCase();

      if (ext !== '.pdf') {
        return badRequest(ctx, 'invalid_extension', 'file must have a .pdf extension');
      }

      if (file.mimetype !== 'application/pdf') {
        return badRequest(ctx, 'invalid_mime_type', 'file must have MIME type application/pdf');
      }

      if (typeof file.size !== 'number' || file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
        return badRequest(
          ctx,
          'file_too_large',
          'file must be a non-empty PDF no larger than 15 MB'
        );
      }

      const magic = await readMagicBytes(file.filepath, PDF_MAGIC_BYTES.length);
      if (!magic.equals(PDF_MAGIC_BYTES)) {
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
      strapi.log.error('[document.upload] Unexpected failure', error as Error);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'internal_error' };
    }
  },
});
