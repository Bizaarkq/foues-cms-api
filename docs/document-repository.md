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

Uploads are **one-time-ticket, direct browser→CMS**: the frontend issues a
short-lived ticket while it still holds the session (so it can validate
who's allowed to upload where), then the browser POSTs the file straight to
this CMS — there is no Next.js hop in the middle for the file bytes
themselves. This is a two-endpoint contract, both on this CMS:

### Issuance — `POST /documents/upload-tickets`

Auth-scoped (`DOCUMENT_TOKEN`, scope `api::document-upload-ticket.issue.issue`)
— called server-to-server by the frontend, which has already checked the
site user's session and `upload_roles` before ever reaching this endpoint.
JSON body:

```json
{ "category": "documentId", "title": "…", "uploaded_by_name": "…", "uploaded_by_email": "…" }
```

- **`category`** (required) — the target `document-category`'s
  `documentId`. Resolved server-side; 400 `category_not_found` if it
  doesn't exist, 400 `upload_not_enabled` if the category doesn't accept
  uploads.
- **`title`** (required) — trimmed, 1–200 characters. 400 `invalid_title`
  otherwise.
- **`uploaded_by_name`** / **`uploaded_by_email`** (optional) — who is
  uploading. `uploaded_by_email`, if present, must match a basic email
  shape (400 `invalid_email` otherwise).

Even though this endpoint is token-authed, the JSON body itself is **not**
authoritative — every field is defensively validated exactly as
`document/controllers/upload.ts` used to validate its own query
params/headers, because the caller (the frontend) is trusted for holding
the session, not for the shape of what it forwards.

On success: a `document-upload-ticket` row is created with a fresh opaque
ticket (`crypto.randomBytes(16).toString('base64url')`), a 10-minute
`expires_at`, and `used: false`. Response `200`:

```json
{ "ok": true, "ticket": "…", "expiresAt": "2026-…Z" }
```

**Lazy cleanup**: right after creating the new ticket, the same call
opportunistically deletes ticket rows whose `expires_at` is more than an
hour in the past (`strapi.db.query(...).deleteMany(...)`, wrapped so a
cleanup failure only `strapi.log.warn`s and never delays or fails the
issuance response). This runs on every issuance call instead of a
scheduled job — the project has no cron/scheduled-job infrastructure, and
piggybacking on issuance traffic is enough to keep the table bounded.

Controller: `src/api/document-upload-ticket/controllers/issue.ts`. Route:
`src/api/document-upload-ticket/routes/issue.ts`.

### Redemption — `POST /documents/upload/:ticket`

**Public** (`auth: false`) — not an oversight. The ticket in the URL path
IS the credential: an opaque, single-use, 10-minute-TTL string bound to a
specific category+title+uploader identity at issuance time. The browser
calls this route directly, so there is no Bearer token to require, and
requiring one would be both impossible for the real client and meaningless
as a security boundary.

Multipart/form-data, file field **`file`** — exactly one file, `.pdf`
extension, `application/pdf` MIME type, magic-byte signature `%PDF-`,
≤ 500 MB (see "Configurable parameters" below). Category, title, and
uploader identity all come from the redeemed ticket entity — none of them
travel as request fields anymore.

Redemption is an **atomic single-use compare-and-swap**, implemented as a
raw SQL `UPDATE ... WHERE ticket = ? AND used = false AND expires_at > ?`
run directly through `strapi.db.connection` (knex) — the same low-level
pattern `src/api/site-user/controllers/track-login.ts` already uses for its
own atomicity requirement. This deliberately does **not** use
`strapi.db.query(uid).update({ where, data })`: that entity-manager call
looks like a compare-and-swap but isn't one — it runs a `SELECT` against
your `where` clause first, then re-scopes the actual `UPDATE` to the found
row's primary key only, dropping the rest of the `where` clause (e.g.
`used: false`) for that second query. Two concurrent requests for the same
ticket could both pass the initial `SELECT` and both then successfully
`UPDATE` by id — not the "exactly one request wins" guarantee a
single-use credential requires. See `redeemTicket()` in
`src/api/document/controllers/upload.ts` for the implementation and a
fuller comment.

