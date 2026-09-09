# Full Project Audit

Read-only production-readiness review of ClippyV3 (Discord bot + dashboard + Supabase) for a small friend group. Working tree and live database inspected on 19 Aug 2026. No code was changed as part of this audit.

Specialists reviewed Discord, frontend, UI/UX, backend/data, QA, security, and product consistency in parallel. Findings below are the de-duplicated synthesis.

A navigable summary also exists as a Cursor canvas beside chat.

---

## Executive Summary

Clippy is a **working friend-group coordination tool**, not a broken prototype. The real product is the shared timetable: Discord OAuth, ICS calendars, group activities, a Discord PNG day view, and a dashboard week view. Those pieces are wired through one Node process and one Supabase project, and the security baseline (guild-gated OAuth, service-role-only DB, ICS SSRF checks, location redaction) is better than most hobby bots.

What is actually problematic is a small set of **correctness mismatches**, not missing features. The dashboard buckets events by UTC date while Discord uses `Europe/Brussels`. Sunday exists in Discord’s data range but not in the web week. All-day ICS events are dropped from the group timeline and the Discord image. F1 tells people the weekend starts “tomorrow” while firing three days early. Session expiry does not send you back to login.

The project is **not “done” in the ship-clean sense**, mainly because the current working tree makes Inter a runtime dependency for `/timetable` PNGs while the font is still untracked. Live production (guild timezone `Europe/Brussels`, 32 members, 3 activities, **0 ICS calendars**) is usable for group activities today. ICS onboarding has not really happened yet.

Biggest remaining weaknesses: timezone/day-boundary consistency between Discord and the dashboard, Sunday, F1 correctness (copy, upsert, 3s defer), silent ICS failures, leftover calendars after guild leave, and a couple of auth/error-handling gaps. There is **no auth bypass, no service-role leak, and no reason to redesign the UI**.

Fix the P0 + P1 list before calling it finished. Do not start a stats dashboard or a visual refresh.

Specialist passes that fed this synthesis: [Discord Bot Engineer](7ad1022e-393a-48d7-8503-3765c6584cd2), [Web/Frontend Engineer](0795207b-f172-456f-8609-1ea4d949e26d), [UI/UX Designer](8c9b5f2d-dc49-43d8-a657-636d4a345a01), [Backend/Data Engineer](6b9171c5-21ee-43d6-b2b9-53bf937769c7), [QA / Adversarial Tester](8ce28e40-6348-43f5-8677-cdbc84a55260), [Security / Reliability Engineer](662ac033-e663-4f50-bf91-145a3de54832), [Product Consistency Reviewer](60c4a1f5-298c-4a4e-8958-4f9e07dd03cc).

---

## Critical Findings

### SHIP-001 — Inter font required but not in git

- **Category:** Reliability
- **Severity:** Critical (for shipping *this* working tree)
- **Location:** `assets/fonts/Inter-Regular.ttf` (untracked), `Dockerfile`, `src/calendar/timetableImage.ts`
- **Problem:** The PNG renderer loads Inter with `loadSystemFonts: false` and throws if the file is missing. The Dockerfile copies `assets/fonts/*.ttf`. The font exists on disk but is **not committed**. A clean clone or a deploy of the current Dockerfile without those files breaks `/timetable` for everyone.
- **Why it matters:** This is the main Discord surface of the product.
- **How to reproduce:** Build the image from a checkout that does not contain `assets/fonts/*.ttf`, then run `/timetable`.
- **Recommended solution:** Commit `Inter-Regular.ttf` and `Inter-LICENSE.txt` with the renderer/Dockerfile change. Optionally fall back to DejaVu if the file is missing so a bad deploy degrades instead of dying.
- **Confidence:** High

No other P0. There is no authentication bypass of “log in as someone else without a Discord account,” no unauthenticated data API, and no crash-on-startup in a correctly configured environment. See SEC-003 for a real OAuth login-CSRF edge (session as the attacker, not Discord account takeover).

---

## High Priority Findings

### XSYS-001 — Dashboard groups events by UTC date, not guild timezone

- **Category:** Functional correctness
- **Severity:** High
- **Location:** `dashboard/src/lib/dates.ts` (`eventDayKey`, `formatTime`), `dashboard/src/pages/Timetable.tsx` (`ev.start.slice(0, 10)`), `dashboard/src/components/WeekGrid.tsx` (`start.getHours()`)
- **Problem:** Discord buckets with `dayKeyInTimezone(..., Europe/Brussels)`. The dashboard uses the UTC prefix of the ISO string, and My Timetable positions blocks with the **browser’s** local hours while the hour axis is computed in guild TZ.
- **Why it matters:** An event at 00:30 Brussels Wednesday is `Tuesday 22:30 UTC`. Discord puts it on Wednesday; the dashboard puts it on Tuesday. Typical 08:00–18:00 lectures hide this; late activities and all-day ICS do not.
- **How to reproduce:** Create an activity 00:30–02:00 Brussels. Compare `/timetable` vs the dashboard.
- **Recommended solution:** Add a shared `dayKeyInTimezone` on the client (the server helper already exists). Format times with `toZonedTime` + guild TZ. Use those zoned hours in `WeekGrid`.
- **Confidence:** High

