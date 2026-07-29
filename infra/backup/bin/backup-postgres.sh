#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

WORK_DIR=""
HEALTHCHECK_URL=""
BACKUP_TIMESTAMP=""

cleanup() {
  if [[ -z "${WORK_DIR}" ]]; then
    return
  fi

  local staging_prefix="${STAGING_DIR%/}/run."
  if [[ "${WORK_DIR}" == "${staging_prefix}"* && -d "${WORK_DIR}" ]]; then
    rm -rf -- "${WORK_DIR}"
  else
    log "WARNING: refused to remove unexpected work directory: ${WORK_DIR}"
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

copy_config_paths() {
  [[ -n "${BACKUP_CONFIG_PATHS:-}" ]] || return 0

  local path
  local -a paths=()
  IFS=':' read -r -a paths <<<"${BACKUP_CONFIG_PATHS}"
  install -d -m 0700 "${WORK_DIR}/config"

  for path in "${paths[@]}"; do
    [[ "${path}" == /* ]] || die "BACKUP_CONFIG_PATHS entries must be absolute: ${path}"
    [[ -e "${path}" ]] || die "configured backup path does not exist: ${path}"
    cp --archive --parents -- "${path}" "${WORK_DIR}/config"
  done
}

create_manifest() {
  local server_version="$1"
  local client_version="$2"
  local manifest_file="${WORK_DIR}/manifest.txt"

  {
    printf 'format_version=1\n'
    printf 'created_at_utc=%s\n' "${BACKUP_TIMESTAMP}"
    printf 'backup_host=%s\n' "${BACKUP_HOST}"
    printf 'postgres_server_version=%s\n' "${server_version}"
    printf 'pg_dump_version=%s\n' "${client_version}"
    printf 'databases=%s\n' "${BACKUP_DATABASES}"
  } >"${manifest_file}"
}

create_checksums() {
  (
    cd "${WORK_DIR}"
    while IFS= read -r -d '' file; do
      sha256sum "${file#./}"
    done < <(find . -type f ! -name SHA256SUMS -print0 | sort -z)
  ) >"${WORK_DIR}/SHA256SUMS"

  (cd "${WORK_DIR}" && sha256sum --check --strict SHA256SUMS >/dev/null)
}

backup_repository() {
  local repository_name="$1"
  local repository="$2"
  local password_file="$3"

  log "Writing verified snapshot to ${repository_name} repository"
  restic_run "${repository}" "${password_file}" backup \
    --host "${BACKUP_HOST}" \
    --tag "treasury-backup" \
    --tag "postgresql-logical" \
    "${WORK_DIR}"
}

main() {
  umask 077
  load_backup_config

  HEALTHCHECK_URL="${BACKUP_HEALTHCHECKS_URL:-}"
  trap on_exit EXIT
  ping_healthcheck "${HEALTHCHECK_URL:+${HEALTHCHECK_URL}/start}"

  require_command cp
  require_command curl
  require_command find
  require_command flock
  require_command pg_dump
  require_command pg_dumpall
  require_command pg_restore
  require_command psql
  require_command restic
  require_command sha256sum
  require_command sort

  require_variable BACKUP_DATABASES
  require_variable BACKUP_HOST
  require_variable PGCONTROL_DATABASE
  require_variable PGHOST
  require_variable PGPORT
  require_variable PGUSER
  require_variable STAGING_DIR
  require_boolean BACKUP_REQUIRE_OFFSITE

  acquire_backup_lock
  install -d -m 0700 "${STAGING_DIR}" "${RESTIC_CACHE_DIR:-/var/cache/treasury-backup/restic}"

  BACKUP_TIMESTAMP="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
  readonly BACKUP_TIMESTAMP
  WORK_DIR="$(mktemp -d -- "${STAGING_DIR%/}/run.${BACKUP_TIMESTAMP}.XXXXXX")"
  install -d -m 0700 "${WORK_DIR}/postgres"

  local -a pg_connection=(
    "--host=${PGHOST}"
    "--port=${PGPORT}"
    "--username=${PGUSER}"
  )
  local server_version
  local client_version
  server_version="$(
    psql "${pg_connection[@]}" \
      "--dbname=${PGCONTROL_DATABASE}" \
      --no-psqlrc --tuples-only --no-align \
      --command='show server_version'
  )"
  client_version="$(pg_dump --version)"
  log "Starting PostgreSQL backup with ${client_version}; server ${server_version}"

  local database
  local partial_dump
  local final_dump
  for database in ${BACKUP_DATABASES}; do
    [[ "${database}" =~ ^[A-Za-z0-9_]+$ ]] ||
      die "unsafe database name in BACKUP_DATABASES: ${database}"

    partial_dump="${WORK_DIR}/postgres/${database}.dump.partial"
    final_dump="${WORK_DIR}/postgres/${database}.dump"
    log "Dumping database ${database}"
    pg_dump "${pg_connection[@]}" \
      "--dbname=${database}" \
      --format=custom \
      --file="${partial_dump}"
    [[ -s "${partial_dump}" ]] || die "pg_dump produced an empty archive for ${database}"
    pg_restore --list "${partial_dump}" >/dev/null
    mv -- "${partial_dump}" "${final_dump}"
  done

  log "Dumping cluster-global roles and tablespaces"
  pg_dumpall "${pg_connection[@]}" \
    "--database=${PGCONTROL_DATABASE}" \
    --globals-only \
    --file="${WORK_DIR}/postgres/globals.sql.partial"
  [[ -s "${WORK_DIR}/postgres/globals.sql.partial" ]] ||
    die "pg_dumpall produced an empty globals file"
  mv -- \
    "${WORK_DIR}/postgres/globals.sql.partial" \
    "${WORK_DIR}/postgres/globals.sql"

  copy_config_paths
  create_manifest "${server_version}" "${client_version}"
  create_checksums
  log "Dump archives and checksums verified"

  for_each_repository backup_repository
  log "Backup completed successfully in every configured repository"
}

main "$@"
