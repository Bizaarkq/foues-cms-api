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

Stock `POST /api/upload` force-assigns the uploaded file to Strapi's
built-in **"API Uploads"** folder, ignoring any `fileInfo.folder` you pass —
so a raw content-API upload can never land inside (or under) the
"Documents" root, and would end up unprotected regardless of which
`document-category` it's linked to. This is exactly why stage 2 (below)
ships its own controller instead of using that route.

## Site uploads (stage 2)

Lets an authenticated site user (session held by the Next.js frontend)
upload a PDF into the repository from the public site, instead of an editor
uploading it from the admin panel.

### Endpoint contract

`POST /documents/upload`, multipart/form-data:

- File field **`file`** — exactly one file, `.pdf` extension,
  `application/pdf` MIME type, magic-byte signature `%PDF-`, ≤ 15 MB.
- Body field **`category`** — the target `document-category`'s
  `documentId`.
- Body field **`title`** — required, trimmed, ≤ 200 characters.
- Body fields **`uploaded_by_name`** / **`uploaded_by_email`** — who is
  uploading (populated by the frontend from the authenticated site user,
  same fields stage 1 fills in manually).

Response `200`: `{ ok: true, published: boolean, documentId: string }`.
Validation failures are `400` with a short machine-readable `error` code
(`invalid_title`, `invalid_category`, `category_not_found`,
`upload_not_enabled`, `invalid_file_count`, `invalid_extension`,
`invalid_mime_type`, `file_too_large`, `invalid_file_signature`,
`invalid_email`) plus an English `message`. Unexpected failures are `500`
`{ ok: false, error: 'internal_error' }` — the response never leaks
internals; details go to `strapi.log.error` only.

Controller: `src/api/document/controllers/upload.ts`. Route:
`src/api/document/routes/upload.ts`, auth scope
`api::document.upload.upload`.

### Where the file lands

The upload goes straight through
`strapi.plugin('upload').service('upload').upload()` (never the stock
content-API route — see the gotcha above), targeting a **per-category
subfolder** under the protected "Documents" root: the endpoint resolves (or
lazily re-creates) the "Documents" root folder, then finds or creates a
subfolder named after the category's **`slug`** underneath it
(`strapi.plugin('upload').service('folder').create()` — same call the
`011-document-repository-folder` migration uses for the root). This means
every upload automatically lands under the `document-access`-protected
tree, subfoldered per category, with no manual folder bookkeeping.

### Draft vs. published

The created `document` entry's status follows the category's
**`requires_approval`** flag: `true` → created as `draft` (an editor must
publish it, same approval step as stage 1's manual flow); `false` →
created directly as `published` (immediately readable, no review step).

### `upload_roles` semantics

`upload_roles` is enforced by the **frontend's Server Action**, which holds
the session and therefore knows the caller's role — this endpoint only
re-checks `upload_enabled` defensively (a category with uploads disabled
never accepts a file regardless of role). Same empty-means-open convention
as `allowed_roles` for reads: **empty `upload_roles` + `upload_enabled` =
any logged-in user may upload** to that category; a non-empty list
restricts uploads to sessions holding one of those roles.

### Token scope note

`DOCUMENT_TOKEN`'s permission list now includes `api::document.upload.upload`
(see `scripts/create-api-tokens.js`). The token-creation script **skips
tokens that already exist** — if `DOCUMENT_TOKEN` was already deployed
before this change shipped, it does **not** pick up the new scope
automatically. Either:

- run `node scripts/create-api-tokens.js --rotate` to regenerate it (update
  the `.env` value on both sides afterward), or
- add the `Document - upload.upload` permission to the existing token
  manually from Settings → API Tokens in the admin panel.

Until one of those happens, stage 2 uploads will 403 even though everything
else in this doc works.

### Known v1 gaps

- **Folder find-or-create race**: two concurrent first-uploads to a category
  can both find the root/category folder missing and both call
  `folderService.create()`. The controller retries with `findOne` on a create
  failure and uses the folder the other request just created; only rethrows
  if the folder still doesn't exist afterward.
- **Orphaned media on a rare create failure**: if the media file uploads
  successfully but the follow-up `document` entry creation throws, the
  controller attempts a compensating deletion of the uploaded file
  (`uploadService.remove()`) so it doesn't sit unreferenced in the protected
  tree. If that cleanup itself fails, the orphaned file's id and the
  category's slug are logged via `strapi.log.error` either way, for manual
  cleanup.
- **No upload idempotency key**: a user who retries after a client-side
  network timeout can create a duplicate `document` entry if the original
  request actually succeeded server-side before the client gave up.
