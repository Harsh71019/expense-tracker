#!/usr/bin/env python3
"""Deploy a SHA-tagged release through the LAN-only Coolify API."""
import json
import os
import re
import time
import urllib.error
import urllib.request

base = os.environ["COOLIFY_URL"].rstrip("/")
app = os.environ["COOLIFY_APP_UUID"]
sha = os.environ["RELEASE_SHA"]
token = os.environ["COOLIFY_TOKEN"]
if not re.fullmatch(r"[0-9a-f]{40}", sha):
    raise SystemExit("A full commit SHA is required")
if not re.fullmatch(r"[A-Za-z0-9]+", app):
    raise SystemExit("Invalid application UUID")


def request(method, path, data=None):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(
        base + path, data=body, method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # API responses can contain environment values. Never echo the body.
        raise SystemExit(f"Coolify {method} {path} failed: HTTP {error.code}") from None


# A queued older workflow must not replace a newer main release.
repo = os.environ["GITHUB_REPOSITORY"]
req = urllib.request.Request(
    f"https://api.github.com/repos/{repo}/git/ref/heads/main",
    headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
             "Accept": "application/vnd.github+json"},
)
with urllib.request.urlopen(req, timeout=30) as response:
    current = json.load(response)["object"]["sha"]
if current != sha:
    print("A newer main commit exists; skipping this superseded release.")
    raise SystemExit(0)

request("PATCH", f"/applications/{app}", {"git_branch": "main", "git_commit_sha": sha})
request("PATCH", f"/applications/{app}/envs/bulk", {"data": [{
    "key": os.environ["IMAGE_TAG_VAR"], "value": sha, "is_preview": False,
    "is_buildtime": False, "is_runtime": True, "is_literal": True,
}]})
queued = request("POST", "/deploy", {"uuid": app})
deployments = queued.get("deployments", [])
if len(deployments) != 1 or not deployments[0].get("deployment_uuid"):
    raise SystemExit("Coolify did not return exactly one deployment UUID")
deployment = deployments[0]["deployment_uuid"]
print(f"Queued Coolify deployment {deployment} for {sha}")
deadline = time.monotonic() + 600
while time.monotonic() < deadline:
    status = request("GET", f"/deployments/{deployment}").get("status")
    if status == "finished":
        break
    if status in {"failed", "cancelled", "canceled"}:
        raise SystemExit(f"Coolify deployment {status}; inspect its dashboard log")
    time.sleep(10)
else:
    raise SystemExit("Coolify deployment did not finish within ten minutes")

# Health failures are deployment failures, not successful workflow exits.
health = os.environ["HEALTH_URL"]
for attempt in range(18):
    try:
        with urllib.request.urlopen(health, timeout=5) as response:
            if response.status == 200:
                break
    except (urllib.error.URLError, TimeoutError, ValueError):
        pass
    time.sleep(5)
else:
    raise SystemExit(f"{health} did not become healthy after deployment")
print(f"Release {sha} is healthy at {health}")
