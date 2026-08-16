# Tag-triggered Docker publish + GitHub Release

## Goal

Pushing a `v*.*.*` git tag should build and publish public Docker images for
both deployable services (`api`, `web`) to GHCR, create a GitHub Release for
that tag linking to the published images, and provide a ready-to-use compose
file so someone can run the whole stack from those images without cloning or
building the source tree. This is a public/portfolio artifact — it does not
change how `deploy.sh` deploys to the home-lab LXC, which continues to build
from source locally.

## Trigger

New workflow file `.github/workflows/release.yml`, separate from the existing
`ci.yml` (which runs on PRs and pushes to `main`).

```yaml
on:
  release:
    types: [published]
```

Fires on a **published GitHub Release**, not a raw tag push. GitHub's
"Draft a new release" UI creates the tag and the release together in one
step, which is far less friction than pushing a tag from the CLI first. Tag
names still follow the `v*.*.*` convention `deploy.sh` already assumes
(`git tag --list 'v*'`); the `build-and-push` job guards with
`if: startsWith(github.event.release.tag_name, 'v')` so a release cut from a
non-version tag is a no-op rather than an error.

`actions/checkout` explicitly pins `ref: ${{ github.event.release.tag_name }}`
on every step that needs source — for the `release` event, an unpinned
checkout defaults to the latest commit on the default branch, not
necessarily the commit the release's tag points at.

The workflow trusts the tag: it does **not** re-run lint/typecheck/tests. A
release is only ever cut from a commit that already passed `ci.yml` via its
PR into `main`; re-running the full suite (including testcontainers-backed
integration tests) here would just duplicate that gate.

## Jobs

### `build-and-push`

Matrix over the two images (each keeps its own `Dockerfile`, own base —
both stay `gcr.io/distroless/nodejs24-debian12:nonroot`, no change to the
existing hardening):

| Image                       | Dockerfile             | Build args                                                                          |
| ---------------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `treasury-ops-api`           | `apps/api/Dockerfile`    | none                                                                                    |
| `treasury-ops-web`           | `apps/web/Dockerfile`    | `NEXT_PUBLIC_API_URL=/api`, `INTERNAL_API_URL=http://api:4000/api` (topology constants, not secrets, same as `docker-compose.yml`) |

`treasury-ops-api` serves `api`, `worker`, and `migrate` in
`docker-compose.yml` today (all three reference `treasury-ops-api:local`),
so only these two images need building — `worker`/`migrate` just override
`command:` on the same image, no separate build.

- `docker/login-action` against `ghcr.io`, using the built-in `GITHUB_TOKEN`
  (`packages: write` permission) — no new secret required.
- `docker/metadata-action` derives two tags per image from the pushed git
  ref: `vX.Y.Z` (immutable, pinned) and `latest` (moving pointer). Both are
  pushed on every tag — GHCR storage for public images is free and
  layer-deduplicated, so this isn't ongoing maintenance, just automatic
  accumulation.
- `docker/build-push-action`, `push: true`, `platforms: linux/amd64` only
  (matches the Proxmox LXC host; no multi-arch buildx complexity for a
  single-target home-lab deploy).

### `update-release-notes` (needs: `build-and-push`)

Only runs if both images pushed successfully. The release already exists
(the trigger *is* its publish event) and may already carry notes the author
wrote by hand or generated via the GitHub UI — this job fetches the current
body and appends the image links + quickstart rather than overwriting it or
creating a second release:

```bash
existing_body="$(gh release view "$TAG" --json body -q .body)"
appendix="... image lines + quickstart block ..."
gh release edit "$TAG" --notes "$existing_body

$appendix"
```

The image lines and quickstart command are appended so the release page is
a complete, self-sufficient pointer to what shipped and how to run it,
without clobbering whatever the author already wrote when publishing.

## `docker-compose.release.yml` (new file, committed alongside `docker-compose.yml`)

Same service shape as the existing `docker-compose.yml` (`postgres`
[local-only profile] → `migrate` → `api` + `worker` → `web`, behind `proxy`),
but `api`/`worker`/`migrate` reference
`image: ghcr.io/harsh71019/treasury-ops-api:${TREASURY_OPS_VERSION:-latest}`
and `web` references
`image: ghcr.io/harsh71019/treasury-ops-web:${TREASURY_OPS_VERSION:-latest}`
instead of `build: context: .`. Everything else (env vars for
`DATABASE_URL`/`REDIS_URL` pointing at external Postgres/Redis, healthchecks,
network, the local-Postgres `profiles: ["local"]` escape hatch) is unchanged
from `docker-compose.yml`.

`TREASURY_OPS_VERSION` lets a user pin an old release (`v1.2.3`) instead of
always tracking `latest`; unset defaults to `latest`.

To actually run this without cloning the repo, someone needs exactly three
files: `docker-compose.release.yml`, `nginx.conf` (referenced by the `proxy`
service), and `env.example` (copied to `.env` and filled in) — all three
already live in the repo root and are fetched individually via
`raw.githubusercontent.com/<owner>/<repo>/<tag>/<file>` pinned to the release
tag (see the exact commands in the release notes above), not the whole tree.

## Known constraint (not a blocker)

GHCR packages are **private by default** on their first push. `GITHUB_TOKEN`
cannot change package visibility (requires a PAT with `admin:packages` scope,
or a manual toggle in the package's GitHub settings). After the very first
run of this workflow, a one-time manual step is required: open each
package's settings on GitHub and set visibility to Public. Every subsequent
push to an already-public package stays public automatically.

## Out of scope

- Changing `deploy.sh` to `docker compose pull` instead of building from
  source — the LXC deploy flow is unaffected by this change.
- Multi-arch builds (arm64 etc.) — no current target hardware needs it.
- Re-running CI on the tagged commit — trusted per the decision above.
- Bundling api+worker+web into a single all-in-one container — considered
  and rejected: it would require dropping the distroless base (no shell/
  process supervisor available today) and merging independent per-service
  healthchecks/restarts into one shared-fate container. Two images +
  `docker-compose.release.yml` gets the "no source tree needed" outcome
  without that trade.
- `/admin/queues` (Bull Board) in the release compose file — it's already
  reachable the same way it is in `docker-compose.yml` today (proxied
  through `proxy`), so no extra work either way; not called out further.
