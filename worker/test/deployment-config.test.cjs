const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const preview = fs.readFileSync(path.join(root, "worker/wrangler.toml"), "utf8");
const production = fs.readFileSync(path.join(root, "worker/wrangler.production.toml"), "utf8");
const migration = fs.readFileSync(path.join(root, "worker/wrangler.preview-migrations.toml"), "utf8");
const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-worker.yml"), "utf8");
const frontend = fs.readFileSync(path.join(root, "app.js"), "utf8");
test("Cloudflare Preview uses the connected Worker name and isolated storage", () => {
  assert.match(preview, /^name = "mina-ai-platform"$/m);
  assert.match(preview, /^database_name = "mina-ai-db-preview"$/m);
  assert.match(preview, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
  assert.match(preview, /^bucket_name = "mina-temporary-files-preview"$/m);
  assert.doesNotMatch(preview, /bdf7737f-b4b2-4158-982b-b7c7483ca702/);
  assert.match(migration, /^name = "mina-ai-platform"$/m);
  assert.match(migration, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
});
test("Production deploy uses active mina-ai-api and production storage", () => {
  assert.match(production, /^name = "mina-ai-api"$/m);
  assert.match(production, /^database_name = "mina-ai-db"$/m);
  assert.match(production, /^bucket_name = "mina-temporary-files"$/m);
  assert.match(frontend, /mina-ai-api\.teknomail2025\.workers\.dev/);
  assert.match(deploy, /command: deploy --config wrangler\.production\.toml/);
});
