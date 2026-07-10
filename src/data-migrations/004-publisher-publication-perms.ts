import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

const PUBLISHER_CODE = 'publisher';
const PUBLICATION_UID = 'api::publication.publication';

const CRUD_ACTIONS = [
  'plugin::content-manager.explorer.create',
  'plugin::content-manager.explorer.read',
  'plugin::content-manager.explorer.update',
  'plugin::content-manager.explorer.delete',
];

const migration: DataMigration = {
  name: '004-publisher-publication-perms',

  async up(strapi: Core.Strapi) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleService = strapi.service('admin::role') as any;

    const role = await roleService.findOne({ code: PUBLISHER_CODE });
    if (!role) {
      strapi.log.warn(
        '[data-migrations] Publisher role not found — skipping publication permissions.'
      );
      return;
    }

    // Current permission set — assignPermissions REPLACES, so we must append.
    const existing = (await strapi.db.query('admin::permission').findMany({
      where: { role: { id: role.id } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any[];

    // Idempotency guard: skip if the role already touches publication.
    if (existing.some((p) => p.subject === PUBLICATION_UID)) {
      strapi.log.info(
        '[data-migrations] Publisher already has publication permissions — skipping.'
      );
      return;
    }

    const kept = existing.map((p) => ({
      action: p.action,
      actionParameters: p.actionParameters ?? {},
      subject: p.subject ?? null,
      conditions: p.conditions ?? [],
      properties: p.properties ?? { fields: null },
    }));

    // publication has draftAndPublish: false — CRUD only, no publish action.
    const added = CRUD_ACTIONS.map((action) => ({
      action,
      subject: PUBLICATION_UID,
      conditions: [],
      properties: { fields: null },
    }));

    await roleService.assignPermissions(role.id, [...kept, ...added]);

    strapi.log.info(
      '[data-migrations] Publisher role extended with publication CRUD permissions.'
    );
  },
};

export default migration;
