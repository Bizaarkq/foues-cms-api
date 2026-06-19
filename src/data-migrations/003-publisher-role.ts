import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

const PUBLISHER_CODE = 'publisher';
const PUBLISHER_NAME = 'Publisher';
const MAGAZINE_ISSUE_UID = 'api::magazine-issue.magazine-issue';

const migration: DataMigration = {
  name: '003-publisher-role',

  async up(strapi: Core.Strapi) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleService = strapi.service('admin::role') as any;

    // Idempotency guard: skip if a role with code 'publisher' already exists.
    const existing = await roleService.findOne({ code: PUBLISHER_CODE });
    if (existing) {
      strapi.log.info('[data-migrations] Publisher role already exists — skipping.');
      return;
    }

    const role = await roleService.create({
      name: PUBLISHER_NAME,
      code: PUBLISHER_CODE,
      description: 'Can create, update, publish, and delete magazine issues and upload media.',
    });

    const permissions = [
      // magazine-issue: Create, Read, Update, Delete, Publish
      {
        action: 'plugin::content-manager.explorer.create',
        subject: MAGAZINE_ISSUE_UID,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::content-manager.explorer.read',
        subject: MAGAZINE_ISSUE_UID,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::content-manager.explorer.update',
        subject: MAGAZINE_ISSUE_UID,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::content-manager.explorer.delete',
        subject: MAGAZINE_ISSUE_UID,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::content-manager.explorer.publish',
        subject: MAGAZINE_ISSUE_UID,
        conditions: [],
        properties: { fields: null },
      },
      // Media library upload actions (no subject — applies globally)
      {
        action: 'plugin::upload.read',
        subject: null,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::upload.assets.create',
        subject: null,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::upload.assets.update',
        subject: null,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::upload.assets.download',
        subject: null,
        conditions: [],
        properties: { fields: null },
      },
      {
        action: 'plugin::upload.assets.copy-link',
        subject: null,
        conditions: [],
        properties: { fields: null },
      },
    ];

    await roleService.assignPermissions(role.id, permissions);

    strapi.log.info(
      '[data-migrations] Publisher role created with magazine-issue CRUD+publish and upload permissions.'
    );
  },
};

export default migration;
