import type { Core } from '@strapi/strapi';

type AttrMeta = { columnName: string };
type StatMeta = {
  tableName: string;
  attributes: Record<string, AttrMeta>;
};

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async track(ctx: any) {
    const body = ctx.request.body as Record<string, unknown> | undefined;
    const type = body?.type;

    if (type !== 'visit' && type !== 'depth') {
      return ctx.badRequest('type must be "visit" or "depth"');
    }

    let maxPercent = 0;
    if (type === 'depth') {
      const raw = body?.maxPercent;
      if (typeof raw !== 'number') {
        return ctx.badRequest('maxPercent is required for type "depth"');
      }
      maxPercent = Math.min(100, Math.max(0, Math.round(raw)));
    }

    const { documentId } = ctx.params as { documentId: string };

    // Resolve published issue entity (integer id)
    const issue = await strapi.db.query('api::magazine-issue.magazine-issue').findOne({
      where: { documentId, publishedAt: { $notNull: true } },
    }) as { id: number } | null;

    if (!issue) {
      return ctx.notFound();
    }

    // Today UTC date string YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10);

    // Find existing aggregate row for this issue + day
    let stat = await strapi.db.query('api::magazine-stat.magazine-stat').findOne({
      where: { issue: { id: issue.id }, date: today },
    }) as { id: number } | null;

    if (!stat) {
      stat = await strapi.db.query('api::magazine-stat.magazine-stat').create({
        data: {
          issue: issue.id,
          date: today,
          visits: 0,
          depth25: 0,
          depth50: 0,
          depth75: 0,
          depth100: 0,
        },
      }) as { id: number };
    }

    // Resolve real DB column names to avoid guessing camelCase→snake_case mapping
    const meta = strapi.db.metadata.get('api::magazine-stat.magazine-stat') as unknown as StatMeta;

    const inc: Record<string, number> = {};
    if (type === 'visit') {
      inc[meta.attributes.visits.columnName] = 1;
    } else {
      // Cumulative buckets: every bucket whose threshold ≤ maxPercent increments
      if (maxPercent >= 25) inc[meta.attributes.depth25.columnName] = 1;
      if (maxPercent >= 50) inc[meta.attributes.depth50.columnName] = 1;
      if (maxPercent >= 75) inc[meta.attributes.depth75.columnName] = 1;
      if (maxPercent >= 100) inc[meta.attributes.depth100.columnName] = 1;
    }

    if (Object.keys(inc).length > 0) {
      await (strapi.db.connection as any)(meta.tableName)
        .where({ id: stat.id })
        .increment(inc);
    }

    ctx.status = 200;
    ctx.body = { ok: true };
  },
});
