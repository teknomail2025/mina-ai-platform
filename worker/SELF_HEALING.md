# Mina Self-Healing

Mina's self-healing workflow is an administrator-controlled pipeline: detect an error, diagnose it, request a proposed patch, test that patch in an isolated runner, and create a review-only pull request. It never merges or deploys automatically.

## Administrator API

All routes below require the existing signed Mina administrator session in the `Authorization: Bearer <session>` header.

- `GET /api/admin/self-healing/status` — reports enabled capabilities.
- `POST /api/admin/self-healing/report` — records a bounded incident. Example:
  `{"source":"manual","route":"/api/chat","message":"Example failure","stack":"Optional stack"}`
  Accepted sources: `worker`, `browser`, `test`, `manual`.
- `GET /api/admin/self-healing/incidents` — lists recent incidents.
- `POST /api/admin/self-healing/diagnose` — body `{"incidentId":"<uuid>"}`; asks Gemini for a structured diagnosis.
- `GET /api/admin/self-healing/proposals` — lists diagnosis proposals.
- `POST /api/admin/self-healing/proposals/<uuid>/review` — body `{"decision":"approve"}` or `{"decision":"reject"}`.
- `POST /api/admin/self-healing/proposals/<uuid>/generate-patch` — generates a constrained diff and dispatches the isolated test workflow. Requires an approved, non-critical proposal.

## Detection and data handling

- Unhandled Worker request failures and scheduled cleanup failures are recorded when D1 is available.
- Authenticated browser sessions report uncaught JavaScript errors and unhandled promise rejections. Voice startup and WebSocket failures are also reported.
- Browser reports contain error metadata only; chat messages, conversation history, microphone audio, and transcripts are not attached.
- Reports are throttled client-side. Diagnostic fields are size-limited and common bearer tokens, API keys, JWTs, GitHub tokens, and private-key blocks are redacted.
- Source files sent to Gemini for patch generation are also passed through secret redaction. If a proposed diff contains a redaction placeholder, it is rejected rather than risking placeholder text being written into source.
- Incident and proposal history is pruned to 30 days and at most 500 recent records per category to control D1 use.
- AI output is treated as untrusted data. Suggested paths and every patch path are checked against a fixed application-source allowlist.

## Isolated patch runner

1. An administrator reviews a diagnosis proposal and explicitly approves it for manual testing.
2. Mina fetches the exact current commit SHA of `main`, fetches only allowlisted source files at that immutable SHA, redacts secrets, and asks Gemini for a minimal unified diff.
3. The Worker validates the diff and dispatches GitHub Actions with the patch, proposal ID, and pinned source SHA.
4. A read-only, secret-free job checks that the pinned SHA belongs to the trusted repair branch, validates patch paths and headers, applies the patch in an ephemeral runner, runs regression tests, checks JavaScript syntax, and performs Wrangler `--dry-run`.
5. Only if every check succeeds does a separate write-enabled job create a review-only pull request. That job does not execute the generated source code.

The generated patch cannot change regression tests, workflow files, package manifests, deployment configuration, or files outside the allowlist. The workflow does not merge, modify the live Worker, or deploy. Tests run without repository write credentials or application secrets.

## Activation and current readiness

This feature is not activated in production by this pull request. The repository must contain the trusted workflow on its default branch and the Worker must be deployed with its explicit runner flag and separately managed credentials before dispatch can work. Keep the runner flag disabled until those prerequisites have been reviewed and intentionally configured. Never enable automatic merging or deployment.

An administrator's explicit proposal approval is required for patch generation. Critical-risk proposals are rejected. A short-lived HMAC binds the approval to the proposal, immutable source commit, exact patch digest, and timestamp; the isolated runner independently checks the signature, age, source, and allowlisted patch paths before testing. The runner has no application secrets in its read-only test job. A passing repair can create a review-only pull request; it cannot merge or deploy.

## Validation

The test count and CI state change with each commit; use the current pull request checks as the source of truth. Local Worker tests include an end-to-end approval-signature handoff into the Python runner validator. Browser CI uses simulated camera devices and does not verify physical camera hardware, real microphone permission prompts, or a live Gemini voice session. No test deploys to production.


## Deployment isolation

Cloudflare Workers Builds uses the repository-root `wrangler.toml` and `worker/wrangler.toml` for the `mina-ai-platform` Preview Worker. Both use only Preview D1/R2 resources. The production API remains `mina-ai-api` and is deployed only through `worker/wrangler.production.toml` after regression tests and Wrangler dry-runs pass. The self-healing runner validates patches in an isolated GitHub Actions job and creates a review-only pull request; it never merges or deploys a repair automatically.


Self-healing repairs also require the same random SELF_HEALING_APPROVAL_SECRET value as a Cloudflare Worker secret and a GitHub Actions repository secret named MINA_SELF_HEALING_APPROVAL_SECRET. It must contain at least 32 characters. The Worker signs the approved proposal id, exact main commit, patch digest, and a timestamp valid for ten minutes; the read-only validation job rejects missing, expired, or mismatched signatures. Keep the repair button disabled until both copies are configured.

