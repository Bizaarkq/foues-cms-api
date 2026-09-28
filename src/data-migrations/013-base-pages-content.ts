import type { DataMigration } from './runner';
import pregradoSeed from '../seeds/pages/pregrado.json';
import serviciosSeed from '../seeds/pages/servicios.json';
import proyeccionSocialSeed from '../seeds/pages/proyeccion-social.json';
import centroImagenes3dSeed from '../seeds/pages/centro-imagenes-3d.json';
import centroInvestigacionesSeed from '../seeds/pages/centro-investigaciones.json';
import posgradoSeed from '../seeds/pages/posgrado.json';
import contactoSeed from '../seeds/pages/contacto.json';
import { createMediaCache, getMediaDir, resolvePageContent } from '../seeds/resolve-page-content';

type PageSeed = {
  routePath: string;
  title: string;
  layout: 'default' | 'full-width';
  content: Record<string, unknown>[];
};

// Only the base pages adapted from the mockup. These still hold their 002 seed
// content, so `content` is replaced wholesale without losing editor work.
const PAGE_SEEDS: PageSeed[] = [
  pregradoSeed,
  serviciosSeed,
  proyeccionSocialSeed,
  centroImagenes3dSeed,
  centroInvestigacionesSeed,
  posgradoSeed,
  contactoSeed,
] as PageSeed[];

const migration: DataMigration = {
  name: '013-base-pages-content',

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

    // Logged so a wrong app root (dev vs. image) is visible in the deploy log.
    strapi.log.info(`[data-migrations] Seed media dir: ${getMediaDir(strapi)}`);

    // One cache per run so pages sharing an image upload it once.
    const mediaCache = createMediaCache();

    for (const seed of PAGE_SEEDS) {
      const routeRecord = routeByPath.get(seed.routePath);
      if (!routeRecord) {
        strapi.log.warn(
          `[data-migrations] Route not found for "${seed.routePath}" — skipping page.`
        );
        continue;
      }

      const existing = await strapi.db.query('api::page.page').findOne({
        where: { route: routeRecord.id },
      });

      const content = await resolvePageContent(strapi, seed.content, mediaCache);

      if (existing) {
        await strapi.documents('api::page.page').update({
          documentId: existing.documentId,
          data: { title: seed.title, content } as never,
          status: 'published',
        });
        strapi.log.info(`[data-migrations] Page "${seed.title}" updated.`);
        continue;
      }

      await strapi.documents('api::page.page').create({
        data: {
          title: seed.title,
          layout: seed.layout,
          route: routeRecord.documentId,
          content,
        } as never,
        status: 'published',
      });
      strapi.log.info(`[data-migrations] Page "${seed.title}" created.`);
    }
  },
};

export default migration;
