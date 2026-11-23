Status of AUDIT.md findings as of commit 771c7e3 (2026-11-23).

| ID | Status | Evidence (file:line @771c7e3) | Trivial? |
| --- | --- | --- | --- |
| SHIP-001 | fixed | `Dockerfile:38` copies the tracked Inter font; `src/calendar/timetableImage.ts:78` also has a fallback. | — |
| XSYS-001 | fixed | `dashboard/src/lib/dates.ts:52` uses timezone-aware helpers; `dashboard/src/components/WeekGrid.tsx:165` uses zoned day keys. | — |
| XSYS-002 | fixed | `shared/timetable/dates.ts:68` produces seven days and `dashboard/src/hooks/useWeekTimetable.ts:25` requests through Sunday. | — |
| BOT-001 | fixed | `src/f1/embeds.ts:142` now describes predictions opening instead of saying the weekend starts tomorrow. | — |
| BOT-002 | fixed | `src/commands/f1-reminder.ts:125` moves settings to the dashboard; `src/dashboard/botSettings.ts:228` checks the save result. | — |
| FE-001 | fixed | `dashboard/src/api.ts:30` redirects on subsequent 401 responses. | — |
| BE-001 | fixed | `src/dashboard/server.ts:277` wraps the callback in a try/catch, and `src/dashboard/server.ts:157` catches session recheck errors. | — |
| UX-001 | fixed | `src/calendar/timetableImage.ts:653`, `dashboard/src/components/WeekTimelineGrid.tsx:145`, and `dashboard/src/components/WeekGrid.tsx:126` render all-day events. | — |
| BOT-006 | fixed | `src/commands/f1-reminder.ts:160` defers before handling the subcommand. | — |
| XSYS-003 | fixed | `dashboard/src/hooks/useWeekTimetable.ts:63` shifts by calendar days. | — |
| FE-026 | partial | `dashboard/src/pages/Timetable.tsx:335` displays member errors, but `src/calendar/timetableImage.ts:653` renders events without an error notice. | no |
| FE-027 | fixed | `dashboard/src/components/WeekGrid.tsx:174` packs overlapping events into columns. | — |
| SEC-003 | fixed | `src/dashboard/server.ts:281` requires matching OAuth state via `oauthStatesMatch`. | — |
| PROD-003 | partial | `src/index.ts:212` deletes calendars on member removal, but `src/dashboard/server.ts:165` still permits an inconclusive membership recheck. | no |
| QA-022 | fixed | `shared/timetable/layout.ts:169` keys activities by ID. | — |
| FE-002 | fixed | `src/calendar/timetableService.ts:78` uses the member timezone for floating ICS times. | — |
| FE-003 | fixed | `src/dashboard/server.ts:319` redirects successful login to the timetable. | — |
| FE-004 | fixed | `dashboard/src/pages/Timetable.tsx:299` retains the grid while `dashboard/src/hooks/useWeekTimetable.ts:40` loads. | — |
| BE-002 | partial | `src/calendar/activities.ts:275` attempts cleanup after participant failure, but cleanup itself can fail and leave the row. | no |
| BE-003 | fixed | `src/dashboard/server.ts:541` rejects ranges beyond the configured maximum. | — |
| BOT-003 | fixed | `src/calendar/timetableInteractions.ts:49` detects stale day buttons and rolls or rejects the old message. | — |
| PROD-001 | fixed | `src/dashboard/server.ts:855` exposes admin statistics and `README.md:10` documents the stats dashboard. | — |
| SEC-001 | open | `src/calendar/icsFetcher.ts:169` resolves and validates DNS separately from the hostname fetch at line 217. | no |
| UX-002 | fixed | `dashboard/src/components/EventPopup.tsx:72` refreshes after joining without closing, and line 138 displays participant avatars. | — |
| BOT-005 | fixed | `src/commands/stats/sync-stats.ts:125` directs timezone changes to dashboard, where `src/dashboard/botSettings.ts:164` validates IANA zones. | — |
| QA-001 | open | `src/index.ts:67` initializes the bot without closing stale `voice_sessions`; `src/stats/liveHandlers.ts:209` closes on leave. | no |
| STATS-001 | fixed | `src/index.ts:291` listens for `messageDeleteBulk`. | — |
| STATS-002 | partial | `src/stats/liveHandlers.ts:96` uses `.is` for null emoji IDs; existing duplicate rows are not verifiable from repo — ops check needed. | no |
| STATS-003 | open | `src/stats/liveHandlers.ts:47` writes the cursor and `src/commands/stats/backfill-stats.ts:59` treats it as incremental. | no |
| FE-028 | fixed | `dashboard/src/hooks/useWeekTimetable.ts:40` ignores responses after effect cleanup. | — |
| UX-004 | fixed | `dashboard/src/hooks/useTimetableLayout.ts:15` defaults mobile to agenda. | — |
| PROD-004 | fixed | `dashboard/src/pages/MyTimetable.tsx:16` filters activities by creator or participant. | — |
| BE-005 | fixed | `src/calendar/icsParser.ts:128` skips cancelled components. | — |
| SEC-004 | partial | `shared/timetable/eventMeta.ts:48` removes room codes from redacted descriptions, but line 33 detects only location headings. | no |
| FE-029 | fixed | `dashboard/src/components/ActivityForm.tsx:78` maps midnight to the next day and `src/calendar/activities.ts:85` accepts it. | — |
| SHIP-002 | fixed | `dashboard/src/pages/Timetable.tsx:341` renders the schedule without the hardcoded chart condition. | — |
| BOT-004 | open | `src/commands/f1-reminder.ts:125` uses English descriptions while `src/calendar/timetableInteractions.ts:36` uses Dutch. | no |
| FE-005 | open | `src/calendar/activities.ts:136` expands each activity to participant events. | no |
| SEC-002 | open | `AUDIT.md:460`: not verifiable from repo — ops check needed. | no |
| UX-003 | partial | `dashboard/src/components/EventPopup.tsx:100` adds `aria-modal`, but `dashboard/src/components/ActivityForm.tsx:115` handles Escape while the popup does not. | no |
| PROD-002 | partial | `README.md:3` still describes a settings dashboard and its command list at line 8 omits `/timetable`; line 10 documents admin stats. | no |
| BE-004 | open | `src/calendar/icsFetcher.ts:7` retains a 20-minute TTL and line 24 uses a Map without eviction. | no |

## Trivial fix list

None.

