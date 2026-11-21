# Mina Self-Healing – Stage 1

This stage adds guarded incident capture and AI-assisted diagnosis to the authenticated Worker API.

## Endpoints

All endpoints require the existing signed Mina administrator session in the `Authorization: Bearer <session>` header.

- `GET /api/admin/self-healing/status` – reports which capabilities are active.
- `POST /api/admin/self-healing/report` – records a bounded incident. JSON body:
  `{"source":"manual","route":"/api/chat","message":"Example failure","stack":"Optional stack"}`
  Accepted sources: `worker`, `browser`, `test`, `manual`.
- `GET /api/admin/self-healing/incidents` – lists the latest 50 incidents.
- `POST /api/admin/self-healing/diagnose` – JSON body `{"incidentId":"<uuid>"}`; asks Gemini for a structured diagnosis and stores a proposal.
- `GET /api/admin/self-healing/proposals` – lists stored diagnosis proposals.
- `POST /api/admin/self-healing/proposals/<uuid>/review` – JSON body `{"decision":"approve"}` or `{"decision":"reject"}`. Approval only marks a proposal for a later manual test stage; it never changes code.

## Safety boundaries

- Unhandled Worker request failures and scheduled cleanup failures are automatically recorded when D1 is available.
- Diagnostic text is size-limited and common bearer/API-key/token formats are redacted before storage and before Gemini receives the incident.
- User chat history is not attached to an incident or sent to the diagnostic model.
- Model output is parsed as JSON, required fields are validated, and suggested source paths are filtered through a fixed allowlist.
- All self-healing endpoints run after the existing administrator session check.
- No source code is changed, no generated code is executed, and no deployment is performed.
- A proposal marked `approved_for_manual_test` has not been tested or applied.

## Not implemented in Stage 1

The isolated patch runner is deliberately a separate stage. It must fetch only allowlisted source files, produce a reviewable diff, run tests in an ephemeral GitHub Actions environment, and create a separate pull request only after explicit administrator approval. It must never merge or deploy automatically.

## Validation

The Worker CI job runs the self-healing safety tests alongside the existing regression tests, checks Worker/frontend syntax, and runs Wrangler `--dry-run`. No production D1/R2 data is written by these tests.
