#!/usr/bin/env bash
# Forced-command wrapper for Clippy CD SSH key.
# Only allows cd-apply.sh (sync-from-tar + deploy) with validated argv.
set -euo pipefail

APPLY_BIN="/data/deployments/clippy/bin/cd-apply.sh"
DEPLOY_BIN="/data/deployments/clippy/bin/deploy.sh"
cmd="${SSH_ORIGINAL_COMMAND:-}"

if [[ -z "$cmd" ]]; then
  echo "ERROR: interactive SSH denied for Clippy CD key" >&2
  exit 1
fi

# Drop optional single/double quotes Actions may wrap around argv.
cmd="${cmd//\'/}"
cmd="${cmd//\"/}"

img_re='ghcr\.io/quintendesaever/clippy:[0-9a-f]{40}'
apply_re='(/data/deployments/clippy/bin/cd-apply\.sh|[[:alnum:]_./-]*cd-apply\.sh)'
deploy_re='(/data/deployments/clippy/bin/deploy\.sh|[[:alnum:]_./-]*deploy\.sh)'

if [[ "$cmd" =~ ^${apply_re}[[:space:]]+(staging|production)[[:space:]]+(${img_re})$ ]]; then
  exec "$APPLY_BIN" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi
if [[ "$cmd" =~ ^${apply_re}[[:space:]]+rollback[[:space:]]+(staging|production)[[:space:]]+(${img_re})$ ]]; then
  exec "$APPLY_BIN" rollback "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi
if [[ "$cmd" =~ ^${apply_re}[[:space:]]+rollback[[:space:]]+(staging|production)$ ]]; then
  exec "$APPLY_BIN" rollback "${BASH_REMATCH[2]}"
fi

# Legacy deploy.sh (bootstrap / local)
if [[ "$cmd" =~ ^${deploy_re}[[:space:]]+(staging|production)[[:space:]]+(${img_re})$ ]]; then
  exec "$DEPLOY_BIN" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi
if [[ "$cmd" =~ ^${deploy_re}[[:space:]]+rollback[[:space:]]+(staging|production)[[:space:]]+(${img_re})$ ]]; then
  exec "$DEPLOY_BIN" rollback "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi
if [[ "$cmd" =~ ^${deploy_re}[[:space:]]+rollback[[:space:]]+(staging|production)$ ]]; then
  exec "$DEPLOY_BIN" rollback "${BASH_REMATCH[2]}"
fi

echo "ERROR: command not allowed: $cmd" >&2
exit 1
