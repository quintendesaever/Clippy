#!/usr/bin/env bash
# Apply deploy artifacts from a tar stream on stdin, then run deploy.sh.
# Invoked by GitHub Actions over SSH (forced-command). Git remains source of truth.
set -euo pipefail

ROOT="/data/deployments/clippy"
BIN="${ROOT}/bin"
DEPLOY_SH="${BIN}/deploy.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat >&2 <<'EOF'
Usage (stdin = gzipped tar of deploy/ payload):
  cd-apply.sh <staging|production> <image-ref>
  cd-apply.sh rollback <staging|production> [image-ref]
EOF
  exit 2
}

[[ $# -ge 1 ]] || usage
action="$1"

tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

# Require a tar on stdin (Actions always sends the bundle).
if [[ -t 0 ]]; then
  die "stdin must be a gzipped tar of deploy artifacts (not a TTY)"
fi
tar -xzf - -C "$tmp"

[[ -f "${tmp}/deploy.sh" ]] || die "bundle missing deploy.sh"
[[ -f "${tmp}/cd-apply.sh" ]] || die "bundle missing cd-apply.sh"
[[ -f "${tmp}/ssh-forced-command.sh" ]] || die "bundle missing ssh-forced-command.sh"
[[ -f "${tmp}/compose/docker-compose.yml" ]] || die "bundle missing compose/docker-compose.yml"
[[ -f "${tmp}/compose/docker-compose.staging.yml" ]] || die "bundle missing compose/docker-compose.staging.yml"
[[ -f "${tmp}/compose/docker-compose.production.yml" ]] || die "bundle missing compose/docker-compose.production.yml"

mkdir -p "${BIN}" "${ROOT}/staging/state" "${ROOT}/production/state"

install -m 755 "${tmp}/deploy.sh" "${DEPLOY_SH}"
install -m 755 "${tmp}/cd-apply.sh" "${BIN}/cd-apply.sh"
install -m 755 "${tmp}/ssh-forced-command.sh" "${BIN}/ssh-forced-command.sh"
if [[ -f "${tmp}/cutover-production.sh" ]]; then
  install -m 755 "${tmp}/cutover-production.sh" "${BIN}/cutover-production.sh"
fi

install -m 644 "${tmp}/compose/docker-compose.yml" "${ROOT}/staging/docker-compose.yml"
install -m 644 "${tmp}/compose/docker-compose.staging.yml" "${ROOT}/staging/docker-compose.staging.yml"
install -m 644 "${tmp}/compose/docker-compose.yml" "${ROOT}/production/docker-compose.yml"
install -m 644 "${tmp}/compose/docker-compose.production.yml" "${ROOT}/production/docker-compose.production.yml"

echo "Synced deploy artifacts from git bundle → ${ROOT}"

case "$action" in
  staging|production)
    [[ $# -eq 2 ]] || usage
    exec "${DEPLOY_SH}" "$action" "$2"
    ;;
  rollback)
    [[ $# -ge 2 && $# -le 3 ]] || usage
    if [[ $# -eq 3 ]]; then
      exec "${DEPLOY_SH}" rollback "$2" "$3"
    fi
    exec "${DEPLOY_SH}" rollback "$2"
    ;;
  *)
    usage
    ;;
esac
