import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleSelfHealingRequest } from "../src/self-healing.mjs";

const INCIDENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const PROPOSAL_ID = "223e4567-e89b-42d3-a456-426614174000";
const BASE_SHA = "a".repeat(40);
const APPROVAL_SECRET = "self-healing-test-secret-with-at-least-32-characters";
const RUNNER_VALIDATOR = fileURLToPath(new URL("../scripts/validate_self_healing_patch.py", import.meta.url));

class MemoryD1 {
  constructor({ incidents = [], proposals = [], patches = [] } = {}) {
    this.incidents = new Map(incidents.map(row => [row.id, { ...row }]));
    this.proposals = new Map(proposals.map(row => [row.id, { ...row }]));
    this.patches = new Map(patches.map(row => [row.id, { ...row }]));
  }

  prepare(sql) {
    const db = this;
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async run() { return db.run(sql, params); },
      async first() { return db.first(sql, params); },
      async all() { return db.all(sql, params); }
    };
  }

  async run(sql, p) {
    const q = sql.replace(/\s+/g, " ").trim();
    let changes = 1;
    if (q.startsWith("INSERT INTO mina_self_healing_incidents")) {
      const [id, source, route, message, stack, createdAt, updatedAt] = p;
      this.incidents.set(id, { id, source, route, message, stack, status: "new", created_at: createdAt, updated_at: updatedAt });
    } else if (q.startsWith("INSERT INTO mina_self_healing_proposals")) {
      const [id, incident_id, summary, root_cause, risk_level, steps_json, files_json, test_plan, created_at] = p;
      this.proposals.set(id, { id, incident_id, summary, root_cause, risk_level, steps_json, files_json, test_plan, status: "pending_review", created_at, reviewed_at: null });
    } else if (q.startsWith("UPDATE mina_self_healing_incidents SET status = 'diagnosed'")) {
      const [updated_at, id] = p;
      const row = this.incidents.get(id);
      if (row) Object.assign(row, { status: "diagnosed", updated_at });
    } else if (q.startsWith("UPDATE mina_self_healing_proposals SET status = ?, reviewed_at = ?")) {
      const [status, reviewed_at, id] = p;
      const row = this.proposals.get(id);
      if (row && (!q.includes("AND status = 'pending_review'") || row.status === "pending_review")) Object.assign(row, { status, reviewed_at });
      else changes = 0;
    } else if (q.startsWith("INSERT INTO mina_self_healing_patches") && q.includes("'generating'")) {
      const [id, proposal_id, created_at, staleBefore] = p;
      const existing = [...this.patches.values()].find(row => row.proposal_id === proposal_id);
      if (!existing) this.patches.set(id, { id, proposal_id, patch_text: "", explanation: "", files_json: "[]", status: "generating", created_at });
      else if (existing.status === "dispatch_failed" || (existing.status === "generating" && existing.created_at < staleBefore)) {
        Object.assign(existing, { id, patch_text: "", explanation: "", files_json: "[]", status: "generating", created_at });
      } else changes = 0;
    } else if (q.startsWith("UPDATE mina_self_healing_patches SET patch_text =")) {
      const [patch_text, explanation, files_json, created_at, id] = p;
      const row = this.patches.get(id);
      if (row?.status === "generating") Object.assign(row, { patch_text, explanation, files_json, created_at, status: "generated" });
      else changes = 0;
    } else if (q.startsWith("UPDATE mina_self_healing_patches SET status =")) {
      const status = q.includes("'runner_dispatched'") ? "runner_dispatched" : q.includes("'dispatch_uncertain'") ? "dispatch_uncertain" : "dispatch_failed";
      const row = this.patches.get(p[0]);
      if (row && (!q.includes("AND status = 'generating'") || row.status === "generating")) row.status = status;
    } else if (q.startsWith("UPDATE mina_self_healing_proposals SET status = 'patch_queued'")) {
      const row = this.proposals.get(p[0]);
      if (row) row.status = "patch_queued";
    }
    return { success: true, meta: { changes } };
  }

  async first(sql, p) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.includes("FROM mina_self_healing_proposals WHERE id = ?")) return this.proposals.get(p[0]) || null;
    if (q.includes("FROM mina_self_healing_patches WHERE proposal_id = ?")) return [...this.patches.values()].find(row => row.proposal_id === p[0]) || null;
    if (q.includes("FROM mina_self_healing_incidents WHERE id = ?")) return this.incidents.get(p[0]) || null;
    return null;
  }

  async all(sql) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.includes("FROM mina_self_healing_incidents")) return { results: [...this.incidents.values()] };
    if (q.includes("FROM mina_self_healing_proposals")) return { results: [...this.proposals.values()] };
    return { results: [] };
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function callHandler({ db, path, method = "GET", body, env = {} }) {
  const request = new Request("https://mina.test" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return handleSelfHealingRequest(
    request,
    new URL(request.url),
    { MINA_DB: db, ...env },
    {},
    jsonResponse,
    async req => {
      try { return { value: await req.json(), tooLarge: false, invalid: false }; }
      catch { return { value: null, tooLarge: false, invalid: true }; }
    }
  );
}

function fakeProposal(overrides = {}) {
  return {
    id: PROPOSAL_ID,
    incident_id: INCIDENT_ID,
    summary: "A guarded client request fails",
    root_cause: "An error branch does not handle an empty response",
    risk_level: "medium",
    steps_json: JSON.stringify(["Add a safe fallback"]),
    files_json: JSON.stringify(["app.js"]),
    test_plan: "Run the frontend and Worker regression suites",
    status: "pending_review",
    created_at: Date.now(),
    reviewed_at: null,
    ...overrides
  };
}

function fakeIncident(overrides = {}) {
  return {
    id: INCIDENT_ID,
    source: "manual",
    route: "/api/test",
    message: "Synthetic test incident",
    stack: "Synthetic stack",
    status: "new",
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides
  };
}

test("status endpoint reports configured capabilities without exposing secrets", async () => {
  const db = new MemoryD1();
  const response = await callHandler({
    db,
    path: "/api/admin/self-healing/status",
    env: {
      GEMINI_API_KEY: "fake-gemini-key",
      GITHUB_ACTIONS_TOKEN: "fake-runner-token",
      SELF_HEALING_APPROVAL_SECRET: APPROVAL_SECRET,
      SELF_HEALING_RUNNER_ENABLED: "true"
    }
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.incidentCapture, true);
  assert.equal(data.aiDiagnosis, true);
  assert.equal(data.patchGeneration, true);
  assert.equal(data.isolatedTestRunner, true);
  assert.equal(data.approvalRequired, true);
  assert.equal(data.patchExecution, false);
  assert.equal(data.automaticCodeChanges, false);
  assert.doesNotMatch(JSON.stringify(data), /fake-gemini-key|fake-runner-token|self-healing-test-secret/);
});

test("incident report stores redacted diagnostic content and rejects an invalid source", async () => {
  const db = new MemoryD1();
  const rejected = await callHandler({
    db,
    path: "/api/admin/self-healing/report",
    method: "POST",
    body: { source: "unknown", message: "bad" }
  });
  assert.equal(rejected.status, 400);

  const response = await callHandler({
    db,
    path: "/api/admin/self-healing/report",
    method: "POST",
    body: {
      source: "browser",
      route: "/settings",
      message: "Request failed: Bearer ghp_abcdefghijklmnopqrstuvwxyz123456",
      stack: "GEMINI_API_KEY=AIza123456789012345678901234567890"
    }
  });
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.recorded, true);
  const stored = db.incidents.get(data.incident.id);
  assert.ok(stored);
  assert.match(stored.message, /\[REDACTED\]/);
  assert.doesNotMatch(stored.message + stored.stack, /ghp_abcdefghijklmnopqrstuvwxyz123456|AIza123456789012345678901234567890/);
});

test("proposal review uses an atomic state transition when approval and rejection race", async () => {
  const db = new MemoryD1({ proposals: [fakeProposal()] });
  const originalRun = db.run.bind(db);
  db.run = async (sql, params) => {
    const query = sql.replace(/\s+/g, " ").trim();
    if (query.startsWith("UPDATE mina_self_healing_proposals SET status = ?, reviewed_at = ?")) {
      // Simulate another administrator tab winning after this request's SELECT.
      db.proposals.get(params[2]).status = "rejected";
    }
    return originalRun(sql, params);
  };

  const response = await callHandler({
    db,
    path: "/api/admin/self-healing/proposals/" + PROPOSAL_ID + "/review",
    method: "POST",
    body: { decision: "approve" }
  });
  const data = await response.json();
  assert.equal(response.status, 409);
  assert.match(data.error, /eşzamanlı/);
  assert.equal(db.proposals.get(PROPOSAL_ID).status, "rejected");
});

test("diagnosis creates a review-only proposal from the AI response", async t => {
  const db = new MemoryD1({ incidents: [fakeIncident()] });
  const diagnosis = {
    summary: "A request error is not normalized",
    root_cause: "The frontend assumes a response field is always present",
    risk_level: "low",
    recommended_steps: ["Guard the missing field", "Add a regression test"],
    suggested_files: ["app.js", "../../secrets.env"],
    test_plan: "Exercise the empty response branch"
  };
  t.mock.method(globalThis, "fetch", async () => jsonResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify(diagnosis) }] } }]
  }));
  const response = await callHandler({
    db,
    path: "/api/admin/self-healing/diagnose",
    method: "POST",
    body: { incidentId: INCIDENT_ID },
    env: { GEMINI_API_KEY: "fake-gemini-key", GEMINI_MODEL: "test-model" }
  });
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.diagnosed, true);
  assert.equal(data.proposal.status, "pending_review");
  assert.equal(data.proposal.patchGenerated, false);
  assert.equal(data.proposal.applied, false);
  assert.deepEqual(data.proposal.suggested_files, ["app.js"]);
  assert.equal(db.incidents.get(INCIDENT_ID).status, "diagnosed");
  assert.equal(db.proposals.get(data.proposal.id).status, "pending_review");
});

