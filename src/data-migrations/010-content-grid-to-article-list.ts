import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

/**
 * `blocks.content-grid` was removed in favour of the self-fetching
 * `blocks.article-list` (its `collection_type` was never wired; manual card
 * grids are superseded). This migration converts any dynamic-zone entry that
 * still points at the deleted component into an article-list entry.
 *
 * Caveat: Strapi's schema sync drops `components_blocks_content_grids` (and
 * the card items) BEFORE bootstrap runs, so on most databases only the orphan
 * link rows survive — `title` is recovered when the old table still exists,
 * otherwise the entry falls back to a null title. Manual card items are
 * dropped by design (seed/demo data only).
 *
 * Link-table shape (Strapi v5): `{entity}_cmps` rows carry
 * (entity_id, cmp_id, component_type, field, order).
 */

const OLD_COMPONENT = 'blocks.content-grid';
const NEW_COMPONENT = 'blocks.article-list';
const OLD_TABLE = 'components_blocks_content_grids';
const NEW_TABLE = 'components_blocks_article_lists';

/** Dynamic zones that allowed content-grid: page.content and block-group.blocks. */
const LINK_TABLES = ['pages_cmps', 'block_groups_cmps'];

const migration: DataMigration = {
  name: '010-content-grid-to-article-list',

  async up(strapi: Core.Strapi) {
    const knex = strapi.db.connection;

    // Best-effort title recovery — the old component table only survives if
    // schema sync has not dropped it yet (e.g. migration run before deploy).
    const titles = new Map<number, string | null>();
    if (await knex.schema.hasTable(OLD_TABLE)) {
      const rows: Array<{ id: number; title: string | null }> = await knex(
        OLD_TABLE
      ).select('id', 'title');
      for (const row of rows) titles.set(row.id, row.title);
    }

    let converted = 0;

    for (const linkTable of LINK_TABLES) {
      if (!(await knex.schema.hasTable(linkTable))) continue;

      const links: Array<{ id: number; cmp_id: number }> = await knex(linkTable)
        .select('id', 'cmp_id')
        .where('component_type', OLD_COMPONENT);

      for (const link of links) {
        const [inserted] = await knex(NEW_TABLE).insert(
          {
            title: titles.get(link.cmp_id) ?? null,
            category_filter: 'all',
            page_size: 9,
            card_style: 'default',
            columns: 3,
          },
          ['id']
        );
        const newCmpId =
          typeof inserted === 'object' ? (inserted as { id: number }).id : inserted;

        await knex(linkTable)
          .where('id', link.id)
          .update({ cmp_id: newCmpId, component_type: NEW_COMPONENT });

        converted += 1;
      }
    }

    strapi.log.info(
      `[data-migrations] Converted ${converted} content-grid entr${converted === 1 ? 'y' : 'ies'} to article-list.`
    );
  },
};

export default migration;
