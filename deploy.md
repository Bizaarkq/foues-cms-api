# Guía de deploy — FOUES (CMS + Frontend)

Guía operativa completa del stack: deploy desde cero, actualizaciones, reset
total y **runbook de caídas** (diagnóstico → causa → solución por escenario).

> Documentos relacionados: [`README.md`](README.md) (resumen rápido),
> [`docs/forms-api-token.md`](docs/forms-api-token.md) (detalle de tokens de
> formularios), `CLAUDE.md` (decisiones de arquitectura).

---

## 1. Arquitectura del stack

Todo corre con Docker Compose desde este repo (proyecto pinneado como `foues`).
El frontend se construye desde el repo hermano `../foues-cms-frontend`.

```
                          Internet
                             │ :80
                       ┌─────▼─────┐
                       │   nginx   │  FRONTEND_DOMAIN → foues:3000
                       └─────┬─────┘  CMS_DOMAIN      → cms:1337
             red "foues"     │
        ┌────────────────────┼──────────────────┐
  ┌─────▼─────┐        ┌─────▼─────┐            │
  │   foues   │───────►│    cms    │            │
  │ Next.js   │  :1337 │ Strapi v5 │            │
  │   :3000   │        │           │            │
  └───────────┘        └─────┬─────┘            │
                             │  red "foues-backend" (internal: sin salida)
                       ┌─────▼─────┐
                       │    db     │
                       │ MySQL 8   │
                       └───────────┘

  Volúmenes con datos (¡son EL sitio — cuidarlos!):
  · foues-cms-db       → base de datos MySQL (todo el contenido)
  · foues-cms-uploads  → media subida (imágenes, PDFs, páginas de revista)
```

| Servicio | Contenedor | Puerto interno | Healthcheck | Depende de |
|---|---|---|---|---|
| `db` | `db` | 3306 | `mysqladmin ping` | — |
| `cms` | `cms` | 1337 | `GET /_health` (204) | `db` healthy |
| `foues` | `foues` | 3000 | `GET /` (200) | `cms` healthy |
| `nginx` | `nginx` | 80 (publicado) | — | `foues` healthy |

El orden de arranque es en cadena: `db → cms → foues → nginx`. Si un eslabón
no llega a healthy, los siguientes **no arrancan** — por eso "se cayó nginx"
casi siempre significa que se cayó algo antes en la cadena (ver §6).

---

## 2. Requisitos previos

- Docker Engine + Docker Compose v2 (`docker compose`, no `docker-compose`).
- Los DOS repos clonados como hermanos:
  ```
  ~/apps/foues-cms-api        ← este repo (compose, .env, nginx)
  ~/apps/foues-cms-frontend   ← el frontend (lo construye el compose)
  ```
- DNS: `FRONTEND_DOMAIN` y `CMS_DOMAIN` apuntando a la IP del servidor.
- Cliente OAuth de Google (ID + secret) con el callback
  `https://FRONTEND_DOMAIN/api/auth/callback/google` autorizado.

---

## 3. Deploy desde cero

Todos los comandos se corren desde la raíz de `foues-cms-api`.

### 3.1 Clonar y generar el entorno

```bash
git clone git@github.com:Bizaarkq/foues-cms-api.git
git clone git@github.com:Bizaarkq/foues-cms-frontend.git
cd foues-cms-api
./scripts/generate-env.sh          # crea .env con secretos aleatorios
```

### 3.2 Editar `.env` (lo que generate-env.sh NO puede adivinar)

```bash
# Dominios reales del servidor
FRONTEND_DOMAIN=test.odontologia.ues.edu.sv
CMS_DOMAIN=cms.test.odontologia.ues.edu.sv

# ⚠️ REGLA: STRAPI_PUBLIC_URL debe apuntar al CMS_DOMAIN (es la URL con la
# que el navegador carga las imágenes). Si no coinciden, la media se rompe.
STRAPI_PUBLIC_URL=http://cms.test.odontologia.ues.edu.sv

# URL pública del frontend (OAuth la necesita exacta)
AUTH_URL=http://test.odontologia.ues.edu.sv
NEXTAUTH_URL=http://test.odontologia.ues.edu.sv

# OAuth real (los "dummy" generados no sirven para login)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Producción
BUILD_ENV=production

# Opcional: link de Campus Virtual en el navbar (vacío = no se muestra)
CAMPUS_VIRTUAL_URL=https://campus.ues.edu.sv
```

