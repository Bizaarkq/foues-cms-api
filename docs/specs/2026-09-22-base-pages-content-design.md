# Base pages content (mockup pages 5–11) — Design

**Date:** 2026-09-22
**Repo:** foues-cms-api (no frontend changes)
**Source:** `FOUES_landing_page_demo.pdf`, pages 5–11

## Goal

Populate the base site pages with the content of the PDF mockup, adapted to the
site's existing design system: only existing CMS blocks, existing frontend
renderers, and the site's typography and colors. The mockup's visual style is
NOT reproduced; only its content, structure intent, and imagery.

## Scope

| Page | Route | Scope |
|---|---|---|
| Pregrado | `/pregrado` | Full content |
| Servicios | `/servicios` | Full content |
| Proyección Social | `/proyeccion-social` | Full content |
| Centro de Imágenes 3D | `/centro-imagenes-3d` | Full content |
| Centro de Investigaciones | `/centro-investigaciones` | Hero only |
| Escuela de Posgrado | `/posgrado` | Hero only (new page) |
| Contacto | `/contacto` | Hero only (new page) |

The three hero-only pages stay as base seeds until the PO defines their content.

Out of scope:

- Frontend changes, new blocks, and schema changes.
- Subpages (`/servicios/areas-clinicas`, etc.).
- Fixing the `#` placeholder URLs in "Acceso Rápido". They stay as they are today.

## Preconditions

The seven pages still match their `002-initial-pages` seed content (confirmed by
Edwin, 2026-09-22), so the migration may replace `content` wholesale without
losing editor work.

## Architecture

### Media

- Images extracted from the PDF (`pdfimages`) live, committed, in
  `src/seeds/media/` with semantic names.
- **Not** in `public/uploads/`, for two reasons:
  - In production, the named volume `foues-cms-uploads` is mounted over
    `/opt/app/public/uploads` (`docker-compose.yml`). Files baked into the image
    at that path are hidden once the volume holds data.
  - `public/uploads/*` is gitignored.
- The migration uploads each file through the Strapi upload plugin service, so
  every image gets a normal `plugin::upload.file` record, responsive formats,
  and storage in each environment's own upload volume.
- Dedupe: before uploading, look up `plugin::upload.file` by `name`. If a match
  exists, reuse its id.
- `alternativeText` is set in Spanish (see the media table below).

| File | Source (PDF page) | Used in | alt text |
|---|---|---|---|
| `pregrado-hero.jpg` | p5, student with tablet | Pregrado hero | Estudiante de Odontología sonriendo en el campus |
| `servicios-hero.jpg` | p6, clinical consultation | Servicios hero | Atención odontológica a un paciente |
| `servicios-administracion-academica.jpg` | p6, academic building | Servicios gallery | Edificio de Administración Académica |
| `servicios-areas-clinicas.jpg` | p6, clinic room | Servicios gallery | Sala de clínicas odontológicas |
| `servicios-pacientes.jpg` | p6, patient care | Servicios gallery | Estudiantes atendiendo a un paciente |
| `servicios-primera-consulta.jpg` | p6, first consultation | Servicios gallery | Paciente en consulta por primera vez |
| `proyeccion-social-hero.jpg` | p7, workshop | Proyección Social hero | Estudiantes en un taller de proyección social |
| `proyeccion-programa-preventivo.jpg` | p7, preventive care | Proyección gallery | Atención preventiva a un paciente escolar |
| `proyeccion-clinicas-extramurales.jpg` | p7, extramural clinics | Proyección gallery | Sistema de Gestión de Clínicas Extramurales |
| `proyeccion-paipad.jpg` | p7, PAIPAD team | Proyección gallery | Equipo del programa PAIPAD |
| `proyeccion-servicio-social.jpg` | p7, field care (cropped to remove the navy band) | Proyección gallery | Estudiantes en jornada de servicio social |
| `centro-imagenes-hero.jpg` | p8, scanner | Centro de Imágenes hero | Paciente en el equipo de tomografía |
| `centro-imagenes-flyer.png` | p8, flyer | Centro de Imágenes gallery | Afiche informativo del Centro de Imágenes |
| `centro-investigaciones-hero.jpg` | p9, meeting room | Centro de Investigaciones hero | Investigadores en una sala de reuniones |
| `posgrado-hero.jpg` | p10, building | Posgrado hero | Edificio de la Facultad de Odontología |

Login screenshots of external systems (extramural clinics, research center) are
excluded. They show another application's UI, not content.

### Seeds