Any failure to redeem (ticket missing, already used, or expired) responds
`404`:

```json
{ "ok": false, "error": "invalid_ticket", "message": "this upload ticket is missing, already used, or expired" }
```

The three cases (missing/used/expired) are deliberately **not**
distinguished in the response — collapsing them avoids leaking which case
it was to a caller probing ticket strings.

**Burn-on-failure**: once the atomic redemption UPDATE succeeds, the ticket
is burned — permanently, even if a *later* validation step in the same
request fails (wrong file type, category's `upload_enabled` flipped off
since issuance, etc.). There is no "unburn" path. The client's upload form
simply requests a fresh ticket and retries; this keeps the redemption logic
simple (one atomic step, no partial-rollback bookkeeping) at the cost of a
ticket being a strictly one-shot attempt rather than one-shot-per-success.

Response `200` on a fully successful upload:
`{ ok: true, published: boolean, documentId: string }`. Other validation
failures are `400` with the same machine-readable `error` codes as before
(`upload_not_enabled`, `invalid_file_count`, `invalid_extension`,
`invalid_mime_type`, `file_too_large`, `invalid_file_signature`) plus an
English `message`. Unexpected failures are `500`
`{ ok: false, error: 'internal_error' }` — the response never leaks
internals; details go to `strapi.log.error` only. **Exception**: a request
whose file exceeds formidable's own `maxFileSize` never reaches this
controller at all and gets a different, less clean `500` shape — see "What
happens when formidable's own limit is hit" below.

Controller: `src/api/document/controllers/upload.ts`. Route:
`src/api/document/routes/upload.ts` — `auth: false`.

### CORS and anti-abuse

Direct browser→CMS upload means the frontend's own rate limiter no longer
covers the actual file-transfer traffic — the throttled step moves to
**issuance** (session-gated and rate-limited on the Next.js side).
Redemption is self-limiting by construction: a ticket can only ever produce
one successful upload, so replaying or hammering the same ticket string
does nothing after its first (successful or burned) use. Volumetric abuse
against the public redemption endpoint itself (many *different* tickets, or
raw request-flood traffic) is covered by two layers now:
`global::upload-ticket-gate` (`src/middlewares/upload-ticket-gate.ts`)
rejects an invalid/oversized request before formidable ever runs (see
"Configurable parameters" above), and nginx rate-limits the
`^/api/documents/upload/` path itself (`limit_req zone=docupload burst=3
nodelay;`, zone `rate=6r/m`, in `nginx/templates/default.conf.template` —
see that file's comments if the zone declaration needs enabling per your
nginx setup). nginx's `client_max_body_size` also still caps request size
as before.

Because the browser now calls this CMS directly from the public site's own
origin, `SITE_ORIGIN` must be set in production so `strapi::cors`
(`config/middlewares.ts`) admits that origin — see `deploy.md` §3.2 and
`scripts/generate-env.sh`. Unset/empty allows only `http://localhost:3000`,
and only outside production — production has no fallback origin, so
`SITE_ORIGIN` must be set there or direct uploads (and any other
cross-origin browser call to this CMS) will fail CORS.

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

`upload_roles` is enforced by the **frontend, before it ever issues a
ticket** — it holds the session and therefore knows the caller's role.
Neither CMS endpoint re-checks a caller's role (the redemption endpoint has
no caller identity to check — it's public and ticket-gated); the issuance
endpoint only re-checks `upload_enabled` defensively (a category with
uploads disabled never issues a ticket regardless of role), and the
redemption endpoint re-checks `upload_enabled` again at redemption time
(category config may have changed between issuance and redemption). Same
empty-means-open convention as `allowed_roles` for reads: **empty
`upload_roles` + `upload_enabled` = any logged-in user may upload** to that
category; a non-empty list restricts ticket issuance to sessions holding
one of those roles.

