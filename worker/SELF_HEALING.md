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
2. Mina fetches the exact current commit SHA of `feature/mina-self-healing`, fetches only allowlisted source files at that immutable SHA, redacts secrets, and asks Gemini for a minimal unified diff.
3. The Worker validates the diff and dispatches GitHub Actions with the patch, proposal ID, and pinned source SHA.
4. A read-only, secret-free job checks that the pinned SHA belongs to the trusted repair branch, validates patch paths and headers, applies the patch in an ephemeral runner, runs regression tests, checks JavaScript syntax, and performs Wrangler `--dry-run`.
5. Only if every check succeeds does a separate write-enabled job create a review-only pull request. That job does not execute the generated source code.

The generated patch cannot change regression tests, workflow files, package manifests, deployment configuration, or files outside the allowlist. The workflow does not merge, modify the live Worker, or deploy. Tests run without repository write credentials or application secrets.

## Activation requirements

- GitHub permits `workflow_dispatch` only after the workflow file exists on the repository's default branch. The workflow file is currently in the `feature/mina-self-healing` branch and its PR is not merged; it is not dispatchable until the branch chain reaches the default branch.
- Configure the Cloudflare Worker Secret `GITHUB_ACTIONS_TOKEN` with a fine-grained GitHub token limited to Actions: write on this repository. The Worker uses it only to dispatch the workflow; it is never passed to the runner.
- After the workflow exists on the default branch, set the Cloudflare Worker variable `SELF_HEALING_RUNNER_ENABLED=true`. This explicit feature flag prevents dispatch attempts before the trusted workflow is available.
- Until all three conditions are met, the settings UI keeps patch generation disabled.

## Validation

The latest successful GitHub Actions run for the repair pipeline changes passed 89 tests, with zero failures. Worker and frontend syntax checks passed, and Wrangler `--dry-run` completed. These checks did not deploy or write to production D1/R2.
