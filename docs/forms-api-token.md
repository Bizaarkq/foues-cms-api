# Form Submit API Token

Create a restricted API token in Strapi Admin → Settings → API Tokens:
- Name: FORM_SUBMIT_TOKEN
- Type: Custom
- Scopes: form → findOne; form-submission → create

Set the token value as FORM_SUBMIT_TOKEN in the frontend .env file.

Public role permissions (Settings → Users & Permissions → Public):
- form: find, findOne (for GraphQL)
- form-submission: no public permissions