Los 3 tokens (`STRAPI_API_TOKEN`, `FORM_SUBMIT_TOKEN`, `MAGAZINE_TRACK_TOKEN`)
quedan vacíos por ahora — se generan en el paso 3.4.

### 3.3 Primer arranque

```bash
docker compose up -d --build
```

El primer build tarda varios minutos (dos imágenes Node). El frontend va a
buildear con tokens vacíos — está bien, se rebuildea en 3.5.

### 3.4 Sembrar datos y generar tokens

```bash
# Seeds: árbol de rutas, páginas iniciales, rol Publisher, navbar móvil…
docker compose run --rm cms pnpm data:migrate

# Tokens de API — SE MUESTRAN UNA SOLA VEZ, copialos ya
docker compose run --rm cms node scripts/create-api-tokens.js
```

Pegá los tres valores impresos en el `.env`:

```bash
STRAPI_API_TOKEN=...      # lectura GraphQL del frontend
FORM_SUBMIT_TOKEN=...     # envío de formularios (scope mínimo)
MAGAZINE_TRACK_TOKEN=...  # métricas de la revista (scope mínimo)
DOCUMENT_TOKEN=...        # repositorio de documentos (scope mínimo)
```

Además, `DOCUMENT_ACCESS_SECRET` (generado por `generate-env.sh`) debe
coincidir en ambos lados — lo revisa el middleware `document-access` del CMS
contra el header `x-document-access-secret` que envía el proxy de descargas
del frontend.

### 3.5 Rebuild del frontend con los tokens

```bash
docker compose up -d --build foues
```

### 3.6 Crear el admin de Strapi

Abrí `http://CMS_DOMAIN/admin` — la primera visita ofrece crear el usuario
administrador. Ese usuario es el dueño del CMS: guardá la contraseña bien.

### 3.7 Configuración post-instalación (en el admin)

1. **Permisos públicos**: Settings → Users & Permissions → Roles → Public →
   habilitar `find` de **Global-theme** (el tema del sitio se lee sin token;
   sin esto el frontend usa la paleta de fallback).
2. **Webhook de revalidación**: Settings → Webhooks → Create:
   - URL: `http://FRONTEND_DOMAIN/api/revalidate`
   - Header: `x-revalidate-secret` = el valor de `REVALIDATE_SECRET` del `.env`
   - Eventos: create/update/delete (+publish/unpublish) de **TODOS los content
     types que alimentan el render** — page, route, footer, global-theme,
     block-group, staff, organizational-unit, form, magazine-issue,
     publication, mobile-navbar, document, document-category. Si falta uno,
     sus cambios tardan hasta 24 h en verse (caché ISR).
3. **mainField de relaciones** (cosmético pero ayuda mucho al editor):
   Content Manager → ⚙ Configure the view → en los pickers de relación elegir
   qué campo se muestra (form→title, publications→name, route→label,
   staff→name).

### 3.8 Checklist de verificación

```bash
docker ps                                    # los 4 Up, cms y foues (healthy)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:80 -H "Host: $FRONTEND_DOMAIN"   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:80 -H "Host: $CMS_DOMAIN"        # 200/204
```

Y en el navegador: la home carga con contenido, `/admin` entra, una edición
de contenido publicada se ve reflejada en el sitio (webhook funcionando).

---

## 4. Deploy de actualizaciones (día a día)

```bash
cd foues-cms-api
git pull                       # este repo
git -C ../foues-cms-frontend pull

docker compose up -d --build   # 1) SIEMPRE build primero
docker compose run --rm cms pnpm data:migrate   # 2) migraciones DESPUÉS
```

