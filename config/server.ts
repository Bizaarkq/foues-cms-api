import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  watchIgnoreFiles: ['**/public/uploads/**'],
} satisfies Core.Config.Server & { watchIgnoreFiles: string[] });

export default config;
