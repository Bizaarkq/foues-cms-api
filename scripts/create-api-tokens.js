'use strict';

const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

// Token names double as the .env variable names they belong to.
const TOKENS = [
  {
    name: 'STRAPI_API_TOKEN',
    description: 'Frontend read access for SDUI content (GraphQL/REST)',
    type: 'read-only',
    permissions: null,
  },
  {
    name: 'FORM_SUBMIT_TOKEN',
    description: 'Restricted token for public form submissions',
    type: 'custom',
    permissions: [
      'api::form.form.findOne',
      'api::form-submission.form-submission.create',
    ],
  },
  {
    name: 'MAGAZINE_TRACK_TOKEN',
    description: 'Restricted token for magazine read-depth and visit tracking',
    type: 'custom',
    permissions: [
      'api::magazine-issue.track.track',
    ],
  },
  {
    name: 'SITE_USER_TOKEN',
    description: 'Restricted token for login tracking (site-user upsert only)',
    type: 'custom',
    permissions: [
      'api::site-user.track-login.trackLogin',
    ],
  },
];

const appDir = path.resolve(__dirname, '..');
const distDir = path.join(appDir, 'dist');

async function resolveAppContext() {
  // The production image ships a prebuilt dist/ — reuse it. Compile only when
  // running from a clean working tree (local dev without a build).
  if (fs.existsSync(path.join(distDir, 'src', 'index.js'))) {
    return { appDir, distDir };
  }
  return compileStrapi();
}

async function main() {
  const rotate = process.argv.includes('--rotate');
  const appContext = await resolveAppContext();
  const app = await createStrapi(appContext).load();

  try {
    const service = app.service('admin::api-token');
    const lines = [];

    for (const def of TOKENS) {
      const existing = await service.getByName(def.name);

      if (existing && !rotate) {
        lines.push(`${def.name}=<already exists — run with --rotate to regenerate>`);
        continue;
      }

      if (existing) {
        const { accessKey } = await service.regenerate(existing.id);
        lines.push(`${def.name}=${accessKey}`);
        continue;
      }

      const attributes = {
        name: def.name,
        description: def.description,
        type: def.type,
        lifespan: null,
      };
      if (def.permissions) {
        attributes.permissions = def.permissions;
      }

      const created = await service.create(attributes);
      lines.push(`${def.name}=${created.accessKey}`);
    }

    console.log('\nCopy these values into .env — they are shown only once:\n');
    for (const line of lines) {
      console.log(line);
    }
    console.log('\nThen rebuild the frontend so it picks up the tokens.');
  } finally {
    await app.destroy();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
