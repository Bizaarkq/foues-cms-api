import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';
import routeTreeData from '../seeds/routes/tree.json';

type RouteNode = {
  path: string;
  label: string;
  order: number;
  type: 'page' | 'section' | 'header';
  enabled?: boolean;
  children?: RouteNode[];
};

const ROUTE_TREE = routeTreeData as RouteNode;

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
      active: node.enabled ?? true,
      ...(parentId !== null ? { parent: parentId } : {}),
    },
  });

  for (const child of node.children ?? []) {
    await insertNode(strapi, child, record.id);
  }
}

const migration: DataMigration = {
  name: '001-route-tree',

  async up(strapi) {
    // Guard for databases seeded by the old bootstrap seeder, where data
    // exists but the tracking table does not.
    const count = await strapi.db.query('api::route.route').count({});
    if (count > 0) {
      strapi.log.info('[data-migrations] Route table not empty — skipping tree insert.');
      return;
    }

    await insertNode(strapi, ROUTE_TREE, null);
  },
};

export default migration;