- `src/seeds/pages/*.json` for the five existing pages are updated.
- `posgrado.json` and `contacto.json` are added.
- Media fields use a string reference `"@media:<file-name>"`.
  - Single media (`backgroundImage`) takes one reference.
  - Multiple media (`images`) takes an array of references.
- Two-column sections are expressed inline in the seed:
  `{ "__component": "blocks.section", "section_columns": 12, "groups": [ { "name", "group_columns", "blocks": [...] } ] }`.
  The loader creates the `api::block-group` documents and swaps `groups` for the
  `children` relation.
- A shared helper `src/seeds/resolve-page-content.ts` resolves `@media:`
  references and inline sections. Both migrations use it.
  - `002-initial-pages` registers the two new seeds and uses the helper, so a
    fresh install ends in the same state as an upgraded one.
  - Editing 002 is safe: it only runs on databases that have never run it, and
    it has the same precedent as the 009 edit in the calendar merge.

### Migration `013-base-pages-content`

The migration is appended to `src/data-migrations/index.ts`. The runner executes
it once, inside a transaction, and records it by name. For each of the seven
seeds it does the following:

1. Resolve the route by `path`. If the route is missing, log a warning and skip
   the page.
2. Resolve the content: upload or reuse media, then create the block-groups.
3. If a page is linked to the route, `update` its `content` (and `title`). If
   not, `create` the page (layout `full-width`) linked to the route.
4. Publish (`status: 'published'`).

## Page content

Every full page ends with the existing "ACCESO RÁPIDO" `quick-links`, unchanged
from today's seeds (4 columns: `book`, `clipboard-list`, `stethoscope`,
`clock`).

### Pregrado

