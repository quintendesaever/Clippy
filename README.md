# ClippyV3

Discord bot with Supabase stats tracking and a web settings dashboard.

## Features

- Live message, reaction, voice, and member-count stats to Supabase
- Slash commands: `/ping`, `/stats set-timezone`, `/backfill-stats`, `/f1-reminder`
- Settings dashboard at `https://dashboard.clippybot.be` (calendar management via Discord OAuth)
- Admin dashboard at `/admin` (Discord Manage Server permission; web analytics and activity stats)
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

## Production deploy (home server + Cloudflare Tunnel)

**Server:** SSH to your home host on the LAN (user/host from your own notes — not committed here)  
**Dashboard:** `https://dashboard.clippybot.be`

### Prerequisites

- Docker Engine + Docker Compose plugin on the server
- Cloudflare Tunnel route: `dashboard.clippybot.be` → `http://clippy:3000`
- `CLOUDFLARE_TUNNEL_TOKEN` in `.env`
- Discord OAuth redirect URI: `https://dashboard.clippybot.be/api/auth/callback`

### Deploy

```bash
ssh <user>@<home-server>
cd /opt/ClippyBotV3
cp .env.example .env
# Edit .env with all secrets; set DASHBOARD_URL=https://dashboard.clippybot.be

docker compose -f docker-compose.yml -f docker-compose.home.yml up -d --build
docker compose exec clippy node dist/src/deploy-commands.js
```

### Updates

On the server:

```bash
ssh <user>@<home-server>
/opt/ClippyBotV3/scripts/deploy-home.sh
```

Or manually:

```bash
cd /opt/ClippyBotV3
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.home.yml up -d --build
```

### Legacy VPS deploy (Caddy + Let's Encrypt)

Point DNS for `dashboard.clippybot.be` at your VPS, then:

```bash
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
| `F1_REMINDER_TEST` | optional | `1` for short F1 reminder poll/timing intervals |
| `F1_PREDICTION_URL` | optional | Fallback URL for the F1 **Make predictions** button. Prefer `/f1-reminder set-prediction-url` in Discord. If neither is set, the button is omitted. |

Dashboard analytics stores country/region/city from Cloudflare visitor headers (`CF-IPCountry`, `CF-IPCity`, `CF-Region`) and never keeps raw IPs. Enable **Add visitor location headers** on the `dashboard.clippybot.be` zone for city/region; country works by default. No extra API key is required.

## F1 prediction reminders

`/f1-reminder` sends one active Discord message per Grand Prix:

1. 3 days before the prediction deadline (qualifying start minus 15 minutes)
2. 3 hours before the deadline
3. 1 hour before the race
4. Race results after published classification and championship standings are available

Configure channel, role, and prediction URL with `/f1-reminder set-channel`, `set-role`, and `set-prediction-url`. The guild timezone from `/stats set-timezone` is used for displayed times.

### Testing F1 reminders immediately

Do **not** wait for the next race weekend. Preview each stage in the configured F1 channel:

```
/f1-reminder test-send stage:predictions_open
/f1-reminder test-send stage:final_prediction
/f1-reminder test-send stage:race_soon
/f1-reminder test-send stage:results
```

These use the real delete→send→persist message lifecycle (so you can verify replacement and role mentions) but they **do not** mark the real Grand Prix stage as sent. Results previews use sample data labeled TEST and a preview-only statistics button.

`/f1-reminder status` shows scheduler state (next stage, deadline, results retry). `/f1-reminder test-schedule` explains the same workflow.

`F1_REMINDER_TEST=1` only shortens poll/offset constants. It does not move the real calendar to today, so leave it off in production.

## Project structure

- `src/index.ts` — Discord client and event handlers
- `src/stats/` — Live Supabase writers
- `src/commands/` — Auto-discovered slash commands
- `src/dashboard/server.ts` — Express OAuth + settings API
- `src/dashboard/adminStats.ts` — Admin aggregates (web/user/activity)
- `dashboard/` — React dashboard UI
