/**
 * conversion service — async PDF-to-image pipeline for magazine issues.
 *
 * conversionWrites is a module-level Set used both as an in-flight guard
 * (prevents duplicate jobs) and as a write-allowlist checked by lifecycles.ts
 * to let the pipeline bypass the system-managed field strip.
 */

import type { Core } from '@strapi/strapi';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Tracks documentIds whose pipeline is currently writing pages/conversionStatus. */
export const conversionWrites = new Set<string>();

const FOLDER_MODEL = 'plugin::upload.folder';

async function getOrCreateFolder(
  name: string,
  parentId: number | null,
): Promise<{ id: number; path: string }> {
  const where: Record<string, unknown> = { name };
  if (parentId) {
    where.parent = { id: parentId };
  } else {
    where.$or = [{ parent: null }, { parent: { id: { $null: true } } }];
  }

  const existing = await strapi.db.query(FOLDER_MODEL).findOne({ where });
  if (existing) return existing;

  const folderService = strapi.plugin('upload').service('folder') as any;
  return folderService.create({ name, parent: parentId });
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async convert(documentId: string): Promise<void> {
    if (conversionWrites.has(documentId)) {
      strapi.log.warn(`[conversion] Job already in-flight for ${documentId}, skipping`);
      return;
    }

    conversionWrites.add(documentId);
    let tmpDir: string | null = null;

    try {
      // 1. Create isolated temp directory
      tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'magazine-'));

      // 2. Fetch draft issue with pdf relation and existing pages
      const issue = await strapi
        .documents('api::magazine-issue.magazine-issue')
        .findOne({ documentId, populate: ['pdf', 'pages'], status: 'draft' });

      if (!issue) {
        strapi.log.warn(`[conversion] Issue ${documentId} not found, skipping`);
        return;
      }

      const pdfFile = (issue as any).pdf as { id: number; url: string; name: string } | null;
      if (!pdfFile) {
        strapi.log.warn(`[conversion] Issue ${documentId} has no PDF, skipping`);
        return;
      }

      // 3. Resolve PDF on disk (local upload provider)
      const pdfUrl = pdfFile.url.startsWith('/') ? pdfFile.url.slice(1) : pdfFile.url;
      const pdfDiskPath = path.join(strapi.dirs.static.public, pdfUrl);
      const outPrefix = path.join(tmpDir, 'page');

      // 4. Render all pages via pdftoppm — no shell, 150 DPI, JPEG q=85
      await execFileAsync(
        'pdftoppm',
        ['-jpeg', '-r', '150', '-jpegopt', 'quality=85', pdfDiskPath, outPrefix],
        { timeout: 300_000 }
      );

      // 5. Collect and sort output files numerically
      const allFiles = await fs.promises.readdir(tmpDir);
      const pageFiles = allFiles
        .filter((f) => /^page-?\d+\.jpg$/i.test(f))
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10);
          const numB = parseInt(b.replace(/\D/g, ''), 10);
          return numA - numB;
        });

      if (pageFiles.length === 0) {
        throw new Error('[conversion] pdftoppm produced no output files');
      }

      // 6. Ensure folder structure: magazines → {slug} → pages
      const uploadService = strapi.plugin('upload').service('upload') as any;
      const slug = ((issue as any).slug as string) ?? documentId;

      const magazinesFolder = await getOrCreateFolder('magazines', null);
      const issueFolder = await getOrCreateFolder(slug, magazinesFolder.id);
      const pagesFolder = await getOrCreateFolder('pages', issueFolder.id);

      const uploadedIds: number[] = [];

      for (let i = 0; i < pageFiles.length; i++) {
        const pageFileName = pageFiles[i];
        const filePath = path.join(tmpDir, pageFileName);
        const stat = await fs.promises.stat(filePath);
        const paddedNum = String(i + 1).padStart(3, '0');
        const name = `${slug}-page-${paddedNum}.jpg`;

        const result: any[] = await uploadService.upload({
          data: {
            fileInfo: {
              name,
              alternativeText: name,
              caption: '',
              folder: pagesFolder.id,
            },
          },
          files: [
            {
              filepath: filePath,
              originalFilename: name,
              mimetype: 'image/jpeg',
              size: stat.size,
              newFilename: name,
              hashAlgorithm: false,
              hash: null,
              toJSON: () => ({}),
            },
          ],
        });

        const uploaded = Array.isArray(result) ? result[0] : result;
        if (uploaded?.id) {
          uploadedIds.push(uploaded.id as number);
        }
      }

      if (uploadedIds.length === 0) {
        throw new Error('[conversion] No pages were successfully uploaded');
      }

      // 6b. Move the source PDF into the issue folder
      try {
        await uploadService.updateFileInfo(pdfFile.id, { folder: issueFolder.id });
      } catch (movePdfErr) {
        strapi.log.warn(`[conversion] Could not move PDF to issue folder:`, movePdfErr);
      }

      // 7. Capture old page file IDs before overwriting
      const existingPages = (issue as any).pages;
      const oldPageIds: number[] = Array.isArray(existingPages)
        ? existingPages.map((p: any) => p.id as number).filter(Boolean)
        : [];

      // 8. Link pages + set ready via query engine (bypasses lifecycle stripping)
      const UID = 'api::magazine-issue.magazine-issue' as const;

      const draftRow = await strapi.db.query(UID).findOne({
        where: { documentId, publishedAt: null },
        select: ['id'],
      });

      if (!draftRow) {
        throw new Error(`[conversion] Draft row not found for documentId=${documentId}`);
      }

      await strapi.db.query(UID).update({
        where: { id: draftRow.id },
        data: { conversionStatus: 'ready', pages: uploadedIds },
      });

      // Verify the update took effect
      const verify = await strapi.db.query(UID).findOne({
        where: { id: draftRow.id },
        select: ['id', 'conversionStatus'],
      });
      strapi.log.info(
        `[conversion] ${documentId} row=${draftRow.id} → status=${verify?.conversionStatus} (${uploadedIds.length} pages)`
      );

      // 9. Publish-sync: if a published row exists, re-publish to propagate pages/status
      try {
        const publishedIssue = await strapi
          .documents(UID)
          .findOne({ documentId, status: 'published' });

        if (publishedIssue) {
          await strapi.documents(UID).publish({ documentId });
        }
      } catch (publishErr) {
        strapi.log.warn(
          `[conversion] Publish-sync failed for ${documentId} — pages are linked, status is ready:`,
          publishErr
        );
      }

      // 10. Delete old page files AFTER new pages are successfully linked
      for (const oldId of oldPageIds) {
        try {
          const oldFile = await uploadService.findOne(oldId);
          if (oldFile) {
            await uploadService.remove(oldFile);
          }
        } catch (removeErr) {
          strapi.log.warn(`[conversion] Could not remove old page file id=${oldId}:`, removeErr);
        }
      }
    } catch (err) {
      strapi.log.error(`[conversion] Conversion failed for ${documentId}:`, err);

      try {
        await strapi.db.query('api::magazine-issue.magazine-issue' as const).update({
          where: { documentId, publishedAt: null },
          data: { conversionStatus: 'failed' },
        });
      } catch (updateErr) {
        strapi.log.error(
          `[conversion] Could not set failed status for ${documentId}:`,
          updateErr
        );
      }
    } finally {
      conversionWrites.delete(documentId);

      if (tmpDir) {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch {
          // Cleanup failure is non-fatal
        }
      }
    }
  },
});
