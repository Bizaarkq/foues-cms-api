import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      enabled: true,
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      // Browsers now upload directly to this CMS (POST
      // /documents/upload/:ticket) instead of hopping through the Next.js
      // frontend for the file bytes, so the CMS itself must allow
      // cross-origin requests from the public site's real origin — not
      // just from the frontend-to-CMS server-to-server calls, which never
      // go through CORS at all.
      // localhost:3000 is dev-only (Next.js dev server); production relies solely on SITE_ORIGIN.
      origin: [
        ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []),
        ...(process.env.SITE_ORIGIN ? [process.env.SITE_ORIGIN] : []),
      ],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  // Anti-DoS gate for the public ticket-upload route — MUST run before
  // `strapi::body` (see its own file header for the full two-gate design):
  // global middlewares run, in this array's order, before the router ever
  // dispatches to a controller, and `strapi::body` (formidable) is itself
  // one of these global middlewares, so this rejects an invalid ticket or
  // an oversized Content-Length before formidable ever streams a byte to
  // disk for it.
  'global::upload-ticket-gate',
  {
    name: 'strapi::body',
    config: {
      // Raises formidable's multipart file-size cap from its 200 MB default
      // to match the document-repository's 500 MB upload ceiling (+ a
      // ~10 MB cushion for the surrounding multipart envelope). Verified
      // against @strapi/core@5.41.1's middlewares/body.js: the object
      // passed here is forwarded (merged with `{ multipart: true,
      // patchKoa: true }`) straight into `koa-body`, whose `formidable` key
      // is itself passed straight into the `formidable` package — so
      // `config.formidable.*` are genuine formidable `Options` (see
      // node_modules/formidable/src/Formidable.js's defaults and
      // node_modules/koa-body/lib/types.d.ts's `KoaBodyMiddlewareOptions`).
      //
      // NOTE: exceeding this limit does NOT come back as a clean 413 in
      // this Strapi/koa-body/formidable combo — see docs/document-repository.md
      // → "What happens when formidable's own limit is hit" for the exact
      // (surprising) failure shape. In practice this rarely matters: the
      // client shows its own pre-check (UX only, not a security boundary)
      // and, more importantly, `global::upload-ticket-gate`'s
      // Content-Length check above rejects an oversized request with a
      // clean 413 before formidable ever runs, for any client that reports
      // Content-Length honestly (every normal browser upload does). This
      // formidable-level cap only matters as a backstop against a client
      // that lies about Content-Length (smaller header than actual body).
      formidable: {
        maxFileSize: 510 * 1024 * 1024,
      },
    },
  },
  'strapi::session',
  'global::document-access',
  'strapi::favicon',
  'strapi::public',
];

export default config;
