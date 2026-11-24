const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const rootPreview = fs.readFileSync(path.join(root, "wrangler.toml"), "utf8");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const previewConfig = fs.readFileSync(path.join(root, "worker/wrangler.toml"), "utf8");
const productionConfig = fs.readFileSync(path.join(root, "worker/wrangler.production.toml"), "utf8");
const previewMigrationConfig = fs.readFileSync(path.join(root, "worker/wrangler.preview-migrations.toml"), "utf8");
const deployWorkflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-worker.yml"), "utf8");
const frontend = fs.readFileSync(path.join(root, "app.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "worker/package.json"), "utf8"));

test("repository-root Wrangler config is Preview-only and matches Cloudflare Build service", () => {
  assert.match(rootPreview, /^name = "mina-ai-platform"$/m);
  assert.ok(rootPreview.includes('main = "worker/src/index.js"'));
  assert.match(rootPreview, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
  assert.doesNotMatch(rootPreview, /bdf7737f-b4b2-4158-982b-b7c7483ca702/);
  assert.equal(rootPackage.devDependencies.wrangler, "4.167.0");
});

test("Cloudflare Worker Preview and migration configs use isolated D1/R2 resources", () => {
  assert.match(previewConfig, /^name = "mina-ai-platform"$/m);
  assert.match(previewConfig, /^\[previews\]$/m);
  assert.match(previewConfig, /^database_name = "mina-ai-db-preview"$/m);
  assert.match(previewConfig, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
  assert.match(previewConfig, /^bucket_name = "mina-temporary-files-preview"$/m);
  assert.doesNotMatch(previewConfig, /bdf7737f-b4b2-4158-982b-b7c7483ca702/);
  assert.match(previewMigrationConfig, /^name = "mina-ai-platform"$/m);
  assert.match(previewMigrationConfig, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
  assert.doesNotMatch(previewMigrationConfig, /bdf7737f-b4b2-4158-982b-b7c7483ca702/);
});

test("production deployment and frontend target mina-ai-api with production storage", () => {
  assert.match(productionConfig, /^name = "mina-ai-api"$/m);
  assert.match(productionConfig, /^database_name = "mina-ai-db"$/m);
  assert.match(productionConfig, /^database_id = "bdf7737f-b4b2-4158-982b-b7c7483ca702"$/m);
  assert.match(productionConfig, /^bucket_name = "mina-temporary-files"$/m);
  assert.match(productionConfig, /^database_name = "mina-ai-db-preview"$/m);
  assert.match(productionConfig, /^database_id = "a0c9df12-44bc-4e58-866c-25a3651edd66"$/m);
  assert.match(productionConfig, /^bucket_name = "mina-temporary-files-preview"$/m);
  assert.match(frontend, /https:\/\/mina-ai-api\.teknomail2025\.workers\.dev/);
  assert.match(deployWorkflow, /workingDirectory: worker/);
  assert.match(deployWorkflow, /command: deploy --config wrangler\.production\.toml/);
  assert.ok(deployWorkflow.includes("npx --yes wrangler@4 deploy --dry-run --config worker/wrangler.toml"));
  assert.ok(deployWorkflow.includes("npx --yes wrangler@4 deploy --dry-run --config wrangler.toml"));
  assert.match(deployWorkflow, /branches: \[main\]/);
  assert.match(packageJson.scripts.deploy, /wrangler\.production\.toml/);
  assert.match(packageJson.scripts.test, /^node scripts\/run-tests\.mjs$/);
});
