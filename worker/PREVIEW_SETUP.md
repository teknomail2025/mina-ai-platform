# Mina AI – Cloudflare Worker Preview setup

Production API and Cloudflare Build Previews use separate Wrangler files and separate resources.

- Cloudflare Workers Builds is connected to the existing Worker named `mina-ai-platform`; it must use `worker/wrangler.toml`.
- The active production API is `mina-ai-api`; GitHub Actions deploys it using `worker/wrangler.production.toml`.
- Both Preview D1 and R2 bindings are isolated from production.

## 1. Preview resources

The isolated Preview resources already exist:

- D1: `mina-ai-db-preview`, ID `a0c9df12-44bc-4e58-866c-25a3651edd66`
- R2: `mina-temporary-files-preview`

Keep production resources unchanged:

- D1: `mina-ai-db`
- R2: `mina-temporary-files`

## 2. Wrangler configuration separation

`worker/wrangler.toml` is the Cloudflare Workers Builds Preview configuration. Its Worker name must remain `mina-ai-platform` because that is the Worker connected to the repository. It binds only Preview resources under `[previews]`.

`worker/wrangler.production.toml` is the production API configuration. It targets `mina-ai-api`, binds production D1/R2 at the top level, and keeps Preview bindings isolated under `[previews]`.

Never change the production deployment workflow to use `wrangler.toml`. Never change the Cloudflare Build Preview command to use `wrangler.production.toml`.

## 3. Cloudflare Workers Builds settings

Repository root: `/`

Build command:

```sh
cd worker && npm install --no-audit --no-fund
```

Preview command:

```sh
cd worker && npx wrangler d1 migrations apply MINA_DB --remote --config wrangler.preview-migrations.toml && npx wrangler preview --config wrangler.toml
```

The migration command targets only the isolated Preview D1 database. The Preview command uses `mina-ai-platform`, matching the connected Cloudflare Worker. Do not use `wrangler deploy` in this Preview command.

## 4. Preview-only secrets

Using Wrangler 4.135.0 or later, set secrets in the Preview Base configuration. Wrangler prompts for each secret value:

```sh
npx wrangler preview base-config secret put ADMIN_USERNAME
npx wrangler preview base-config secret put ADMIN_PASSWORD
npx wrangler preview base-config secret put SESSION_SECRET
npx wrangler preview base-config secret put GEMINI_API_KEY
```

Use a separate long random `SESSION_SECRET` for Preview. Never put secret values in this file, Wrangler configuration, or Git.

## 5. Manual Preview validation

From `worker/`:

```sh
npx wrangler d1 migrations apply MINA_DB --remote --config wrangler.preview-migrations.toml
npx wrangler preview --config wrangler.toml
```

Use the returned Preview URL for browser testing. Confirm `/api/health`, authenticated upload/download/delete, chat, and isolated cleanup behavior. Do not test against the production API URL.

## Safety notes

- `wrangler.toml` has no production D1 or R2 binding.
- `wrangler.production.toml` is the only configuration used by the GitHub production deployment.
- Preview resources and secrets are separate from production.
- Cron Triggers do not invoke the Preview `scheduled()` handler; test cleanup through automated tests or a dedicated isolated test path.
- Do not merge or deploy until the Cloudflare Preview build and end-to-end checks pass.
