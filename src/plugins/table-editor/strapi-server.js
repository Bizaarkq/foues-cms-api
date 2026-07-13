'use strict';

/**
 * Server entry for the table-editor local plugin.
 * Plain CommonJS on purpose: Strapi's plugin loader requires the server
 * entrypoint as a .js config file (src/plugins/** is excluded from the
 * app's TypeScript compilation), so there is no build step to depend on.
 */
module.exports = {
  register({ strapi }) {
    strapi.customFields.register({
      name: 'table',
      plugin: 'table-editor',
      type: 'json',
    });
  },
};
