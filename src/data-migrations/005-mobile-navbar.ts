import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

/**
 * Seed items for the mobile bottom navigation bar (max 3 — schema-enforced).
 * Internal targets reference routes by path (must exist in the tree, same
 * convention as 002). Editors adjust the selection later from the admin.
 */
const SEED_ITEMS = [
  { label: 'Admisión', icon: 'graduation-cap', routePath: '/admision' },
  { label: 'Clínicas', icon: 'stethoscope', routePath: '/servicios/areas-clinicas' },
  { label: 'Pregrado', icon: 'book-open', routePath: '/pregrado' },
];

const migration: DataMigration = {
  name: '005-mobile-navbar',

  async up(strapi: Core.Strapi) {
    const existing = await strapi.db
      .query('api::mobile-navbar.mobile-navbar')
      .findOne({});
    if (existing) {
      strapi.log.info('[data-migrations] Mobile navbar already exists — skipping seed.');
      return;
    }

    const paths = SEED_ITEMS.map((item) => item.routePath);
    const routes = await strapi.db.query('api::route.route').findMany({
      where: { path: { $in: paths } },
    });
    const routeByPath = new Map(
      routes.map((route: { path: string; documentId: string }) => [route.path, route])
    );

    const items = SEED_ITEMS.flatMap((item) => {
      const route = routeByPath.get(item.routePath);
      if (!route) {
        strapi.log.warn(
          `[data-migrations] Route not found for "${item.routePath}" — skipping mobile nav item.`
        );
        return [];
      }
      return [{ label: item.label, icon: item.icon, route: route.documentId }];
    });

    await strapi.documents('api::mobile-navbar.mobile-navbar').create({
      data: { items } as never,
    });

    strapi.log.info(`[data-migrations] Mobile navbar seeded with ${items.length} item(s).`);
  },
};

export default migration;
