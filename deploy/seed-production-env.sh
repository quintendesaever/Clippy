#!/usr/bin/env bash
# Attended seed of production CD .env from the live apps checkout.
# Never prints secret values. Default is dry-run.
set -euo pipefail

SRC="${CLIPPY_PROD_ENV_SRC:-/data/apps/clippy/.env}"
DST="${CLIPPY_PROD_ENV_DST:-/data/deployments/clippy/production/.env}"
TOKEN_FILE="${CLIPPY_TUNNEL_TOKEN_FILE:-/data/ai-platform/secrets/clippy-cloudflare-tunnel-token}"

die() { echo "ERROR: $*" >&2; exit 1; }

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

[[ -f "$SRC" ]] || die "missing source env: $SRC"
[[ -f "$TOKEN_FILE" ]] || die "missing tunnel token file: $TOKEN_FILE"
mkdir -p "$(dirname "$DST")"

echo "=== seed production CD env ==="
echo "source: $SRC (mode $(stat -c %a "$SRC"))"
echo "dest:   $DST"
echo "tunnel: $TOKEN_FILE (will set CLOUDFLARE_TUNNEL_TOKEN if missing in dest)"
echo
echo "This copies production runtime secrets onto the CD production path."
echo "Do not run until staging E2E with real secrets has passed."

if [[ "$APPLY" -ne 1 ]]; then
  echo
  echo "Dry-run only. Re-run with --apply to write $DST"
  exit 0
fi

if [[ -f "$DST" ]]; then
  bak="${DST}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$DST" "$bak"
  echo "Existing dest backed up to $bak"
fi

umask 077
cp -a "$SRC" "$DST"
# Ensure tunnel token present for production compose interpolation
if ! grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' "$DST"; then
  # Append without echoing value
  printf 'CLOUDFLARE_TUNNEL_TOKEN=' >> "$DST"
  cat "$TOKEN_FILE" >> "$DST"
  printf '\n' >> "$DST"
  echo "Appended CLOUDFLARE_TUNNEL_TOKEN from secrets file"
else
  echo "CLOUDFLARE_TUNNEL_TOKEN already present in dest"
fi
chmod 600 "$DST"
# Ownership: keep current user until deploy-clippy exists
echo "Wrote $DST mode $(stat -c %a "$DST")"
echo "Next: /data/deployments/clippy/bin/cutover-production.sh <image> --apply"
