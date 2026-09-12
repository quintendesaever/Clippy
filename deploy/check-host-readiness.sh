#!/usr/bin/env bash
# Host-side readiness for Clippy CD E2E (no secrets printed).
set -euo pipefail

ok=0
bad=0
check() {
  local name="$1" cond="$2"
  if eval "$cond"; then
    echo "OK  $name"
    ok=$((ok + 1))
  else
    echo "FAIL $name"
    bad=$((bad + 1))
  fi
}

echo "=== Clippy CD host readiness ==="
check "deploy root" "[[ -d /data/deployments/clippy ]]"
check "cd-apply.sh" "[[ -x /data/deployments/clippy/bin/cd-apply.sh ]]"
check "deploy.sh" "[[ -x /data/deployments/clippy/bin/deploy.sh ]]"
check "forced-command wrapper" "[[ -x /data/deployments/clippy/bin/ssh-forced-command.sh ]]"
check "staging compose" "[[ -f /data/deployments/clippy/staging/docker-compose.yml ]]"
check "staging overlay" "[[ -f /data/deployments/clippy/staging/docker-compose.staging.yml ]]"
check "production compose" "[[ -f /data/deployments/clippy/production/docker-compose.yml ]]"
check "production overlay" "[[ -f /data/deployments/clippy/production/docker-compose.production.yml ]]"
check "staging .env mode 600" "[[ -f /data/deployments/clippy/staging/.env && $(stat -c %a /data/deployments/clippy/staging/.env) == 600 ]]"
check "CLIPPY_STAGING_BIND in staging .env" "grep -q '^CLIPPY_STAGING_BIND=' /data/deployments/clippy/staging/.env"
check "deploy SSH key" "[[ -f /data/ai-platform/secrets/clippy-deploy-ssh-key ]]"
check "edge network" "docker network inspect edge >/dev/null 2>&1"
check "live prod /data/apps/clippy" "[[ -d /data/apps/clippy ]]"
check "Tailscale up" "tailscale status --self >/dev/null 2>&1"

echo
echo "=== GitHub secrets (names only) ==="
if command -v gh >/dev/null; then
  gh secret list --repo quintendesaever/Clippy || true
else
  echo "gh not available"
fi

echo
echo "=== Remaining operator blockers ==="
echo "1. TS_OAUTH_CLIENT_ID + TS_OAUTH_SECRET (Tailscale admin OAuth tag:ci)"
echo "2. Real staging Discord/Supabase secrets in staging .env (not prod copy)"
echo "3. Optional: sudo deploy/setup-deploy-user.sh --apply → DEPLOY_USER=deploy-clippy"
echo "4. Merge PR #13; after CI on main, CD workflow_run can E2E"
echo "See /data/docs/history/CLIPPY_CD_OPERATOR_UNBLOCK_2026-09-12.md"

echo
echo "Result: ${ok} OK, ${bad} FAIL"
[[ "$bad" -eq 0 ]]
