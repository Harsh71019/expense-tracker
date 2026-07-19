# Release strategy

## Why this exists

`deploy.sh` used to `git pull` on whatever branch/ref was checked out on the
Proxmox LXC and deploy that. That's fine while the only thing running is a
throwaway sandbox, but this app is an append-only financial ledger holding
real transaction data. Tracking a moving branch means one careless `git pull`
during active development deploys unvetted, possibly-broken code straight
against real money data — with no clean line between "I'm experimenting" and
"this is what's live."

Tags fix that by giving a **deliberate checkpoint**: nothing reaches the LXC
until someone decides a specific commit is good enough to name and ship. Main
and feature branches stay free for experiments; the tag is the only thing
`deploy.sh` will ever run.

## How it works today

- `deploy.sh` now fetches tags and checks out the newest `v*` tag by default,
  or an explicit one: `./deploy.sh v0.2.0`.
- Rollback is the same command with the previous tag: `./deploy.sh v0.1.0`.
  No manual SHA lookup, no rebuilding from a detached commit.
- The running container reports `<tag>+<short-sha>` via `/api/healthz`, so
  it's always obvious exactly what's deployed.

## Why it matters more if this is ever open-sourced

If someone else runs this on their own infrastructure, git SHAs stop being a
usable version identifier — they need:

- A stable point to pin to, instead of tracking a branch that changes under
  them.
- A way to know whether upgrading is safe. Migrations here are
  additive-only and ordered (see `AGENTS.md` §3), so upgrade paths between
  tagged versions can be reasoned about; upgrade paths between arbitrary
  commits cannot.
- Release notes describing what changed, since they won't have the git log
  context or PR history that we do.

## Deliberately deferred (revisit later, not now)

None of this is needed for a single-user home-lab deploy, so it's not being
built yet. Worth reconsidering if/when this is opened up:

- Semantic versioning discipline (breaking vs. additive changes) tied to
  migration compatibility guarantees.
- Auto-generated `CHANGELOG.md` from conventional commits
  (`release-please` or `changesets` — near-zero ongoing effort).
- CI workflow to build and push a versioned image to a registry (GHCR) on
  tag push, rather than building locally in `deploy.sh`.
- `LICENSE` and `CONTRIBUTING.md`.
