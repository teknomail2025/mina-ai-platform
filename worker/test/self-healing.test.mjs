import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDiagnosticText, sanitizeSourceForPatch, isAllowedDiagnosticPath, parseDiagnosisOutput, parsePatchOutput, createRunnerApprovalSignature } from "../src/self-healing.mjs";

test("diagnostic text redacts common credentials and bounds length", () => {
  const value = sanitizeDiagnosticText("Bearer abc.def SECRET=hidden GEMINI_API_KEY=AIza123456789012345678901234567890", 80);
  assert.doesNotMatch(value, /abc\.def|hidden|AIza123/);
  assert.match(value, /REDACTED/);
  assert.ok(value.length <= 80);
});

test("source path allowlist rejects traversal and unknown files", () => {
  assert.equal(isAllowedDiagnosticPath("worker/src/index.js"), true);
  assert.equal(isAllowedDiagnosticPath("../../wrangler.toml"), false);
  assert.equal(isAllowedDiagnosticPath("worker/wrangler.toml"), false);
  assert.equal(isAllowedDiagnosticPath("worker/test/worker.test.cjs"), false, "AI patches must not weaken the regression suite");
});

test("diagnosis parser validates required fields and filters suggested files", () => {
  const parsed = parseDiagnosisOutput(JSON.stringify({
    summary: "Request failed",
    root_cause: "Upstream timeout",
    risk_level: "high",
    recommended_steps: ["Check provider response"],
    suggested_files: ["worker/src/index.js", "../../secrets.env"],
    test_plan: "Add a timeout regression test"
  }));
  assert.equal(parsed.risk_level, "high");
  assert.deepEqual(parsed.suggested_files, ["worker/src/index.js"]);
  assert.equal(parsed.recommended_steps.length, 1);
});

test("diagnosis parser rejects malformed or incomplete model output", () => {
  assert.equal(parseDiagnosisOutput("not json"), null);
  assert.equal(parseDiagnosisOutput(JSON.stringify({ summary: "Only a summary" })), null);
});


test("frontend captures browser and voice failures only for an authenticated admin session", async () => {
  const fs = await import("node:fs");
  const app = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const voice = fs.readFileSync(new URL("../../voice.js", import.meta.url), "utf8");
  assert.match(app, /window\.MINA_AUTHENTICATED !== true/);
  assert.match(app, /addEventListener\("error"/);
  assert.match(app, /addEventListener\("unhandledrejection"/);
  assert.match(app, /source: "browser"/);
  assert.match(app, /lastBrowserIncidentAt/);
  assert.match(voice, /window\.MINA_AUTHENTICATED !== true/);
  assert.match(voice, /reportVoiceIncident\("Live voice WebSocket error"\)/);
  assert.match(voice, /source: "browser"/);
  const reportFunction = app.match(/function reportBrowserIncident\([\s\S]*?\n  }/);
  assert.ok(reportFunction, "browser incident reporter must exist");
  assert.doesNotMatch(reportFunction[0], /messages|conversation|audio/i);
});


test("settings expose a guarded self-healing incident and diagnosis review panel", async () => {
  const fs = await import("node:fs");
  const app = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  for (const id of ["selfHealingCaptureStatus","selfHealingIncidentSelect","diagnoseSelfHealingIncident","selfHealingProposalSelect","approveSelfHealingProposal","rejectSelfHealingProposal"]) {
    assert.ok(app.includes(id), "settings UI must wire "+id);
  }
  assert.match(html, /data-settings-section="self-healing"/);
  assert.match(app, /patchGeneration===true&&system\.isolatedTestRunner===true/);
  assert.match(app, /Kod değişikliği ve yayın kapalı/);
});


test("patch parser accepts only bounded unified diffs for approved allowlisted files", () => {
  const good = JSON.stringify({
    explanation: "Fix the guarded error path.",
    patch: "diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n@@ -1 +1 @@\n-old\n+new\n"
  });
  const parsed = parsePatchOutput(good, ["app.js"]);
  assert.deepEqual(parsed.files, ["app.js"]);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/worker/wrangler.toml b/worker/wrangler.toml\n--- a/worker/wrangler.toml\n+++ b/worker/wrangler.toml\n@@ -1 +1 @@\n-a\n+b" }), ["worker/wrangler.toml"]), null);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/app.js b/other.js\n--- a/app.js\n+++ b/other.js\n@@ -1 +1 @@\n-a\n+b" }), ["app.js"]), null);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/app.js b/app.js\nnew file mode 100644\n--- a/app.js\n+++ b/app.js\n@@ -1 +1 @@\n-a\n+b" }), ["app.js"]), null);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n--- a/auth.js\n+++ b/auth.js\n@@ -1 +1 @@\n-a\n+b" }), ["app.js"]), null);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n@@ -1 +1 @@\n+Bearer abc.def\n" }), ["app.js"]), null);
});


