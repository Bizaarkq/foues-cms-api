# Sesión de usuario: registro de accesos, roles y UI — Diseño

**Fecha**: 2026-07-11 · **Estado**: aprobado por Edwin · **Alcance**: dos repos
(`foues-cms-api` + `foues-cms-frontend`)

## Contexto y objetivo

Hoy la sesión del frontend solo muestra el nombre y "Cerrar sesión". Este
diseño la convierte en una sesión real con tres piezas:

1. **Transparencia**: nota informativa en el login (cookie de sesión + registro
   del correo). Verificado: el sitio usa CERO cookies para visitantes anónimos;
   las únicas cookies son las esenciales de Auth.js al iniciar sesión →
   **no se necesita banner de consentimiento** (las cookies estrictamente
   necesarias están exentas; solo aplica el deber de informar).
2. **Registro de accesos en el CMS**: saber quién ha entrado al sitio (un
   registro por usuario, no historial).
3. **Roles de usuario** (Estudiante/Catedrático/Personal, extensibles desde el
   admin) como **cimiento** del gating por rol futuro (ej.: repositorio de
   documentos solo para un rol). El gating en sí NO se implementa en este
   round — queda diseñado en §7.

## No-objetivos (este round)

- Gating de rutas/secciones por rol (solo diseño, §7).
- Historial completo de logins (una fila por acceso).
- Banner de consentimiento de cookies.
- Refresco del rol en sesiones vivas (el rol se lee en el login; cambios de
  rol aplican en el siguiente login — limitación aceptada).

## 1. Modelo de datos (CMS)

Dos content types nuevos, sin draft & publish, campos nativos, con entrada en
la Guía del editor (`fields-doc.ts`):

**`api::user-role.user-role` — "Rol de usuario"** (colección)

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string, required | Visible: "Estudiante" |
| `key` | uid (target: name) | Identificador estable para código: `estudiante`. No se renombra. |
| `description` | string | Opcional |
| `is_default` | boolean, default false | El rol asignado a usuarios nuevos. Gobernado desde el admin. |

**`api::site-user.site-user` — "Usuario del sitio"** (colección)

| Campo | Tipo | Notas |
|---|---|---|
| `email` | string, required, **unique** | Ancla del upsert atómico |
| `name` | string | Nombre de Google (se actualiza en cada login) |
| `role` | relation manyToOne → user-role | |
| `last_login` | datetime | |
| `login_count` | integer, default 0 | |

Primer acceso = `createdAt` (gratis). Ambos visibles en el Content Manager
(ahí se cambia el rol de un usuario).

**Migración 007** (`007-user-roles.ts`): siembra Estudiante (`is_default:
true`), Catedrático, Personal. Idempotente (guard por tabla vacía).

## 2. Endpoint de registro (CMS)

`POST /api/site-users/track-login` — ruta custom (patrón idéntico al `track`
de revista: controller custom + scope de token propio).

- **Body**: `{ email: string, name: string }`. Valida email presente y con
  forma de correo; responde 400 si no.
- **Upsert atómico** por `email` único: `INSERT … ON DUPLICATE KEY UPDATE`
  vía Knex (patrón anti-carreras del issue #8 — dos logins concurrentes del
  mismo correo no crean duplicados):
  - Nuevo → crea con `role` = el user-role con `is_default: true` (fallback:
    key `estudiante`), `login_count = 1`, `last_login = NOW()`.
  - Existente → `login_count++`, `last_login = NOW()`, actualiza `name`.
  - La relación role vive en link table → insertar el link solo en el camino
    de INSERT (misma transacción), como en el fix del issue #8.
- **Respuesta**: `{ ok: true, role: { key, name } }`.
- **Token**: `SITE_USER_TOKEN` (custom, scope único
  `api::site-user.track-login.track-login`). Se agrega a
  `scripts/create-api-tokens.js`, `generate-env.sh`, compose y `.env`.

## 3. Flujo de login (frontend)

En `lib/auth.ts`:

- `signIn` callback: sin cambios (valida `@ues.edu.sv`).
- `jwt` callback: cuando hay `profile` (= momento del login), llama
  server-side a `STRAPI_URL/api/site-users/track-login` con
  `SITE_USER_TOKEN` y guarda `token.role = { key, name }` de la respuesta.
- `session` callback: expone `session.user.role`.
- **Resiliencia**: timeout de 3 s + try/catch. Si Strapi falla, el login
  procede igual con `role = null` (la UI lo trata como default) y el error va
  al log. El registro es informativo: JAMÁS bloquea el login.
- **Sesión explícita**: `session: { strategy: 'jwt', maxAge: 30 días }` con
  comentario — hoy es el default implícito; queda como decisión declarada.
  Rolling: se renueva con uso; expira a los 30 días sin uso. Sin auto-logout
  agresivo (portal informativo, no banca) y sin checkbox "Recordarme" (el
  re-login con Google cuesta un clic).