1. `hero-page`
   - `title`: "Pregrado"
   - `gradient`: `primary`
   - `backgroundImage`: `pregrado-hero.jpg`
   - `subtitle`: the short line kept from the old seed ("Formando
     profesionales competentes con una base integral…").
2. `rich-text` intro with the full PDF paragraph ("Formar profesionales
   competentes, capaces de desarrollarse en el quehacer institucional…").
   `hero-page.subtitle` is a `string` (VARCHAR 255), so the full paragraph does
   not fit in the hero.
3. `quick-links` "Descripción de la Carrera": unchanged from the current seed
   (2 columns, `book-open`, `user`, `briefcase`, `map`).
4. `section` "Áreas Docentes", with a `rich-text` block ahead of it holding only
   `## Áreas Docentes`. The section has two 6/12 groups, each with a
   `rich-text`:
   - Left: Área Restaurativa / Operatoria Dental; Cirugía Oral y Maxilofacial;
     Odontología Infantil / Odontopediatría; Endodoncia; Periodoncia.
   - Right: Diagnóstico / Patología Bucal; Odontología Preventiva / Integral;
     Prostodoncia / Rehabilitación.
   - The text is the current seed text, split across the two columns.
5. ACCESO RÁPIDO.

### Servicios

1. `hero-page`
   - `title`: "Servicios"
   - `gradient`: `secondary`
   - `backgroundImage`: `servicios-hero.jpg`
   - `subtitle`: "Atención dental integral de bajo costo en las clínicas de la
     Facultad, realizada por estudiantes supervisados."
2. `rich-text` intro with the full PDF text (currently the info-card body), "La
   Facultad de Odontología de la Universidad de El Salvador (UES) ofrece
   atención dental integral…". It sits below the hero for the same VARCHAR 255
   reason as Pregrado.
3. `quick-links` "Nuestros Servicios" (4 columns). Each item has an icon that
   evokes its PDF photo:

   | Label | URL | Icon | Description |
   |---|---|---|---|
   | Administración Académica | `/servicios/administracion-academica` | `school` | Gestión académica y administrativa |
   | Áreas Clínicas | `/servicios/areas-clinicas` | `armchair` | Clínicas odontológicas de la Facultad |
   | Servicios para Pacientes | `/servicios/servicios-pacientes` | `hand-heart` | Tratamientos de bajo costo supervisados |
   | Consulta por Primera Vez | `/servicios/consulta-primera-vez` | `clipboard-plus` | Requisitos para tu primera consulta |

4. `photo-gallery`
   - `title`: "Nuestras instalaciones"
   - `photo_columns`: `col_2`
   - `images`: the four `servicios-*` photos, in the table order above.
5. ACCESO RÁPIDO.

The current `info-card` "Áreas Clínicas" is removed. Its text moves to the intro
`rich-text`, and its link is covered by the quick-links.

### Proyección Social

1. `hero-page`
   - `title`: "Proyección Social"
   - `gradient`: `primary`
   - `backgroundImage`: `proyeccion-social-hero.jpg`
2. `rich-text` with the current seed text of "Programa Preventivo Escolar",
   full width.
   - A 5/12 + 7/12 section with the photo was tried and dropped.
     `photo-gallery` has at least 2 columns, so a single image inside a 5/12
     group rendered at about 160 px. The photo moves to the gallery instead.
3. `quick-links` "Programas" (3 columns):

   | Label | URL | Icon | Description |
   |---|---|---|---|
   | Clínicas Extramurales | `/proyeccion-social/clinicas-extramurales` | `truck` | Atención odontológica fuera del campus |
   | PAIPAD | `/proyeccion-social/paipad` | `users` | Programa de atención a pacientes con discapacidad |
   | Servicio Social | `/proyeccion-social/servicio-social` | `hand-helping` | Jornadas de servicio a la comunidad |

4. `photo-gallery`
   - `title`: "Galería"
   - `photo_columns`: `col_2`
   - `images`: programa preventivo, extramurales, PAIPAD, servicio social.
5. ACCESO RÁPIDO.

The PAIPAD description is an inference from the Pregrado area text ("atención a
pacientes con discapacidad"). Flag it in the PR for confirmation.

### Centro de Imágenes 3D

1. `hero-page`
   - `title`: "Centro de Imágenes 3D"
   - `gradient`: `primary`
   - `backgroundImage`: `centro-imagenes-hero.jpg`
   - `subtitle`: "Estudios radiográficos intraorales y extraorales."
2. `bullet-list` "Ofrecemos":
   - Radiografías digitales 2D: panorámica, cefalométrica, ATM, senos
     paranasales, A-P y P-A de cráneo, de carpo.
   - Tomografía volumétrica 3D: por cuadrantes, maxilar superior o inferior, de
     ambos maxilares, senos paranasales, para endodoncia.
3. `clinic-schedule`
   - `clinic_name`: "Centro de Imágenes – FOUES"
   - `hours`:
     - Lunes a Viernes, 7:00 a. m. – 12:00 m. d.
     - Lunes a Viernes, 1:00 p. m. – 3:00 p. m.
4. `cta` "Contáctanos"
   - `description`: "Instagram y X: @centro3d_foues"
   - Buttons:
     - WhatsApp, `https://wa.me/50370710309`, `variant-filled-primary`, icon
       `message-circle`.
     - Correo, `mailto:centroimagenes3d.odontologia@ues.edu.sv`, `variant-ghost-primary`,
       icon `mail`.
5. `photo-gallery` with `centro-imagenes-flyer.png` and `photo_columns: col_2`.
6. ACCESO RÁPIDO.

### Hero-only pages

| Page | title | gradient | backgroundImage |
|---|---|---|---|
| Centro de Investigaciones | "Centro de Investigaciones" | `primary` | `centro-investigaciones-hero.jpg` |
| Escuela de Posgrado | "Escuela de Posgrado" | `primary` | `posgrado-hero.jpg` |
| Contacto | "Contacto" | `primary` | none (solid navy with gradient) |

The current `"—"` rich-text and empty gallery placeholders are removed.

## Error handling

- **Missing file in `src/seeds/media/`:** throw with the file name. The runner's
  transaction rolls back and the migration is not recorded.
- **Unknown `@media:` reference:** throw, same as a missing file.
- **Missing route:** warn and skip that page. The rest continue.
- **Upload plugin failure:** throw, so the whole migration rolls back.
  - Files already written to disk by the upload provider may remain as orphans.
    The next run's name-based dedupe cannot see them, because their DB rows
    were rolled back. This is accepted: it is a one-off and the files are small.

## Testing

1. Local Docker stack (`.env`, 3 compose files): restart the CMS, then confirm
   the log shows 013 applied and the uploads appear in the Media Library.
2. Visit all seven routes on desktop and mobile (DevTools). Check heroes with
   images, the two-column sections stacking on mobile, galleries, and icons.
3. Restart again. The runner must skip 013, with no duplicated files and no
   duplicated block-groups.
4. `pnpm build` (TypeScript) passes.
5. Fresh-install path: on an empty DB, 002 must produce the same pages (verify
   through the helper's shared code path; a full fresh DB run is optional).

## Deploy notes

- The CMS-only change needs no frontend redeploy.
- The migration's Document Service writes do not fire the Strapi webhook that
  revalidates the frontend. After deploy, trigger `POST /api/revalidate` on the
  frontend with `x-revalidate-secret` and body `{"model":"page"}` (or any other
  model, which covers pages and routes), or restart the frontend container.
  Until then it serves the cached old pages.
- The images add about 2 MB to the repository, in PNG and JPEG.
