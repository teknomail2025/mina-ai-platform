# Mina AI – Cloudflare Worker Preview setup

Production resources must not be shared with branch Previews. Cloudflare Worker Previews do not inherit production variables, secrets, or bindings.

## 1. Create isolated Preview resources

From the `worker/` directory, or in the Cloudflare dashboard:

- Create a D1 database named `mina-ai-db-preview`.
- Create a private R2 bucket named `mina-temporary-files-preview` (Public access disabled; Standard storage).

Keep the existing production resources unchanged:
- D1: `mina-ai-db`
- R2: `mina-temporary-files`

## 2. Add Preview bindings to `worker/wrangler.toml`

Replace the current empty `previews = {}` block with the following. Replace `<PREVIEW_D1_DATABASE_ID>` with the ID returned by Cloudflare:

```toml
[previews.vars]
ALLOWED_ORIGINS = "https://teknomail2025.github.io,http://localhost:8000,http://127.0.0.1:8000"
GEMINI_MODEL = "gemini-3.8-flash"

[[previews.d1_databases]]
binding = "MINA_DB"
database_name = "mina-ai-db-preview"
database_id = "<PREVIEW_D1_DATABASE_ID>"
migrations_dir = "migrations"

[[previews.r2_buckets]]
binding = "MINA_FILES"
bucket_name = "mina-temporary-files-preview"
```

Do not point Preview bindings at the production D1 database or production R2 bucket.

## 3. Configure Preview-only secrets

Using Wrangler 4.135.0 or later, set these in the Preview Base configuration. Wrangler prompts for each secret value:

```sh
npx wrangler preview base-config secret put ADMIN_USERNAME
npx wrangler preview base-config secret put ADMIN_PASSWORD
npx wrangler preview base-config secret put SESSION_SECRET
npx wrangler preview base-config secret put GEMINI_API_KEY
```

Use the existing admin username if desired, but use a separate long random `SESSION_SECRET` for Preview. Never put secret values in this file or in `wrangler.toml`.

## 4. Apply D1 migrations and create the Preview

Apply the repository migrations to the Preview database, then create the branch Preview:

```sh
npx wrangler d1 migrations apply mina-ai-db-preview --remote
npx wrangler preview
```

Use the Preview URL—not the production Worker URL—for browser testing. Confirm that `/api/health` reports the API configured and that authenticated upload, download, delete, chat, and cleanup tests pass.

## Safety notes

- The top-level `MINA_DB` and `MINA_FILES` bindings remain production-only.
- Cron triggers are production-only; Cloudflare does not run production cron triggers for Previews. Test cleanup by invoking the cleanup helper in automated tests or with an isolated Preview-only test path.
- Do not merge or deploy the PR until the Preview uses the isolated resources and the end-to-end checks pass.