### XSYS-002 — Sunday is second-class

- **Category:** Functional correctness / UX
- **Severity:** High
- **Location:** `src/calendar/timetableService.ts` (`getWeekDayKeys` loops `i < 6`, range is Mon–Sun), `dashboard/src/lib/dates.ts` (`DAY_LABELS` is 6 days), `dashboard/src/hooks/useWeekTimetable.ts` (`to = dayDates[5]` = Saturday)
- **Problem:** Discord **fetches** Sunday events but has **no Sunday button** (except when today is Sunday, via `getDefaultDayKey`). The dashboard never requests or renders Sunday.
- **Why it matters:** Weekend hangouts are exactly when a friend-group timetable is useful. A Sunday activity created from the date picker disappears from the web UI.
- **How to reproduce:** Create “Kotavond” on Sunday. Open `/timetable` on Sunday vs the dashboard week view.
- **Recommended solution:** Pick one model. Best: Mon–Sun everywhere, hide Sunday only when empty (same as Saturday). Worse but consistent: stop fetching Sunday on Discord too, and reject Sunday activities with a clear error.
- **Confidence:** High

### BOT-001 — F1 reminder copy vs firing window

- **Category:** Functional correctness
- **Severity:** High
- **Location:** `src/f1/reminderJob.ts`
- **Problem:** The window is `raceDate - 3 days`, but the message is “F1 race weekend starts **tomorrow**”. Variable is named `oneDayBeforeMs`. First 10-minute tick after entering the 3-day window sends it.
- **Why it matters:** The only user-visible F1 behaviour is wrong. Role pings three days early train people to ignore the bot.
- **How to reproduce:** Enable reminders before a race; watch the first send ~72h out, not ~24h.
- **Recommended solution:** Either fire ~24h before (match the copy) or change the copy to “this weekend” / include the actual date. Rename the variable.
- **Confidence:** High

### BOT-002 — F1 settings upsert can fail silently

- **Category:** Reliability
- **Severity:** High
- **Location:** `src/f1/reminderStorage.ts` (`upsertF1ReminderSettings` logs and returns `null`), `src/commands/f1-reminder.ts` (ignores the return value)
- **Problem:** `/f1-reminder enable|set-channel|set-role` always replies success.
- **Why it matters:** Admins think reminders are on; the job no-ops forever.
- **How to reproduce:** Force an upsert error (bad channel FK, etc.) and run `/f1-reminder enable`.
- **Recommended solution:** If upsert returns `null`, reply with an error. Don’t claim success.
- **Confidence:** High

### FE-001 — Expired session does not return to login

- **Category:** UX / Reliability
- **Severity:** High
- **Location:** `dashboard/src/api.ts`, `dashboard/src/App.tsx`
- **Problem:** `getMe()` 401 only on first load sends you to login. Later 401s from `/api/timetable` etc. become `errorMsg` (“Not authenticated”). No retry, no redirect.
- **Why it matters:** After 7 quiet days (or cookie drop), the app looks broken.
- **How to reproduce:** Log in, delete the `clippy_session` cookie, change week.
- **Recommended solution:** In `fetchApi`, on 401 set `window.location = "/"`. Optionally wrap mutations the same way.
- **Confidence:** High

### BE-001 — OAuth callback has no try/catch

- **Category:** Reliability
- **Severity:** High
- **Location:** `src/dashboard/server.ts` `GET /api/auth/callback`
- **Problem:** Express 4 does not catch async throws. If Discord `/users/@me` or `/users/@me/guilds` fails after the token exchange, the request hangs/500s with no friendly `/?error=…`. There is also no `unhandledRejection` handler on the process.
- **Why it matters:** Login is the front door. Discord blips should not dump a blank 500.
- **How to reproduce:** Break the Discord API (or throw after `tokenRes.ok`) during callback.
- **Recommended solution:** Wrap the handler in try/catch and `redirect("/?error=token_exchange")`. Same for the `requireSession` recheck IIFE.
- **Confidence:** High

### UX-001 — All-day ICS events disappear from Discord PNG and group timeline

- **Category:** Functional correctness / UX
- **Severity:** High
- **Location:** `shared/timetable/layout.ts` `groupDayEvents` (`if (event.allDay) continue`)
- **Problem:** Agenda has `groupAllDayEvents`. Timeline, Discord PNG, and WeekGrid do not. WeekGrid will instead draw a 00:00-based block using browser hours.
- **Why it matters:** UGent feeds often have all-day holidays/exam periods. Discord can show an “empty day” image while the dashboard agenda lists events.
- **How to reproduce:** Add an all-day ICS event; open `/timetable` for that day vs mobile agenda vs desktop timeline.
- **Recommended solution:** Reserve a thin all-day row above the hour axis (Discord + group timeline). On WeekGrid, skip all-day from the hour column and show a header chip.
- **Confidence:** High

### BOT-006 — `/f1-reminder` never defers

