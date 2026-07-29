#!/usr/bin/env bash

set -euo pipefail

readonly DEFAULT_BACKUP_CONFIG_FILE="/etc/treasury-backup/backup.env"

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

load_backup_config() {
  local config_file="${BACKUP_CONFIG_FILE:-${DEFAULT_BACKUP_CONFIG_FILE}}"
  [[ -r "${config_file}" ]] || die "backup configuration is not readable: ${config_file}"

  set -a
  # shellcheck disable=SC1090
  source "${config_file}"
  set +a

  if [[ -z "${PGPASSFILE:-}" ]]; then
    unset PGPASSFILE
  fi
}

require_command() {
  local command_name="$1"
  command -v "${command_name}" >/dev/null 2>&1 ||
    die "required command is unavailable: ${command_name}"
}

require_variable() {
  local variable_name="$1"
  [[ -n "${!variable_name:-}" ]] || die "required configuration is empty: ${variable_name}"
}

require_positive_integer() {
  local variable_name="$1"
  local value="${!variable_name:-}"
  [[ "${value}" =~ ^[1-9][0-9]*$ ]] ||
    die "${variable_name} must be a positive integer"
}

require_boolean() {
  local variable_name="$1"
  local value="${!variable_name:-}"
  [[ "${value}" == "true" || "${value}" == "false" ]] ||
    die "${variable_name} must be true or false"
}

acquire_backup_lock() {
  local lock_file="${BACKUP_LOCK_FILE:-/run/lock/treasury-backup.lock}"
  install -d -m 0755 "$(dirname "${lock_file}")"
  exec 9>"${lock_file}"
  flock --nonblock 9 || die "another backup, maintenance, or restore job is already running"
}

ping_healthcheck() {
  local url="${1:-}"
  [[ -n "${url}" ]] || return 0
  if ! curl --fail --silent --show-error --max-time 10 --retry 2 "${url}" >/dev/null; then
    log "WARNING: healthcheck ping failed"
  fi
}

restic_run() {
  local repository="$1"
  local password_file="$2"
  shift 2

  [[ -r "${password_file}" ]] ||
    die "restic password file is not readable: ${password_file}"

  restic \
    --repo "${repository}" \
    --password-file "${password_file}" \
    --cache-dir "${RESTIC_CACHE_DIR:-/var/cache/treasury-backup/restic}" \
    "$@"
}

for_each_repository() {
  local callback="$1"

  require_variable RESTIC_LOCAL_REPOSITORY
  require_variable RESTIC_LOCAL_PASSWORD_FILE
  "${callback}" "local" "${RESTIC_LOCAL_REPOSITORY}" "${RESTIC_LOCAL_PASSWORD_FILE}"

  if [[ "${BACKUP_REQUIRE_OFFSITE:-true}" == "true" ]]; then
    require_variable RESTIC_OFFSITE_REPOSITORY
    require_variable RESTIC_OFFSITE_PASSWORD_FILE
  fi

  if [[ -n "${RESTIC_OFFSITE_REPOSITORY:-}" ]]; then
    require_variable RESTIC_OFFSITE_PASSWORD_FILE
    "${callback}" "offsite" "${RESTIC_OFFSITE_REPOSITORY}" "${RESTIC_OFFSITE_PASSWORD_FILE}"
  fi
}
