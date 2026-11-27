import hashlib
import hmac
import json
import os
import pathlib
import re
import sys
import time


def fail(message):
    sys.exit(message)


base_sha = os.environ.get("BASE_SHA", "")
if not re.fullmatch(r"[0-9a-f]{40}", base_sha):
    fail("Invalid pinned base commit SHA.")
try:
    patch = json.loads(os.environ["PATCH_JSON"])
except (KeyError, json.JSONDecodeError):
    fail("Patch payload is invalid.")
if not isinstance(patch, str) or not patch or len(patch) > 40000:
    fail("Patch is empty or exceeds 40 KB.")

proposal_id = os.environ.get("PROPOSAL_ID", "")
issued_at = os.environ.get("APPROVAL_ISSUED_AT", "")
signature = os.environ.get("APPROVAL_SIGNATURE", "")
secret = os.environ.get("APPROVAL_SECRET", "")
if not re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", proposal_id):
    fail("Invalid approved proposal id.")
if not re.fullmatch(r"[0-9]{13}", issued_at) or not re.fullmatch(r"[0-9a-f]{64}", signature):
    fail("Missing or malformed approval proof.")
if len(secret) < 32:
    fail("Approval verification secret is not configured.")
issued_ms = int(issued_at)
if abs(int(time.time() * 1000) - issued_ms) > 600000:
    fail("Approval proof expired; request a fresh diagnosis.")
patch_sha256 = hashlib.sha256(patch.encode("utf-8")).hexdigest()
message = "\n".join([proposal_id.lower(), base_sha.lower(), patch_sha256, issued_at]).encode("utf-8")
expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
if not hmac.compare_digest(expected, signature):
    fail("Approval proof does not match this proposal, source commit, or patch.")

allowed = {"worker/src/index.js", "app.js", "media.js", "auth.js", "voice.js", "i18n.js"}
paths = []
current = None
old_header = False
new_header = False
in_hunk = False
for line in patch.splitlines():
    if line.startswith("diff --git "):
        if current and not (old_header and new_header):
            fail("Previous file headers are incomplete.")
        match = re.fullmatch(r"diff --git a/([^ ]+) b/([^ ]+)", line)
        if not match or match.group(1) != match.group(2):
            fail("Rename, create/delete, or malformed diff is forbidden.")
        current = match.group(1)
        if current not in allowed or current in paths:
            fail("Patch contains a path outside the allowlist or a duplicate path.")
        paths.append(current)
        old_header = new_header = in_hunk = False
        continue
    if line.startswith(("new file mode ", "deleted file mode ", "old mode ", "new mode ", "rename from ", "rename to ", "copy from ", "copy to ", "GIT binary patch")):
        fail("File mode, rename, copy, and binary patches are forbidden.")
    if current and not in_hunk and line.startswith("--- "):
        if old_header or line != f"--- a/{current}":
            fail("Unexpected old-file header.")
        old_header = True
    elif current and not in_hunk and line.startswith("+++ "):
        if not old_header or new_header or line != f"+++ b/{current}":
            fail("Unexpected new-file header.")
        new_header = True
    elif current and line.startswith("@@ "):
        if not (old_header and new_header):
            fail("Unified diff headers are incomplete.")
        in_hunk = True

if current and not (old_header and new_header):
    fail("Final file headers are incomplete.")
if not paths or len(paths) > 5:
    fail("Patch must change between one and five allowlisted files.")
if "@@" not in patch:
    fail("Unified diff hunks are missing.")

pathlib.Path(os.environ["RUNNER_TEMP"], "mina-repair.patch").write_text(patch, encoding="utf-8", newline="")
print("Validated paths:", ", ".join(paths))
