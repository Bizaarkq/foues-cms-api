import type { Core } from '@strapi/strapi';

type AttrMeta = { columnName: string };
type StatMeta = {
  tableName: string;
  attributes: Record<string, AttrMeta> & {
    issue: AttrMeta & {
      joinTable?: {
        name: string;
        joinColumn: { name: string };
        inverseJoinColumn: { name: string };
      };
    };
  };
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

    // Issue #8: the daily aggregate row has a DETERMINISTIC document_id
    // (`stat-i{issueId}-{date}`) backed by a unique index (migration 006),
    // so concurrent beacons collapse into one atomic upsert instead of the
    // old find-then-create race. The stat collection is system-managed and
    // only written here, which is what keeps the invariant sound.
    const statDocumentId = `stat-i${issue.id}-${today}`;

    // Resolve real DB column names to avoid guessing camelCase→snake_case mapping
    const meta = strapi.db.metadata.get('api::magazine-stat.magazine-stat') as unknown as StatMeta;
    const col = (attr: string) => meta.attributes[attr].columnName;

    // First beacon of the day inserts these values; later beacons add them
    // onto the existing row via ON DUPLICATE KEY UPDATE.
    const counters: Record<string, number> = {
      [col('visits')]: type === 'visit' ? 1 : 0,
      [col('depth25')]: type === 'depth' && maxPercent >= 25 ? 1 : 0,
      [col('depth50')]: type === 'depth' && maxPercent >= 50 ? 1 : 0,
      [col('depth75')]: type === 'depth' && maxPercent >= 75 ? 1 : 0,
      [col('depth100')]: type === 'depth' && maxPercent >= 100 ? 1 : 0,
    };
    const counterCols = Object.keys(counters);

    const joinTable = meta.attributes.issue.joinTable;
    const linkTable = joinTable?.name ?? 'magazine_stats_issue_lnk';
    const linkStatCol = joinTable?.joinColumn.name ?? 'magazine_stat_id';
    const linkIssueCol = joinTable?.inverseJoinColumn.name ?? 'magazine_issue_id';

    const knex = strapi.db.connection as any;

    await knex.transaction(async (trx: any) => {
      const [result] = await trx.raw(
        `INSERT INTO \`${meta.tableName}\`
           (document_id, \`${col('date')}\`, ${counterCols.map((c) => `\`${c}\``).join(', ')},
            created_at, updated_at, published_at)
         VALUES (?, ?, ${counterCols.map(() => '?').join(', ')}, NOW(6), NOW(6), NOW(6))
         AS incoming
         ON DUPLICATE KEY UPDATE
           ${counterCols.map((c) => `\`${c}\` = \`${meta.tableName}\`.\`${c}\` + incoming.\`${c}\``).join(', ')},
           updated_at = incoming.updated_at`,
        [statDocumentId, today, ...counterCols.map((c) => counters[c])]
      );

      // affectedRows === 1 → row was inserted (first beacon of the day):
      // create its relation link. On update (=== 2) the link already exists.
      if (result.affectedRows === 1) {
        await trx(linkTable).insert({
          [linkStatCol]: result.insertId,
          [linkIssueCol]: issue.id,
        });
      }
    });

    ctx.status = 200;
    ctx.body = { ok: true };
  },
});