- **Category:** UX / Reliability
- **Severity:** High
- **Location:** `src/commands/f1-reminder.ts`
- **Problem:** Status, test-send, enable/disable, and set-channel/role all `await` OpenF1 / Discord fetches **before** acknowledging. Discord requires a response in 3 seconds. `/timetable` and `/backfill-stats` already defer; F1 does not.
- **Why it matters:** Cold cache or a slow OpenF1 call shows “The application did not respond,” even if a test ping is later sent.
- **How to reproduce:** Restart the bot and immediately run `/f1-reminder status` or `test-send`.
- **Recommended solution:** `deferReply({ ephemeral: true })` as the first line of `execute`, then `editReply`.
- **Confidence:** High

### XSYS-003 — Week navigation uses 168 UTC hours

- **Category:** Functional correctness
- **Severity:** High
- **Location:** `dashboard/src/hooks/useWeekTimetable.ts` (`shiftWeek`)
- **Problem:** Next/prev is `weekMonday.getTime() + delta * 7 * 86400000`. Across EU autumn DST that lands on Sunday 23:00; `toISODate` then stores Sunday while headers still say Ma–Za.
- **Why it matters:** Once a year, paging across the October weekend shows the wrong dates and fetches the wrong range.
- **How to reproduce:** Browser TZ `Europe/Brussels`, week of 19 Oct 2026, click next week. Expect Monday 26 Oct; you get Sunday 25 Oct.
- **Recommended solution:** `setDate(getDate() + 7)` or `addWeeks` from date-fns, matching `getWeekMonday`.
- **Confidence:** High

### FE-026 — ICS fetch errors never reach the UI

- **Category:** UX / Reliability
- **Severity:** High
- **Location:** `src/calendar/timetableService.ts` `loadMemberEvents`, `GET /api/timetable` `members[].error`, `useWeekTimetable.ts` (ignores `members`)
- **Problem:** A 404/timeout ICS URL becomes `events: []` plus an `error` string. Discord PNG and the dashboard both treat that as a free week.
- **Why it matters:** “Clippy is empty” vs “my university URL died” is the main support trap once people actually link calendars.
- **How to reproduce:** Save an HTTPS URL that 404s. Open Rooster and `/timetable`. Chip is there; no events; no error.
- **Recommended solution:** Keep `members` in the hook. Mark the chip / a one-line banner. Discord: short footer, no raw URL. Optionally fetch+parse on Settings save.
- **Confidence:** High

### FE-027 — Overlapping events on Mijn rooster cover each other

- **Category:** Functional correctness / UI
- **Severity:** High
- **Location:** `dashboard/src/components/WeekGrid.tsx`, `.weekGridDayColumn .eventCard`
- **Problem:** Personal week grid paints every event `left: 4px; right: 4px`. The last DOM node wins. Group `WeekTimelineGrid` already packs rows.
- **Why it matters:** An activity on top of a lecture is unclickable. Looks like the lesson vanished.
- **How to reproduce:** Put an activity on top of an ICS class on Mijn rooster (desktop grid).
- **Recommended solution:** Reuse `packEventsIntoRows` as side-by-side columns, or inset overlapping cards.
- **Confidence:** High

### SEC-003 — OAuth `state` is optional when both sides are missing

- **Category:** Security
- **Severity:** High (login CSRF, not Discord account takeover)
- **Location:** `src/dashboard/server.ts` `GET /api/auth/callback`
- **Problem:** `if (!code || state !== session.state)` lets a request through when `code` is present and **both** `state` and `session.state` are `undefined`. A victim who opens an attacker’s unused callback URL gets a dashboard session as the attacker.
- **Why it matters:** Not “log in as the victim.” It is classic OAuth login CSRF: the victim’s browser is bound to the attacker’s Discord identity on this site.
- **How to reproduce:** In a clean browser (no `clippy_session`), open `/api/auth/callback?code=<unused_code>` with no `state`.
- **Recommended solution:** Require `typeof session.state === "string" && session.state.length > 0` before comparing (ideally `crypto.timingSafeEqual`). Reject missing state.
- **Confidence:** High

### PROD-003 — Leaving the guild does not drop the calendar

- **Category:** Functional correctness / Privacy
- **Severity:** High
- **Location:** `src/index.ts` (no `guildMemberRemove`), `src/calendar/memberCalendars.ts`
- **Problem:** Kick/leave does not delete `member_calendars`. Remaining members still fetch that ICS. Dashboard access lasts until the 15-minute guild recheck (and fail-opens if the bot cannot confirm membership).
- **Why it matters:** A former friend’s class schedule stays on the group rooster. Tokenized ICS URLs keep being fetched server-side.
- **How to reproduce:** Save an ICS, leave the guild, have someone else open Rooster.
- **Recommended solution:** On `guildMemberRemove`, delete that user’s `member_calendars` row (decide separately whether activities stay). Fail closed on `botConfirmsGuildMember === null` for API writes.
- **Confidence:** High

### QA-022 — Distinct activities with the same title/time merge into one card

- **Category:** Functional correctness
- **Severity:** High
- **Location:** `shared/timetable/layout.ts` `groupDayEvents`
- **Problem:** Merge key is `source|start|end|title|badges`, not activity `id`. Two independent “Film” events at 20:00 become one card; the popup is whichever DTO won the lookup.
- **Why it matters:** ICS same-class merge is intended. Activity merge is not. Join/delete can hit the wrong row.
- **How to reproduce:** Two people create “Film”, 20:00–22:00, same night.
- **Recommended solution:** Include `id` in the merge key for `source === "activity"`. Keep title merge for ICS.
- **Confidence:** High

