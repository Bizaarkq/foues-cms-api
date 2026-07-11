# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Strapi v5 (5.41.x, TypeScript) headless CMS for the Facultad de Odontología UES site. It is the content backend of a two-repo system: `foues-cms-frontend` (Next.js 16, cloned as a sibling directory) renders every public page from content served here via GraphQL (`/graphql`).

This file is the **single source of truth for architecture decisions** — there are no separate ADR files or CONTEXT.md (they were lost with a previous machine; decisions are consolidated in the "Decisions" section below). Bugs and pending work are tracked in **GitHub Issues**, not in memory tools.

## Workflow

- `develop` is the working branch (will be promoted to `main` when v1 is ready). GitHub account `Bizaarkq` is Edwin (solo dev).
- Conventional commits, optionally gitmoji-prefixed (`✨ feat(...)`, `🐛 fix(...)`). No AI attribution.
- Verification gate: `npx tsc --noEmit`. There is no test runner or linter configured yet — adding tests (here and in the frontend) is planned, not a decision against them.

## Commands

Package manager is **pnpm** (lockfile + `patches/` applied via pnpm).

- `pnpm develop` — dev server with autoReload. Bootstrap (`src/index.ts`) runs pending data migrations on every start when `NODE_ENV !== 'production'`.
- `pnpm data:migrate` — run pending data migrations explicitly (the production path; in Docker: `docker compose run --rm cms pnpm data:migrate`).
- `./scripts/generate-env.sh` — bootstrap `.env` with openssl-generated secrets (refuses to overwrite without `--force`; preserves DB credentials on `--force` so the MySQL volume stays accessible).
- `node scripts/create-api-tokens.js` — create/rotate the `STRAPI_API_TOKEN`, `FORM_SUBMIT_TOKEN` and `MAGAZINE_TRACK_TOKEN` API tokens via `admin::api-token` service and print them once (see `docs/forms-api-token.md`).
- `pnpm build` / `pnpm start` — build admin panel / run without autoReload.
- `pnpm console` — Strapi REPL.
- `npx tsc --noEmit` — type-check (the verification gate).

## Docker & deployment

Compose files live in this repo; `.env` sits next to them; the frontend repo must be cloned as a sibling (`../foues-cms-frontend`). Project name is pinned (`name: foues`) so containers/volumes keep their identity.

Services: `db` (MySQL 8, internal `backend` network), `cms` (Strapi, container `:1337`), `foues` (Next.js frontend, built from `../foues-cms-frontend`), `nginx` (reverse proxy on host `:80`).

- **Production (default)**: `docker compose up -d --build`, then seed with `docker compose run --rm cms pnpm data:migrate`.
- **Dev**: the override must be passed explicitly — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`. (It was renamed from `docker-compose.override.yml` to prevent accidental dev merge in prod.) Dev exposes the API on host `:8000` → container `:1337` and MySQL on loopback `:3306`.
- **nginx** routes `${FRONTEND_DOMAIN}` → frontend and `${CMS_DOMAIN}` → Strapi via the envsubst template `nginx/templates/default.conf.template` (rendered by the nginx image at startup). Domains come from the `.env` (defaults: the test-server domains). `CMS_DOMAIN` must match `STRAPI_PUBLIC_URL`.
- Current environment: a **test server** using those domains, with a test Google OAuth client already working.
- Healthchecks use `127.0.0.1` (not `localhost`) to avoid IPv6 resolution failures on Alpine.
- `STRAPI_URL` (internal, `http://cms:1337`) vs `STRAPI_PUBLIC_URL` (browser-facing, for media URLs) — both flow to the frontend build and runtime.

## Architecture: SDUI pipeline

The whole system is server-driven UI. Content flows:

```
route (nav tree + access control) → page (dynamic zone "content") → block components → GraphQL → frontend registry
```

