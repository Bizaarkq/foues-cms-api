import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

/**
 * Creates the root "Documents" media-library folder that the
 * `document-access` middleware (`src/middlewares/document-access.ts`) uses
 * as the boundary for role-gated files: anything placed in this folder (or
 * a subfolder of it) is only served with a valid `x-document-access-secret`
 * header. Editors upload documents into this folder (or subfolders of it)
 * from the admin panel — nothing in this migration seeds documents
 * themselves, only the folder they must live under to be protected.
 */

const ROOT_FOLDER_NAME = 'Documents';

const migration: DataMigration = {
  name: '011-document-repository-folder',

  async up(strapi: Core.Strapi) {
    const existing = await strapi.db.query('plugin::upload.folder').findOne({
      where: { name: ROOT_FOLDER_NAME, parent: null },
    });

    if (existing) {
      strapi.log.info('[data-migrations] "Documents" root folder already exists — skipping.');
      return;
    }

    await strapi.plugin('upload').service('folder').create({
      name: ROOT_FOLDER_NAME,
      parent: null,
    });

    strapi.log.info('[data-migrations] Created "Documents" root media folder.');
  },
};

export default migration;
