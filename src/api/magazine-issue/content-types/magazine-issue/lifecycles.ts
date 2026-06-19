/**
 * magazine-issue lifecycles
 *
 * Responsibilities:
 *   1. Strip system-managed fields (pages, conversionStatus) from user writes.
 *   2. Detect PDF file change and set conversionStatus = 'processing' synchronously.
 *   3. Fire the async conversion job (fire-and-forget) on afterCreate / afterUpdate.
 *
 * Loop-guard strategy (three independent layers):
 *   a. conversionWrites Set on strapi global: shared with conversion service.
 *   b. Draft-row-only trigger: afterCreate/afterUpdate only fires when result.publishedAt is null.
 *   c. Publish copies PDF → triggers beforeUpdate, but conversionWrites is active → no recursion.
 */

import { getConversionWrites } from '../../services/conversion';

type LifecycleData = Record<string, unknown>;

interface BeforeCreateEvent {
  params: { data: LifecycleData };
  state: LifecycleData;
}

interface AfterCreateEvent {
  state: LifecycleData;
  result: LifecycleData;
}

interface BeforeUpdateEvent {
  params: {
    data: LifecycleData;
    documentId?: string;
    where?: Record<string, unknown>;
    locale?: string;
    status?: string;
  };
  state: LifecycleData;
}

interface AfterUpdateEvent {
  state: LifecycleData;
  result: LifecycleData;
}

export default {
  /**
   * beforeCreate — always strips system fields; sets processing if pdf is provided.
   */
  async beforeCreate(event: BeforeCreateEvent) {
    const { data } = event.params;

    // Publish copies draft → published row; preserve system fields as-is
    if (data.publishedAt != null) return;

    delete data.pages;
    delete data.conversionStatus;

    if (data.pdf != null) {
      event.state.pdfChanged = true;
      data.conversionStatus = 'processing';
    }
  },

  /**
   * afterCreate — fires conversion if a PDF was attached and we are on the draft row.
   */
  async afterCreate(event: AfterCreateEvent) {
    if (!event.state.pdfChanged) return;

    const documentId = event.result.documentId as string | undefined;
    if (!documentId) return;

    // Only fire on the draft row; publishing clones data but must not re-trigger
    if (event.result.publishedAt != null) return;

    // Skip if the pipeline is already running for this document
    if (getConversionWrites().has(documentId)) return;

    // Defer to next tick so the create transaction commits before convert() queries the row
    setTimeout(() => {
      const svc = strapi.service('api::magazine-issue.conversion') as any;
      void svc.convert(documentId).catch((err: unknown) => {
        strapi.log.error('[magazine-issue/lifecycle] Conversion error after create:', err);
      });
    }, 100);
  },

  /**
   * beforeUpdate — strips system fields unless this is a pipeline write;
   * detects PDF change and sets processing status.
   */
  async beforeUpdate(event: BeforeUpdateEvent) {
    const { data, documentId } = event.params;

    // Pipeline writes are allowed through without any stripping
    if (documentId && getConversionWrites().has(documentId)) return;

    // Publish/unpublish copies data between rows; preserve system fields
    if (data.publishedAt !== undefined) return;

    delete data.pages;
    delete data.conversionStatus;

    // Detect PDF change only when the pdf field is explicitly included in the update
    if (!('pdf' in data) || !documentId) return;

    // Look up the current draft row to compare pdf ids
    const current = await strapi.db
      .query('api::magazine-issue.magazine-issue')
      .findOne({ where: { documentId, publishedAt: null }, populate: ['pdf'] }) as any;

    const incomingPdfRaw = data.pdf;
    const incomingPdfId: number | null =
      incomingPdfRaw == null
        ? null
        : typeof incomingPdfRaw === 'object'
        ? ((incomingPdfRaw as any).id as number | undefined) ?? null
        : (incomingPdfRaw as number);

    const currentPdfId: number | null = (current?.pdf as any)?.id ?? null;

    if (incomingPdfId !== currentPdfId) {
      event.state.pdfChanged = true;
      event.state.documentId = documentId;
      data.conversionStatus = 'processing';
    }
  },

  /**
   * afterUpdate — fires conversion if the PDF changed, we are on the draft row,
   * and the pipeline is not already in-flight for this document.
   */
  async afterUpdate(event: AfterUpdateEvent) {
    if (!event.state.pdfChanged) return;

    const documentId =
      (event.state.documentId as string | undefined) ??
      (event.result.documentId as string | undefined);
    if (!documentId) return;

    // Only fire on the draft row
    if (event.result.publishedAt != null) return;

    // Skip if the pipeline is already running (e.g. publish triggered by pipeline itself)
    if (getConversionWrites().has(documentId)) return;

    setTimeout(() => {
      const svc = strapi.service('api::magazine-issue.conversion') as any;
      void svc.convert(documentId).catch((err: unknown) => {
        strapi.log.error('[magazine-issue/lifecycle] Conversion error after update:', err);
      });
    }, 100);
  },
};
