import type { Core } from '@strapi/strapi';

export type DataMigration = {
  name: string;
  up: (strapi: Core.Strapi) => Promise<void>;
};

// Separate from Strapi's native `strapi_migrations`: those run BEFORE schema
// sync (knex-only, no Document Service), so they cannot seed content tables.
const TRACKING_TABLE = 'data_migrations';

async function ensureTrackingTable(strapi: Core.Strapi): Promise<void> {
  const knex = strapi.db.connection;
  if (await knex.schema.hasTable(TRACKING_TABLE)) return;

  await knex.schema.createTable(TRACKING_TABLE, (table) => {
    table.increments('id');
    table.string('name').notNullable().unique();
    table.datetime('executed_at').notNullable();
  });
}

export async function runDataMigrations(
  strapi: Core.Strapi,
  migrations: DataMigration[]
): Promise<void> {
  await ensureTrackingTable(strapi);

  const knex = strapi.db.connection;
  const appliedRows: { name: string }[] = await knex(TRACKING_TABLE).select('name');
  const applied = new Set(appliedRows.map((row) => row.name));

  const pending = migrations.filter((migration) => !applied.has(migration.name));
  if (pending.length === 0) {
    strapi.log.info('[data-migrations] Nothing to run — all migrations already applied.');
    return;
  }

  for (const migration of pending) {
    strapi.log.info(`[data-migrations] Applying "${migration.name}"...`);

    await strapi.db.transaction(async () => {
      await migration.up(strapi);
    });

    await knex(TRACKING_TABLE).insert({
      name: migration.name,
      executed_at: new Date(),
    });

    strapi.log.info(`[data-migrations] "${migration.name}" applied.`);
  }
}
