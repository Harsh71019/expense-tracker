#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

HEALTHCHECK_URL=""

on_exit() {
  local status=$?
  if [[ ${status} -eq 0 ]]; then
    ping_healthcheck "${HEALTHCHECK_URL}"
  else
    ping_healthcheck "${HEALTHCHECK_URL:+${HEALTHCHECK_URL}/fail}"
  fi
  exit "${status}"
}

maintain_repository() {
  local repository_name="$1"
  local repository="$2"
  local password_file="$3"

  log "Applying retention policy to ${repository_name} repository"
  restic_run "${repository}" "${password_file}" forget \
    --host "${BACKUP_HOST}" \
    --tag "postgresql-logical" \
    --group-by "host,tags" \
    --keep-last "${RETENTION_KEEP_LAST}" \
    --keep-daily "${RETENTION_KEEP_DAILY}" \
    --keep-weekly "${RETENTION_KEEP_WEEKLY}" \
    --keep-monthly "${RETENTION_KEEP_MONTHLY}" \
    --prune

  local epoch_week
  local subset_index
  epoch_week="$(($(date -u +'%s') / 604800))"
  subset_index="$((epoch_week % CHECK_READ_DATA_PARTS + 1))"

  log "Checking ${repository_name} repository data subset ${subset_index}/${CHECK_READ_DATA_PARTS}"
  restic_run "${repository}" "${password_file}" check \
    "--read-data-subset=${subset_index}/${CHECK_READ_DATA_PARTS}"
}

main() {
  umask 077
  load_backup_config

  HEALTHCHECK_URL="${MAINTENANCE_HEALTHCHECKS_URL:-}"
  trap on_exit EXIT
  ping_healthcheck "${HEALTHCHECK_URL:+${HEALTHCHECK_URL}/start}"

  require_command curl
  require_command flock
  require_command restic
  require_variable BACKUP_HOST
  require_positive_integer CHECK_READ_DATA_PARTS
  require_positive_integer RETENTION_KEEP_DAILY
  require_positive_integer RETENTION_KEEP_LAST
  require_positive_integer RETENTION_KEEP_MONTHLY
  require_positive_integer RETENTION_KEEP_WEEKLY
  require_boolean BACKUP_REQUIRE_OFFSITE

  acquire_backup_lock
  install -d -m 0700 "${RESTIC_CACHE_DIR:-/var/cache/treasury-backup/restic}"
  for_each_repository maintain_repository
  log "Repository maintenance completed successfully"
}

main "$@"
