# ClippyV3

Discord bot with Supabase stats tracking and a web settings dashboard.

## Features

- Live message, reaction, voice, and member-count stats to Supabase
- Slash commands: `/ping`, `/stats set-timezone`, `/backfill-stats`, `/f1-reminder`
- Settings dashboard at `https://dashboard.clippybot.be` (calendar management via Discord OAuth)
- Single-server deployment (`GUILD_ID` required)
- Docker-first: no Node.js install needed on the server

## Local development

1. Copy `.env.example` to `.env` and fill in values (copy from ClippyV2 if migrating).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Register slash commands:

   ```bash
   npm run deploy-commands
   ```

4. Run the bot:

   ```bash
   npm run dev
   ```

5. Build the dashboard (optional for dev — use Vite dev server on port 5173 with API proxy):

   ```bash
   cd dashboard && npm install && npm run dev
   ```

   Or build into `dashboard/dist` for the bot to serve:

   ```bash
   npm run build:dashboard
   ```

## Production deploy (Ubuntu server)

**Server:** `ssh root@91.99.237.148`  
**Dashboard:** `https://dashboard.clippybot.be`

### Prerequisites

- Docker Engine + Docker Compose plugin on the server
- DNS A record: `dashboard.clippybot.be` → `91.99.237.148`
- Discord OAuth redirect URI: `https://dashboard.clippybot.be/api/auth/callback`

### Deploy

```bash
ssh root@91.99.237.148
git clone git@github.com:RageMonke/ClippyBotV3.git /opt/ClippyBotV3
cd /opt/ClippyBotV3
cp .env.example .env
# Edit .env with all secrets; set DASHBOARD_URL=https://dashboard.clippybot.be

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec clippy node dist/deploy-commands.js
```

### Updates

On the server (after deploy key is configured):

```bash
ssh root@91.99.237.148
/opt/ClippyBotV3/scripts/deploy.sh
```

Or manually:

```bash
cd /opt/ClippyBotV3
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | yes | Bot token |
| `CLIENT_ID` | yes | Application ID |
| `GUILD_ID` | yes | Your Discord server ID |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key (backend writes) |
| `CLIENT_SECRET` | dashboard | OAuth client secret |
| `SESSION_SECRET` | dashboard | Random string for session cookies |
| `DASHBOARD_URL` | dashboard | `https://dashboard.clippybot.be` in prod |
| `DASHBOARD_PORT` | optional | Default `3000` |
| `F1_REMINDER_TEST` | optional | `1` for short test intervals |

## Project structure

- `src/index.ts` — Discord client and event handlers
- `src/stats/` — Live Supabase writers
- `src/commands/` — Auto-discovered slash commands
- `src/dashboard/server.ts` — Express OAuth + settings API
- `dashboard/` — React settings UI
