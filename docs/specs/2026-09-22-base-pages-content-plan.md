# Base pages content — Implementation plan

**Spec:** `docs/specs/2026-09-22-base-pages-content-design.md`
**Branch:** `feat/base-pages-content` → PR to `develop`

## Grounding

These are the facts about the current codebase that the plan relies on.

- **Upload service.** `strapi.plugin('upload').service('upload').upload({ data: { fileInfo }, files })`
  is already used in two places, `src/api/magazine-issue/services/conversion.ts`
  and `src/api/document/controllers/upload.ts`. Each entry in `files` has the
  shape `{ filepath, originalFilename, mimetype, size }`.
- **Section wiring.** A section's `children` is set with
  `{ connect: [{ documentId }] }` against block-groups that already exist. See
  `009-showcase-page.ts` lines 142–184 and 510–520.
- **Runner.** Each migration runs once inside `strapi.db.transaction`. Tracking
  is by name, and `index.ts` is an append-only list.
- **Image and source layout.** The Docker image copies the whole repo
  (`COPY . .`), and `.dockerignore` does not exclude `src/`. At runtime,
  `src/seeds/media/` is therefore available at
  `path.join(strapi.dirs.app.root, 'src', 'seeds', 'media')`.
  - The compiled `dist/` does not contain the images. Never resolve paths
    relative to `__dirname`.
- **Tests.** The API has no test framework. Verification is `tsc`, the local
  Docker stack, and a browser check.

## Tasks

### 1. Extract and prepare the media

- Run `pdfimages -all -f 5 -l 10` on `FOUES_landing_page_demo.pdf` into a
  scratch directory, which is not committed.
- Copy the chosen images into `src/seeds/media/` under the spec's names:

| Spec file | pdfimages source |
|---|---|
| `pregrado-hero.jpg` | `i-000.jpg` |
| `servicios-hero.jpg` | `i-010.jpg` |
| `servicios-administracion-academica.jpg` | `i-018.jpg` |
| `servicios-areas-clinicas.jpg` | `i-008.jpg` |
| `servicios-pacientes.jpg` | `i-019.jpg` |
| `servicios-primera-consulta.jpg` | `i-009.jpg` |
| `proyeccion-social-hero.jpg` | `i-020.jpg` |
| `proyeccion-programa-preventivo.jpg` | `i-024.jpg` |
| `proyeccion-clinicas-extramurales.jpg` | `i-031.jpg` |
| `proyeccion-paipad.jpg` | `i-026.jpg` |
| `proyeccion-servicio-social.jpg` | `i-025.jpg`, cropped to drop the navy band on the right |
| `centro-imagenes-hero.jpg` | `i-033.jpg` |
| `centro-imagenes-flyer.png` | `i-041.png` |
| `centro-investigaciones-hero.jpg` | `i-042.jpg` |
| `posgrado-hero.jpg` | `i-051.jpg` |

- Look at each file before committing to confirm the crop and that the image
  matches its slot.
- Check the total size. The target is about 2 MB. If it is larger, re-encode the
  JPEGs at quality 85 and leave the flyer PNG as-is, because JPEG would blur its
  text.
- **Commit:** `🍱 assets(seeds): add page images extracted from the mockup`.

### 2. Shared helper `src/seeds/resolve-page-content.ts`

It exports `resolvePageContent(strapi, content, mediaCache)`, which returns the
content with all references resolved.

**`resolveMedia(strapi, fileName, cache)`**

1. Return the id from the cache if it is there.
2. Look up `plugin::upload.file` where `name = fileName`. If found, cache and
   return its id.
3. Look for `path.join(strapi.dirs.app.root, 'src/seeds/media', fileName)`. If
   the file is missing, throw `Seed media not found: <fileName>`.
4. Copy the file to a temporary path (`fs.mkdtemp(os.tmpdir())`) so the upload
   pipeline can never move or delete the committed source.
5. Upload it with:
   - `fileInfo: { name: fileName, alternativeText, caption: '' }`
   - `files: { filepath, originalFilename, mimetype, size }`
6. Remove the temporary directory in a `finally` block, then cache and return
   the id.