test("manual approval gates patch generation; signed patch is dispatched for isolated tests only", async t => {
  const db = new MemoryD1({
    incidents: [fakeIncident()],
    proposals: [fakeProposal()]
  });
  const repairRepository = mkdtempSync(path.join(os.tmpdir(), "mina-self-healing-repository-"));
  t.after(() => rmSync(repairRepository, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: repairRepository, encoding: "utf8" }).trim();
  git(["init", "--quiet"]);
  git(["config", "core.autocrlf", "false"]);
  git(["config", "user.name", "Mina isolated test"]);
  git(["config", "user.email", "mina-isolated-test@example.invalid"]);
  const originalSource = 'const answer = "before";\n';
  const repairedSource = 'const answer = "after";\n';
  writeFileSync(path.join(repairRepository, "app.js"), originalSource, "utf8");
  git(["add", "--", "app.js"]);
  git(["commit", "--quiet", "-m", "trusted source"]);
  const baseSha = git(["rev-parse", "HEAD"]);
  writeFileSync(path.join(repairRepository, "app.js"), repairedSource, "utf8");
  const patch = execFileSync("git", ["diff", "--", "app.js"], { cwd: repairRepository, encoding: "utf8" });
  git(["checkout", "--", "app.js"]);
  const approval = await callHandler({
    db,
    path: "/api/admin/self-healing/proposals/" + PROPOSAL_ID + "/review",
    method: "POST",
    body: { decision: "approve" }
  });
  const approvalData = await approval.json();
  assert.equal(approval.status, 200);
  assert.equal(approvalData.status, "approved_for_manual_test");
  assert.equal(approvalData.applied, false);
  assert.equal(approvalData.testsExecuted, false);

  let requestCount = 0;
  let dispatchInputs;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    requestCount += 1;
    const target = String(url);
    if (target.endsWith("/commits/main")) return jsonResponse({ sha: baseSha });
    if (target.includes("raw.githubusercontent.com/")) return new Response(originalSource, { status: 200 });
    if (target.includes("generativelanguage.googleapis.com/")) {
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ explanation: "Normalize the empty answer branch.", patch }) }] } }] });
    }
    if (target.endsWith("/dispatches")) {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer fake-runner-token");
      dispatchInputs = JSON.parse(options.body).inputs;
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected mocked network request: " + target);
  });

  const response = await callHandler({
    db,
    path: "/api/admin/self-healing/proposals/" + PROPOSAL_ID + "/generate-patch",
    method: "POST",
    body: {},
    env: {
      GEMINI_API_KEY: "fake-gemini-key",
      GEMINI_MODEL: "test-model",
      GITHUB_ACTIONS_TOKEN: "fake-runner-token",
      SELF_HEALING_APPROVAL_SECRET: APPROVAL_SECRET,
      SELF_HEALING_RUNNER_ENABLED: "true"
    }
  });
  const data = await response.json();
  assert.equal(response.status, 202, JSON.stringify(data));
  assert.equal(data.patchGenerated, true);
  assert.equal(data.runnerDispatched, true);
  assert.equal(data.applied, false);
  assert.equal(data.deployed, false);
  assert.deepEqual(data.files, ["app.js"]);
  assert.equal(requestCount, 4);
  assert.equal(db.proposals.get(PROPOSAL_ID).status, "patch_queued");

  assert.ok(dispatchInputs);
  assert.equal(dispatchInputs.proposal_id, PROPOSAL_ID);
  assert.equal(dispatchInputs.base_sha, baseSha);
  assert.equal(dispatchInputs.patch, patch);
  assert.match(dispatchInputs.approval_issued_at, /^\d{13}$/);
  assert.match(dispatchInputs.approval_signature, /^[0-9a-f]{64}$/);
  const patchDigest = createHash("sha256").update(patch).digest("hex");
  const expected = createHmac("sha256", APPROVAL_SECRET)
    .update([PROPOSAL_ID, baseSha, patchDigest, dispatchInputs.approval_issued_at].join("\n"))
    .digest("hex");
  assert.equal(dispatchInputs.approval_signature, expected);
  const runnerTemp = mkdtempSync(path.join(os.tmpdir(), "mina-self-healing-e2e-"));
  t.after(() => rmSync(runnerTemp, { recursive: true, force: true }));
  const runnerValidation = spawnSync(process.platform === "win32" ? "python" : "python3", [RUNNER_VALIDATOR], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATCH_JSON: JSON.stringify(dispatchInputs.patch),
      BASE_SHA: dispatchInputs.base_sha,
      PROPOSAL_ID: dispatchInputs.proposal_id,
      APPROVAL_ISSUED_AT: dispatchInputs.approval_issued_at,
      APPROVAL_SIGNATURE: dispatchInputs.approval_signature,
      APPROVAL_SECRET,
      RUNNER_TEMP: runnerTemp
    }
  });
  assert.equal(runnerValidation.status, 0, runnerValidation.stderr || runnerValidation.stdout);
  const materializedPatch = path.join(runnerTemp, "mina-repair.patch");
  assert.equal(readFileSync(materializedPatch, "utf8"), patch, "the approved and signed patch must reach the isolated runner unchanged");
  execFileSync("git", ["apply", "--check", materializedPatch], { cwd: repairRepository, stdio: "pipe" });
  execFileSync("git", ["apply", materializedPatch], { cwd: repairRepository, stdio: "pipe" });
  assert.equal(readFileSync(path.join(repairRepository, "app.js"), "utf8"), repairedSource, "the approved runner patch must apply to its exact source commit");
  const storedPatch = [...db.patches.values()][0];
  assert.equal(storedPatch.status, "runner_dispatched");
  assert.equal(storedPatch.patch_text, patch);
});