- **`api::route.route`** — tree of `path`/`label`/`order`/`type`/`active` driving navigation. `visibility` enum (`public` | `requires-login`) is the access-control source of truth; enforcement happens in the frontend Server Component after resolving the route (NOT in the proxy/middleware). The boolean field is named `active` because **Strapi v5 GraphQL reserves the field name `enabled`**.
- **`api::page.page`** — `title`, `layout` (`default` | `full-width`), `content` dynamic zone holding the block components in `src/components/blocks/`.
- **`api::mobile-navbar.mobile-navbar`** — single type governing the frontend's mobile bottom bar: repeatable `navigation.mobile-nav-item` component (**max 3, schema-enforced**) with `label`, `icon` (lucide), and either a `route` relation (internal target — must be an active `type: page` route; the frontend drops anything else) or `external_url` (external wins if both are set). "Inicio" and "Menú" are hardcoded in the frontend; seeded by data migration 005.
- **Frontend contract**: every block maps to an inline GraphQL fragment in `foues-cms-frontend/lib/strapi.ts` (`LEAF_BLOCK_FRAGMENTS`), a `TYPENAME_TO_COMPONENT` entry, a `normalizeBlocks` pass, and a component registry entry. Adding or changing a block schema here is incomplete until those frontend pieces are updated.
- **Nested blocks**: Strapi v5 cannot nest dynamic zones inside components, so nesting uses `blocks.section` → relation to the `block-group` collection type (a reusable container of flat blocks), max 2 levels. GraphQL `depthLimit` is 10 in `config/plugins.ts` specifically to allow this — don't lower it.
- **Intentionally unused schemas**: `blocks/hero.json`, `blocks/dynamic-collection.json` and `api::article` are NOT in any dynamic zone or frontend query. They are kept on purpose for when the final frontend design lands — do not delete them as "dead code".

## Magazine pipeline (revista / publicaciones)

**Multi-publication model**: `api::publication.publication` (no draft & publish) groups editions — each publication (Revista Estudiantil, informes científicos, memorias…) owns its `magazine-issue` entries via a required manyToOne relation. The `blocks.magazine-archive` component has a `title` field and a `publications` relation: each placement of the block selects which publications it lists (none selected = all). Edition URLs are **derived from where the block lives** (`{page-path}/{issue-slug}`) — there is no hardcoded route prefix anywhere. The Publisher admin role gets publication CRUD via data migration 004.

`api::magazine-issue.magazine-issue` (draft & publish) holds an uploaded PDF; an async pipeline converts it to page images for the frontend flipbook viewer.

