#!/usr/bin/env bash
# Simulate GitHub Actions deploy path on ai-server (no Tailscale OAuth needed).
# Usage:
#   ./deploy/simulate-actions-deploy.sh staging <40-hex-sha>
#   ./deploy/simulate-actions-deploy.sh production <40-hex-sha>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NAME="${1:-}"
SHA="${2:-}"
KEY="${CLIPPY_DEPLOY_SSH_KEY:-/data/ai-platform/secrets/clippy-deploy-ssh-key}"
HOST="${DEPLOY_HOST:-ai-server}"
USER_NAME="${DEPLOY_USER:-quinten}"
KH="${ROOT}/deploy/known_hosts"
IMAGE_NAME="ghcr.io/quintendesaever/clippy"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ "$ENV_NAME" == "staging" || "$ENV_NAME" == "production" ]] || die "env must be staging|production"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "sha must be 40 lowercase hex"
[[ -f "$KEY" ]] || die "missing deploy key: $KEY"
[[ -f "$KH" ]] || die "missing known_hosts: $KH"

IMAGE="${IMAGE_NAME}:${SHA}"
tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

tar -C "${ROOT}/deploy" -czf "$tmp" \
  deploy.sh cd-apply.sh ssh-forced-command.sh cutover-production.sh check-host-readiness.sh \
  compose known_hosts

echo "Simulating Actions → ${USER_NAME}@${HOST} cd-apply ${ENV_NAME} ${IMAGE}"
ssh -i "$KEY" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$KH" \
  "${USER_NAME}@${HOST}" \
  "/data/deployments/clippy/bin/cd-apply.sh ${ENV_NAME} ${IMAGE}" \
  < "$tmp"

echo "OK simulate-actions-deploy ${ENV_NAME} ${IMAGE}"