---

## Medium Priority Findings

### FE-002 — Settings timezone is saved and never used

- **Category:** UX / Maintainability
- **Severity:** Medium
- **Location:** `dashboard/src/pages/Settings.tsx`, `src/calendar/memberCalendars.ts`, `src/calendar/timetableService.ts` `loadMemberEvents`
- **Problem:** Member `timezone` is stored. ICS parse and layout use **guild** timezone from `/stats set-timezone`. Changing Settings TZ does nothing visible.
- **Why it matters:** Looks like a broken control. Two timezone concepts, one of which is fake.
- **How to reproduce:** Save `Europe/London` in Settings. Times still follow `Europe/Brussels`.
- **Recommended solution:** Remove the field from Settings (guild TZ is enough for this group) **or** actually apply it. Do not leave a no-op dropdown.
- **Confidence:** High

### FE-003 — OAuth always redirects to `/settings`

- **Category:** UX
- **Severity:** Medium
- **Location:** `src/dashboard/server.ts` (`res.redirect("/settings")`)
- **Problem:** Returning users land on calendar settings, not the roster. Discord’s “Volledig Rooster” link is `/timetable`, which is fine once you already have a cookie.
- **Why it matters:** Extra click every login. Fine for first-time ICS setup; wrong thereafter.
- **How to reproduce:** Log out, log in with Discord, land on Settings instead of Rooster.
- **Recommended solution:** Redirect to `/timetable`. If `GET /api/calendar` is empty, show a one-line banner “Koppel je kalender in Instellingen”.
- **Confidence:** High

### FE-004 — Week navigation blanks the page

- **Category:** UX
- **Severity:** Medium
- **Location:** `dashboard/src/hooks/useWeekTimetable.ts`
- **Problem:** Every week change sets `loading=true` and unmounts the grid (`{!loading && …}`).
- **Why it matters:** Feels unreliable even when the API is fast.
- **How to reproduce:** Click next/previous week on Rooster or Mijn rooster.
- **Recommended solution:** Keep the previous week on screen; overlay a small “Laden…” or disable the nav buttons until the new payload arrives. Ignore stale responses with an incrementing request id.
- **Confidence:** High

### BE-002 — `createActivity` is not transactional

- **Category:** Reliability
- **Severity:** Medium
- **Location:** `src/calendar/activities.ts`
- **Problem:** Insert into `timetable_activities`, then insert the creator into `timetable_activity_participants`. If the second insert fails, the client gets 500 but the activity row remains. Display still works via the `created_by` fallback.
- **Why it matters:** Rare, but you can get activities with no participant row and confusing join/leave later.
- **How to reproduce:** Fail the participant insert (e.g. members FK) after the activity insert.
- **Recommended solution:** Postgres function/transaction, or delete the activity if the participant insert fails.
- **Confidence:** High

### BE-003 — `/api/timetable` has no max range

- **Category:** Reliability / Performance
- **Severity:** Medium
- **Location:** `src/dashboard/server.ts` `GET /api/timetable`
- **Problem:** Date format is validated, span is not. A guild member can request years of recurring ICS expansion.
- **Why it matters:** Authenticated friend-group DoS of the bot process (same event loop as Discord).
- **How to reproduce:** `GET /api/timetable?from=2020-01-01&to=2030-12-31` while logged in.
- **Recommended solution:** Reject ranges > 14 days (the UI only ever asks for 6–7).
- **Confidence:** High

### BOT-003 — Old `/timetable` buttons always reload this week

- **Category:** UX
- **Severity:** Medium
- **Location:** `src/calendar/timetableInteractions.ts` → `getGuildTimetable()` (current week only)
- **Problem:** Clicking a day button on last week’s message loads **this** week’s ICS, then looks up last week’s `dayKey` → empty-day PNG, then rewrites buttons to this week.
- **Why it matters:** Discord messages persist. People tap old roosters.
- **How to reproduce:** Run `/timetable`, wait a week, tap a day button on the old message.
- **Recommended solution:** `getGuildTimetableForDates` for the week of `dayKey`, or disable/ignore buttons whose `dayKey` is outside the current week with “Dit rooster is verouderd — gebruik /timetable”.
- **Confidence:** High

### PROD-001 — Stats are collected and never shown

- **Category:** Product / Maintainability
- **Severity:** Medium
- **Location:** `src/stats/*`, `/backfill-stats`, `/stats set-timezone`, `README.md`
- **Problem:** Message/voice/reaction ingest is live (807 messages, 32 members). No dashboard, no Discord stats command for users. README still leads with stats. `/stats set-timezone` silently drives **timetable** TZ.
- **Why it matters:** Message Content intent + DB growth for no user-facing value. Timezone command is misnamed.
- **Recommended solution:** Do **not** build a stats UI. Either keep ingest as a quiet sidecar and rename `/stats set-timezone` to something timetable-related, or stop documenting stats as a feature. Unused helper functions in `src/stats/helpers.ts` can be deleted later.
- **Confidence:** High

### SEC-001 — ICS fetch DNS rebinding TOCTOU