### Token scope note

`DOCUMENT_TOKEN`'s permission list now includes
`api::document-upload-ticket.issue.issue` in place of the old
`api::document.upload.upload` (see `scripts/create-api-tokens.js`) — the
upload/redemption route itself is `auth: false` now (public, ticket-gated),
so an API-token scope for it would be meaningless; issuance is the endpoint
that actually needs token auth. The token-creation script **skips tokens
that already exist** — if `DOCUMENT_TOKEN` was already deployed before this
change shipped, it does **not** pick up the new scope automatically, and
still carries the now-dead `document.upload.upload` scope. Either:

- run `node scripts/create-api-tokens.js --rotate` to regenerate it (update
  the `.env` value on both sides afterward), or
- add the `Document-upload-ticket - issue.issue` permission to the existing
  token manually from Settings → API Tokens in the admin panel (removing
  the stale `Document - upload.upload` one is optional cleanup, not
  required for correctness).

Until one of those happens, ticket issuance will 403 even though everything
else in this doc works.

### Configurable parameters

`max_upload_mb` lives on the `api::site-setting.site-setting` single type
(`src/api/site-setting/`), editable from the Strapi admin (Content Manager →
Site setting). It sets the effective upload size ceiling enforced by
`src/api/document/controllers/upload.ts`'s `file_too_large` check.

- **Hard ceiling of 500 MB**, enforced by the schema (`max: 500`) and
  clamped again in the controller (`resolveMaxUploadMb`'s
  `MAX_UPLOAD_MB_MAX`). The browser now uploads straight to this CMS (the
  ticket-based direct-upload flow) — the frontend never touches the file
  bytes at all, so it cannot cap the ceiling from its side anymore. The
  full ceiling chain, all kept in lockstep at 500 MB, is:
  1. `site-setting.max_upload_mb` (this single type, admin-editable, clamped
     here to `[1, 500]`).
  2. The frontend's client-side pre-check (`DocumentUploadForm.tsx`,
     reading the same value) — **UX only, no network gate**: it just gives
     the user immediate feedback before the browser ever opens a
     connection to this CMS.
  3. `global::upload-ticket-gate`'s `Content-Length` check
     (`src/middlewares/upload-ticket-gate.ts`) — the real early gate: it
     runs before `strapi::body` (formidable) ever starts streaming the
     request to a temp file, rejecting an oversized `Content-Length` with a
     clean `413` for any client that reports it honestly.
  4. Formidable's `maxFileSize` (`config/middlewares.ts`, `strapi::body` →
     `config.formidable.maxFileSize`, set to `510 * 1024 * 1024` — a
     ~10 MB cushion above the 500 MB content ceiling for the surrounding
     multipart envelope) — the hard, authoritative cap against bytes really
     received, since formidable streams straight to a temp file rather than
     buffering; this is the backstop for a client that lies about
     `Content-Length` (smaller header than actual body).
  5. The reverse proxy's `client_max_body_size` (`nginx/templates/default.conf.template`
     in this repo, `510M` on both the `FRONTEND_DOMAIN` and `CMS_DOMAIN`
     server blocks) — must stay ≥ the formidable ceiling, or nginx rejects
     the request before it ever reaches either app.
  Raising the ceiling further than 500 MB requires bumping steps 1, 3, 4 and
  5 in the same direction; lowering `site-setting.max_upload_mb` alone
  (step 1) is enough to tighten the *effective* limit without touching the
  others, same pattern as before.
- **Fallback is 15 MB** whenever the single type has no entry yet, or the
  read fails for any reason — a config-read failure must never fail an
  upload; it silently falls back to the safe default instead. (The default
  stays modest even though the ceiling is now 500 MB — an admin has to
  deliberately opt into raising it.)
