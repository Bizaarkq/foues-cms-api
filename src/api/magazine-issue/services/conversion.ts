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

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Converts the PDF attached to a magazine-issue into ordered JPEG pages.
   * Must be called fire-and-forget from lifecycles (no await at call site).
   */
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

      // 6. Upload each page via the Strapi upload service
      const uploadService = strapi.plugin('upload').service('upload') as any;
      const slug = ((issue as any).slug as string) ?? documentId;
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

      // 7. Capture old page file IDs before overwriting
      const existingPages = (issue as any).pages;
      const oldPageIds: number[] = Array.isArray(existingPages)
        ? existingPages.map((p: any) => p.id as number).filter(Boolean)
        : [];

      // 8. Link ordered pages + set ready (pipeline write — guard is active)
      await strapi
        .documents('api::magazine-issue.magazine-issue')
        .update({ documentId, data: { pages: uploadedIds, conversionStatus: 'ready' } as any });

      // 9. Publish-sync: if a published row exists, re-publish to propagate pages/status.
      // Wrapped in its own try/catch: a publish failure here is non-critical because
      // pages are already linked and conversionStatus is 'ready'. The editor can
      // manually re-publish from the admin panel.
      try {
        const publishedIssue = await strapi
          .documents('api::magazine-issue.magazine-issue')
          .findOne({ documentId, status: 'published' });

        if (publishedIssue) {
          await strapi
            .documents('api::magazine-issue.magazine-issue')
            .publish({ documentId });
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

      // Set failed status — old pages remain untouched
      try {
        await strapi
          .documents('api::magazine-issue.magazine-issue')
          .update({ documentId, data: { conversionStatus: 'failed' } as any });
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
