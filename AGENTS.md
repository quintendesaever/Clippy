# AGENTS.md

Agent-oriented operating instructions for ClippyV3. Human-facing setup and ops detail live in `README.md`. Cursor-specific rules live under `.cursor/rules/`.

## Project Overview

ClippyV3 (`clippyv3`) is a **single-guild Discord bot** with:

- live Discord statistics written to **Supabase**
- slash commands
- an **Express + Discord OAuth** dashboard API
- a **React + Vite** dashboard SPA
- shared **calendar / timetable** features (ICS, activities, Discord PNG panels)
- **F1 prediction reminders** (schedule, stages, results)
- **Docker-first** production deployment

Canonical GitHub repository: `quintendesaever/Clippy`.

## Repository Structure

| Path | Role |
|------|------|
| `src/index.ts` | Discord client entry: events, jobs, dashboard server |
| `src/commands/` | Auto-discovered slash commands |
| `src/stats/` | Live message / voice / reaction / member writers to Supabase |
| `src/calendar/` | ICS feeds, activities, timetable panels and Discord jobs |
| `src/f1/` | F1 schedule, reminders, results, prediction URL handling |
| `src/dashboard/` | Express API, OAuth, admin/Discord stats, analytics |
| `shared/` | Shared timetable and member-name helpers (bot + dashboard) |
| `dashboard/` | React + Vite SPA (`@shared` alias to `../shared`) |
| `supabase/migrations/` | SQL migrations |
| `scripts/` | Deploy helpers, F1 smoke, timetable preview tooling |
| `assets/` | Fonts and timetable art used in rendering |
| `Dockerfile`, `docker-compose*.yml`, `Caddyfile` | Container build and deploy overlays |
| `README.md` | Human project / env / ops documentation |
| `.cursor/rules/` | Cursor rules (only intentionally tracked rules belong in git) |

## Development Environment

- **Package manager:** npm (lockfile v3)
- **Runtime:** Node.js 22 (matches production Dockerfile)
- **Language:** TypeScript 5.x, ESM (`"type": "module"`)
- **Module resolution:** `NodeNext` (root `tsconfig.json`)
- **Layout:** root bot/API package + separate `dashboard/` frontend package

Do not prescribe a different Node major than the project already uses.

## Development Commands

Routine development:

```bash
npm run build              # tsc → dist/
npm test                   # tsx --test (explicit file list in package.json)
npm run dev                # tsx watch src/index.ts
npm start                  # node dist/src/index.js
npm run build:dashboard    # dashboard npm ci + Vite build
npm run smoke:f1           # F1 smoke tooling
npm run preview:timetable  # timetable preview tooling
```

Dashboard package (from `dashboard/`):

```bash
npm run dev       # Vite on port 5173 (proxies /api → localhost:3000)
npm run build     # tsc && vite build
npm run preview   # Vite preview
```

Operational / infrastructure (not routine coding defaults):

```bash
npm run deploy-commands   # clears global slash commands; registers guild commands
npm run docker:build
npm run docker:up
npm run docker:prod
```

There is currently **no** lint or format script in `package.json`.

## Testing and Build

- Root build: TypeScript compiler (`tsc`); tests are excluded from compilation
- Tests: Node.js built-in test runner via `tsx --test` (not Jest/Vitest)
- After relevant code changes, prefer `npm run build` and `npm test`
- Report failures explicitly; do not hide them

### Known F1 timezone test issue

`src/f1/embeds.test.ts` has a known **environment-dependent** failure around timezone abbreviation formatting (`formatF1DateTime` / `zzz`). Wall-clock conversion can succeed while the abbreviation reflects the process host timezone.

- Do **not** silently change production formatting, host timezone, or test expectations merely to make the suite green
- Address it only as an intentional investigation or fix

## Architecture

```text
Discord gateway
    ↓
src/index.ts
    ├── slash commands (filesystem discovery)
    ├── statistics → Supabase
    ├── calendar / timetable jobs & interactions
    ├── F1 reminder jobs & interactions
    └── dashboard server (Express :DASHBOARD_PORT, default 3000)
            ├── Discord OAuth + cookie-session
            ├── timetable / settings APIs
            ├── admin statistics (ManageGuild)
            └── serves dashboard/dist
```

Background jobs include F1 reminders and Discord timetable panel maintenance. Prefer reading the relevant module over duplicating logic here.

## Discord Bot

- Single-server: `GUILD_ID` is required
- Slash commands are auto-discovered under `src/commands/`
- Command registration (`npm run deploy-commands` / production equivalent) is **operational**
- `deploy-commands` clears **global** application commands, then registers guild commands for `GUILD_ID`
- Never register, clear, or redeploy slash commands unless the user explicitly requests it

## Dashboard

- Express backend in `src/dashboard/`
- Discord OAuth login and cookie-session auth
- React + Vite frontend in `dashboard/`
- Admin APIs gated by Discord **ManageGuild**
- Production exposes the dashboard publicly; treat auth, sessions, and admin checks as security-sensitive

Do not embed machine-specific hostnames or LAN details in agent instructions. See `README.md` for human ops naming.

## Calendar and Timetable