- **Category:** Security
- **Severity:** Medium (calibrated for a private guild)
- **Location:** `src/calendar/icsFetcher.ts`
- **Problem:** `assertIcsUrlSafe` resolves DNS and blocks private IPs, then `fetch(hostname)` can hit a different IP. HTTPS-only, no credentials, redirect re-checks help a lot. This is leftover TOCTOU, not an open SSRF hole.
- **Why it matters:** A guild member with a malicious ICS host could theoretically hit RFC1918. Unlikely in this group; still the main remaining SSRF edge.
- **How to reproduce:** Attacker-controlled DNS that flips to `127.0.0.1` between lookup and connect.
- **Recommended solution:** Pin to resolved addresses, or skip unless you start allowing untrusted users. Current checks are already solid.
- **Confidence:** Medium

### UX-002 — Popup shows “Deelnemers: 3”, not who

- **Category:** UX
- **Severity:** Medium
- **Location:** `dashboard/src/components/EventPopup.tsx`
- **Problem:** Cards already show `AvatarStack`. The popup, where you join/leave, only shows a number. Join/leave also closes the popup immediately.
- **Why it matters:** The point of join is “who’s coming?”. Extra click to reopen.
- **How to reproduce:** Open a group activity with several participants; look at the popup vs the card.
- **Recommended solution:** Reuse `AvatarStack` in the popup. Stay open after join/leave and refresh in place.
- **Confidence:** High

### BOT-005 — `/stats set-timezone` does not validate IANA

- **Category:** Reliability
- **Severity:** Medium
- **Location:** `src/commands/stats/set-timezone.ts`
- **Problem:** Any string is upserted. Invalid TZ can make `date-fns-tz` produce Invalid Dates and break `/timetable` + the dashboard.
- **Why it matters:** One admin typo takes down the main feature. Live value is already `Europe/Brussels` (good).
- **How to reproduce:** `/stats set-timezone timezone:Not/AZone`, then open `/timetable`.
- **Recommended solution:** Allowlist (at least `Europe/Brussels` + the Settings list) or `Intl.supportedValuesOf("timeZone")`.
- **Confidence:** High

### QA-001 — Voice sessions never closed on bot restart

- **Category:** Reliability
- **Severity:** Medium
- **Location:** `src/stats/liveHandlers.ts` `handleVoiceStateJoin/Leave`
- **Problem:** Open rows (`left_at` null) stay open if the process dies.
- **Why it matters:** Only if you ever show voice stats. Today: silent data rot.
- **How to reproduce:** Join a voice channel, restart the bot, inspect `voice_sessions`.
- **Recommended solution:** On `clientReady`, close stale open sessions, or ignore until you have a stats UI.
- **Confidence:** High

### STATS-001 — Bulk-delete handler never runs

- **Category:** Functional correctness
- **Severity:** Medium (stats-only; no timetable UI)
- **Location:** `src/index.ts` `client.on("messageBulkDelete")`
- **Problem:** discord.js 14 emits `messageDeleteBulk`. This listener name is wrong, so channel purges never set `deleted_at`.
- **Why it matters:** Only if you ever query message counts. Live single-delete still works.
- **How to reproduce:** Shift-select delete several human messages; those `messages` rows stay undeleted.
- **Recommended solution:** Listen for `messageDeleteBulk`. One-line fix if you keep stats ingest.
- **Confidence:** High

### STATS-002 — Unicode reaction counts do not increment

- **Category:** Functional correctness
- **Severity:** Medium (stats-only)
- **Location:** `src/stats/liveHandlers.ts` `.eq("emoji_id", emojiId)` when `emojiId` is `null`
- **Problem:** PostgREST `eq.null` does not match SQL `NULL` (need `.is("emoji_id", null)`). 👍 inserts extra rows instead of incrementing. Production already has duplicate groups.
- **Why it matters:** Top-emoji stats would be wrong. Custom emoji (snowflake id) is mostly fine.
- **How to reproduce:** React 👍 twice on a tracked message; inspect `message_reactions`.
- **Recommended solution:** `.is("emoji_id", null)` when null; unique index + SQL increment. Skip until you care about stats.
- **Confidence:** High

### STATS-003 — `/backfill-stats` never walks history after live traffic

- **Category:** Functional correctness
- **Severity:** Medium (stats-only)
- **Location:** `src/commands/stats/backfill-stats.ts`; live `handleMessageCreate` upserts `last_processed_message_id`
- **Problem:** Any existing cursor is treated as incremental `after` that ID. After one live message, backfill only catches up newer messages.
- **Why it matters:** The command’s name is a lie once the bot has been up.
- **How to reproduce:** Let the bot ingest a message, then run `/backfill-stats`. Older history is skipped.
- **Recommended solution:** Separate live high-water mark from history-backfill complete. Skip until you care about stats.
- **Confidence:** High

### FE-028 — Rapid week changes can paint a stale fetch

- **Category:** Reliability
- **Severity:** Medium
- **Location:** `dashboard/src/hooks/useWeekTimetable.ts`
- **Problem:** No request id / abort. A slow ICS week can resolve after a newer week and overwrite state. Combined with full unmount on `loading`, this feels like a broken pager.
- **Why it matters:** Fast next/prev on a slow network shows the wrong week with the new label.
- **How to reproduce:** Throttle `/api/timetable` to ~2s; click next, then immediately previous.
- **Recommended solution:** Ignore stale responses (incrementing request id) or abort. Keep previous data visible (see FE-004).
- **Confidence:** High

