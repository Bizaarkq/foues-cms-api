import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

const UID = 'api::mobile-navbar.mobile-navbar';
const TITLE = 'Barra de navegación móvil';

/**
 * The mobile-navbar single type had zero string attributes, so the Content
 * Manager fell back to `id` as entry title and the admin header showed the
 * raw documentId. The schema now has a `title` field; this migration:
 *
 * 1. Backfills `title` on the existing entry (seeded by 005 without it).
 * 2. Points the stored Content Manager configuration's `mainField` at
 *    `title` — the boot sync KEEPS a stored mainField as long as it is
 *    still sortable, so already-configured databases would otherwise stay
 *    on `id` forever. Fresh databases need no config fix (the default
 *    mainField picks the first string attribute), but they do get the
 *    backfill since 005 runs before this migration in the same pass.
 */
const migration: DataMigration = {
  name: '008-mobile-navbar-title',

  async up(strapi: Core.Strapi) {
    const entry = await strapi.db.query(UID).findOne({});
    if (entry && !entry.title) {
      await strapi.db.query(UID).update({
        where: { id: entry.id },
        data: { title: TITLE },
      });
      strapi.log.info('[data-migrations] Mobile navbar title backfilled.');
    }

    // Same store the content-manager plugin uses (services/utils/store.ts):
    // full core_store key is plugin_content_manager_configuration_content_types::{uid}
    const store = strapi.store({ type: 'plugin', name: 'content_manager' });
    const key = `configuration_content_types::${UID}`;
    const config = (await store.get({ key })) as {
      settings?: { mainField?: string };
    } | null;

    if (config?.settings && config.settings.mainField !== 'title') {
      config.settings.mainField = 'title';
      await store.set({ key, value: config });
      strapi.log.info(
        '[data-migrations] Mobile navbar entry title now uses the "title" field.'
      );
    }
  },
};

export default migration;
