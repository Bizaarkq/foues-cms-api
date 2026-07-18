# Document Repository

Role-gated document repository. Stage 1 (this doc) is **read-only**: editors
manage everything from the admin panel, and the frontend only reads and logs
downloads through a restricted API token plus a middleware-enforced media
gate. Stage 2 (site uploads by end users) is out of scope here — see the
gotcha at the bottom for what it will need.

## Content model

- **`api::document-category.document-category`** — groups documents and
  controls read access.
  - `name`, `slug`, `description`.
  - `allowed_roles` (relation → `api::user-role.user-role`, one-way, no
    inverse side): roles allowed to **read** this category's documents.
    **Empty = any logged-in user may read.** There is no "public, no login"
    tier for categories — the repository is a logged-in-users feature.
  - `upload_enabled`, `upload_roles`, `requires_approval`: **stage 2 only**,
    unused for now. They exist so the schema doesn't need another migration
    when site uploads land.
  - `documents` — the reverse side of `document.category`.
- **`api::document.document`** — one uploaded file.
  - `title`, `file` (single media, `allowedTypes: ["files"]`), `category`
    (required, manyToOne → document-category).
  - `uploaded_by_name` / `uploaded_by_email` — who uploaded it. In stage 1
    this is just filled in manually by whichever editor uploads on someone's
    behalf; in stage 2 it's populated from the authenticated site user.
  - **Draft & Publish is the approval flow**: a document sits as a draft
    until an editor reviews and publishes it. The frontend only ever reads
    published entries. There is no separate "status" field or lifecycle —
    publish/unpublish IS approve/revoke.
  - PDF-only is enforced at upload surfaces (admin discipline in stage 1; a
    Server Action check in stage 2), not by a CMS lifecycle hook — Strapi's
    `allowedTypes: ["files"]` accepts any non-image/video file type, so
    nothing stops an editor from uploading a `.docx` by mistake. Keep an eye
    on it.
- **`api::document-download.document-download`** — audit log row per
  download: `document` (one-way manyToOne, no inverse), `user_email`,
  `user_name`, `downloaded_at`. Written by the frontend's download proxy via
  `DOCUMENT_TOKEN`'s `create` scope; nothing in the CMS writes these rows.
- **`blocks.document-repository`** — self-fetching SDUI block (`title` +
  `categories` relation, same shape as `blocks.magazine-archive`). Added to
  `page.content`'s dynamic zone.

GraphQL exposure is automatic (shadowCRUD) — no resolvers were written.

## Admin steps (stage 1, manual)

1. **Create categories**: Content Manager → Document category → New entry.
   Set `name`, optionally `description`, and `allowed_roles` (leave empty for
   "any logged-in user"). `upload_enabled` / `upload_roles` /
   `requires_approval` can be left at their defaults — they don't do
   anything until stage 2 ships.
2. **Upload PDFs into the "Documents" folder**: Media Library → open (or
   create a subfolder inside) the **"Documents"** root folder — this exact
   folder is what data migration `011-document-repository-folder` creates on
   first boot, and what `document-access` middleware treats as the protected
   boundary (see below). Uploading elsewhere in the media library means the
   file is served **unprotected**.
3. **Create document entries**: Content Manager → Document → New entry. Set
   `title`, attach the `file` you just uploaded, pick its `category`, and
   optionally fill `uploaded_by_name` / `uploaded_by_email`.
4. **Publish** the entry when it's ready to be readable — this is the
   approval step. Unpublishing revokes read access immediately (next cache
   expiry aside — see the webhook reminder below).

## Media protection

`src/middlewares/document-access.ts` (registered as `global::document-access`
in `config/middlewares.ts`, right after `strapi::session` and before
`strapi::favicon`) intercepts `GET`/`HEAD /uploads/*` requests. If the
requested file lives under the "Documents" root folder (or any subfolder of
it), the request is only allowed through with a matching
`x-document-access-secret` header; otherwise it gets a plain **404** (never
403/401 — existence of a restricted file is not revealed). Files outside
"Documents" are untouched.

This means the folder is the enforcement boundary, not the `document`
content type — a PDF uploaded outside "Documents" and merely linked from a
`document` entry would NOT be protected. Always upload into (a subfolder of)
"Documents".

The middleware caches its per-file "is this protected" decision in memory.
Moving a file **into** the "Documents" tree can therefore take up to ~60
seconds to actually start requiring the secret if that file's URL was
already cached as unprotected (a deliberately short TTL — see the code
comments in `document-access.ts` for the confidentiality-window rationale).

## `DOCUMENT_TOKEN`

Created/rotated the same way as the other restricted tokens:

```bash
node scripts/create-api-tokens.js            # first creation
node scripts/create-api-tokens.js --rotate    # rotate an existing one
```

Scopes: `document.find` + `document.findOne`, `document-category.find` +
`document-category.findOne`, `document-download.create`. See
`docs/forms-api-token.md` for the general token workflow (`.env`, rebuild).

## `DOCUMENT_ACCESS_SECRET`

A shared secret between this CMS and the frontend — **not** a Strapi API
token. `scripts/generate-env.sh` generates it alongside `REVALIDATE_SECRET`.
The frontend's own download proxy route (a Server Component/Action, never
the browser directly) attaches it as the `x-document-access-secret` header
when fetching a protected file server-to-server; `document-access`
middleware checks it against `process.env.DOCUMENT_ACCESS_SECRET`. Both
sides must have the same value — treat it like any other shared secret
(rotate on both sides together).

If `DOCUMENT_ACCESS_SECRET` is missing or empty, the middleware logs a
`strapi.log.warn` at startup, and **every** protected document download 404s
(the secret comparison can never succeed) until the variable is set.

## No public-role permissions needed

Unlike `global-theme` (which needs a public `find` permission because the
frontend reads it unauthenticated), **`document`, `document-category` and
`document-download` need zero Settings → Users & Permissions → Public
grants**. The frontend reads them exclusively via `DOCUMENT_TOKEN`
(authenticated, server-side), and the download itself is gated by the
`document-access` middleware, not by content-API permissions. Leaving Public
permissions disabled here is intentional, not an oversight.

## Revalidation webhook reminder

Per the CMS's cache-invalidation contract (see `CLAUDE.md` → "Cache
invalidation"), the frontend's `/api/revalidate` webhook target treats any
model it doesn't special-case as "expire everything." `document` and
`document-category` changes still need to reach readers promptly (a newly
published document, a category's `allowed_roles` change), so make sure the
Strapi webhook (Settings → Webhooks) has create/update/delete/publish/
unpublish entry events enabled for **`document`** and
**`document-category`** too, same as every other content type that feeds
rendering. (`document-download` doesn't need it — it's a write-only audit
log, nothing renders from it.)

## Stage 2 gotcha (for later): content-API uploads and the "API Uploads" folder

When site uploads land, do **not** point them at the stock
`POST /api/upload` content-API route: it force-assigns the uploaded file to
Strapi's built-in **"API Uploads"** folder, ignoring any `fileInfo.folder`
you pass — so a raw content-API upload can never land inside (or under) the
"Documents" root, and would end up unprotected regardless of which
`document-category` it's linked to. Stage 2 will need a **custom
controller** that calls
`strapi.plugin('upload').service('upload').upload()` directly, passing
`fileInfo.folder` (or `folderPath`) so the file is created inside the right
subfolder of "Documents" (or the category's own upload target) from the
start.
