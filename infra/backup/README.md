# Shared PostgreSQL backup operations

This directory provides the independent backup system for TreasuryOps and the
other PostgreSQL databases hosted by shared-infrastructure LXC 102. It does not
run inside NestJS, BullMQ, or the application LXC, so an application failure
cannot prevent the next scheduled backup.

The initial recovery targets are:

- recovery point objective (RPO): at most six hours of database writes;
- recovery time objective (RTO): one to two hours for a documented restore;
- copies: production, a separate local Proxmox backup disk, and an encrypted
  off-site Restic repository.

## What it protects

Each backup snapshot contains:

- a PostgreSQL custom-format archive for every database in
  `BACKUP_DATABASES`;
- a `pg_dumpall --globals-only` export of roles and tablespaces;
- explicitly configured infrastructure files from LXC 102;
- PostgreSQL client/server versions, creation time and backup host;
- SHA-256 checksums covering every file in the snapshot.

The app LXC has no application data volume, but its production `.env` is
required for disaster recovery. Protect that LXC with a separate Proxmox/PBS
backup job. Do not attempt to list `/opt/apps/treasury-ops/.env` in
`BACKUP_CONFIG_PATHS` unless that path is genuinely mounted on LXC 102.

Docker images, `node_modules`, logs and build output are deliberately excluded.
Code and additive migrations are recovered from Git.

## Files

- `bin/backup-postgres.sh`: creates and validates dumps, then writes the same
  completed snapshot to the local and off-site repositories.
- `bin/maintain-repositories.sh`: applies retention, prunes unreferenced data
  and checks one deterministic quarter of repository data each week.
- `bin/verify-restore.sh`: restores the latest off-site snapshot into an
  isolated PostgreSQL 18 Docker container and runs read-only ledger checks.
- `sql/verify-ledger.sql`: balance-cache, reversal-pair, transfer-pair, tenancy
  and transaction-audit invariants.
- `systemd/`: six-hour backup, weekly maintenance and monthly restore-test
  services and timers.

All three jobs share one `flock` lock. Maintenance can never prune a repository
while a backup or restore test is using it.

## Prerequisites

On LXC 102 install:

- PostgreSQL 18 client tools (`psql`, `pg_dump`, `pg_dumpall`, `pg_restore`);
- Restic;
- rclone when Google Drive is used;
- Docker for the isolated monthly restore test;
- `curl`, `flock`, GNU coreutils and findutils.

The local repository path must be a mounted, physically separate backup disk.
A directory on LXC 102's root disk does not count as another copy.

The scripts run as root because they may read root-owned database
configuration. Credentials and repository passwords remain in
`/etc/treasury-backup` with mode `0600`.

## Install

Run from a checkout of this repository on LXC 102:

```bash
cd /path/to/treasury-ops/infra/backup
sudo ./install.sh
sudo editor /etc/treasury-backup/backup.env
```

The installer copies scripts and SQL to `/opt/treasury-backup`, installs the
systemd units, and creates the configuration on first installation. It never
enables timers or overwrites an existing configuration.

Only list paths that actually exist on LXC 102 in `BACKUP_CONFIG_PATHS`. A
missing configured path fails the backup rather than silently producing an
incomplete recovery set.

### PostgreSQL authentication

Local peer authentication for `PGUSER=postgres` is preferred. If password
authentication is required, create `/etc/treasury-backup/pgpass` with mode
`0600` and set `PGPASSFILE`:

```text
hostname:5432:*:backup_role:password
```

Do not place a PostgreSQL password in a command argument. A logical-backup role
must be able to read every selected database and the cluster-global metadata.

### Repository passwords

Use different, high-entropy passwords for the two repositories:

```bash
sudo sh -c 'umask 077; openssl rand -base64 48 > /etc/treasury-backup/local-repository-password'
sudo sh -c 'umask 077; openssl rand -base64 48 > /etc/treasury-backup/offsite-repository-password'
```

Store both passwords in a password manager and keep a second offline copy away
from the Proxmox host. Restic data cannot be recovered without its repository
password.

Initialize the local repository only after confirming that the mount is the
separate backup disk:

```bash
findmnt /mnt/proxmox-backup
sudo restic \
  --repo /mnt/proxmox-backup/restic/shared-postgres \
  --password-file /etc/treasury-backup/local-repository-password \
  init
```

### Google Drive off-site repository

Configure rclone into the root-owned path used by the hardened systemd
services:

```bash
sudo env RCLONE_CONFIG=/etc/treasury-backup/rclone.conf rclone config
sudo chmod 0600 /etc/treasury-backup/rclone.conf
sudo env RCLONE_CONFIG=/etc/treasury-backup/rclone.conf rclone lsd treasury-drive:
sudo env RCLONE_CONFIG=/etc/treasury-backup/rclone.conf restic \
  --repo rclone:treasury-drive:treasury-ops/restic \
  --password-file /etc/treasury-backup/offsite-repository-password \
  init
```