> ### ⚠️ REGLA DE ORO: build ANTES de migrate
>
> `data:migrate` arranca Strapi con el código **compilado dentro de la
> imagen**. Si la imagen es más vieja que el schema actual, Strapi hace su
> sync de arranque y **BORRA las tablas (con datos) de los content types que
> su imagen no conoce**. No es teórico: una corrida con imagen vieja vació el
> single type del navbar móvil en el ambiente local. Nunca corras
> `data:migrate` sin haber hecho `--build` antes.

¿Cuándo hace falta rebuild explícito de `foues`?

- Siempre que cambie el frontend (`git pull` trajo commits) → lo cubre el
  `up -d --build` general.
- Si **rotaste tokens** (§6.9) → `docker compose up -d --build foues` (los
  tokens se hornean en el build).

---

## 5. Reset del sitio

### 5.1 Reset TOTAL (borrar todo y empezar de cero)

Borra contenido, media, usuarios del admin, tokens — TODO. No hay vuelta
atrás sin backup (§7).

```bash
docker compose down                          # apaga el stack
docker volume rm foues-cms-db foues-cms-uploads   # ← el punto de no retorno
docker compose up -d --build
docker compose run --rm cms pnpm data:migrate
docker compose run --rm cms node scripts/create-api-tokens.js   # tokens NUEVOS
# pegar los 3 tokens nuevos en .env, luego:
docker compose up -d --build foues
```

Después: crear admin (§3.6) y repetir la post-instalación (§3.7) — el rol
público, el webhook y los mainFields viven en la DB que acabás de borrar.

¿Regenerar también los secretos del `.env`?

```bash
./scripts/generate-env.sh --force   # regenera secretos, PRESERVA credenciales de DB
```

`--force` conserva `DB_ROOT_PASSWORD/DB_NAME/DB_USER/DB_PASSWORD` a propósito:
si NO borraste el volumen de MySQL, esas credenciales tienen que seguir
coincidiendo con las que el volumen ya tiene grabadas. Si regenerás secretos,
todo lo firmado con los viejos muere (sesiones de admin, tokens → rotar §6.9).

### 5.2 Reset SOLO de contenido (conservar media)

```bash
docker compose down
docker volume rm foues-cms-db        # solo la base
docker compose up -d --build
docker compose run --rm cms pnpm data:migrate
docker compose run --rm cms node scripts/create-api-tokens.js
# pegar tokens + rebuild foues + admin + post-instalación, igual que arriba
```

Ojo: la media queda en el volumen pero la DB ya no la referencia — los
archivos aparecen huérfanos hasta resubirlos desde la Media Library. Útil
sobre todo para descartar contenido de prueba sin perder los archivos.

---

## 6. Runbook de caídas — diagnóstico y solución

### 6.0 Diagnóstico general (empezá SIEMPRE por acá)

```bash
docker ps -a                        # ¿quién está Up/healthy y quién no?
docker logs cms --tail 50           # (o db / foues / nginx)
docker inspect cms --format '{{json .State.Health.Log}}'   # último healthcheck
df -h                               # ¿disco lleno? (mata a MySQL primero)
```

Regla de la cadena: `db → cms → foues → nginx`. El PRIMER contenedor no
healthy de esa cadena es el culpable; los de después son víctimas.

### 6.1 `db` unhealthy o reiniciándose

**Síntoma**: `db` en `Restarting` o `(unhealthy)`; `cms` en `Waiting`/caído.

1. `docker logs db --tail 50`:
   - `Access denied for user` → las credenciales del `.env` no coinciden con
     las grabadas en el volumen. Causa típica: se regeneró el `.env` sin
     `--force`. Restaurá las credenciales originales en el `.env` (o restore
     de backup si se perdieron).
   - `No space left on device` → liberar disco (`docker system prune -a`
     limpia imágenes viejas SIN tocar volúmenes) y reiniciar.
   - Corrupción de InnoDB tras un apagón → restore del último backup (§7.2).
2. Si los logs se ven sanos pero no responde: `docker compose restart db`.

### 6.2 `cms` caído o en crash-loop

