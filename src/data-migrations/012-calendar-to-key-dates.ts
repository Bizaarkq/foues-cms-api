import type { DataMigration } from './runner';

/**
 * `blocks.calendar` was merged into `blocks.key-dates` (displayName
 * "Calendario"): key-dates already handled date ranges and a list/calendar
 * display mode, and now also carries the category field calendar had (values
 * translated to Spanish). This migration converts any dynamic-zone entry that
 * still points at the deleted component into a key-dates entry.
 *
 * Caveat (same as 010): Strapi's schema sync drops the calendar component
 * tables BEFORE bootstrap runs, so title/items are recovered only when the
 * old tables still exist. The only known usage is the showcase page seeded by
 * 009, so when recovery is impossible the entry falls back to that seed's
 * static content instead of an empty block.
 *
 * Link-table shape (Strapi v5): `{entity}_cmps` rows carry
 * (entity_id, cmp_id, component_type, field, order).
 */

const OLD_COMPONENT = 'blocks.calendar';
const NEW_COMPONENT = 'blocks.key-dates';
const OLD_TABLE = 'components_blocks_calendars';
const OLD_ITEMS_TABLE = 'components_elements_schedule_items';
const OLD_CMPS_TABLE = 'components_blocks_calendars_cmps';
const NEW_TABLE = 'components_blocks_key_dates';
const NEW_ITEMS_TABLE = 'components_elements_date_entries';
const NEW_CMPS_TABLE = 'components_blocks_key_dates_cmps';
const ITEM_COMPONENT = 'elements.date-entry';

/** Dynamic zones that allowed calendar: page.content and block-group.blocks. */
const LINK_TABLES = ['pages_cmps', 'block_groups_cmps'];

const CATEGORY_MAP: Record<string, string> = {
  academic: 'academico',
  event: 'evento',
  deadline: 'fecha_limite',
  holiday: 'asueto',
  other: 'otro',
};

interface NewItem {
  start_date: string;
  end_date: string | null;
  label: string;
  description: string | null;
  category: string | null;
}

/** Static fallback = the calendar block seeded by 009 (its only known usage). */
const SHOWCASE_FALLBACK: { title: string; items: NewItem[] } = {
  title: 'Calendario Académico',
  items: [
    {
      start_date: '2026-08-01',
      end_date: null,
      label: 'Inicio del ciclo II-2026',
      description: null,
      category: 'academico',
    },
    {
      start_date: '2026-08-15',
      end_date: '2026-08-16',
      label: 'Jornada de bienvenida',
      description: 'Actividades de integración para estudiantes de nuevo ingreso.',
      category: 'evento',
    },
    {
      start_date: '2026-09-15',
      end_date: null,
      label: 'Fecha límite de retiro',
      description: 'Último día para retiro extraordinario de materias.',
      category: 'fecha_limite',
    },
    {
      start_date: '2026-10-01',
      end_date: null,
      label: 'Día del odontólogo',
      description: 'Celebración con actividades académicas y culturales.',
      category: 'asueto',
    },
  ],
};

const migration: DataMigration = {
  name: '012-calendar-to-key-dates',

  async up(strapi) {
    const knex = strapi.db.connection;

    // Best-effort recovery — the old tables only survive if schema sync has
    // not dropped them yet (e.g. migration run before deploying the schema).
    const canRecover =
      (await knex.schema.hasTable(OLD_TABLE)) &&
      (await knex.schema.hasTable(OLD_ITEMS_TABLE)) &&
      (await knex.schema.hasTable(OLD_CMPS_TABLE));

    const titles = new Map<number, string | null>();
    const itemsByCalendar = new Map<number, NewItem[]>();
    if (canRecover) {
      const rows: Array<{ id: number; title: string | null }> = await knex(
        OLD_TABLE
      ).select('id', 'title');
      for (const row of rows) titles.set(row.id, row.title);

      const links: Array<{ entity_id: number; cmp_id: number }> = await knex(
        OLD_CMPS_TABLE
      )
        .select('entity_id', 'cmp_id')
        .where('field', 'items')
        .orderBy('order', 'asc');
      const itemRows: Array<{
        id: number;
        date: string;
        title: string;
        description: string | null;
        category: string | null;
      }> = await knex(OLD_ITEMS_TABLE).select(
        'id',
        'date',
        'title',
        'description',
        'category'
      );
      const byId = new Map(itemRows.map((r) => [r.id, r]));
      for (const link of links) {
        const item = byId.get(link.cmp_id);
        if (!item) continue;
        const list = itemsByCalendar.get(link.entity_id) ?? [];
        list.push({
          start_date: item.date,
          end_date: null,
          label: item.title,
          description: item.description,
          category: item.category ? (CATEGORY_MAP[item.category] ?? 'otro') : null,
        });
        itemsByCalendar.set(link.entity_id, list);
      }
    }

    let converted = 0;

    for (const linkTable of LINK_TABLES) {
      if (!(await knex.schema.hasTable(linkTable))) continue;

      const links: Array<{ id: number; cmp_id: number }> = await knex(linkTable)
        .select('id', 'cmp_id')
        .where('component_type', OLD_COMPONENT);

      for (const link of links) {
        const title = canRecover
          ? (titles.get(link.cmp_id) ?? null)
          : SHOWCASE_FALLBACK.title;
        const items = canRecover
          ? (itemsByCalendar.get(link.cmp_id) ?? [])
          : SHOWCASE_FALLBACK.items;

        const [insertedBlock] = await knex(NEW_TABLE).insert(
          { title, display_mode: 'list' },
          ['id']
        );
        const newCmpId =
          typeof insertedBlock === 'object'
            ? (insertedBlock as { id: number }).id
            : insertedBlock;

        for (const [index, item] of items.entries()) {
          const [insertedItem] = await knex(NEW_ITEMS_TABLE).insert(item, ['id']);
          const newItemId =
            typeof insertedItem === 'object'
              ? (insertedItem as { id: number }).id
              : insertedItem;
          await knex(NEW_CMPS_TABLE).insert({
            entity_id: newCmpId,
            cmp_id: newItemId,
            component_type: ITEM_COMPONENT,
            field: 'items',
            order: index + 1,
          });
        }

        await knex(linkTable)
          .where('id', link.id)
          .update({ cmp_id: newCmpId, component_type: NEW_COMPONENT });

        converted += 1;
      }
    }

    strapi.log.info(
      `[data-migrations] Converted ${converted} calendar entr${converted === 1 ? 'y' : 'ies'} to key-dates (${canRecover ? 'recovered from old tables' : 'showcase fallback'}).`
    );
  },
};

export default migration;
