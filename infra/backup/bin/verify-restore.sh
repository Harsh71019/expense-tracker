#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

RESTORE_DIR=""
VERIFY_CONTAINER=""
HEALTHCHECK_URL=""

cleanup() {
  if [[ -n "${VERIFY_CONTAINER}" ]]; then
    docker rm --force "${VERIFY_CONTAINER}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${RESTORE_DIR}" ]]; then
    local restore_prefix="${RESTORE_TEST_STAGING_DIR%/}/restore."
    if [[ "${RESTORE_DIR}" == "${restore_prefix}"* && -d "${RESTORE_DIR}" ]]; then
      rm -rf -- "${RESTORE_DIR}"
    else
      log "WARNING: refused to remove unexpected restore directory: ${RESTORE_DIR}"
    fi
  fi
}

on_exit() {
  local status=$?
  cleanup
  if [[ ${status} -eq 0 ]]; then
    ping_healthcheck "${HEALTHCHECK_URL}"
  else
    ping_healthcheck "${HEALTHCHECK_URL:+${HEALTHCHECK_URL}/fail}"
  fi
  exit "${status}"
}

wait_for_postgres() {
  local _attempt
  for _attempt in $(seq 1 30); do
    if docker exec "${VERIFY_CONTAINER}" pg_isready --username=postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "temporary PostgreSQL container did not become ready"
}

main() {
  umask 077
  load_backup_config

  HEALTHCHECK_URL="${RESTORE_TEST_HEALTHCHECKS_URL:-}"
  trap on_exit EXIT
  ping_healthcheck "${HEALTHCHECK_URL:+${HEALTHCHECK_URL}/start}"

  require_command curl
  require_command docker
  require_command find
  require_command flock
  require_command restic
  require_command sha256sum

  require_variable BACKUP_HOST
  require_variable POSTGRES_VERIFY_IMAGE
  require_variable RESTORE_TEST_TMPFS_SIZE
  require_variable RESTORE_TEST_DATABASE
  require_variable RESTORE_TEST_PASSWORD_FILE
  require_variable RESTORE_TEST_REPOSITORY
  require_variable RESTORE_TEST_STAGING_DIR
  require_variable VERIFY_SQL_FILE
  [[ "${RESTORE_TEST_DATABASE}" =~ ^[A-Za-z0-9_]+$ ]] ||
    die "unsafe RESTORE_TEST_DATABASE: ${RESTORE_TEST_DATABASE}"
  [[ -r "${VERIFY_SQL_FILE}" ]] || die "ledger verification SQL is not readable: ${VERIFY_SQL_FILE}"

  acquire_backup_lock
  install -d -m 0700 \
    "${RESTORE_TEST_STAGING_DIR}" \
    "${RESTIC_CACHE_DIR:-/var/cache/treasury-backup/restic}"
  RESTORE_DIR="$(
    mktemp -d -- "${RESTORE_TEST_STAGING_DIR%/}/restore.$(date -u +'%Y-%m-%dT%H-%M-%SZ').XXXXXX"
  )"

  log "Restoring latest off-host snapshot into an isolated staging directory"
  restic_run "${RESTORE_TEST_REPOSITORY}" "${RESTORE_TEST_PASSWORD_FILE}" restore latest \
    --host "${BACKUP_HOST}" \
    --tag "postgresql-logical" \
    --target "${RESTORE_DIR}"

  local checksum_file
  local snapshot_dir
  local database_dump
  checksum_file="$(find "${RESTORE_DIR}" -type f -name SHA256SUMS -print -quit)"
  [[ -n "${checksum_file}" ]] || die "restored snapshot has no SHA256SUMS"
  snapshot_dir="$(dirname "${checksum_file}")"
  (cd "${snapshot_dir}" && sha256sum --check --strict SHA256SUMS >/dev/null)

  database_dump="${snapshot_dir}/postgres/${RESTORE_TEST_DATABASE}.dump"
  [[ -s "${database_dump}" ]] ||
    die "restored snapshot does not contain ${RESTORE_TEST_DATABASE}.dump"
  log "Restored snapshot checksums verified"

  VERIFY_CONTAINER="treasury-backup-verify-$(date -u +'%Y%m%d%H%M%S')-$$"
  log "Starting isolated ${POSTGRES_VERIFY_IMAGE} restore target"
  docker run --detach --rm \
    --name "${VERIFY_CONTAINER}" \
    --network none \
    "--tmpfs=/var/lib/postgresql/data:rw,noexec,nosuid,size=${RESTORE_TEST_TMPFS_SIZE}" \
    --env POSTGRES_HOST_AUTH_METHOD=trust \
    "${POSTGRES_VERIFY_IMAGE}" >/dev/null
  wait_for_postgres

  docker exec "${VERIFY_CONTAINER}" \
    createdb --username=postgres "${RESTORE_TEST_DATABASE}"
  docker exec --interactive "${VERIFY_CONTAINER}" \
    pg_restore \
    --username=postgres \
    "--dbname=${RESTORE_TEST_DATABASE}" \
    --exit-on-error \
    --no-owner \
    --no-privileges <"${database_dump}"

  log "Running read-only TreasuryOps ledger invariants against restored data"
  docker exec --interactive "${VERIFY_CONTAINER}" \
    psql \
    --username=postgres \
    "--dbname=${RESTORE_TEST_DATABASE}" \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 <"${VERIFY_SQL_FILE}"

  log "Latest off-host snapshot restored and verified successfully"
}

main "$@"
