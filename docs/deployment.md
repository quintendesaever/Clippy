# Clippy Continuous Delivery

**Live inventory:** `/data/CURRENT_STATE.md`  
**Design record:** `/data/docs/history/CLIPPY_CD_IMPLEMENTATION_PLAN_2026-09-12.md`

## Architecture

```text
merge → main
  → CI (validate)
  → CD build → ghcr.io/quintendesaever/clippy:<git-sha>
  → Tailscale (ephemeral tag:ci)
  → SSH deploy-clippy@ai-server
  → /data/deployments/clippy/staging
  → health GET /api/health
  → GitHub Environment production approval
  → /data/deployments/clippy/production
  → health GET /api/health
```

Immutable rule: deploy only `ghcr.io/quintendesaever/clippy:<40-hex-sha>`.

## Workflows

| Workflow | File | Trigger |
| --- | --- | --- |
| CI | `.github/workflows/ci.yml` | PR + push main |
| CD | `.github/workflows/cd.yml` | push main |
| Rollback | `.github/workflows/rollback.yml` | manual |

## Server layout

| Path | Role |
| --- | --- |
| `/data/deployments/clippy/bin/deploy.sh` | Deploy / rollback entrypoint |
| `/data/deployments/clippy/staging/` | Staging compose + `.env` + `state/` |
| `/data/deployments/clippy/production/` | Production CD compose + `.env` + `state/` |
| `/data/apps/clippy` | **Current live production** until CD cutover |

## Deploy identity

Intended user: `deploy-clippy` (docker group only; no sudo).

**Status:** NOT YET CONFIGURED — creating the account requires interactive sudo on ai-server.

Until then, local/operator tests may run deploy.sh as `quinten` (docker group). Actions must use `DEPLOY_SSH_KEY` for `deploy-clippy` once the account exists.

## Secrets

| Class | Location |
| --- | --- |
| Actions | `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `DEPLOY_SSH_KEY` |
| Staging runtime | `/data/deployments/clippy/staging/.env` (0600) — **not** production `.env` |
| Production runtime | `/data/deployments/clippy/production/.env` (0600) after cutover; today `/data/apps/clippy/.env` |
| Tunnel token source | `/data/ai-platform/secrets/clippy-cloudflare-tunnel-token` |

Templates: `deploy/env.staging.example`, `deploy/env.production.example`.

## Manual GitHub setup (required)

1. Repo → Settings → Environments → create `staging` and `production`.
2. On `production`: enable **Required reviewers** (operator account).
3. Repo secrets:
   - `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` — Tailscale OAuth client with `auth_keys` + tag `tag:ci`
   - `DEPLOY_SSH_KEY` — private key for `deploy-clippy`
4. Tailscale ACL: allow `tag:ci` SSH to `ai-server` as `deploy-clippy` only.
5. GHCR: Actions `GITHUB_TOKEN` pushes; server needs `docker login ghcr.io` for `deploy-clippy` (read packages) if image is private. Public repo packages may be public — still avoid secrets in image layers.

## Operator commands

```bash
# Deploy exact SHA (on ai-server)
/data/deployments/clippy/bin/deploy.sh staging ghcr.io/quintendesaever/clippy:<sha>
/data/deployments/clippy/bin/deploy.sh production ghcr.io/quintendesaever/clippy:<sha>

# Rollback to previous recorded image
/data/deployments/clippy/bin/deploy.sh rollback staging
/data/deployments/clippy/bin/deploy.sh rollback production

# Or pin exact known-good SHA
/data/deployments/clippy/bin/deploy.sh rollback production ghcr.io/quintendesaever/clippy:<sha>
```

## Health

Success requires `GET /api/health` body containing `"ok":true` inside the `clippy` container (retries + grace). `docker compose up -d` alone is not success.

## Rollback behavior

Failed health → restore previous known-good SHA image → re-check health → non-zero exit.

## Adding another app later

1. Copy `deploy/` pattern under that repo.
2. Add `/data/deployments/<app>/{staging,production,bin}`.
3. Dedicated `deploy-<app>` user + GH environments + GHCR image name.
4. Keep secrets per-app under `/data/ai-platform/secrets/` and per-env `.env`.

## Cutover note

Do **not** point CD production at `dashboard.clippybot.be` until staging + rollback drills pass and operator approves replacing `/data/apps/clippy` runtime.
