import type { Core } from '@strapi/strapi';

import routeTreeData    from './seeds/routes/tree.json';
import landingSeed      from './seeds/pages/landing.json';
import quienesSomosSeed from './seeds/pages/quienes-somos.json';
import admisionSeed     from './seeds/pages/admision.json';
import areasClinicasSeed from './seeds/pages/areas-clinicas.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteNode = {
  path: string;
  label: string;
  order: number;
  type: 'page' | 'section' | 'header';
  children?: RouteNode[];
};

type PageSeed = {
  routePath: string;
  title: string;
  layout: 'default' | 'full-width';
  content: Record<string, unknown>[];
};

const ROUTE_TREE = routeTreeData as RouteNode;

const PAGE_SEEDS: PageSeed[] = [
  landingSeed,
  quienesSomosSeed,
  admisionSeed,
  areasClinicasSeed,
] as PageSeed[];

// ---------------------------------------------------------------------------
// Route seed
// ---------------------------------------------------------------------------

async function insertNode(
  strapi: Core.Strapi,
  node: RouteNode,
  parentId: number | null
): Promise<void> {
  const record = await strapi.db.query('api::route.route').create({
    data: {
      path: node.path,
      label: node.label,
      order: node.order,
      type: node.type,
      ...(parentId !== null ? { parent: parentId } : {}),
    },
  });

  for (const child of node.children ?? []) {
    await insertNode(strapi, child, record.id);
  }
}

async function seedRoutes(strapi: Core.Strapi): Promise<void> {
  const count = await strapi.db.query('api::route.route').count({});
  if (count > 0) return;
  await insertNode(strapi, ROUTE_TREE, null);
  strapi.log.info('[seed] Route tree inserted successfully.');
}

// ---------------------------------------------------------------------------
// Page seed
// ---------------------------------------------------------------------------

async function seedPages(strapi: Core.Strapi): Promise<void> {
  const paths = PAGE_SEEDS.map((p) => p.routePath);
  const routes = await strapi.db.query('api::route.route').findMany({
    where: { path: { $in: paths } },
  });

  const routeByPath = new Map(
    routes.map((r: { path: string; id: number; documentId: string }) => [r.path, r])
  );

  for (const seed of PAGE_SEEDS) {
    try {
      const routeRecord = routeByPath.get(seed.routePath);
      if (!routeRecord) {
        strapi.log.warn(`[seed] Route not found for "${seed.routePath}" — skipping.`);
        continue;
      }

      const existing = await strapi.db.query('api::page.page').findOne({
        where: { title: seed.title, route: routeRecord.id },
      });
      if (existing) {
        strapi.log.info(`[seed] Page "${seed.title}" already exists — skipping.`);
        continue;
      }

      await strapi.documents('api::page.page').create({
        data: {
          title: seed.title,
          layout: seed.layout,
          route: routeRecord.documentId,
          content: seed.content,
        } as never,
        status: 'published',
      });

      strapi.log.info(`[seed] Page "${seed.title}" (${seed.routePath}) created.`);
    } catch (err) {
      strapi.log.error(`[seed] Failed to seed "${seed.title}" (${seed.routePath}): ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Strapi lifecycle
// ---------------------------------------------------------------------------

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    if (process.env.NODE_ENV === 'production') return;
    await seedRoutes(strapi);
    await seedPages(strapi);
  },
};
