import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDiagnosticText, isAllowedDiagnosticPath, parseDiagnosisOutput } from "../src/self-healing.mjs";

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