### UX-004 — Phones default to Tijdlijn, not Lijst

- **Category:** UX
- **Severity:** Medium
- **Location:** `dashboard/src/hooks/useTimetableLayout.ts` (default `"timeline"`)
- **Problem:** First visit on a phone opens the horizontal timeline (`min-width: 880px` scroll). Agenda exists but is opt-in.
- **Why it matters:** The first mobile impression is pinch-and-pan, not “what’s today.”
- **How to reproduce:** Phone or DevTools ≤767px, clear `clippy.timetableLayout`, open `/timetable`.
- **Recommended solution:** Default mobile to `"agenda"`. Keep the toggle. Desktop can stay timeline.
- **Confidence:** High

### PROD-004 — Mijn rooster is not “mine”

- **Category:** UX
- **Severity:** Medium
- **Location:** `dashboard/src/pages/MyTimetable.tsx` (`[...mine, ...activities]`)
- **Problem:** Personal view is own ICS **plus every shared activity**, including ones you never joined. Rooster already shows all activities (and ignores the member filter for them).
- **Why it matters:** Two pages that both dump group kotavond. “Mijn” is a lie.
- **How to reproduce:** Friend A creates “Kotavond.” Friend B never joins; B opens Mijn rooster.
- **Recommended solution:** Filter Mijn rooster to `createdBy === me || participantIds.includes(me)`. Keep all activities on Rooster only.
- **Confidence:** High

### BE-005 — Cancelled ICS events still render

- **Category:** Functional correctness
- **Severity:** Medium
- **Location:** `src/calendar/icsParser.ts` (no `STATUS:CANCELLED` filter)
- **Problem:** Cancelled lectures still become timetable events.
- **Why it matters:** Dropped classes stay on the rooster.
- **How to reproduce:** ICS with `STATUS:CANCELLED`; open Rooster / `/timetable`.
- **Recommended solution:** Skip cancelled VEVENTs in the parser.
- **Confidence:** Medium (depends on how UGent/Outlook marks cancellations)

### SEC-004 — Hidden location still leaks room codes in notes

- **Category:** Security / Privacy
- **Severity:** Medium
- **Location:** `shared/timetable/eventMeta.ts` `redactLocationFromDescription`
- **Problem:** Redaction strips `Location(s):` / `Locatie:` headings. A bare `B22.0.10` line in the description is kept. `descriptionContainsLocation` also only looks for those headings.
- **Why it matters:** “Toon locatie aan andere leden” off still shows room codes under Opmerkingen.
- **How to reproduce:** ICS `LOCATION: Campus` plus description line `B22.0.10`, `show_location` false.
- **Recommended solution:** When location is hidden, also strip `ROOM_CODE_PATTERN` from the description (the same regex already used for `shortLocation`).
- **Confidence:** High

### FE-029 — Evening activities cannot end at midnight

- **Category:** UX
- **Severity:** Medium
- **Location:** `src/calendar/activities.ts` (same calendar day, `end > start`); `ActivityForm.tsx` (`type="time"`)
- **Problem:** `22:00–00:00` is the same date with end before start, so validation rejects it. `clipEventToGrid` also drops timed events whose zoned end is 00:00.
- **Why it matters:** “Kotavond tot middernacht” is a normal friend-group event and cannot be saved.
- **How to reproduce:** Form: today, start 22:00, end 00:00.
- **Recommended solution:** Treat 00:00 end as next-day midnight (or 23:59). For clipping, treat 00:00 as 24:00 on the start day.
- **Confidence:** High

---

## Low Priority / Polish

### SHIP-002 — Availability chart hardcoded off

- **Category:** Maintainability
- **Severity:** Low
- **Location:** `dashboard/src/pages/Timetable.tsx` `{false && selectedCalendars.length > 0 && ( <WeekAvailabilityChart /> )}`
- **Problem:** Dead UI with a fake condition.
- **Why it matters:** Dead code tends to bit-rot and confuse later changes.
- **How to reproduce:** Read `Timetable.tsx`; the chart never mounts.
- **Recommended solution:** Delete the chart (and `availability.ts`) **or** turn it on. Do not leave `false &&`.
- **Confidence:** High

### BOT-004 — Mixed Dutch / English command surface

- **Category:** UX
- **Severity:** Cosmetic
- **Location:** `/timetable` Dutch vs `/ping`, `/stats`, `/f1-reminder`, `/backfill-stats` English
- **Problem:** Fine for you; slightly odd for friends.
- **Why it matters:** Small inconsistency, not a usability failure.
- **How to reproduce:** Compare slash command descriptions in Discord.
- **Recommended solution:** Only worth touching if you rewrite F1/stats copy anyway.
- **Confidence:** High

### FE-005 — Participant expansion bloats the API payload

