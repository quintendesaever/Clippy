#!/usr/bin/env bash
# Clippy immutable-image deploy with health gate and automatic rollback.
# Usage:
#   deploy.sh <staging|production> <image-ref>
#   deploy.sh rollback <staging|production> [image-ref]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Prefer server deployment root when present; fall back to repo-local deploy/ for dry runs.
DEPLOYMENTS_ROOT="${CLIPPY_DEPLOYMENTS_ROOT:-/data/deployments/clippy}"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage:
  deploy.sh <staging|production> <image-ref>
  deploy.sh rollback <staging|production> [image-ref]

image-ref must be:
  ghcr.io/quintendesaever/clippy:<40-char-lowercase-sha>
EOF
  exit 2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

validate_image_ref() {
  local ref="$1"
  # Exact owner/name + immutable SHA tag only (no :latest, no mutable aliases).
  [[ "$ref" =~ ^ghcr\.io/quintendesaever/clippy:[0-9a-f]{40}$ ]] \
    || die "invalid image ref (need ghcr.io/quintendesaever/clippy:<40-hex-sha>): $ref"
}

env_dir() {
  local environment="$1"
  echo "${DEPLOYMENTS_ROOT}/${environment}"
}

compose_files_for() {
  local environment="$1"
  local dir
  dir="$(env_dir "$environment")"
  echo "-f ${dir}/docker-compose.yml -f ${dir}/docker-compose.${environment}.yml"
}

state_dir() {
  echo "$(env_dir "$1")/state"
}

read_state() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' <"$file"
  else
    echo ""
  fi
}

write_state() {
  local file="$1"
  local value="$2"
  local tmp
  tmp="${file}.tmp.$$"
  printf '%s\n' "$value" >"$tmp"
  mv -f "$tmp" "$file"
}

compose() {
  local environment="$1"
  shift
  local dir
  dir="$(env_dir "$environment")"
  local image_env="${dir}/.image"
  [[ -f "$image_env" ]] || die "missing ${image_env} (CLIPPY_IMAGE)"
  # .image holds CLIPPY_IMAGE=… for compose interpolation (separate from secret .env).
  docker compose --project-directory "$dir" \
    --env-file "$image_env" \
    -f "${dir}/docker-compose.yml" \
    -f "${dir}/docker-compose.${environment}.yml" \
    "$@"
}

wait_healthy() {
  local environment="$1"
  local retries="${HEALTH_RETRIES:-30}"
  local sleep_s="${HEALTH_SLEEP_SECS:-5}"
  local i status body
  local service="clippy"

  echo "Waiting for health (retries=${retries}, sleep=${sleep_s}s)…"
  for ((i = 1; i <= retries; i++)); do
    status="$(compose "$environment" ps --status running --services 2>/dev/null | grep -cx "$service" || true)"
    if [[ "$status" == "1" ]]; then
      if body="$(compose "$environment" exec -T "$service" wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null)"; then
        if [[ "$body" == *'"ok":true'* ]] || [[ "$body" == *'"ok": true'* ]]; then
          echo "Health OK on attempt ${i}: ${body}"
          return 0
        fi
        echo "Attempt ${i}: unexpected health body: ${body}"
      else
        # Fall back to Docker health status when exec is briefly unavailable.
        local cid health
        cid="$(compose "$environment" ps -q "$service" 2>/dev/null || true)"
        if [[ -n "$cid" ]]; then
          health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo unknown)"
          echo "Attempt ${i}: container health=${health}"
          if [[ "$health" == "healthy" ]]; then
            return 0
          fi
        else
          echo "Attempt ${i}: service not running yet"
        fi
      fi
    else
      echo "Attempt ${i}: clippy service not running"
    fi
    sleep "$sleep_s"
  done
  echo "Health check failed after ${retries} attempts" >&2
  compose "$environment" ps >&2 || true
  compose "$environment" logs --tail 80 "$service" >&2 || true
  return 1
}

