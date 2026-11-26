import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { handleSelfHealingRequest } from "../src/self-healing.mjs";

const INCIDENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const PROPOSAL_ID = "223e4567-e89b-42d3-a456-426614174000";
const BASE_SHA = "a".repeat(40);
const APPROVAL_SECRET = "self-healing-test-secret-with-at-least-32-characters";

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
      if (row) Object.assign(row, { status, reviewed_at });
    } else if (q.startsWith("INSERT INTO mina_self_healing_patches")) {
      const [id, proposal_id, patch_text, explanation, files_json, created_at] = p;
      this.patches.set(id, { id, proposal_id, patch_text, explanation, files_json, status: "generated", created_at });
    } else if (q.startsWith("UPDATE mina_self_healing_patches SET status =")) {
      const status = q.includes("'runner_dispatched'") ? "runner_dispatched" : "dispatch_failed";
      const row = this.patches.get(p[0]);
      if (row) row.status = status;
    } else if (q.startsWith("UPDATE mina_self_healing_proposals SET status = 'patch_queued'")) {
      const row = this.proposals.get(p[0]);
      if (row) row.status = "patch_queued";
    }
    return { success: true, meta: { changes: 1 } };
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

  const patch = [
    "diff --git a/app.js b/app.js",
    "--- a/app.js",
    "+++ b/app.js",
    "@@ -1 +1 @@",
    '-const answer = "before";',
    '+const answer = "after";',
    ""
  ].join("\n");
  let requestCount = 0;
  let dispatchInputs;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    requestCount += 1;
    const target = String(url);
    if (target.endsWith("/commits/main")) return jsonResponse({ sha: BASE_SHA });
    if (target.includes("raw.githubusercontent.com/")) return new Response('const answer = "before";\n', { status: 200 });
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
  assert.equal(response.status, 202);
  assert.equal(data.patchGenerated, true);
  assert.equal(data.runnerDispatched, true);
  assert.equal(data.applied, false);
  assert.equal(data.deployed, false);
  assert.deepEqual(data.files, ["app.js"]);
  assert.equal(requestCount, 4);
  assert.equal(db.proposals.get(PROPOSAL_ID).status, "patch_queued");

  assert.ok(dispatchInputs);
  assert.equal(dispatchInputs.proposal_id, PROPOSAL_ID);
  assert.equal(dispatchInputs.base_sha, BASE_SHA);
  assert.equal(dispatchInputs.patch, patch);
  assert.match(dispatchInputs.approval_issued_at, /^\d{13}$/);
  assert.match(dispatchInputs.approval_signature, /^[0-9a-f]{64}$/);
  const patchDigest = createHash("sha256").update(patch).digest("hex");
  const expected = createHmac("sha256", APPROVAL_SECRET)
    .update([PROPOSAL_ID, BASE_SHA, patchDigest, dispatchInputs.approval_issued_at].join("\n"))
    .digest("hex");
  assert.equal(dispatchInputs.approval_signature, expected);
  const storedPatch = [...db.patches.values()][0];
  assert.equal(storedPatch.status, "runner_dispatched");
  assert.equal(storedPatch.patch_text, patch);
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
