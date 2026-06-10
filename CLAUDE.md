# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Strapi v5 (5.41.x, TypeScript) headless CMS for the Facultad de Odontología UES site. It is the content backend of a two-app monorepo: `foues-cms-frontend` (Next.js 16) renders every public page from content served here via GraphQL (`/graphql`). The two apps share one business domain — see `../docs/agents/domain.md`; check `../CONTEXT.md` and `../docs/adr/` (both created lazily) before renaming domain terms or re-deciding architecture.

## Commands

Package manager is **pnpm** (lockfile + `patches/` applied via pnpm).

- `pnpm develop` — dev server with autoReload. Bootstrap (`src/index.ts`) runs pending data migrations on every start when `NODE_ENV !== 'production'`.
- `pnpm data:migrate` — run pending data migrations explicitly (the production path; in Docker: `docker compose run --rm foues-cms-api pnpm data:migrate`).
- `pnpm build` / `pnpm start` — build admin panel / run without autoReload.
- `pnpm console` — Strapi REPL.
- `npx tsc --noEmit` — type-check. There is no test runner or linter configured; this is the verification gate.

Docker (from the repo root, not this folder): `docker compose up` merges `docker-compose.override.yml` for dev. API is exposed on `:8000` → container `:1337`, MySQL 8 service `db`. Production: `docker compose -f docker-compose.yml up --build`.

## Architecture: SDUI pipeline

The whole system is server-driven UI. Content flows:

```
route (nav tree + access control) → page (dynamic zone "content") → block components → GraphQL → frontend registry
```

- **`api::route.route`** — tree of `path`/`label`/`order`/`type`/`active` driving navigation. `visibility` enum (`public` | `requires-login`) is the access-control source of truth; enforcement happens in the frontend Server Component after resolving the route (NOT in the proxy/middleware). The boolean field is named `active` because **Strapi v5 GraphQL reserves the field name `enabled`**.
- **`api::page.page`** — `title`, `layout` (`default` | `full-width`), `content` dynamic zone holding the block components in `src/components/blocks/`.
- **Frontend contract**: every block maps to an inline GraphQL fragment in `foues-cms-frontend/lib/strapi.ts` (`BLOCK_FRAGMENTS`), a `normalizeBlocks` pass, and a component registry entry. Adding or changing a block schema here is incomplete until those three frontend pieces are updated.
- **Nested blocks (ADR-5)**: Strapi v5 cannot nest dynamic zones inside components, so nesting uses `blocks.section` → relation to the `block-group` collection type (a reusable container of flat blocks), max 2 levels, with a JSON escape hatch beyond that. GraphQL `depthLimit` is 10 in `config/plugins.ts` specifically to allow this — don't lower it.

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

Content changes notify the frontend through a Strapi webhook (configured in Admin → Settings → Webhooks, not in code) pointing at the frontend's `/api/revalidate` route handler.

## Schema conventions

- Every schema field uses superfields custom fields (`plugin::superfields.tooltip-field` / `tooltip-enum-field`) with Spanish tooltip + description. Keep 100% coverage when adding fields. Exception: fields with `unique: true` (e.g. `route.path`) must stay plain `string` — tooltip-field does not support the unique constraint.
- Icon fields use `plugin::strapi-lucide-icons.icon`, which stores **kebab-case** Lucide names (`book-open`, `map-pin`). PascalCase values will not render in the frontend's `LucideIcon` component.
- `strapi-plugin-superfields` is patched under `patches/` — do not bump that dependency without re-checking the patch.

## Database gotchas

- MySQL via Docker in dev. If you ever truncate component tables manually, truncate the component table, its `_cmps` junction table, and the parent links **together** (e.g. `components_blocks_quick_links` + `components_blocks_quick_links_cmps`), otherwise the auto_increment reset corrupts parent–child relations.