test("isolated repair workflow tests without secrets and creates only a review pull request", async () => {
  const fs = await import("node:fs");
  const workflow = fs.readFileSync(new URL("../../.github/workflows/mina-self-healing-runner.yml", import.meta.url), "utf8");
  const validator = fs.readFileSync(new URL("../scripts/validate_self_healing_patch.py", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /validate-and-test:[\s\S]*?permissions:\s*contents: read/);
  assert.match(workflow, /create-review-pull-request:[\s\S]*?permissions:\s*contents: write\s*pull-requests: write/);
  assert.ok(workflow.includes("node --test worker/test/*.test.cjs $(find worker/test -name '*.test.mjs' -print)"));
  assert.match(workflow, /wrangler@4 deploy --dry-run/);
  assert.match(workflow, /--base main/);
  assert.doesNotMatch(workflow, /wrangler@4 deploy --config/);
  assert.ok(workflow.includes("APPROVAL_SECRET: " + "$" + "{{ secrets.MINA_SELF_HEALING_APPROVAL_SECRET }}"));
  assert.match(workflow, /python worker\/scripts\/validate_self_healing_patch\.py/);
  assert.match(validator, /hmac\.compare_digest/);
  assert.match(validator, /abs\(int\(time\.time\(\) \* 1000\) - issued_ms\) > 600000/);
  assert.match(validator, /APPROVAL_SIGNATURE/);
  const writeJob = workflow.split("create-review-pull-request:")[1] || "";
  assert.doesNotMatch(writeJob, /APPROVAL_SECRET|secrets\.MINA_SELF_HEALING_APPROVAL_SECRET/);
});


test("Worker exposes patch generation only through the authenticated proposal workflow", async () => {
  const fs = await import("node:fs");
  const worker = fs.readFileSync(new URL("../src/self-healing.mjs", import.meta.url), "utf8");
  assert.match(worker, /(?:review|generate-patch)/);
  assert.match(worker, /proposal\.status !== "approved_for_manual_test"/);
  assert.match(worker, /env\.GITHUB_ACTIONS_TOKEN/);
  assert.match(worker, /SELF_HEALING_APPROVAL_SECRET/);
  assert.match(worker, /automaticCodeChanges: false/);
  assert.match(worker, /patchExecution: false/);
});


test("self-healing incident history is bounded to 30 days and 500 records", async () => {
  const fs = await import("node:fs");
  const worker = fs.readFileSync(new URL("../src/self-healing.mjs", import.meta.url), "utf8");
  assert.match(worker, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(worker, /ORDER BY created_at DESC LIMIT 500/);
  assert.match(worker, /Retention cleanup must never block incident capture/);
});


test("source sent for repair analysis redacts embedded credentials and private keys", () => {
  const source = [
    'const API_KEY = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
    'const ACCESS_TOKEN = "example-private-access-token";',
    'const CLOUDFLARE_API_TOKEN = "cloudflare-sensitive-value";',
    'const AWS_SECRET_ACCESS_KEY = "aws-sensitive-value";',
    'const PRIVATE = \`-----BEGIN PRIVATE KEY-----',
    'secret-material',
    '-----END PRIVATE KEY-----\`;'
  ].join("\n");
  const sanitized = sanitizeSourceForPatch(source);
  assert.doesNotMatch(sanitized, /ghp_abcdefghijklmnopqrstuvwxyz123456|secret-material|example-private-access-token|cloudflare-sensitive-value|aws-sensitive-value/);
  assert.equal((sanitized.match(/\[REDACTED\]/g) || []).length, 5);
});

test("patch parser rejects redaction placeholders instead of turning them into source code", () => {
  const patch = "diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n@@ -1 +1 @@\n-const key = \"[REDACTED]\";\n+const key = \"new-value\";\n";
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "unsafe context", patch }), ["app.js"]), null);
});

test("repair workflow pins tests to the exact source commit and checks branch ancestry", async () => {
  const fs = await import("node:fs");
  const workflow = fs.readFileSync(new URL("../../.github/workflows/mina-self-healing-runner.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("base_sha:"));
  assert.match(workflow, /name: Validate and materialize patch\s+env:[\s\S]*?run: \|\s+python worker\/scripts\/validate_self_healing_patch\.py\s+git fetch origin main --quiet\s+git merge-base --is-ancestor "\$BASE_SHA" origin\/main[\s\S]*?git switch --detach "\$BASE_SHA"\s+git apply --check "\$RUNNER_TEMP\/mina-repair\.patch"/);
  assert.ok(workflow.includes('git merge-base --is-ancestor "$BASE_SHA" origin/main'));
  assert.ok(workflow.includes('git switch --detach "$BASE_SHA"'));
  assert.ok(workflow.includes("ref: ${{ inputs.base_sha }}"));
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$BASE_SHA"'));
  assert.ok(workflow.includes('test "$(git rev-parse origin/main)" = "$BASE_SHA"'));
  assert.match(workflow, /create-review-pull-request:[\s\S]*?needs: validate-and-test[\s\S]*?permissions:\s+contents: write\s+pull-requests: write/);
});


test("repair UI keeps patch generation disabled until the runner and approved proposal are ready", async () => {
  const fs = await import("node:fs");
  const app = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  assert.match(app, /id="generateSelfHealingPatch" disabled/);
  assert.match(app, /!selfHealingRunnerReady\|\|!item\|\|item\.status!=="approved_for_manual_test"/);
});


test("patch generation remains disabled until the trusted GitHub runner is explicitly enabled", async () => {
  const fs = await import("node:fs");
  const worker = fs.readFileSync(new URL("../src/self-healing.mjs", import.meta.url), "utf8");
  assert.match(worker, /SELF_HEALING_RUNNER_ENABLED === "true"/);
  assert.match(worker, /SELF_HEALING_RUNNER_ENABLED !== "true"/);
});


test("runner approval signature binds proposal, source, exact patch and expires quickly", async () => {
  const input = { proposalId: "123e4567-e89b-42d3-a456-426614174000", baseSha: "a".repeat(40), patch: "diff --git a/app.js b/app.js\n", issuedAt: "1795550000000", secret: "test-only-approval-secret-at-least-32-chars" };
  const signature = await createRunnerApprovalSignature(input);
  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.notEqual(signature, await createRunnerApprovalSignature({ ...input, patch: input.patch + " " }));
  assert.notEqual(signature, await createRunnerApprovalSignature({ ...input, proposalId: "223e4567-e89b-42d3-a456-426614174000" }));
  await assert.rejects(createRunnerApprovalSignature({ ...input, secret: "short" }));
});

