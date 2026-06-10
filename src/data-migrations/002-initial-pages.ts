import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';
import landingSeed from '../seeds/pages/landing.json';
import quienesSomosSeed from '../seeds/pages/quienes-somos.json';
import admisionSeed from '../seeds/pages/admision.json';
import pregradoSeed from '../seeds/pages/pregrado.json';
import serviciosSeed from '../seeds/pages/servicios.json';
import areasClinicasSeed from '../seeds/pages/areas-clinicas.json';
import proyeccionSocialSeed from '../seeds/pages/proyeccion-social.json';
import centroImagenes3dSeed from '../seeds/pages/centro-imagenes-3d.json';
import centroInvestigacionesSeed from '../seeds/pages/centro-investigaciones.json';

type PageSeed = {
  routePath: string;
  title: string;
  layout: 'default' | 'full-width';
  content: Record<string, unknown>[];
};

const PAGE_SEEDS: PageSeed[] = [
  landingSeed,
  quienesSomosSeed,
  admisionSeed,
  pregradoSeed,
  serviciosSeed,
  areasClinicasSeed,
  proyeccionSocialSeed,
  centroImagenes3dSeed,
  centroInvestigacionesSeed,
] as PageSeed[];

const migration: DataMigration = {
  name: '002-initial-pages',

  async up(strapi) {
    const paths = PAGE_SEEDS.map((seed) => seed.routePath);
    const routes = await strapi.db.query('api::route.route').findMany({
      where: { path: { $in: paths } },
    });

    const routeByPath = new Map(
      routes.map((route: { path: string; id: number; documentId: string }) => [
        route.path,
        route,
      ])
    );

    for (const seed of PAGE_SEEDS) {
      const routeRecord = routeByPath.get(seed.routePath);
      if (!routeRecord) {
        strapi.log.warn(
          `[data-migrations] Route not found for "${seed.routePath}" — skipping page.`
        );
        continue;
      }

      // Guard for databases seeded by the old bootstrap seeder, where pages
      // exist but the tracking table does not.
      const existing = await strapi.db.query('api::page.page').findOne({
        where: { title: seed.title, route: routeRecord.id },
      });
      if (existing) {
        strapi.log.info(`[data-migrations] Page "${seed.title}" already exists — skipping.`);
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

      strapi.log.info(`[data-migrations] Page "${seed.title}" (${seed.routePath}) created.`);
    }
  },
};

export default migration;
