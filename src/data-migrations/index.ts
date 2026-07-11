import type { Core } from '@strapi/strapi';

import { runDataMigrations } from './runner';
import routeTree from './001-route-tree';
import initialPages from './002-initial-pages';
import publisherRole from './003-publisher-role';
import publisherPublicationPerms from './004-publisher-publication-perms';
import mobileNavbar from './005-mobile-navbar';
import magazineStatUnique from './006-magazine-stat-unique';

// Ordered registry — append new migrations at the end, never reorder.
const migrations = [
  routeTree,
  initialPages,
  publisherRole,
  publisherPublicationPerms,
  mobileNavbar,
  magazineStatUnique,
];

export async function runAllDataMigrations(strapi: Core.Strapi): Promise<void> {
  await runDataMigrations(strapi, migrations);
}
