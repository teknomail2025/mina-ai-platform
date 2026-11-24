const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const workerConfig = fs.readFileSync(path.join(root, "worker/wrangler.toml"), "utf8");
const previewMigrationConfig = fs.readFileSync(path.join(root, "worker/wrangler.preview-migrations.toml"), "utf8");
const deployWorkflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-worker.yml"), "utf8");
const frontend = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("production frontend and GitHub deployment target the same active mina-ai-api Worker", () => {
  assert.match(workerConfig, /^name = "mina-ai-api"$/m);
  assert.match(frontend, /https:\/\/mina-ai-api\.teknomail2025\.workers\.dev/);
  assert.match(deployWorkflow, /workingDirectory: worker/);
  assert.match(deployWorkflow, /node --test worker\/test\/\*\.test\.cjs worker\/test\/\*\.test\.mjs/);
  assert.match(deployWorkflow, /wrangler@4 deploy --dry-run --config worker\/wrangler\.toml/);
  assert.match(deployWorkflow, /command: deploy/);
  assert.match(deployWorkflow, /branches: \[main\]/);
});

test("production and Preview storage bindings remain isolated", () => {
  assert.match(workerConfig, /^database_name = "mina-ai-db"$/m);
  assert.match(workerConfig, /^bucket_name = "mina-temporary-files"$/m);
  assert.match(workerConfig, /^\[previews\]$/m);
  assert.match(workerConfig, /^database_name = "mina-ai-db-preview"$/m);
  assert.match(workerConfig, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
  assert.match(workerConfig, /^bucket_name = "mina-temporary-files-preview"$/m);
  assert.match(previewMigrationConfig, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
  assert.doesNotMatch(previewMigrationConfig, /bdf7737f-b4b2-4158-982b-b7c7483ca702/);
});