test("concurrent patch requests claim one runner dispatch before spending a second AI generation", async t => {
  const db = new MemoryD1({
    incidents: [fakeIncident()],
    proposals: [fakeProposal({ status: "approved_for_manual_test" })]
  });
  const patch = [
    "diff --git a/app.js b/app.js",
    "--- a/app.js",
    "+++ b/app.js",
    "@@ -1 +1 @@",
    '-const answer = "before";',
    '+const answer = "after";',
    ""
  ].join("\n");
  let sourceFetches = 0;
  let resolveSources;
  const bothSourceFetches = new Promise(resolve => { resolveSources = resolve; });
  let generationCalls = 0;
  let dispatchCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const target = String(url);
    if (target.endsWith("/commits/main")) return jsonResponse({ sha: BASE_SHA });
    if (target.includes("raw.githubusercontent.com/")) {
      sourceFetches++;
      if (sourceFetches === 2) resolveSources();
      await bothSourceFetches;
      return new Response('const answer = "before";\n', { status: 200 });
    }
    if (target.includes("generativelanguage.googleapis.com/")) {
      generationCalls++;
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ explanation: "Test a concurrency-safe repair.", patch }) }] } }] });
    }
    if (target.endsWith("/dispatches")) {
      dispatchCalls++;
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected mocked network request: " + target);
  });
  const env = {
    GEMINI_API_KEY: "fake-gemini-key",
    GITHUB_ACTIONS_TOKEN: "fake-runner-token",
    SELF_HEALING_APPROVAL_SECRET: APPROVAL_SECRET,
    SELF_HEALING_RUNNER_ENABLED: "true"
  };
  const responses = await Promise.all([1, 2].map(() => callHandler({
    db,
    path: "/api/admin/self-healing/proposals/" + PROPOSAL_ID + "/generate-patch",
    method: "POST",
    body: {},
    env
  })));
  assert.deepEqual(responses.map(response => response.status).sort(), [202, 409]);
  assert.equal(sourceFetches, 2, "both requests may finish the bounded source reads before claiming");
  assert.equal(generationCalls, 1, "only the winning request may call the AI repair model");
  assert.equal(dispatchCalls, 1, "only one signed patch may be dispatched for an approved proposal");
  assert.equal([...db.patches.values()].length, 1);
  assert.equal([...db.patches.values()][0].status, "runner_dispatched");
});

