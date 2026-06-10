'use strict';

const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

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
  const appContext = await resolveAppContext();
  const app = await createStrapi(appContext).load();

  try {
    const { runAllDataMigrations } = require(
      path.join(appContext.distDir, 'src', 'data-migrations')
    );
    await runAllDataMigrations(app);
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
