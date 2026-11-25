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

- Unhandled Worker request failures and scheduled cleanup failures are recorded when D1 is available. Incident writes are throttled per route and per isolate so repeated failures cannot flood D1.
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

## Activation requirements

- GitHub permits `workflow_dispatch` only after `.github/workflows/mina-self-healing-runner.yml` exists on the repository's default branch (`main`). This branch contains the workflow, but it is not active for dispatch until the workflow is reviewed and merged into `main`.
- The self-healing Worker code must also be included in the deployed Worker version before the feature is active. Do not merge or deploy until the full Preview smoke test and regression suite pass. No PR is merged automatically.
- Configure the Cloudflare Worker Secret `GITHUB_ACTIONS_TOKEN` with a fine-grained GitHub token limited to Actions: write on this repository. The Worker uses it only to dispatch the workflow; it is never passed to the runner.
- After the workflow exists on `main`, configure the matching GitHub repository secret and the appropriate Cloudflare Worker secrets/variable. Use Preview-only values during Preview validation; never reuse or expose production credentials in Preview. Set `SELF_HEALING_RUNNER_ENABLED=true` only after the workflow and required secrets have been verified.
- Until all three conditions are met, the settings UI keeps patch generation disabled.

## Validation

The complete-checkup development branch currently has a successful CI run covering 101 tests, JavaScript syntax, and Wrangler dry-run validation. The isolated Cloudflare Preview smoke test is a separate acceptance gate. These checks do not authorize production deployment.


## Deployment isolation

Cloudflare Workers Builds uses the repository-root `wrangler.toml` and `worker/wrangler.toml` for the `mina-ai-platform` Preview Worker. Both use only Preview D1/R2 resources. The production API remains `mina-ai-api` and is deployed only through `worker/wrangler.production.toml` after regression tests and Wrangler dry-runs pass. The self-healing runner validates patches in an isolated GitHub Actions job and creates a review-only pull request; it never merges or deploys a repair automatically.


Self-healing repairs also require the same random SELF_HEALING_APPROVAL_SECRET value as a Cloudflare Worker secret and a GitHub Actions repository secret named MINA_SELF_HEALING_APPROVAL_SECRET. It must contain at least 32 characters. The Worker signs the approved proposal id, exact main commit, patch digest, and a timestamp valid for ten minutes; the read-only validation job rejects missing, expired, or mismatched signatures. Keep the repair button disabled until both copies are configured.

