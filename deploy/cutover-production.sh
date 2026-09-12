#!/usr/bin/env bash
# Attended Clippy production cutover: /data/apps/clippy → CD production stack.
# Default: dry-run. With --apply: stop live, deploy GHCR SHA, verify public health;
# on failure, bring live stack back.
set -euo pipefail

APPS="/data/apps/clippy"
PROD="/data/deployments/clippy/production"
BIN="/data/deployments/clippy/bin/deploy.sh"
PUBLIC_HEALTH="${CLIPPY_PUBLIC_HEALTH_URL:-https://dashboard.clippybot.be/api/health}"
PUBLIC_READY="${CLIPPY_PUBLIC_READY_URL:-https://dashboard.clippybot.be/api/status?ready=1}"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[cutover] $*"; }

IMAGE="${1:-}"
[[ -n "$IMAGE" ]] || die "usage: $0 ghcr.io/quintendesaever/clippy:<40-hex-sha> [--apply]"
APPLY=0
[[ "${2:-}" == "--apply" ]] && APPLY=1

[[ -d "$APPS" ]] || die "missing $APPS"
[[ -d "$PROD" ]] || die "missing $PROD"
[[ -x "$BIN" ]] || die "missing $BIN"
[[ -f "$PROD/.env" ]] || die "missing $PROD/.env — run seed-production-env.sh --apply first"
docker network inspect edge >/dev/null 2>&1 || die "docker network edge missing"

live_up() {
  docker compose --project-directory "$APPS" \
    -f "$APPS/docker-compose.yml" \
    -f "$APPS/docker-compose.home.yml" \
    up -d --remove-orphans
}

live_down() {
  docker compose --project-directory "$APPS" \
    -f "$APPS/docker-compose.yml" \
    -f "$APPS/docker-compose.home.yml" \
    stop
}

prod_down() {
  docker compose --project-directory "$PROD" \
    --env-file "$PROD/.env" \
    --env-file "$PROD/.image" \
    -f "$PROD/docker-compose.yml" \
    -f "$PROD/docker-compose.production.yml" \
    down --remove-orphans || true
}

verify_public() {
  local i body
  for i in $(seq 1 30); do
    if body="$(curl -fsS -m 5 "$PUBLIC_HEALTH" 2>/dev/null)"; then
      if [[ "$body" == *'"ok":true'* || "$body" == *'"ok": true'* ]]; then
        if curl -fsS -m 5 "$PUBLIC_READY" >/dev/null 2>&1; then
          log "public health+ready OK: $body"
          return 0
        fi
        log "attempt $i: health OK, ready not yet"
      fi
    else
      log "attempt $i: public health unreachable"
    fi
    sleep 5
  done
  return 1
}

echo "=== Clippy production CD cutover ==="
echo "Live:   $APPS (compose home + tunnel)"
echo "CD:     $PROD"
echo "Image:  $IMAGE"
echo "Check:  $PUBLIC_HEALTH / ready"
echo

if [[ "$APPLY" -ne 1 ]]; then
  echo "Dry-run only. Re-run with --apply to cut over (brief public downtime)."
  exit 0
fi

log "pre-pull $IMAGE"
docker pull "$IMAGE"

log "stopping live stack (tunnel will drop until CD production is up)"
live_down

revert_live() {
  log "REVERT: stopping CD production and restoring live apps stack"
  prod_down
  live_up
  sleep 5
  curl -fsS -m 10 "$PUBLIC_HEALTH" || log "WARN: public health still down after revert"
}

if ! "$BIN" production "$IMAGE"; then
  revert_live
  die "CD production deploy failed; live stack restore attempted"
fi

if ! verify_public; then
  revert_live
  die "public health/ready failed after cutover; live stack restore attempted"
fi

log "cutover OK — live apps stack left stopped; CD production serving $PUBLIC_HEALTH"
log "Keep /data/apps/clippy tree as rollback source; do not docker compose down -v"
