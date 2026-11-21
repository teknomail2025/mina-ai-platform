import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDiagnosticText, isAllowedDiagnosticPath, parseDiagnosisOutput, parsePatchOutput } from "../src/self-healing.mjs";

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
  assert.match(app, /automaticCodeChanges\?"Açık":"Kapalı/);
  assert.match(app, /Kod değişikliği ve yayın kapalı/);
});


test("patch parser accepts only bounded unified diffs for approved allowlisted files", () => {
  const good = JSON.stringify({
    explanation: "Fix the guarded error path.",
    patch: "diff --git a/app.js b/app.js\\n--- a/app.js\\n+++ b/app.js\\n@@ -1 +1 @@\\n-old\\n+new\\n"
  });
  const parsed = parsePatchOutput(good, ["app.js"]);
  assert.deepEqual(parsed.files, ["app.js"]);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/worker/wrangler.toml b/worker/wrangler.toml\\n--- a/worker/wrangler.toml\\n+++ b/worker/wrangler.toml\\n@@ -1 +1 @@\\n-a\\n+b" }), ["worker/wrangler.toml"]), null);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/app.js b/other.js\\n--- a/app.js\\n+++ b/other.js\\n@@ -1 +1 @@\\n-a\\n+b" }), ["app.js"]), null);
  assert.equal(parsePatchOutput(JSON.stringify({ explanation: "bad", patch: "diff --git a/app.js b/app.js\\nnew file mode 100644\\n--- a/app.js\\n+++ b/app.js\\n@@ -1 +1 @@\\n-a\\n+b" }), ["app.js"]), null);
});


test("isolated repair workflow tests without secrets and creates only a review pull request", async () => {
  const fs = await import("node:fs");
  const workflow = fs.readFileSync(new URL("../../.github/workflows/mina-self-healing-runner.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /validate-and-test:[\s\S]*?permissions:\s*contents: read/);
  assert.match(workflow, /create-review-pull-request:[\s\S]*?permissions:\s*contents: write\s*pull-requests: write/);
  assert.match(workflow, /node --test worker\/test\/\*\.test\.cjs worker\/test\/\*\.test\.mjs/);
  assert.match(workflow, /wrangler@4 deploy --dry-run/);
  assert.match(workflow, /--base feature\/mina-self-healing/);
  assert.doesNotMatch(workflow, /wrangler@4 deploy --config/);
  assert.doesNotMatch(workflow, /secrets\.[A-Z_]+/);
});


test("Worker exposes patch generation only through the authenticated proposal workflow", async () => {
  const fs = await import("node:fs");
  const worker = fs.readFileSync(new URL("../src/self-healing.mjs", import.meta.url), "utf8");
  assert.match(worker, /(?:review|generate-patch)/);
  assert.match(worker, /proposal\.status !== "approved_for_manual_test"/);
  assert.match(worker, /env\.GITHUB_ACTIONS_TOKEN/);
  assert.match(worker, /automaticCodeChanges: false/);
  assert.match(worker, /patchExecution: false/);
});