Use a dedicated Google account with MFA and a dedicated rclone OAuth client.
Restic encrypts repository contents; adding an rclone `crypt` layer is
unnecessary.

For Backblaze B2, replace `RESTIC_OFFSITE_REPOSITORY` and
`RESTORE_TEST_REPOSITORY` with the S3-compatible repository URL and add a
bucket-scoped `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to the root-only
configuration. Do not use an account-wide master key.

## Commissioning

Do not enable automation until both commands pass:

```bash
sudo systemctl start treasury-backup.service
sudo journalctl -u treasury-backup.service --since today

sudo systemctl start treasury-backup-restore-test.service
sudo journalctl -u treasury-backup-restore-test.service --since today
```

The restore test:

1. downloads the latest snapshot from `RESTORE_TEST_REPOSITORY`;
2. verifies every SHA-256 checksum;
3. restores `treasury_ops` into a temporary PostgreSQL 18 container with no
   network;
4. checks account balance reconstruction, reversal and transfer pairing,
   cross-tenant ownership, positive integer amounts, and transaction audit
   references;
5. destroys the container and plaintext staging directory.

Increase `RESTORE_TEST_TMPFS_SIZE` before the database archive approaches the
configured limit.

After commissioning, enable all timers:

```bash
sudo systemctl enable --now \
  treasury-backup.timer \
  treasury-backup-maintenance.timer \
  treasury-backup-restore-test.timer

systemctl list-timers 'treasury-backup*'
```

Timers use `Asia/Kolkata` explicitly. Backups run near 00:15, 06:15, 12:15 and
18:15 with up to five minutes of randomized delay.

## Monitoring

Configure three independent Healthchecks-compatible ping URLs in
`backup.env`. Each script sends `/start`, success, or `/fail` without printing
the secret URL. Alert when:

- a six-hour job misses its expected window;
- weekly repository maintenance fails;
- the monthly restore test fails.

The monitor must be outside TreasuryOps, PostgreSQL and Redis. Application
notifications cannot be trusted during an infrastructure failure.

Useful commands:

```bash
systemctl status treasury-backup.service
journalctl -u treasury-backup.service -n 200
journalctl -u treasury-backup-maintenance.service -n 200
journalctl -u treasury-backup-restore-test.service -n 200
```

## Retention and integrity

The default policy keeps:

- the latest 28 snapshots;
- 30 daily snapshots;
- 12 weekly snapshots;
- 12 monthly snapshots.

Maintenance prunes only after successful backups have already been written.
Every week it checks repository structure and cycles through one of four
deterministic data subsets. Snapshot retention is grouped by host and tags,
not by the timestamped staging path, so the configured limits apply across
successive jobs.

Never run `restic unlock`, `forget`, `prune`, or destructive rclone commands
automatically outside the supplied maintenance service. Investigate a lock
before removing it.

## Pre-deployment backup

Before applying production migrations, run the backup on LXC 102 and require a
successful exit:

```bash
ssh root@SHARED_INFRA_LXC_102 systemctl start treasury-backup.service
```

This remains an explicit deployment gate until the stable address and SSH
identity for LXC 102 are configured on the application LXC. Do not weaken a
deployment so that it continues after a failed pre-deployment backup.

## Full disaster recovery

Practice this quarterly from the off-site repository and the password manager,
without relying on files from the Proxmox host:

1. Provision a fresh PostgreSQL 18 cluster.
2. Restore the latest Restic snapshot into an empty staging directory.
3. Run `sha256sum --check --strict SHA256SUMS`.
4. Inspect `postgres/globals.sql`, then restore it only into the new cluster.
   Never apply it blindly to an existing shared cluster.
5. Create each empty database from `template0`.
6. Restore each custom archive with `pg_restore --exit-on-error`.
7. Run `sql/verify-ledger.sql` against TreasuryOps.
8. Restore the app LXC configuration from its Proxmox/PBS backup, clone the
   matching application tag, and start the API without workers.
9. Verify health and balances before enabling workers, scheduled jobs or
   notification delivery.
10. Record the recovery point, duration and any manual corrections.

The logical dumps do not provide point-in-time recovery between six-hour
snapshots. Add pgBackRest and WAL archiving later if the required RPO becomes
shorter than six hours.

## Proxmox jobs

In addition to these logical dumps, configure nightly Proxmox/PBS backups of:

- shared-infrastructure LXC 102, including PostgreSQL and Redis persistence;
- the TreasuryOps application LXC, primarily for its production `.env` and
  host configuration.

Target the separate backup disk or, preferably, a Proxmox Backup Server on
separate hardware. Keep at least seven daily, four weekly and six monthly
container backups. Whole-container backups speed up recovery; they do not
replace the portable, continuously validated PostgreSQL dumps.