- **Disk space**: a 500 MB ceiling means the CMS host needs enough free
  disk for the temp file(s) formidable writes during an in-flight upload
  (`os.tmpdir()`, cleaned up automatically once the request finishes —
  see the `strapi::body` middleware's post-`next()` cleanup) PLUS the
  permanent copy the upload plugin's local provider writes under
  `public/uploads/`. Size deploys accordingly if concurrent large uploads
  are expected.

### What happens when formidable's own limit is hit

This is worth documenting precisely because the failure shape is **not**
what it looks like it should be from reading `@strapi/core`'s
`middlewares/body.js` source. That file has a special case:

```js
if (error.message.includes('maxFileSize exceeded')) {
  return ctx.payloadTooLarge('FileTooBig'); // -> a clean 413
}
throw error;
```

...but formidable v2.1.5 (the version this Strapi version depends on)
actually throws a `FormidableError` whose message is
`` `options.maxFileSize (${N} bytes) exceeded, received (${M}) bytes of
file data` `` (see `formidable/src/Formidable.js`) — note the byte counts
sitting *between* "maxFileSize" and "exceeded". That string does **not**
contain `'maxFileSize exceeded'` as a contiguous substring, so the special
case's `.includes()` check never matches, and the error falls through to
`throw error;` instead.

From there: `FormidableError` sets `.httpCode` (413) and a formidable
internal `.code`, but **not** `.status`/`.statusCode` — the two properties
`@strapi/core`'s error-formatting service (`services/errors.js`,
`formatInternalError` → the `http-errors` package's `createError(error)`)
actually reads to pick a status. Finding neither, it defaults to `500`. Net
result: **a file that exceeds formidable's `maxFileSize` comes back as a
generic, undifferentiated `500`** —
`{ data: null, error: { status: 500, name: 'InternalServerError', message: 'Internal Server Error', details: {} } }`
— with no `ok`/`error`/`limit_mb` fields for the frontend's
`mapUploadError()` to key off of, so the site user just sees the generic
fallback message ("No se pudo subir el documento. Inténtalo de nuevo.")
instead of a size-specific one.

In practice this rarely matters: `global::upload-ticket-gate`
(`src/middlewares/upload-ticket-gate.ts`) rejects an oversized
`Content-Length` with a clean `413` *before* `strapi::body`/formidable ever
runs, for any client that reports `Content-Length` honestly (every normal
browser upload does; the frontend's own client-side pre-check in
`DocumentUploadForm.tsx` catches it even earlier, but that's UX only, not a
gate this CMS can rely on). This formidable-level ceiling is a backstop for
a client that lies about `Content-Length` (smaller header than actual
body) — a rare, arguably adversarial case — and it currently fails ugly
rather than gracefully. Worth revisiting (e.g. koa-body's `onError` config
hook) if that backstop path turns out to matter in practice; left as-is for
now to keep this change's diff minimal.

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
- **Ticket TTL vs. slow uploads on large files — mostly closed**: Strapi's
  `strapi::body` middleware (formidable) fully parses the incoming
  multipart body — including streaming the whole file to a temp file —
  **before** the controller (and therefore the ticket-expiry check inside
  `redeemTicket()`) ever runs. For a large file (up to the 500 MB ceiling)
  on a slow connection, the actual transfer can take longer than the
  ticket's TTL; if it does, the expiry check rejects an upload that was
  legitimately started within the window, even though no abuse occurred.
  `TICKET_TTL_MS` (`document-upload-ticket/controllers/issue.ts`) was raised
  from 10 to 60 minutes specifically to shrink this window — 60 minutes
  comfortably covers a 500 MB upload down to roughly ~1.2 Mbps. **Residual
  gap**: connections slower than that can still hit it. This is inherent to
  Strapi's middleware-before-controller pipeline (the ticket can't
  practically be checked before the body is parsed) — a user who hits this
  simply requests a fresh ticket and retries (same as any other
  burn-on-failure case).