**Where `alternativeText` comes from.** A map in
`src/seeds/media/manifest.json` of the form `{ "<file>": "<alt>" }`, filled with
the spec table. A missing entry throws, so every image is guaranteed to have alt
text.

**Content walk**

- Any string `"@media:<file>"` is replaced by `resolveMedia(...)`, and any array
  of them by an array of ids.
- For `blocks.section` entries that have `groups`:
  1. For each group, resolve its `blocks` recursively.
  2. Create an `api::block-group` with
     `{ name, group_columns, blocks }` and `status: 'published'`.
  3. Replace `groups` with `children: { connect: [{ documentId }, ...] }`.
- Nested sections are rejected by the schema, so the walk does not recurse into
  sections inside groups.

**Mimetype.** It comes from the extension, via a small map for `.jpg`/`.jpeg`
and `.png`. No new dependency is added.

**Commit:** `✨ feat(seeds): resolve media references and inline sections in page seeds`.

### 3. Update the page seeds

- Rewrite the five existing seeds and add `posgrado.json` and `contacto.json`,
  exactly as the spec's "Page content" section describes.
- Keep `routePath`, `title`, and `layout: "full-width"`.
- For Pregrado, split the current "Áreas Docentes" markdown into two groups, and
  keep a `rich-text` with `## Áreas Docentes` ahead of the section.
- **Commit:** `📝 content(seeds): base pages content adapted from the mockup`,
  together with task 4 so the tree always builds.

### 4. Adapt `002-initial-pages`

- Import `posgrado.json` and `contacto.json`, and append both to `PAGE_SEEDS`.
- Before calling `create`, build a single `mediaCache` for the run and pass the
  content through `resolvePageContent`.
- The existing guard (skip the page if `title` + `route` already exist) is kept.

### 5. Migration `src/data-migrations/013-base-pages-content.ts`

- `name: '013-base-pages-content'`. It uses the seven seeds of this scope only,
  not the landing, admission, and similar pages.
- Resolve all routes with `$in` over the paths. A missing route logs a warning
  and skips that page.
- For each page:
  1. Find the page with `strapi.db.query('api::page.page').findOne({ where: { route: route.id } })`.
  2. Run `resolvePageContent`.
  3. If a page exists, call `strapi.documents('api::page.page').update({ documentId, data: { title, content }, status: 'published' })`.
  4. If not, call `create` with `{ title, layout, route: route.documentId, content }` and `status: 'published'`.
- Block-groups left over from the old content: the old seeds had no sections, so
  there are no orphans to clean up.
- Log one line per page, in the format `Page "<title>" updated|created`.
- Append the migration to `src/data-migrations/index.ts`.
- **Commit:** `✨ feat(data-migrations): 013 base pages content with seeded media`.

### 6. Verify

1. `pnpm exec tsc --noEmit` passes (or `pnpm build` if the project has no
   standalone tsconfig check).
2. On the local Docker stack (`.env`, 3 compose files, db on `:3307`):
   1. Restart the CMS.
   2. In the logs, 013 is applied with 7 pages updated or created.
   3. The Media Library shows 15 files, each with alt text.
3. On the frontend, check the 7 routes at desktop and mobile widths:
   - The heroes show their image.
   - The two-column sections stack on mobile.
   - The galleries, icons, schedule, and CTA links (WhatsApp, mailto) all work.
4. Restart once more. The log must say "Nothing to run", and there must be no
   new files or block-groups.
5. Re-check the spec against the result, page by page.

### 7. Deliver

- Push the branch, then open a PR to `develop` with no AI attribution. The PR
  body calls out:
  - PAIPAD description is inferred and needs PO confirmation.
  - The Servicios info-card is removed.
  - 002 is changed to use the shared helper.
  - Deploy order: CMS only, no frontend redeploy.
- Update the roadmap memory.

## Risks

| Risk | Mitigation |
|---|---|
| The upload pipeline deletes or moves its input file | Upload from a temporary copy (task 2) |
| Upload inside the runner transaction leaves orphan files on disk if a later step throws | Accepted in the spec; the files are small and it is a one-off |
| `strapi.dirs.app.root` differs between dev and the image | Log the resolved media dir once at start. It is verified in step 6.2. |
| The PDF photos are mockup or stock | Editors can replace them from the admin; the alt text and names make them easy to find |
