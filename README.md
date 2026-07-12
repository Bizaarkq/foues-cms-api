# foues-cms-api

CMS headless (Strapi v5, TypeScript, MySQL) de la **Facultad de Odontología — Universidad de El Salvador (FOUES)**. Sirve todo el contenido del sitio público vía GraphQL al frontend [`foues-cms-frontend`](https://github.com/Bizaarkq/foues-cms-frontend) (Next.js, arquitectura server-driven UI). Este repo también contiene los compose files del stack completo.

## Levantar el stack

```bash
# Requisitos: Docker + el frontend clonado como directorio hermano (../foues-cms-frontend)

./scripts/generate-env.sh        # genera .env con secretos aleatorios

# Producción (default)
docker compose up -d --build
docker compose run --rm cms pnpm data:migrate                    # seeds/migraciones de datos
docker compose run --rm cms node scripts/create-api-tokens.js   # tokens → copiarlos al .env
docker compose up -d --build foues                               # rebuild frontend con tokens

# Desarrollo (override explícito: expone API en :8000 y MySQL en loopback :3306)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Servicios: `db` (MySQL 8), `cms` (Strapi `:1337`), `foues` (frontend), `nginx` (reverse proxy en `:80`, dominios configurables vía `FRONTEND_DOMAIN` / `CMS_DOMAIN` en el `.env`).

## Desarrollo sin Docker

```bash
pnpm install
pnpm develop        # dev server con autoReload; corre las data migrations pendientes
npx tsc --noEmit    # gate de verificación — correr antes de commitear
```

## Estructura clave

- `src/api/` — content types (route, page, form, magazine-issue, publication…)
- `src/components/blocks/` — bloques del dynamic zone (contrato SDUI con el frontend)
- `src/data-migrations/` + `src/seeds/` — seeds versionados con runner propio
- `src/admin/extensions/` — paneles custom del admin (envíos de formularios, stats de revista)
- `scripts/` — generate-env.sh, create-api-tokens.js

## Documentación

La arquitectura, decisiones y convenciones viven en [`CLAUDE.md`](./CLAUDE.md). Bugs y pendientes en [GitHub Issues](https://github.com/Bizaarkq/foues-cms-api/issues).

**Deploy y operación**: la guía completa (deploy desde cero, actualizaciones, reset total, runbook de caídas por escenario, backups) está en [`deploy.md`](./deploy.md).
