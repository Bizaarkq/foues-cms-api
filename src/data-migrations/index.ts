import type { Core } from '@strapi/strapi';

import { runDataMigrations } from './runner';
import routeTree from './001-route-tree';
import initialPages from './002-initial-pages';

// Ordered registry — append new migrations at the end, never reorder.
const migrations = [routeTree, initialPages];

export async function runAllDataMigrations(strapi: Core.Strapi): Promise<void> {
  await runDataMigrations(strapi, migrations);
}
