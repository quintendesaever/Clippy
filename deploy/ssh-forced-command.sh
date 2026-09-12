#!/usr/bin/env bash
# Forced-command wrapper for Clippy CD SSH key.
# Only allows: /data/deployments/clippy/bin/deploy.sh …
set -euo pipefail

DEPLOY_BIN="/data/deployments/clippy/bin/deploy.sh"
cmd="${SSH_ORIGINAL_COMMAND:-}"

if [[ -z "$cmd" ]]; then
  echo "ERROR: interactive SSH denied for Clippy CD key" >&2
  exit 1
fi

# Allow only deploy.sh with validated argv (no shell metacharacters).
# Forms:
#   deploy.sh staging|production <image-ref>
#   deploy.sh rollback staging|production [<image-ref>]
img_re='ghcr\.io/quintendesaever/clippy:[0-9a-f]{40}'
if [[ "$cmd" =~ ^(/data/deployments/clippy/bin/deploy\.sh|[[:alnum:]_./-]*deploy\.sh)[[:space:]]+(staging|production)[[:space:]]+(${img_re})$ ]]; then
  exec "$DEPLOY_BIN" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi
if [[ "$cmd" =~ ^(/data/deployments/clippy/bin/deploy\.sh|[[:alnum:]_./-]*deploy\.sh)[[:space:]]+rollback[[:space:]]+(staging|production)[[:space:]]+(${img_re})$ ]]; then
  exec "$DEPLOY_BIN" rollback "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi
if [[ "$cmd" =~ ^(/data/deployments/clippy/bin/deploy\.sh|[[:alnum:]_./-]*deploy\.sh)[[:space:]]+rollback[[:space:]]+(staging|production)$ ]]; then
  exec "$DEPLOY_BIN" rollback "${BASH_REMATCH[2]}"
fi

echo "ERROR: command not allowed: $cmd" >&2
exit 1
