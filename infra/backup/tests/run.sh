#!/usr/bin/env bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TEST_DIR
BACKUP_DIR="$(cd "${TEST_DIR}/.." && pwd)"
readonly BACKUP_DIR

for script in \
  "${BACKUP_DIR}"/bin/*.sh \
  "${BACKUP_DIR}"/lib/*.sh \
  "${BACKUP_DIR}"/install.sh \
  "${BACKUP_DIR}"/tests/*.sh; do
  bash -n "${script}"
done

test_root="$(mktemp -d)"
cleanup() {
  rm -rf -- "${test_root}"
}
trap cleanup EXIT

mock_bin="${test_root}/bin"
mock_log="${test_root}/restic.log"
mkdir -p "${mock_bin}" "${test_root}/staging" "${test_root}/cache"

make_mock() {
  local name="$1"
  local body="$2"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\n'
    printf '%s\n' "${body}"
  } >"${mock_bin}/${name}"
  chmod 0755 "${mock_bin}/${name}"
}

make_mock psql 'printf "18.4\\n"'
# The single-quoted bodies are written into separate executable mock scripts.
# shellcheck disable=SC2016
make_mock pg_dump '
if [[ "${1:-}" == "--version" ]]; then
  printf "pg_dump (PostgreSQL) 18.4\\n"
  exit 0
fi
for argument in "$@"; do
  case "${argument}" in
    --file=*) printf "mock database archive\\n" >"${argument#--file=}" ;;
  esac
done
'
# shellcheck disable=SC2016
make_mock pg_dumpall '
for argument in "$@"; do
  case "${argument}" in
    --file=*) printf "create role mock;\\n" >"${argument#--file=}" ;;
  esac
done
'
make_mock pg_restore 'exit 0'
# shellcheck disable=SC2016
make_mock restic 'printf "%s\\n" "$*" >>"${MOCK_RESTIC_LOG}"'
make_mock curl 'exit 0'
make_mock flock 'exit 0'
# shellcheck disable=SC2016
make_mock sha256sum '
if [[ "${1:-}" == "--check" ]]; then
  exit 0
fi
printf "mock-sha256  %s\\n" "${1}"
'
make_mock sort 'cat'

printf 'local-password\n' >"${test_root}/local-password"
printf 'offsite-password\n' >"${test_root}/offsite-password"

config_file="${test_root}/backup.env"
{
  printf 'PGHOST=localhost\n'
  printf 'PGPORT=5432\n'
  printf 'PGUSER=postgres\n'
  printf 'PGCONTROL_DATABASE=postgres\n'
  printf 'PGPASSFILE=\n'
  printf 'BACKUP_DATABASES="treasury_ops second_app"\n'
  printf 'BACKUP_HOST=test-host\n'
  printf 'STAGING_DIR=%q\n' "${test_root}/staging"
  printf 'RESTIC_CACHE_DIR=%q\n' "${test_root}/cache"
  printf 'BACKUP_LOCK_FILE=%q\n' "${test_root}/backup.lock"
  printf 'BACKUP_CONFIG_PATHS=\n'
  printf 'RESTIC_LOCAL_REPOSITORY=local:test\n'
  printf 'RESTIC_LOCAL_PASSWORD_FILE=%q\n' "${test_root}/local-password"
  printf 'BACKUP_REQUIRE_OFFSITE=true\n'
  printf 'RESTIC_OFFSITE_REPOSITORY=offsite:test\n'
  printf 'RESTIC_OFFSITE_PASSWORD_FILE=%q\n' "${test_root}/offsite-password"
  printf 'RETENTION_KEEP_LAST=28\n'
  printf 'RETENTION_KEEP_DAILY=30\n'
  printf 'RETENTION_KEEP_WEEKLY=12\n'
  printf 'RETENTION_KEEP_MONTHLY=12\n'
  printf 'CHECK_READ_DATA_PARTS=4\n'
  printf 'BACKUP_HEALTHCHECKS_URL=\n'
  printf 'MAINTENANCE_HEALTHCHECKS_URL=\n'
} >"${config_file}"

PATH="${mock_bin}:/usr/bin:/bin" \
  MOCK_RESTIC_LOG="${mock_log}" \
  BACKUP_CONFIG_FILE="${config_file}" \
  "${BACKUP_DIR}/bin/backup-postgres.sh"

grep --quiet -- '--repo local:test' "${mock_log}"
grep --quiet -- '--repo offsite:test' "${mock_log}"
grep --quiet -- 'postgresql-logical' "${mock_log}"

PATH="${mock_bin}:/usr/bin:/bin" \
  MOCK_RESTIC_LOG="${mock_log}" \
  BACKUP_CONFIG_FILE="${config_file}" \
  "${BACKUP_DIR}/bin/maintain-repositories.sh"

grep --quiet -- '--group-by host,tags' "${mock_log}"
grep --quiet -- '--read-data-subset=' "${mock_log}"

if find "${test_root}/staging" -mindepth 1 -print -quit | grep --quiet .; then
  printf 'backup test left plaintext staging data behind\n' >&2
  exit 1
fi

printf 'backup infrastructure tests passed\n'