**Síntoma**: `cms` en `Restarting`; el admin no carga; `foues` no arranca.

`docker logs cms --tail 50` y buscá:

- **`STRAPI_JWT_SECRET is required`** → falta en el `.env` (el compose
  hard-failea a propósito). Corré `./scripts/generate-env.sh --force` o
  agregala a mano.
- **`connect EHOSTUNREACH`/`ECONNREFUSED` hacia la DB** → primero mirá §6.1;
  si `db` está healthy, es el bridge roto → §6.6.
- **Error en una migración** (`[data-migrations] ... failed`) → cada
  migración corre en transacción: la DB queda como antes. Leer el error,
  corregir, `--build` y volver a correr `data:migrate`.
- **Arranque lento ≠ caído**: el healthcheck da 180 s de gracia. No lo
  reinicies antes de que venza.

### 6.3 `foues` caído

**Síntoma**: `foues` en `Restarting` o nunca llega a healthy; nginx da 502.

`docker logs foues --tail 30`:

- **`Missing required env var: X`** → el frontend valida TODAS sus variables
  al arrancar (fail-fast) y el log dice exactamente cuál falta. Agregala al
  `.env` y `docker compose up -d foues`.
- **`dependency cms failed to start`** → la víctima es foues, el culpable es
  cms → §6.2.
- Errores de GraphQL al renderizar → §6.9 (token) o cms caído.

### 6.4 nginx da 502 / el sitio no responde

- 502 en el dominio del frontend → `foues` caído (§6.3).
- 502 en el dominio del CMS → `cms` caído (§6.2).
- Ningún dominio responde → ¿`nginx` está Up? ¿el DNS apunta al server?
  ¿`FRONTEND_DOMAIN`/`CMS_DOMAIN` del `.env` coinciden con los del DNS?
  (nginx solo rutea los `Host` exactos que le configuraste).
- Página en blanco solo en `/admin` → el `CMS_DOMAIN` no permite subir
  archivos grandes… no: el template ya trae `client_max_body_size 100M` para
  el CMS. Revisá la consola del navegador y §6.2.

### 6.5 Todo "healthy" pero el sitio no carga

**Síntoma clásico** (nos pasó DOS veces): `docker ps` muestra todo Up y
healthy, pero desde afuera no responde, o un contenedor no alcanza a otro
(`EHOSTUNREACH` con la DB "healthy").

**Causa**: bridge de red roto — típico tras un reinicio del host, cuando los
contenedores con `restart: unless-stopped` levantan antes de que Docker
termine de armar las redes. El healthcheck pasa porque corre DENTRO del
contenedor (127.0.0.1), pero el veth quedó muerto.

**Fix**:

```bash
docker compose up -d --force-recreate <servicio>    # el que esté inalcanzable
# si no está claro cuál: recrear todo
docker compose up -d --force-recreate
```

### 6.6 El sitio muestra contenido viejo

**Síntoma**: publicás en el admin y el sitio no refleja el cambio.

- El caché ISR dura 24 h; la invalidación inmediata depende del **webhook**
  (§3.7.2). Verificá en Settings → Webhooks que exista, apunte al dominio
  correcto, y tenga TODOS los content types en sus eventos (el panel muestra
  el resultado del último disparo).
- Revalidación manual de emergencia:

  ```bash
  curl -X POST http://FRONTEND_DOMAIN/api/revalidate \
    -H "x-revalidate-secret: $REVALIDATE_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"model":"page"}'          # respuesta esperada: {"revalidated":true,...}
  ```

### 6.7 Las imágenes no cargan (URLs con `http://cms:1337`)

**Causa**: `STRAPI_PUBLIC_URL` vacía o desactualizada — el frontend resuelve
la media contra esa URL, y `http://cms:1337` solo existe dentro de Docker.

**Fix**: corregirla en el `.env` (= el `CMS_DOMAIN` con protocolo) y
`docker compose up -d --build foues` (se usa también en build).

### 6.8 El login con Google falla

- `redirect_uri_mismatch` → el callback autorizado en Google no coincide con
  `AUTH_URL/api/auth/callback/google`.
