import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

/**
 * Roles iniciales de los usuarios del sitio. "Estudiante" queda como
 * default (is_default) — el rol que recibe todo usuario en su primer login.
 * Editables/ampliables desde el admin sin deploy.
 */
const SEED_ROLES = [
  {
    name: 'Estudiante',
    key: 'estudiante',
    description: 'Estudiante activo de la facultad',
    is_default: true,
  },
  {
    name: 'Catedrático',
    key: 'catedratico',
    description: 'Docente de la facultad',
    is_default: false,
  },
  {
    name: 'Personal',
    key: 'personal',
    description: 'Personal administrativo de la facultad',
    is_default: false,
  },
];

const migration: DataMigration = {
  name: '007-user-roles',

  async up(strapi: Core.Strapi) {
    // Índice único REAL sobre site_users.email: Strapi v5 solo valida
    // `unique: true` en su capa de API — el upsert crudo de track-login
    // (INSERT … ON DUPLICATE KEY) necesita la constraint en la base o los
    // logins concurrentes duplican filas (lección del issue #8, otra vez).
    const knex = strapi.db.connection;
    const [indexRows] = (await knex.raw(
      `SELECT COUNT(*) AS n FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'site_users'
          AND index_name = 'uq_site_users_email'`
    )) as [Array<{ n: number }>];

    if (Number(indexRows[0]?.n) === 0) {
      await knex.raw('CREATE UNIQUE INDEX uq_site_users_email ON site_users (email)');
      strapi.log.info('[data-migrations] Unique index uq_site_users_email created.');
    }

    const count = await strapi.db.query('api::user-role.user-role').count({});
    if (count > 0) {
      strapi.log.info('[data-migrations] User roles already exist — skipping seed.');
      return;
    }

    for (const role of SEED_ROLES) {
      await strapi.documents('api::user-role.user-role').create({
        data: role as never,
      });
    }

    strapi.log.info(`[data-migrations] Seeded ${SEED_ROLES.length} user roles (default: Estudiante).`);
  },
};

export default migration;
