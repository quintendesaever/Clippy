#!/usr/bin/env bash
# Unit tests for ssh-forced-command allowlist (no SSH, no Docker).
set -euo pipefail

WRAP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ssh-forced-command.sh"
APPLY="/data/deployments/clippy/bin/cd-apply.sh"
fail=0

# Stub binaries on PATH via temp dir so exec is observable without deploying.
tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

mkdir -p "${tmp}/bin"
cat > "${tmp}/bin/cd-apply.sh" <<'EOF'
#!/usr/bin/env bash
printf 'APPLY:%s\n' "$*" > /tmp/clippy-cd-forced-command-test.out
EOF
chmod +x "${tmp}/bin/cd-apply.sh"
cat > "${tmp}/bin/deploy.sh" <<'EOF'
#!/usr/bin/env bash
printf 'DEPLOY:%s\n' "$*" > /tmp/clippy-cd-forced-command-test.out
EOF
chmod +x "${tmp}/bin/deploy.sh"

# Patch wrapper paths by running a copy with sed
wrap="${tmp}/wrap.sh"
sed \
  -e "s|/data/deployments/clippy/bin/cd-apply.sh|${tmp}/bin/cd-apply.sh|g" \
  -e "s|/data/deployments/clippy/bin/deploy.sh|${tmp}/bin/deploy.sh|g" \
  "$WRAP" > "$wrap"
chmod +x "$wrap"

run_case() {
  local name="$1" cmd="$2" expect_rc="$3" expect_out="${4:-}"
  rm -f /tmp/clippy-cd-forced-command-test.out
  set +e
  SSH_ORIGINAL_COMMAND="$cmd" "$wrap"
  rc=$?
  set -e
  if [[ "$rc" -ne "$expect_rc" ]]; then
    echo "FAIL $name (rc=$rc want $expect_rc)"
    fail=$((fail + 1))
    return
  fi
  if [[ -n "$expect_out" ]]; then
    got="$(cat /tmp/clippy-cd-forced-command-test.out 2>/dev/null || true)"
    if [[ "$got" != "$expect_out" ]]; then
      echo "FAIL $name (out='$got' want='$expect_out')"
      fail=$((fail + 1))
      return
    fi
  fi
  echo "OK   $name"
}

IMG='ghcr.io/quintendesaever/clippy:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
run_case allow-apply "${tmp}/bin/cd-apply.sh staging ${IMG}" 0 "APPLY:staging ${IMG}"
run_case allow-quoted "${tmp}/bin/cd-apply.sh staging '${IMG}'" 0 "APPLY:staging ${IMG}"
run_case deny-rm "rm -rf /" 1
run_case deny-empty "" 1
run_case deny-bad-tag "${tmp}/bin/cd-apply.sh staging ghcr.io/quintendesaever/clippy:latest" 1
run_case allow-rollback "${tmp}/bin/cd-apply.sh rollback staging ${IMG}" 0 "APPLY:rollback staging ${IMG}"

echo "forced-command tests complete (failures=${fail})"
[[ "$fail" -eq 0 ]]