- **Category:** Performance / Maintainability
- **Severity:** Low
- **Location:** `src/calendar/activities.ts` `activityToParticipantEvents`, `src/dashboard/server.ts` `activities` filter
- **Problem:** One activity with 5 joiners becomes 5 event objects. Layout grouping makes this invisible to users. WeekGrid even comments on it.
- **Why it matters:** Extra payload and a leaky abstraction, not a user-facing bug today.
- **How to reproduce:** Join an activity with several people; inspect `/api/timetable` `activities`.
- **Recommended solution:** Later: return each activity once with `participantIds`. Not user-facing today.
- **Confidence:** High

### SEC-002 — Postgres patches available

- **Category:** Security
- **Severity:** Low
- **Location:** Supabase advisor (`supabase-postgres-17.4.1.074`)
- **Problem:** Platform warning, not an app bug.
- **Why it matters:** Unrelated to app code; still worth doing on a quiet day.
- **How to reproduce:** Supabase dashboard advisors / platform upgrade prompt.
- **Recommended solution:** Upgrade in the Supabase dashboard when convenient.
- **Confidence:** High

### UX-003 — Popup / form a11y

- **Category:** UI/design
- **Severity:** Cosmetic
- **Location:** `EventPopup.tsx`, `ActivityForm.tsx`
- **Problem:** Overlay click-to-close, Escape on the form but not the popup, no focus trap, no `aria-modal`.
- **Why it matters:** Keyboard/screen-reader users get a weaker experience. Fine for this group.
- **How to reproduce:** Tab through a popup; try Escape on EventPopup vs ActivityForm.
- **Recommended solution:** Only if you already touch those components. Not a friend-group blocker.
- **Confidence:** High

### PROD-002 — README is stale

- **Category:** Maintainability
- **Severity:** Low
- **Location:** `README.md` vs actual commands (`/timetable` missing; stats still headline)
- **Problem:** Docs describe the old stats-bot. Deploy notes also disagree (LAN vs old VPS in `.cursor/rules/deploy-commands.mdc`).
- **Why it matters:** Future-you (or a friend) will set up the wrong mental model.
- **How to reproduce:** Read README Features vs `src/commands/`.
- **Recommended solution:** One-paragraph rewrite when you next touch docs.
- **Confidence:** High

### BE-004 — ICS cache 20 minutes, unbounded Map

- **Category:** Performance
- **Severity:** Low
- **Location:** `src/calendar/icsFetcher.ts`
- **Problem:** Fine for a handful of URLs. Stale vs the university server for 20 minutes; Discord and dashboard stay in sync with each other because they share the process.
- **Why it matters:** Acceptable tradeoff. Don’t add a second cache.
- **How to reproduce:** Change an ICS feed and hit `/timetable` within 20 minutes.
- **Recommended solution:** Leave it. Optional: evict on calendar save.
- **Confidence:** High

---

## Discord Bot Audit

Commands are guild-scoped, auto-loaded, and `/timetable` correctly `deferReply`s before ICS/PNG work. Button handler `deferUpdate`s immediately. Errors become ephemeral or edit the same message. Guild event handlers filter on `GUILD_ID`. ICS fetching is one of the better parts of the codebase (HTTPS-only, private IP block, redirect re-validation, size/timeout limits).

Gaps: F1 never `deferReply`s (3s timeout); F1 copy vs 3-day window; silent ICS errors on the PNG; old week buttons; `/stats` timezone is unvalidated. Stats ingest has real bugs (wrong bulk-delete event name, unicode `emoji_id` null, backfill cursor, voice rows after crash) that only matter if you keep that warehouse. English admin commands next to a Dutch timetable.

`/ping` is harmless. Do not add more slash commands.

---

## Dashboard Audit

The SPA is small and readable: OAuth gate, three pages, shared `useWeekTimetable`, real empty states in Dutch, mobile tab bar that actually works (brand / content / nav grid, 44px targets, safe areas). Activity create/edit/join/leave is wired end-to-end with busy states and confirm dialogs.

Weak UX: login dump onto Settings; week-change flicker; 401 handling; unused timezone field; popup not showing who joined; `formatTime` / `eventDayKey` in browser/UTC rather than guild TZ; overlapping cards on Mijn rooster; phones default to timeline. Filter **Mijn rooster** to activities you created or joined (PROD-004) — keep all activities on Rooster only.

Do not merge Rooster and Mijn rooster into one layout. Group timeline vs personal week grid is a good split.

---

## Backend / Database Audit

API surface is tight and session-gated. Calendar ICS URLs are not leaked on `GET /api/calendars`. Activities are owner-only for update/delete; join is upsert; creator cannot leave. Range queries on activities are indexed.

Live database snapshot (queried during this audit):

| Fact | Value |
| --- | --- |
| Guild timezone | `Europe/Brussels` |
| Members tracked | 32 |
| ICS calendars saved | 0 |
| Group activities | 3 |
| Messages ingested | 807 |
| F1 reminder rows | 0 |
| RLS on all public tables | On, no policies (service-role app) |

Zero ICS rows with three activities means people are using group events without linking calendars — onboarding, not a save-path failure.

Issues: unbounded timetable range; non-transactional activity create; member timezone unused; `source_type = file` / `storage_path` schema with no upload path; stats tables growing with unused indexes (advisor noise until you query them); F1 upsert error swallowing.

RLS enabled on every public table with **no policies** is deny-by-default for the anon key. That is the right model as long as the service role never ships to the browser (it doesn’t). Do not “add policies” unless you stop using the service role.

