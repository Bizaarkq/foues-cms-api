# Faculty Magazine (Flipbook) — Design

Date: 2026-06-10
Status: approved-pending-review
Scope: foues-cms-api + foues-cms-frontend

## Overview

Publish the faculty magazine as a browsable flipbook. A Publisher uploads one
PDF per edition; the backend converts every page to an image; readers browse
an archive of editions and read each one as a flipbook with lazy-loaded page
images, with the original PDF available for download. Reading metrics
(visits and read depth) are collected first-party and surfaced in the admin.

## Decisions (agreed 2026-06-10)

| Topic | Decision |
|---|---|
| Editorial model | Archive of editions (collection type), not a single current issue |
| Pipeline | Hybrid: server-side PDF→image conversion + downloadable original PDF |
| Publisher role | Custom admin role, publishes directly (no approval step) |
| Reader navigation | One URL per edition (`/quienes-somos/revista/{slug}`) |
| Metrics | First-party aggregates in the CMS (no third-party analytics) |

## Content model (API)

`api::magazine-issue.magazine-issue` (collection type, draft & publish ON):

- `title` — string (superfields tooltip, Spanish, per project convention)
- `slug` — uid (plain, no tooltip: unique constraint incompatible with tooltip-field)
- `number` — integer
- `date` — date (publication date)
- `description` — text
- `cover` — media, single image
- `pdf` — media, single file (the source of truth uploaded by the Publisher)
- `pages` — media, multiple, ordered (system-managed: filled by the conversion
  pipeline, not edited manually)
- `conversionStatus` — enum `processing | ready | failed` (system-managed)

Metrics aggregate — `api::magazine-stat.magazine-stat` (hidden from the
content manager UI):

- `issue` — relation to magazine-issue
- `date` — date (one row per issue per day)
- `visits` — integer
- `depth25` / `depth50` / `depth75` / `depth100` — integers (sessions whose
  max page reached ≥25/50/75/100% of total pages)

## Conversion pipeline (API)

- Tooling: `poppler-utils` (`pdftoppm`) added to the Docker image (base
  stage). CLI spawn — avoids native Node module fragility on Alpine.
- Trigger: `afterCreate` / `afterUpdate` lifecycle on magazine-issue. When the
  `pdf` file changed: set `conversionStatus: processing`, run the job
  asynchronously (fire-and-forget with logging; no queue infra).
- Job: `pdftoppm` renders each page (~150 DPI, JPEG) to a temp dir → upload
  each page through the Strapi upload service → link to `pages` in order →
  set `ready`. On any error: set `failed`, log, keep the previous pages
  intact if it was a re-conversion.
- Re-conversion (PDF replaced): delete the previous page media files after
  the new set is fully linked.
- Expected duration ~30–60 s for 50 pages; the Publisher sees
  `conversionStatus` in the admin.

## Publisher role

- Custom admin role `Publisher`: CRUD + publish on magazine-issue only, plus
  Media Library upload. No access to other content types or settings.
- Created via data migration `003-publisher-role` using the `admin::role` /
  `admin::permission` services so every environment gets it without manual
  clicks. (Custom admin roles are free in CE since Strapi 4.8 — verify
  against this installation during implementation.)

## Frontend

Archive (existing route `/quienes-somos/revista` in the route tree):

- New block `blocks.magazine-archive`: grid of edition covers (title, number,
  date). Fulfils the full block contract: inline fragment in
  `BLOCK_FRAGMENTS`, `normalizeBlocks` pass, registry entry.

Viewer (one URL per edition):

- The Next catch-all resolves `/quienes-somos/revista/{slug}` — one extra
  segment under an existing CMS route — as the magazine viewer.
- Flipbook with `react-pageflip`, page images lazy-loaded, "Download PDF"
  button linking to the original file.
- Only `ready` + published editions are viewable.

Metrics capture:

- The viewer tracks the max page reached in the session and sends a beacon on
  leave (`fetch` with `keepalive: true`) plus a visit ping on load.
- Beacon goes to a Next route handler that forwards to a custom Strapi
  endpoint (`POST /api/magazine-issues/:id/track`) with a restricted API
  token — same pattern as form submissions. The endpoint only increments
  aggregate counters; no raw events, no PII, no cookies.

Metrics visualization:

- Admin panel extension "Estadísticas de Revista" alongside the existing
  FormSubmissionsPanel: visits per edition over time, read-depth breakdown,
  CSV export reusing `csvExport.ts` hardening.

## Infra changes

- Dockerfile (api): `apk add poppler-utils` in the runtime stages.
- docker-compose.yml: persist `public/uploads` with a volume in the BASE file
  (pre-existing gap: production uploads currently die on every rebuild; this
  feature makes it critical).
- New restricted API token for metrics tracking, added to
  `scripts/create-api-tokens.js`.

## Out of scope (YAGNI)

Advanced zoom, in-magazine search, OCR, per-user reading history, traffic
sources/demographics (re-evaluate a site-wide analytics tool if requested
later).

## Risks

- Conversion failure on exotic PDFs → `failed` status visible in admin;
  Publisher can re-upload. pdftoppm is the most battle-tested option.
- Disk growth: ~15 MB images + PDF per edition; trivial for 25 GB.
- Metrics undercounting (ad-blockers, closed tabs): acceptable — the metric
  is directional, not billing-grade.

## Suggested implementation order

1. Infra: poppler-utils + uploads volume.
2. Content types + conversion pipeline (verifiable in admin alone).
3. Publisher role data migration.
4. Frontend archive block + viewer (flipbook + PDF download).
5. Metrics endpoint + beacon + admin stats panel.
