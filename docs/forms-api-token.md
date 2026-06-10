# API Tokens

## Automated setup (preferred)

With the stack up, generate both tokens in one shot:

```bash
docker compose run --rm foues-cms-api node scripts/create-api-tokens.js
```

Creates (or reports as existing) two tokens and prints their values **once**:

- `STRAPI_API_TOKEN` — read-only, frontend content access (GraphQL/REST).
- `FORM_SUBMIT_TOKEN` — custom, scopes: form → findOne; form-submission → create.

Paste the printed values into `.env`, then rebuild the frontend. To rotate
existing tokens (invalidates the old values): add `--rotate`.

The full `.env` itself can be bootstrapped with `./scripts/generate-env.sh`,
which fills every secret (openssl) and leaves the two token vars empty for
this script to fill.

## Manual setup (admin panel)

Create a restricted API token in Strapi Admin → Settings → API Tokens:
- Name: FORM_SUBMIT_TOKEN
- Type: Custom
- Scopes: form → findOne; form-submission → create

Set the token value as FORM_SUBMIT_TOKEN in the frontend .env file.

## Public role permissions

Settings → Users & Permissions → Public (still manual, both setups):
- form: find, findOne (for GraphQL)
- form-submission: no public permissions
