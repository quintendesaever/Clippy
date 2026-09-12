# Clippy Continuous Delivery

**Live inventory:** `/data/CURRENT_STATE.md`  
**Design record:** `/data/docs/history/CLIPPY_CD_IMPLEMENTATION_PLAN_2026-09-12.md`

## Architecture

```text
merge → main
  → CI (validate) succeeds
  → CD (workflow_run on CI success)
  → build → ghcr.io/quintendesaever/clippy:<git-sha> (+ :main only from CD on main)
  → Tailscale (ephemeral tag:ci)
  → SSH quinten@ai-server (INTERIM forced-command key; prefer deploy-clippy later)
  → cd-apply.sh syncs deploy/* from git tar → /data/deployments/clippy
  → staging health GET /api/health
  → GitHub Environment production approval
  → production health GET /api/health + /api/status?ready=1
```

Immutable rule: deploy only `ghcr.io/quintendesaever/clippy:<40-hex-sha>`.
`:main` is an optional convenience tag published only by CD after CI on `main` — never by feature-branch publish.

## Workflows

| Workflow | File | Trigger |
| --- | --- | --- |
| CI | `.github/workflows/ci.yml` | PR + push main |
| CD | `.github/workflows/cd.yml` | `workflow_run` after CI success on main; manual dispatch |
| Publish image | `.github/workflows/publish-image.yml` | manual; **SHA tags only** |
| Rollback | `.github/workflows/rollback.yml` | manual |

## Server layout

| Path | Role |
| --- | --- |
| `/data/deployments/clippy/bin/cd-apply.sh` | Sync git bundle + invoke deploy (Actions entrypoint) |
| `/data/deployments/clippy/bin/deploy.sh` | Deploy / rollback entrypoint |
| `/data/deployments/clippy/staging/` | Staging compose + `.env` + `state/` |
| `/data/deployments/clippy/production/` | Production CD compose + `.env` + `state/` |
| `/data/apps/clippy` | **Current live production** until CD cutover |

Staging bind address: set `CLIPPY_STAGING_BIND` in host-local staging `.env` (compose substitutes it; not hardcoded in git).

## Deploy identity

Intended user: `deploy-clippy` (docker group only; no sudo).

**Status:** NOT YET CONFIGURED (needs interactive sudo).  

**Interim (CURRENT):** GitHub Actions SSH as `quinten` with forced-command key  
(`/data/deployments/clippy/bin/ssh-forced-command.sh`). Repo secret `DEPLOY_SSH_KEY` set.  
Private key on host: `/data/ai-platform/secrets/clippy-deploy-ssh-key` (0600).

## Operator unblock

Exact remaining steps: `/data/docs/history/CLIPPY_CD_OPERATOR_UNBLOCK_2026-09-12.md`

1. Tailscale OAuth → `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET`
2. Real staging Discord/Supabase `.env` (not production copy)
3. Optional: `sudo … setup-deploy-user.sh --apply`
4. Production cutover via `deploy/cutover-production.sh` after staging E2E

## Secrets

| Class | Location |
| --- | --- |
| Actions | `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` (**missing**), `DEPLOY_SSH_KEY` (**set**) |
| Staging runtime | `/data/deployments/clippy/staging/.env` (0600) — **not** production `.env` |
| Production runtime | `/data/deployments/clippy/production/.env` (0600) after cutover; today `/data/apps/clippy/.env` |
| Tunnel token source | `/data/ai-platform/secrets/clippy-cloudflare-tunnel-token` |

Templates: `deploy/env.staging.example`, `deploy/env.production.example`.

## Manual GitHub setup

| Item | State |
| --- | --- |
| Environments `staging` + `production` | Done |
| Production required reviewer | Done (`quintendesaever`) |
| `DEPLOY_SSH_KEY` | Done |
| `TS_OAUTH_*` | **NOT YET** — Tailscale admin login required |
| Tailscale ACL `tag:ci` | **NOT YET** |

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
