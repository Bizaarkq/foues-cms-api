import type { Core } from '@strapi/strapi';

import { runAllDataMigrations } from './data-migrations';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // In production, data migrations run explicitly via `pnpm data:migrate`
    // (scripts/run-data-migrations.js) after the stack is up.
    if (process.env.NODE_ENV === 'production') return;
    await runAllDataMigrations(strapi);
  },
};
