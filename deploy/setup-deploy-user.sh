#!/usr/bin/env bash
# Operator-run host bootstrap for Clippy CD (requires interactive sudo).
# Does NOT print or read application secrets.
set -euo pipefail

echo "This script prints the exact commands to create deploy-clippy."
echo "Review, then run with: sudo bash deploy/setup-deploy-user.sh --apply"
echo

if [[ "${1:-}" != "--apply" ]]; then
  cat <<'EOF'
# Planned actions (--apply):
# 1. useradd --system --create-home --shell /bin/bash deploy-clippy
# 2. usermod -aG docker deploy-clippy
# 3. install SSH authorized_keys (operator pastes public key)
# 4. chown -R deploy-clippy:deploy-clippy /data/deployments/clippy
# 5. chmod 750 /data/deployments/clippy
# 6. ensure staging/production .env remain mode 0600 owned by deploy-clippy
# 7. docker login ghcr.io as deploy-clippy (read packages) — operator supplies token
#
# Security note: docker group is root-equivalent on the host.
# Dedicated user still limits SSH blast radius vs personal account.
EOF
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: --apply requires root (sudo)" >&2
  exit 1
fi

id deploy-clippy >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash deploy-clippy
usermod -aG docker deploy-clippy
mkdir -p /home/deploy-clippy/.ssh
chmod 700 /home/deploy-clippy/.ssh
touch /home/deploy-clippy/.ssh/authorized_keys
chmod 600 /home/deploy-clippy/.ssh/authorized_keys
chown -R deploy-clippy:deploy-clippy /home/deploy-clippy/.ssh

mkdir -p /data/deployments/clippy/{bin,staging/state,production/state}
chown -R deploy-clippy:deploy-clippy /data/deployments/clippy
chmod 750 /data/deployments/clippy
chmod 750 /data/deployments/clippy/staging /data/deployments/clippy/production
chmod 755 /data/deployments/clippy/bin
[[ -f /data/deployments/clippy/staging/.env ]] && chmod 600 /data/deployments/clippy/staging/.env
[[ -f /data/deployments/clippy/production/.env ]] && chmod 600 /data/deployments/clippy/production/.env

echo "deploy-clippy ready. Append the CD public key to /home/deploy-clippy/.ssh/authorized_keys"
echo "Then: sudo -u deploy-clippy docker login ghcr.io"