test("GitHub 5xx dispatch results stay locked because the runner may have accepted the request", async t => {
  const db = new MemoryD1({
    incidents: [fakeIncident()],
    proposals: [fakeProposal({ status: "approved_for_manual_test" })]
  });
  const patch = [
    "diff --git a/app.js b/app.js",
    "--- a/app.js",
    "+++ b/app.js",
    "@@ -1 +1 @@",
    '-const answer = "before";',
    '+const answer = "after";',
    ""
  ].join("\n");
  let generationCalls = 0;
  let dispatchCalls = 0;
  let sourceFetches = 0;
  t.mock.method(globalThis, "fetch", async url => {
    const target = String(url);
    if (target.endsWith("/commits/main")) return jsonResponse({ sha: BASE_SHA });
    if (target.includes("raw.githubusercontent.com/")) {
      sourceFetches++;
      return new Response('const answer = "before";\n', { status: 200 });
    }
    if (target.includes("generativelanguage.googleapis.com/")) {
      generationCalls++;
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ explanation: "Test uncertain dispatch recovery.", patch }) }] } }] });
    }
    if (target.endsWith("/dispatches")) {
      dispatchCalls++;
      return new Response("GitHub temporarily unavailable", { status: 503 });
    }
    throw new Error("Unexpected mocked network request: " + target);
  });
  const env = {
    GEMINI_API_KEY: "fake-gemini-key",
    GITHUB_ACTIONS_TOKEN: "fake-runner-token",
    SELF_HEALING_APPROVAL_SECRET: APPROVAL_SECRET,
    SELF_HEALING_RUNNER_ENABLED: "true"
  };
  const first = await callHandler({
    db,
    path: "/api/admin/self-healing/proposals/" + PROPOSAL_ID + "/generate-patch",
    method: "POST",
    body: {},
    env
  });
  const firstData = await first.json();
  assert.equal(first.status, 502);
  assert.equal(firstData.runnerDispatched, "unknown");
  assert.equal([...db.patches.values()][0].status, "dispatch_uncertain");

  const retry = await callHandler({
    db,
    path: "/api/admin/self-healing/proposals/" + PROPOSAL_ID + "/generate-patch",
    method: "POST",
    body: {},
    env
  });
  assert.equal(retry.status, 409);
  assert.equal(generationCalls, 1);
  assert.equal(dispatchCalls, 1);
  assert.equal(sourceFetches, 1, "locked retries should stop before contacting source or provider services");
});

test("critical-risk proposals are blocked before any patch or runner request", async t => {
  const db = new MemoryD1({
    incidents: [fakeIncident()],
    proposals: [fakeProposal({ risk_level: "critical", status: "approved_for_manual_test" })]
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Critical proposal must not make a network request");
  });
  const response = await callHandler({
    db,
    path: "/api/admin/self-healing/proposals/" + PROPOSAL_ID + "/generate-patch",
    method: "POST",
    body: {},
    env: {
      GEMINI_API_KEY: "fake-gemini-key",
      GITHUB_ACTIONS_TOKEN: "fake-runner-token",
      SELF_HEALING_APPROVAL_SECRET: APPROVAL_SECRET,
      SELF_HEALING_RUNNER_ENABLED: "true"
    }
  });
  const data = await response.json();
  assert.equal(response.status, 403);
  assert.match(data.error, /Kritik riskli/);
  assert.equal(db.patches.size, 0);
});

