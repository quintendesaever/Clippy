#!/usr/bin/env bash
# Dry-run / attended production CD cutover helper.
# Default: print plan only. Never deletes volumes or runs docker prune.
set -euo pipefail

APPS="/data/apps/clippy"
PROD="/data/deployments/clippy/production"
BIN="/data/deployments/clippy/bin/deploy.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -d "$APPS" ]] || die "missing $APPS"
[[ -d "$PROD" ]] || die "missing $PROD"
[[ -x "$BIN" ]] || die "missing $BIN"

IMAGE="${1:-}"
[[ -n "$IMAGE" ]] || die "usage: $0 ghcr.io/quintendesaever/clippy:<40-hex-sha> [--apply]"

APPLY=0
[[ "${2:-}" == "--apply" ]] && APPLY=1

echo "=== Clippy production CD cutover plan ==="
echo "Current live stack: $APPS (compose home + tunnel)"
echo "CD production dir:  $PROD"
echo "Target image:       $IMAGE"
echo
echo "Prechecks:"
echo "  - staging healthy on real secrets"
echo "  - Actions Tailscale deploy proven"
echo "  - $PROD/.env mode 0600 present (NOT inventable here)"
echo "  - docker network edge exists"
echo
if [[ ! -f "$PROD/.env" ]]; then
  echo "MISSING: $PROD/.env"
  echo "Operator must create it (copy keys from $APPS/.env + CLOUDFLARE_TUNNEL_TOKEN)."
  echo "Do not commit. Do not reuse staging Discord token."
fi

if [[ "$APPLY" -ne 1 ]]; then
  echo
  echo "Dry-run only. Re-run with --apply after .env exists to deploy image via $BIN"
  exit 0
fi

[[ -f "$PROD/.env" ]] || die "$PROD/.env required for --apply"
chmod 600 "$PROD/.env"
"$BIN" production "$IMAGE"
echo "Cutover deploy invoked. Verify https://dashboard.clippybot.be/api/health"
echo "Only then stop $APPS stack (manual)."