deploy_image() {
  local environment="$1"
  local image="$2"
  local dir sdir current previous

  validate_image_ref "$image"
  dir="$(env_dir "$environment")"
  sdir="$(state_dir "$environment")"

  [[ -d "$dir" ]] || die "deployment dir missing: $dir"
  [[ -f "${dir}/docker-compose.yml" ]] || die "missing ${dir}/docker-compose.yml"
  [[ -f "${dir}/docker-compose.${environment}.yml" ]] || die "missing ${dir}/docker-compose.${environment}.yml"
  [[ -f "${dir}/.env" ]] || die "missing runtime secrets file: ${dir}/.env (mode 0600 expected)"

  mkdir -p "$sdir"
  current="$(read_state "${sdir}/current")"
  previous="$(read_state "${sdir}/previous")"

  echo "Environment: ${environment}"
  echo "Target image: ${image}"
  echo "Current image: ${current:-<none>}"
  echo "Previous image: ${previous:-<none>}"

  # Idempotent: same image already current and healthy → success.
  if [[ -n "$current" && "$current" == "$image" ]]; then
    if wait_healthy "$environment"; then
      echo "Already deployed and healthy: ${image}"
      return 0
    fi
    echo "Current image unhealthy; redeploying same image"
  fi

  echo "Pulling ${image}"
  if ! docker pull "$image"; then
    if docker image inspect "$image" >/dev/null 2>&1; then
      echo "WARN: registry pull failed; using existing local image ${image}"
    else
      die "docker pull failed and image not present locally: ${image}"
    fi
  fi

  # Persist image ref for compose interpolation (KEY=value).
  write_state "${dir}/.image" "CLIPPY_IMAGE=${image}"

  echo "Starting stack"
  compose "$environment" up -d --pull never --remove-orphans

  if wait_healthy "$environment"; then
    if [[ -n "$current" && "$current" != "$image" ]]; then
      write_state "${sdir}/previous" "$current"
    fi
    write_state "${sdir}/current" "$image"
    echo "Deploy succeeded: ${environment} → ${image}"
    return 0
  fi

  echo "Deploy health failed; attempting rollback" >&2
  local rollback_to=""
  if [[ -n "$current" && "$current" != "$image" ]]; then
    rollback_to="$current"
  elif [[ -n "$previous" ]]; then
    rollback_to="$previous"
  fi

  if [[ -z "$rollback_to" ]]; then
    die "health failed and no previous known-good image to restore"
  fi

  echo "Rolling back to ${rollback_to}" >&2
  validate_image_ref "$rollback_to"
  docker pull "$rollback_to" || docker image inspect "$rollback_to" >/dev/null 2>&1 \
    || die "rollback image unavailable: ${rollback_to}"
  write_state "${dir}/.image" "CLIPPY_IMAGE=${rollback_to}"
  compose "$environment" up -d --pull never --remove-orphans

  if wait_healthy "$environment"; then
    write_state "${sdir}/current" "$rollback_to"
    die "deploy failed; rolled back to ${rollback_to}"
  fi
  die "deploy failed; rollback to ${rollback_to} also failed health check"
}

rollback_cmd() {
  local environment="$1"
  local image="${2:-}"
  local sdir previous

  sdir="$(state_dir "$environment")"
  if [[ -z "$image" ]]; then
    previous="$(read_state "${sdir}/previous")"
    [[ -n "$previous" ]] || die "no previous image recorded for ${environment}"
    image="$previous"
  fi
  deploy_image "$environment" "$image"
}

main() {
  require_cmd docker
  require_cmd grep

  [[ $# -ge 1 ]] || usage
  local action="$1"
  local lock_env=""

  case "$action" in
    staging|production)
      [[ $# -eq 2 ]] || usage
      lock_env="$action"
      ;;
    rollback)
      [[ $# -ge 2 && $# -le 3 ]] || usage
      lock_env="$2"
      [[ "$lock_env" == "staging" || "$lock_env" == "production" ]] \
        || die "environment must be staging|production"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage
      ;;
  esac

  local lock_dir sdir
  sdir="$(state_dir "$lock_env")"
  mkdir -p "$sdir"
  lock_dir="${sdir}/lock"
  exec 9>"${lock_dir}"
  if ! flock -n 9; then
    die "another deploy is in progress for ${lock_env} (lock ${lock_dir})"
  fi

  case "$action" in
    staging|production)
      deploy_image "$action" "$2"
      ;;
    rollback)
      rollback_cmd "$lock_env" "${3:-}"
      ;;
  esac
}

main "$@"
