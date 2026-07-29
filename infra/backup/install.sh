#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SOURCE_DIR
readonly INSTALL_DIR="/opt/treasury-backup"
readonly CONFIG_DIR="/etc/treasury-backup"
readonly SYSTEMD_DIR="/etc/systemd/system"

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this installer as root on shared-infrastructure LXC 102.\n' >&2
  exit 1
fi

install -d -m 0755 \
  "${INSTALL_DIR}/bin" \
  "${INSTALL_DIR}/lib" \
  "${INSTALL_DIR}/sql" \
  "${CONFIG_DIR}"
install -m 0755 "${SOURCE_DIR}"/bin/*.sh "${INSTALL_DIR}/bin/"
install -m 0644 "${SOURCE_DIR}"/lib/*.sh "${INSTALL_DIR}/lib/"
install -m 0644 "${SOURCE_DIR}"/sql/*.sql "${INSTALL_DIR}/sql/"
install -m 0644 "${SOURCE_DIR}/README.md" "${INSTALL_DIR}/README.md"
install -m 0644 "${SOURCE_DIR}"/systemd/*.service "${SYSTEMD_DIR}/"
install -m 0644 "${SOURCE_DIR}"/systemd/*.timer "${SYSTEMD_DIR}/"

if [[ ! -e "${CONFIG_DIR}/backup.env" ]]; then
  install -m 0600 "${SOURCE_DIR}/backup.env.example" "${CONFIG_DIR}/backup.env"
  printf 'Created %s/backup.env; configure it before starting a job.\n' "${CONFIG_DIR}"
else
  printf 'Preserved existing %s/backup.env.\n' "${CONFIG_DIR}"
fi

systemctl daemon-reload

printf '%s\n' \
  "Installed backup tooling without enabling timers." \
  "Next: configure ${CONFIG_DIR}/backup.env, initialize both Restic repositories," \
  "run a manual backup and restore test, then enable the timers documented in README.md."