- "Acceso denegado" tras autenticar → es comportamiento esperado para cuentas
  que no terminan en `@ues.edu.sv`.
- Credenciales `dummy` en el `.env` → poné las reales y `up -d foues` (son
  runtime, no requieren rebuild).

### 6.9 GraphQL devuelve 401 / los formularios no envían

**Causa**: token inválido (rotado, borrado en el admin, o el `.env` quedó
desincronizado del build del frontend).

```bash
docker compose run --rm cms node scripts/create-api-tokens.js --rotate
# pegar los 3 valores nuevos en .env y rebuildear el frontend:
docker compose up -d --build foues
```

### 6.10 La conversión de PDFs de la revista queda en "processing"

- `docker logs cms | grep -i conversion` — el pipeline usa `pdftoppm`
  (poppler-utils, ya instalado en la imagen).
- Re-subir el PDF en el draft de la edición vuelve a disparar la conversión.
- Si el contenedor se reinició a mitad de una conversión, el estado puede
  quedar `processing`: re-subir el PDF lo destrampa.

---

## 7. Backups y restore

Lo único insustituible son los dos volúmenes. Backupealos ANTES de cualquier
reset, migración grande o cambio de servidor.

### 7.1 Backup

```bash
# Base de datos (dump lógico — portable entre versiones)
source .env
docker exec db mysqldump -u root -p"$DB_ROOT_PASSWORD" --single-transaction \
  --routines "$DB_NAME" | gzip > backup-db-$(date +%F).sql.gz

# Media (tar del volumen de uploads)
docker run --rm -v foues-cms-uploads:/uploads -v "$PWD":/backup alpine \
  tar czf /backup/backup-uploads-$(date +%F).tar.gz -C /uploads .
```

Recomendado: cron diario que corra ambos y conserve los últimos 7, copiando
al menos uno fuera del servidor.

### 7.2 Restore

```bash
# Base de datos
gunzip < backup-db-YYYY-MM-DD.sql.gz | \
  docker exec -i db mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME"

# Media
docker run --rm -v foues-cms-uploads:/uploads -v "$PWD":/backup alpine \
  sh -c "rm -rf /uploads/* && tar xzf /backup/backup-uploads-YYYY-MM-DD.tar.gz -C /uploads"

docker compose restart cms foues
```

Tras un restore de DB, las sesiones del admin siguen valiendo solo si los
secretos del `.env` son los mismos de cuando se hizo el dump.

---

## 8. Cheat sheet

| Necesito… | Comando |
|---|---|
| Ver estado de todo | `docker ps -a` |
| Logs de un servicio | `docker logs cms --tail 50 -f` |
| Deploy de cambios | `git pull` (ambos repos) → `docker compose up -d --build` → `docker compose run --rm cms pnpm data:migrate` |
| Reiniciar un servicio | `docker compose restart cms` |
| Recrear (red rota) | `docker compose up -d --force-recreate cms` |
| Correr migraciones | `docker compose run --rm cms pnpm data:migrate` (⚠️ build antes) |
| Rotar tokens | `docker compose run --rm cms node scripts/create-api-tokens.js --rotate` + `.env` + rebuild `foues` |
| Revalidar caché a mano | `curl -X POST http://FRONTEND_DOMAIN/api/revalidate -H "x-revalidate-secret: …" -d '{"model":"page"}'` |
| Backup DB | ver §7.1 |
| Apagar todo (sin borrar datos) | `docker compose down` |
| Borrar TODO (datos incluidos) | `docker compose down && docker volume rm foues-cms-db foues-cms-uploads` |

### Las 3 reglas de oro

1. **Build antes de migrate** — una imagen vieja corriendo `data:migrate`
   borra content types nuevos con sus datos (§4).
2. **Nunca toques `foues-cms-db` ni `foues-cms-uploads` sin backup** — son el
   sitio entero (§7).
3. **`STRAPI_PUBLIC_URL` = `CMS_DOMAIN`** — si divergen, la media se rompe
   para los visitantes (§6.7).