- **Trigger**: lifecycles (`content-types/magazine-issue/lifecycles.ts`) detect a PDF change on the draft row, set `conversionStatus = 'processing'`, and fire the conversion service after a 100 ms defer (so the write transaction commits first).
- **Conversion** (`services/conversion.ts`): renders the PDF with `pdftoppm` (poppler-utils, installed in the Dockerfile) at 150 DPI JPEG q=85 into a temp dir, uploads pages into the media library folder tree `magazines/{slug}/pages`, links the `pages` relation, sets `conversionStatus = 'ready'`, re-publishes if a published row exists, then deletes the old page files.
- **Loop guard**: a `Set` stored on the global `strapi` object (`__conversionWrites`) is shared between lifecycle and service — it MUST live on the global because TypeScript compilation produces separate module copies in `dist/`, so a module-level Set would not be shared. Pipeline DB writes go through raw Knex to bypass lifecycles.
- **System-managed fields**: `pages` and `conversionStatus` are stripped from user writes in `beforeCreate`/`beforeUpdate` — editors cannot set them manually.
- **Tracking**: `POST /api/magazine-issues/:documentId/track` (`controllers/track.ts`, custom route with token scope `api::magazine-issue.track.track`) aggregates daily stats into `api::magazine-stat.magazine-stat` (visits + cumulative depth buckets 25/50/75/100). The collection is hidden from the content manager; stats are viewed via the `MagazineStatsPanel` admin extension (CSV export).
- **Stat rows are race-free by construction** (issue #8): a composite unique on (issue, date) is impossible in Strapi v5 (the relation lives in the `magazine_stats_issue_lnk` link table), so the daily row's `document_id` is DETERMINISTIC — `stat-i{issueId}-{YYYY-MM-DD}` — backed by a unique index (migration 006) and written with a single atomic `INSERT … ON DUPLICATE KEY UPDATE` (the link row is inserted only on the insert path, same transaction). The invariant holds because ONLY track.ts writes this collection — if anything else ever creates stat rows, it must use the same deterministic id.
- The frontend never calls the track endpoint directly — it proxies through its own `/api/magazine-track` route so `MAGAZINE_TRACK_TOKEN` never reaches the browser.

## Data migrations (seeds)

Seed data lives in `src/seeds/` (JSON) and is applied by ordered data migrations in `src/data-migrations/`, run by a custom runner (`runner.ts`) that tracks applied migrations in the `data_migrations` table — each migration runs exactly once, wrapped in a DB transaction.

- Triggers: dev bootstrap runs pending migrations automatically; production runs them explicitly via `pnpm data:migrate` after `docker compose up -d`.
- Do NOT use Strapi's native `database/migrations/` for seeding: those run BEFORE schema sync (tables may not exist on a fresh DB) and only expose Knex — no Document Service, so dynamic zones/documentId pairs would need hand-written SQL.
- To add a migration: create `src/data-migrations/NNN-name.ts` exporting a `DataMigration`, append it to the registry array in `src/data-migrations/index.ts` (never reorder existing entries).
- Existing migrations keep idempotency guards (route table empty check, page exists check) so databases seeded by the old bootstrap seeder are not double-seeded.
- Seeds reference routes by `routePath`, which must already exist in the tree.
- Seeds never include media — editors upload images through the admin. Placeholder body convention is a `blocks.rich-text` with content `"—"`.
- Page copy in seeds comes from the Figma mockups; content is Spanish (es-SV audience).

## Forms

- `api::form.form` defines fields with the `elements.form-field` component; `api::form-submission.form-submission` stores answers as a single `data` JSON attribute (deliberate decision: dynamic per-form collections would require a server restart in production/Docker).
- CSV export is an admin panel extension, `src/admin/extensions/FormSubmissionsPanel/` — CSV is built client-side (`csvExport.ts`: UTF-8 BOM, CRLF, tab-prefix formula-injection hardening). There is no public export endpoint; controller/router for form-submission are stock core.
- Frontend submits via a restricted API token; setup steps in `docs/forms-api-token.md` (`FORM_SUBMIT_TOKEN`: scopes `form.findOne` + `form-submission.create` only).

## Cache invalidation

Content changes notify the frontend through a Strapi webhook (configured in Admin → Settings → Webhooks, not in code) pointing at the frontend's `/api/revalidate` route handler. The handler maps `route`/`page`/`magazine-issue` to their tags and treats ANY other model as "expire all pages" — so the webhook must have create/update/delete/publish/unpublish entry events enabled for **all content types that feed rendering** (footer, global-theme, block-group, staff, organizational-unit, form, magazine-issue, mobile-navbar…), not just page/route.

## Schema conventions

- Every schema field uses superfields custom fields (`plugin::superfields.tooltip-field` / `tooltip-enum-field`) with Spanish tooltip + description. Keep 100% coverage when adding fields. Exception: fields with `unique: true` (e.g. `route.path`) must stay plain `string` — tooltip-field does not support the unique constraint.
- Icon fields use `plugin::strapi-lucide-icons.icon`, which stores **kebab-case** Lucide names (`book-open`, `map-pin`). PascalCase values will not render in the frontend's `LucideIcon` component.
- `strapi-plugin-superfields` is patched under `patches/` — do not bump that dependency without re-checking the patch.

## Database gotchas

- MySQL via Docker in dev. If you ever truncate component tables manually, truncate the component table, its `_cmps` junction table, and the parent links **together** (e.g. `components_blocks_quick_links` + `components_blocks_quick_links_cmps`), otherwise the auto_increment reset corrupts parent–child relations.

## Decisions (consolidated — formerly ADRs)

1. **Custom data-migration runner over Strapi native migrations** — native ones run before schema sync and lack the Document Service (see Data migrations above).
2. **Form submissions as a JSON blob** — dynamic per-form collections would need a restart per new form in production.
3. **Nesting via `blocks.section` → `block-group` relation** (not nested dynamic zones — Strapi can't) with `depthLimit: 10` in GraphQL to make room for it; max 2 UI levels.
4. **`active` instead of `enabled`** on routes — `enabled` is reserved by Strapi v5 GraphQL.
5. **Access control enforced in the frontend Server Component**, driven by `route.visibility`; the CMS only declares it.
6. **Conversion loop-guard on the `strapi` global** — module-level state doesn't survive the dist/ module duplication.
7. **Raw Knex for pipeline writes** — bypasses lifecycles that would otherwise strip system-managed fields or recurse.
8. **Restricted per-purpose API tokens** (`STRAPI_API_TOKEN` read, `FORM_SUBMIT_TOKEN` submit-only, `MAGAZINE_TRACK_TOKEN` track-only) created by script, never by hand.