- ICS calendar feeds, shared activities, timetable APIs, Discord PNG panels and jobs
- Data is Supabase-backed
- ICS fetching uses SSRF-oriented URL safety (`assertIcsUrlSafe`)
- **Do not weaken** ICS URL / SSRF validation

## F1

- Reminder stages, schedule, results, Discord embeds/interactions
- External data: **OpenF1**, **Jolpica/Ergast**
- Prediction link button uses configured prediction URLs with hardened host validation (`predictionUrl`)
- **Preserve** prediction-URL hardening; do not loosen private-host / credential / bypass protections

## Database — Supabase

- Primary application data store
- Migrations: `supabase/migrations/`
- Client: `@supabase/supabase-js` (`src/supabase.ts`)
- Supports service-role key (preferred for backend) or anon key fallback as coded

Rules:

- Never print or commit secret keys
- Do not apply migrations blindly
- Treat schema and destructive data changes as deliberate, reviewable operations
- Do not invent undocumented migration/run procedures

## External Services

Only these integrations are in scope:

- Discord / discord.js
- Supabase
- OpenF1
- Jolpica/Ergast
- Cloudflare Tunnel (production overlay; token via env)
- ICS HTTP feeds

Do not assume OpenAI, Ollama, Redis, MongoDB, MySQL, or other services exist here.

## Environment Variables

Configure locally via `.env` (gitignored). Safe documentation of names: `.env.example`.

Common variables (names only — never values):

```text
DISCORD_TOKEN
CLIENT_ID
GUILD_ID
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
CLIENT_SECRET
SESSION_SECRET
DASHBOARD_URL
DASHBOARD_PORT
PUBLIC_DASHBOARD_URL
F1_REMINDER_TEST
F1_PREDICTION_URL
F1_REMINDER_IMAGE_URL
CLOUDFLARE_TUNNEL_TOKEN
NODE_ENV
```

Rules:

- Never commit `.env` or `.env.local`
- Never print secret values in logs, commits, PRs, issues, or agent output
- Prefer `.env.example` when documenting required configuration names

## Git Workflow

Intended flow:

```text
Issue / specification
    → feature / fix / WIP branch
    → implementation
    → build / tests
    → pull request
    → review
    → merge to main
```

Rules:

- Do not work directly on `main` by default
- Use feature, fix, or WIP branches
- Prefer pull requests for integration into `main`
- Do not force-push
- Do not rewrite shared history unless the user explicitly authorizes it
- Keep commits focused; explain the change
- Production deployment tracks **`main`**

Commit message style in this repo is mixed (imperative sentences and conventional prefixes such as `fix:` / `chore:`). Prefer clear, focused subjects; do not invent a rigid format beyond that.

## Deployment

Deployment is **operational**, not a default coding step.

Conceptual workflow (details in `README.md`):

- Production tracks `main`
- Deploy scripts rebuild/restart the Docker Compose setup and may re-register slash commands
- Deploy only when the user explicitly requests it

**Do not deploy, SSH to production, restart production services, or run deployment scripts unless the user explicitly requests that operation.**

Do not embed LAN IPs, usernames, absolute server paths, credential-copy instructions, or machine-specific SSH commands in tracked agent documentation.

## Agent Safety Rules

### Secrets

- Never print `.env`
- Never commit `.env`
- Never expose secret values
- Never copy credentials between projects automatically

### Production

- Never deploy unless explicitly requested
- Never SSH to production unless explicitly requested
- Never restart production services unless explicitly requested
- Treat Docker production / home-compose deploy commands as operational actions

### Git

- Never force-push
- Never rewrite shared history without explicit authorization
- Never push `main` by default
- Prefer feature / fix / WIP branches
- Never use destructive Git commands (`reset --hard`, `clean -fd`, etc.) without explicit authorization

### Discord commands

- Do not run `deploy-commands` unless explicitly requested
- It clears global commands before registering guild commands

### Database

- Treat Supabase migrations as deliberate operations
- Do not apply migrations blindly
- Never perform destructive schema/data operations without an explicit request

### Security

- Preserve SSRF / ICS URL validation (`assertIcsUrlSafe`)
- Preserve F1 `predictionUrl` hardening
- Do not weaken OAuth or `ManageGuild` admin authorization

### Worker isolation

- Worker checkouts are separate from Active development
- Do not modify the Active checkout from Worker tasks
- Do not assume unfinished Cursor sessions automatically transfer between machines

### Known test issue

- Do not silently “fix” the known F1 timezone failure merely to make tests green
- Investigate intentionally; distinguish environment behavior from application regressions

### Deployment Cursor rules

- Do not commit unsanitized local deployment rules
- Never embed machine-specific credentials or paths in tracked agent instructions

## Definition of Done

- Change is limited to the requested scope
- No secrets were exposed
- No production operation was performed unless explicitly requested
- Build passes where applicable (`npm run build`)
- Tests pass where applicable (`npm test`), with known failures explicitly reported
- Git diff was reviewed
- No unrelated files were modified
- Commit is focused if a commit was requested
- No force-push or history rewrite occurred

## Documentation Hierarchy

```text
AGENTS.md      → how an agent should work safely in this repository
README.md      → human-facing project, development, and operations docs
.cursor/rules/ → Cursor-specific rules (tracked rules must stay sanitized)
```

Prefer linking to `README.md` over copying large operational sections here.
