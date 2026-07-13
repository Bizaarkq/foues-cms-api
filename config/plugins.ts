import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'table-editor': {
    enabled: true,
    resolve: './src/plugins/table-editor',
  },
  graphql: {
    enabled: true,
    config: {
      endpoint: '/graphql',
      shadowCRUD: true,
      playgroundAlways: false,
      depthLimit: 10, // was 7 — required for blocks.section nesting (docs/adr/0005-graphql-depth-limit-10.md)
      amountLimit: 100,
    },
  },
});

export default config;
