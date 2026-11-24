# Mina AI – Cloudflare Worker Preview setup

Production API and Cloudflare Build Previews use separate Wrangler files and separate resources.

- Cloudflare Workers Builds is connected to the existing Worker named `mina-ai-platform`; it must use `worker/wrangler.toml`.
- The active production API is `mina-ai-api`; GitHub Actions deploys it using `worker/wrangler.production.toml`.
- Preview D1 and R2 bindings are isolated from production.

## Resources

- Preview D1: `mina-ai-db-preview`, ID `a0c9df12-44bc-4e58-866c-25a3651edd66`
- Preview R2: `mina-temporary-files-preview`
- Production D1: `mina-ai-db`
- Production R2: `mina-temporary-files`

## Cloudflare Workers Builds

Repository root: `/`

Build command:

```sh
cd worker && npm install --no-audit --no-fund
```

Preview command:

```sh
cd worker && npx wrangler d1 migrations apply MINA_DB --remote --config wrangler.preview-migrations.toml && npx wrangler preview --config wrangler.toml
```

Both Preview configs use the connected Worker name `mina-ai-platform` and isolated Preview D1/R2 resources.

## Production deployment

Production deploys use `worker/wrangler.production.toml` only. GitHub Actions tests and dry-runs both configurations before deploying `mina-ai-api`. Never store secret values in Wrangler files or Git.


The GitHub `preview-smoke` workflow validates the Preview health/authentication path on the image-pipeline branch and additionally tests D1/R2 upload, listing, download, and deletion once the R2 storage feature is included.

Preview smoke scope: the image-pipeline branch checks health, admin login and usage quotas; R2 lifecycle checks begin with the R2 storage branch; the self-healing branch additionally checks safe defaults and incident capture.
