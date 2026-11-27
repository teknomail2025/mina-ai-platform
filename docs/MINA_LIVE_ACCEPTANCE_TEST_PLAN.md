# Mina AI — Live Provider and Device Acceptance Test Plan

**Status:** Prepared; not executed against live providers.  
**Scope:** Gemini image analysis, Gemini Live voice, real camera/microphone behavior, and the self-healing approval/runner boundary.  
**Safety rule:** Use an isolated Cloudflare Preview/staging Worker and test accounts only. Never run this plan against production D1/R2, production quotas, or the production self-healing dispatch path.

## 1. Preconditions and isolation

- [ ] Confirm the tested Git commit and all required CI workflows are green.
- [ ] Create or select an isolated Cloudflare Preview/staging environment with its own D1 database and R2 bucket.
- [ ] Verify the Preview migration configuration points only to the Preview database; abort if any production database ID appears.
- [ ] Configure provider credentials as Cloudflare secrets in the Preview environment only. Do not paste credentials into chat, source files, logs, test fixtures, or this document.
- [ ] Use a dedicated staging administrator and test user; do not reuse production sessions.
- [ ] Set a small explicit test budget / provider quota and record the expected maximum number of calls before starting.
- [ ] Confirm incident logging redacts API keys, bearer tokens, cookies, authorization headers, and provider response bodies.
- [ ] Keep self-healing runner dispatch disabled during image and voice tests.

## 2. Gemini image-analysis acceptance

**Fixture:** One locally held, non-sensitive JPEG and one PNG. Verify each file's actual magic bytes match its MIME type.

1. Sign in to the staging account.
2. Upload the JPEG and ask Mina to describe only visible content.
3. Confirm the browser sends the actual captured/uploaded image payload to the staging Worker.
4. Confirm the Worker forwards the image as Gemini `inlineData` with matching MIME type and base64 bytes.
5. Confirm a successful response is rendered and the usage counter increments exactly once.
6. Repeat once with PNG.
7. Try a MIME/signature mismatch, malformed base64, unsupported MIME type, and an oversized payload. Each must be rejected before provider invocation and must not consume provider quota.
8. Simulate a provider 4xx/5xx failure in CI/local tests. Confirm the user-facing response contains no raw provider body, credentials, or internal diagnostics; usage reservation is refunded on failure.

**Pass criteria:** Real staging request reaches Gemini with the exact image payload; successful output returns; invalid inputs are blocked before provider calls; provider failures are redacted and quota accounting is correct.

## 3. Gemini Live voice and physical-device acceptance

Use a desktop browser with a real microphone. Do not record or retain unrelated people.

1. Open the staging site over HTTPS and sign in.
2. Start voice mode and grant microphone permission.
3. Confirm the short-lived, single-use Live token is requested only after permission succeeds.
4. Confirm the browser connects to the constrained Gemini Live model and completes setup.
5. Speak a short test phrase; confirm Mina receives audio and returns playable audio.
6. Mute. Confirm the microphone track becomes disabled and no further audio frames are sent.
7. Unmute. Confirm audio frames resume.
8. Close the voice session. Confirm the WebSocket closes, microphone tracks stop, and AudioContext closes.
9. Repeat while permission is pending, then close the session. Confirm the late-arriving stream is immediately stopped and no Live token is requested.
10. Deny microphone permission and verify a clear recovery message without creating a provider session.
11. Exhaust the staging live-minute quota and verify no token request is made after quota exhaustion.

**Pass criteria:** Real device audio round-trip works; mute/close/permission-race behavior matches the browser simulation; no token is minted after a denied, closed, or quota-blocked session.

## 4. Self-healing runner acceptance — safe boundary

The production runner must remain disabled. Do not trigger a production dispatch.

**Phase A — non-dispatch staging checks**
- [ ] Verify the status endpoint reports the runner unavailable when the feature flag, GitHub token, or 32+ character approval secret is missing.
- [ ] Verify every self-healing route rejects guest and invalid sessions.
- [ ] Create a synthetic incident containing dummy secrets and verify redaction in stored incident data and API responses.
- [ ] Generate a diagnosis for a synthetic incident; verify it creates a review-only proposal.
- [ ] Verify approval and rejection are mutually exclusive under concurrent requests; the losing request must receive HTTP 409.
- [ ] Verify critical-risk proposals cannot enter patch generation.
- [ ] Verify patch validation rejects paths outside the six-file allowlist, more than five files, binary changes, mode changes, malformed diffs, duplicate paths, and wrong base commits.

**Phase B — isolated GitHub runner test (currently blocked)**
The current Worker dispatch URL is hard-coded to `teknomail2025/mina-ai-platform`. Therefore, the existing self-healing API cannot safely target a separate sandbox repository. Do not try to use the current API for a sandbox dispatch, and do not dispatch a synthetic patch to the Mina repository.

Before Phase B can be run, implement and review a separate sandbox-only runner configuration:
- [ ] Add an explicit repository target setting with a strict allowlist; the staging environment must accept only the dedicated sandbox repository.
- [ ] Verify the workflow file and signing secret are present in that sandbox repository.
- [ ] Use a disposable test branch and synthetic, non-sensitive patch.
- [ ] Give the test token only the permissions required for that sandbox workflow.
- [ ] Verify the runner checks out the exact approved SHA, runs validation without write permissions, then creates a review-only PR in the sandbox.
- [ ] Verify no merge, release, deployment, or production secret access is possible.
- [ ] Revoke the temporary token and delete the sandbox branch/PR after evidence is collected.

**Pass criteria:** No automatic code application, merge, or deployment. Only a sandbox review PR may be created in Phase B.

## 5. Evidence and final sign-off

Record for each test: commit SHA, environment name, UTC timestamp, test case, pass/fail, HTTP status, redacted request correlation ID, quota before/after, and any issue link. Never record raw tokens, API keys, cookies, image contents, audio recordings, or full provider error bodies.

A feature is **not complete** until its relevant real staging test passes. CI simulations and Preview smoke tests are necessary but do not prove a live Gemini provider connection or a real device round-trip.