- Tipado: augmentar los tipos de NextAuth (`types/next-auth.d.ts`) con `role`.
- `lib/env.ts`: `SITE_USER_TOKEN` requerida (mismo patrón fail-fast);
  Dockerfile del frontend gana el ARG placeholder correspondiente.

## 4. UI de sesión

**Desktop (≥ md)** — top bar accent (pasa a `hidden md:flex`):
- `UserMenu` (client, chico) reemplaza el texto plano: avatar con inicial →
  dropdown con nombre completo, correo, badge del rol, separador, "Cerrar
  sesión" (form → server action, como hoy). Accesible: `aria-expanded`,
  `aria-haspopup`, Escape cierra, focus visible, clic fuera cierra.
- Deslogueado: "Iniciar sesión" como hoy.

**Móvil (< md)** — el top bar NO existe. La cuenta vive en el pie del bottom
sheet (botón Menú del bottom nav):
- Deslogueado: botón "Iniciar sesión" navy ancho completo.
- Logueado: bloque de cuenta (avatar inicial + nombre + correo + badge de rol
  + "Cerrar sesión").
- **Campus Virtual** también en el pie del sheet (solo si `CAMPUS_VIRTUAL_URL`
  existe) — al ocultarse el top bar perdería su único lugar en móvil.
- Implementación: `MobileBottomNav` (RSC, ya conoce la sesión) renderiza el
  bloque de cuenta —incluido el form del signOut— y lo pasa al sheet client
  **como children**. Cero lógica de auth en el cliente.

## 5. Nota de transparencia (login)

En `app/login/page.tsx`, bajo el botón de Google, texto muted:

> "Al iniciar sesión se usa una cookie técnica para mantener tu sesión y se
> registra tu correo institucional con fines de control de acceso al sitio."

Cubre cookie esencial + tratamiento del correo en una frase, antes del acto.
(No soy abogado: para certeza institucional lo valida jurídico de la UES;
esta es la práctica estándar de transparencia.)

## 6. Manejo de errores

| Falla | Comportamiento |
|---|---|
| Strapi caído durante login | Login procede, `role = null` → UI muestra rol default, error al log |
| track-login lento | Timeout 3 s, mismo camino que caído |
| Email sin forma válida en el endpoint | 400 (defensa en profundidad; NextAuth ya validó el dominio) |
| Dos logins concurrentes del mismo correo | Upsert atómico — una sola fila, contador correcto |
| Rol default borrado en el admin | Fallback a key `estudiante`; si tampoco existe, usuario queda sin rol (null) y se loguea igual |

## 7. Gating por rol — diseño futuro (NO implementar ahora)

Cuando exista el primer caso real (ej. repositorio de docs):

- `route` gana relación opcional `allowed_roles` (manyToMany → user-role).
- Semántica: **vacía = comportamiento actual** (manda `visibility`); con
  roles → exige sesión Y `session.user.role.key ∈ allowed_roles`.
- Enforcement donde ya vive el gate autoritativo: el Server Component
  (`page.tsx`). `filterByVisibility` del navbar se extiende con el rol.
- Cero queries extra: el rol ya viaja en el JWT.
- Nota: al implementarse, evaluar si el JWT necesita refresco de rol
  (re-fetch periódico en el callback `jwt`) según la sensibilidad del
  contenido protegido.

## 8. Verificación (gate de la implementación)

1. `npx tsc --noEmit` en ambos repos.
2. Migración 007 corre y siembra los 3 roles (log + DB).
3. Endpoint: curl con token → usuario nuevo crea con rol default; segundo
   curl → `login_count` 2 y misma fila; 20 curls concurrentes → UNA fila.
4. Login real con cuenta `@ues.edu.sv` en local → aparece en el Content
   Manager con rol Estudiante; el UserMenu muestra nombre/correo/rol.
5. Cambiar rol en admin → re-login → el badge cambia.
6. Strapi apagado → el login sigue funcionando (rol default, error en log).
7. Móvil (Chrome emulado): sin top bar, cuenta en el pie del sheet, Campus
   Virtual presente; desktop: top bar con UserMenu, dropdown accesible
   (Tab/Escape).
8. Nota de transparencia visible en /login.

## 9. Rollout

- PR CMS primero (content types + endpoint + migración + token nuevo en
  script), PR frontend después (depende del endpoint y del token).
- Post-merge en server: `--build` → `data:migrate` → generar el token nuevo
  (`create-api-tokens.js` imprime solo los faltantes) → pegarlo en `.env` →
  rebuild `foues`. Webhook: agregar eventos de user-role/site-user NO es
  necesario para el render (no alimentan páginas), no tocar.
