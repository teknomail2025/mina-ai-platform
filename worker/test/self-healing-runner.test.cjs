const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const proposalId = "123e4567-e89b-42d3-a456-426614174000";
const baseSha = "a".repeat(40);
const secret = "self-healing-runner-test-secret-at-least-32-chars";
const patch = [
  "diff --git a/app.js b/app.js",
  "--- a/app.js",
  "+++ b/app.js",
  "@@ -1 +1 @@",
  "-const answer = 'before';",
  "+const answer = 'after';",
  "",
].join("\n");
const verifier = path.join(__dirname, "..", "scripts", "validate_self_healing_patch.py");

function sign({ patchText = patch, id = proposalId, sha = baseSha, issuedAt, key = secret }) {
  const digest = crypto.createHash("sha256").update(patchText).digest("hex");
  const message = [id.toLowerCase(), sha.toLowerCase(), digest, issuedAt].join("\n");
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

test("runner validates a fresh approval and rejects tampered, expired and unsafe patches", t => {
  const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), "mina-healing-runner-"));
  t.after(() => fs.rmSync(runnerTemp, { recursive: true, force: true }));
  const python = process.platform === "win32" ? "python" : "python3";
  const run = ({ patchText = patch, id = proposalId, sha = baseSha, issuedAt = String(Date.now()), signature, key = secret } = {}) => spawnSync(python, [verifier], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATCH_JSON: JSON.stringify(patchText),
      BASE_SHA: sha,
      PROPOSAL_ID: id,
      APPROVAL_ISSUED_AT: issuedAt,
      APPROVAL_SIGNATURE: signature || sign({ patchText, id, sha, issuedAt, key }),
      APPROVAL_SECRET: key,
      RUNNER_TEMP: runnerTemp,
    },
  });

  const issuedAt = String(Date.now());
  const valid = run({ issuedAt });
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.equal(fs.readFileSync(path.join(runnerTemp, "mina-repair.patch"), "utf8"), patch);

  const validSignature = sign({ issuedAt });
  const tampered = run({ issuedAt, patchText: patch + " ", signature: validSignature });
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr + tampered.stdout, /does not match/);

  const expiredAt = String(Date.now() - 600001);
  const expired = run({ issuedAt: expiredAt });
  assert.notEqual(expired.status, 0);
  assert.match(expired.stderr + expired.stdout, /expired/);

  const unsafePatch = patch.replaceAll("app.js", "../../secrets.env");
  const unsafe = run({ patchText: unsafePatch });
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr + unsafe.stdout, /outside the allowlist/);

  const wrongSource = run({ sha: "b".repeat(40), issuedAt, signature: validSignature });
  assert.notEqual(wrongSource.status, 0);
  assert.match(wrongSource.stderr + wrongSource.stdout, /does not match/);
});