---

## UI/UX Audit

Visual system is already Discord-adjacent (blurple, dark elevated surfaces, muted labels) and **should stay that way**. Mobile shell is thought through. Event cards, agenda cards, and activity gold styling are consistent enough.

Meaningful gaps, not redesigns:

- Information hierarchy on Rooster is good (week nav + member chips + density). The availability chart being `false &&` is leftover clutter in code only.
- Popup fails the “who’s in?” job.
- All-day events have no visual home on the main grid.
- Settings timezone is a fake control — worse than no control.
- Login copy still says “kalender beheren” and undersells the roosters.

Do not add more settings, more empty-state illustrations, or a generic SaaS sidebar restyle.

---

## Security Audit

**Solid for a private friend-group app.**

Done well: OAuth `state`, `httpOnly` + `sameSite=lax` + `secure` in production, helmet CSP, rate limits, `trust proxy`, guild membership check, 15-minute re-check via the bot, ICS SSRF hardening, no Discord token in the session (only user profile), health endpoint is `{ ok: true }`, Docker non-root, dashboard not published on the home compose file (Tunnel only).

Not Critical:

- OAuth `state` is optional when both sides are `undefined` (SEC-003) — High for login CSRF, not a Discord takeover.
- 15-minute leftover access after leaving the guild — Medium, acceptable here.
- RLS with no policies — **do not “add policies”** unless you stop using the service role. Adding naive policies without rewriting the backend will break the bot.
- Service role in env — protect `.env`; never commit it (already gitignored).
- `backfill-stats` / F1 `test-send` are Manage Guild — appropriate.
- Residual ICS DNS rebinding — Medium, see SEC-001.

---

## Cross-System Issues

This is where the real bugs live:

1. **Day identity:** Discord `dayKeyInTimezone(guildTz)` vs dashboard `iso.slice(0, 10)` vs WeekGrid `Date#getHours()` local.
2. **Week shape:** Discord fetches Mon–Sun, buttons Mon–Sat, dashboard requests Mon–Sat.
3. **All-day:** Parsed on both sides, rendered only in agenda.
4. **Staleness:** Shared 20-minute ICS cache means Discord and dashboard agree with each other and can both be 20 minutes behind the university. That is the right tradeoff; don’t add a second cache.
5. **Timezone knobs:** Settings member TZ unused; `/stats set-timezone` is the real one and is named like a stats admin tool.
6. **Login landing:** Discord link buttons go to `/timetable` and `/settings`; OAuth always goes to `/settings`.

Activities created on the dashboard **do** show up on `/timetable` (same DB, no ICS cache). That path is coherent.

---

## Things That Are Already Good

Do not churn these:

- Single-guild, Docker + Cloudflare Tunnel deploy
- Discord OAuth limited to guild members
- ICS URL treated as a secret (not in `/api/calendars`)
- Location hidden unless the owner opted in; activities always visible
- Activity join model (creator stays, others toggle)
- Group timeline vs personal week grid
- Mobile bottom nav + floating add-activity button
- Discord day buttons + link to the full dashboard
- Empty-day PNG and “nog geen kalenders” copy
- `groupDayEvents` merging the **same ICS lesson** across people into one card with avatars (do not merge distinct **activities** — see QA-022)
- SSRF checks, helmet, rate limits, non-root container
- Dutch copy on the user-facing timetable surfaces

Rejected as false positives / not worth changing:

- Activity per-participant expansion (intentional, grouped into one card with avatars)
- RLS without policies (service-role architecture)
- Stats unused indexes (no stats UI)
- Avatar fetch throwing on Discord CDN failure (caught per user)
- Dual week layouts (intentional: group timeline vs personal week grid)

---

## Recommended Final Fix List

If you only spend another day or two:

1. **Commit Inter + license** with the PNG/Dockerfile change (or add a font fallback).
2. **Use guild timezone for dashboard day keys and clock labels** (one helper, three call sites).
3. **Make Sunday consistent** — prefer showing it, hide when empty like Saturday.
4. **F1:** fire at the time the message claims; error if upsert returns null; `deferReply` on every subcommand.
5. **Auth:** try/catch on OAuth callback; require a non-empty `state`; 401 → `/`.
6. **All-day row** on Discord PNG + group timeline.
7. **Remove the Settings timezone dropdown** (keep guild TZ). Redirect login to `/timetable` with a banner if no ICS is linked.
8. **Week pager:** shift by calendar days (not 168h); ignore stale fetches; default phones to agenda.
9. **ICS honesty:** show `members[].error`; drop calendars on `guildMemberRemove`; skip `STATUS:CANCELLED`.
10. **Cards:** pack overlapping Mijn-rooster events; do not merge two activities that only share title+time.

Stop there. Do not build a stats UI. If you keep ingest, the one-line `messageDeleteBulk` rename and unicode `.is(null)` are cheap. Do not restyle. Do not add more commands.

---

## Final Verdict

**Functional but needs polish** — close to **production-ready for its intended use** once the ship-blocker font and the P1 consistency bugs are fixed.

This is already a coherent friend-group product. The remaining work is a short correctness pass, not a new roadmap.
