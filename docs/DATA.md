# Data — Vampire Matchup Picker

## Storage: Supabase ("Fantasy Football" project, `tdtchffawcmkvgrccjza`)

The self-hosted page (see README's architecture note for why it's not a
Claude Artifact anymore) talks to Supabase directly with a `supabase-js`
client loaded from a CDN `<script>` tag, using the public anon key embedded
in `template.html`. RLS is off on all four `vampire_` tables — a deliberate
call, not an oversight (low-stakes data, no-login model).

- **`vampire_rosters`** — one row per rostered player. `team, player`
  (composite PK), `position`, `lineup_slot`, `starter` (bool). `team` "Me" is
  the Vampire; the other 9 are the league's other teams. Wiped and
  re-inserted wholesale by `scripts/refresh-data.js`.
- **`vampire_player_values`** — one row per player. `player` (PK), `team`,
  `position`, `bye`, `injury_risk`, `three_d_value`, two rolling
  "current"/"next" weekly-projection slots: `weekly_projection` /
  `weekly_projection_week`, and `weekly_projection_next` /
  `weekly_projection_next_week` (all nullable — populated once DraftSharks
  publishes in-season weekly numbers; scoring falls back to `three_d_value`
  until then), and (added 2026-09-16) two matching opponent columns,
  `weekly_opponent` / `weekly_opponent_next` (nullable text, e.g. `"@DAL"`,
  `"BUF"`) — see "Weekly opponent" below. Both slots are kept pushed at once
  so every available week's projection stays visible until that week has
  actually passed — see below.

  **Gotcha:** `scripts/refresh-data.js` deletes and reinserts this table
  *wholesale* (draft-time roster/DraftSharks refresh), and its row-builder
  (`build-rows.js`'s `buildPlayerValueRows`) never sets any of the four
  weekly-projection columns — so running `refresh-data.js` mid-season
  silently wipes all of them back to `null` for every player. Always re-run
  `refresh-weekly-projection.js` for both the current and next week
  immediately after any `refresh-data.js` run during the season, or the app
  will show blank weekly numbers for everyone until that's caught.
- **`vampire_settings`** — single row (`id boolean` PK, always `true`).
  `last_regular_season_week, restricted_window_start, restricted_window_end,
  max_meetings_per_opponent`. Currently `13, 5, 13, 2`. Not editable in-app —
  change via direct SQL if a league rule changes; never touched by the
  refresh script.
- **`vampire_schedule`** — one row per week, `week int` PK. `opponent`
  (nullable text), `locked` (bool), `result`, `note` — the app no longer
  writes `result`/`note` (that UI was removed; Jared tracks those manually),
  but the columns still exist and are left alone by the page's upserts.
  Written directly by the app (lock-in, schedule generator); the page also
  holds a realtime subscription on this table so simultaneous viewers see
  schedule changes live without reloading.

The browser client code (`rowsToRosters`, `rowsToPlayerValues`,
`rowToScheduleWeek` in `template.html`) converts `snake_case` Postgres
columns to the `camelCase` shape the pure `src/*.js` scoring/rules modules
expect — that translation layer is the thing most likely to drift if a
column gets renamed on either side.

## Source files (external to this repo)

- `../rosters.csv` — ESPN-style export: `team,player,position,lineup_slot,starter`
  (`starter` is `"1"`/`"0"`). Parsed by `src/rosters-parser.js`.
- A DraftSharks rankings CSV — path varies by season/scrape, typically
  `Fantasy Football/Draft/data/raw/rankings-half-ppr.csv` (this league is
  0.5 PPR — use the half-ppr file, not full-PPR). Columns actually used:
  `Player`, `Team`, `Fantasy Position`, `Bye`, `InjuryRisk`, `3D Value`.
  Parsed by `src/draftsharks-parser.js`.
- `../../in-season/data/processed/rankings_long.csv` — the in-season weekly
  pipeline's output (see that project's README/docs/DATA.md). Used only by
  `scripts/refresh-weekly-projection.js` (below) to populate the
  current/next projection slots once the season starts; the draft-time
  refresh above is unrelated to it.

## Weekly projection refresh (`scripts/refresh-weekly-projection.js`)

`node scripts/refresh-weekly-projection.js ../../in-season/data/processed/rankings_long.csv <week> [scoring] [slot]`
(`scoring` defaults to `half-ppr`, matching this league; `slot` defaults to
`current`, the only other value is `next`). Unlike `refresh-data.js`, this
**never wipes** `vampire_player_values` — it's a targeted
`UPDATE ... SET weekly_projection[_next]` per matched player, using Draft
Sharks' `weekly3dPts` ("3D Proj") for that week/scoring, matched onto
`vampire_player_values.player` via the same `normalizeName` alias-matching
`src/scoring.js` already uses (not a separate/forked matcher). The CSV is
append-only across re-pulls of a not-yet-played week, so this script only
trusts rows from the single most recent `pulled_at` timestamp for that
week/scoring (not each player's own latest row across all pulls) — a player
present in an earlier pull but absent from the latest one (e.g. ruled
out/inactive, so Draft Sharks stopped publishing a number for them) gets
`0` instead of a stale carry-over value from days ago. Refuses to run
(exits 1, updates nothing) if the match rate comes in under 50% — a low
rate almost always means a name-matching or CSV-shape problem, not that
many players are genuinely unranked, and partial/wrong data here is worse
than none.

Sets `weekly_projection_week` (or `weekly_projection_next_week` for the
`next` slot) on every row it updates, alongside the projection value itself
— see the next section for why. `in-season/scripts/scheduled_pull.ps1` calls
this script twice per daily run: once for the current week (slot `current`)
and once for current+1 (slot `next`, skipped once the season's last week has
already been pushed as `current`).

## Weekly projection: two rolling slots, and what "out" means (`src/scoring.js`)

Per Jared: every available week's projection should stay visible until that
week has actually passed, not just the single nearest one — so two slots are
kept pushed at once instead of one. `weekly_projection`/`weekly_projection_week`
holds the current week; `weekly_projection_next`/`weekly_projection_next_week`
holds the next one. There's still no deeper per-week history than that — once
a week passes, the daily pull shifts both slots forward (this week's `next`
becomes next visit's `current`).

`projectionForWeek(info, week)` (in `src/scoring.js`) checks both slots for a
match against the week being viewed and returns whichever one covers it (or
`undefined` if neither slot is for that week at all — e.g. paging the picker
two or more weeks ahead of a week that hasn't been pulled yet). `playerScore()`
and the roster-view render in `template.html` both go through this helper
rather than checking either column directly, so they can't drift out of sync
with each other about which weeks currently have real data. `weekHasPublishedData()`
checks whether *any* player has `week` in either slot — i.e. whether Draft
Sharks has published that week at all yet.

**A rostered starter missing from a week Draft Sharks HAS published is
treated as excluded (out, scores 0), not "unknown."** Confirmed live against
draftsharks.com/weekly-rankings/rb: Draft Sharks drops inactive/injured
players from a week's rankings table entirely rather than listing them with
a `0` — searching a live week's rankings by name for such a player returns
zero rows, not a zero-value row. So "no data for a live week" is a real
signal (they're out), not a data gap, and the UI/scoring treat it that way:
`isOut` covers both bye and this exclusion case, the lineup card hides the
now-irrelevant `3D Value` for an out player, and `teamWeekBreakdown` matches
them to the best eligible bench replacement by slot position
(`eligiblePositionsForSlot` — FLEX accepts RB/WR/TE, everything else is a
strict match). `teamWeekScore` substitutes that replacement's value in place
of the starter's 0, so the team total reflects the realistic swapped-in
lineup, not a guaranteed zero. The bench itself is scored the same
week-aware way (`scoredBench`) rather than by static `three_d_value`, so a
hot-projected backup outranks a higher-draft-value one that's cold this
week; `teamBenchTopPlayer` (the card's `BENCH`/`top bench` row) restricts
this to FLEX-eligible positions only — a backup QB is never useful here in
a 1-QB league.

## Weekly opponent (`weekly_opponent` / `weekly_opponent_next`)

Same two-slot rolling pattern as the projection columns, populated by the
same `refresh-weekly-projection.js` run (no separate script) from the
in-season CSV's `opponent` field (e.g. `"@DAL"` = away vs. Dallas, `"BUF"` =
home vs. Buffalo). `src/scoring.js`'s `opponentForWeek(info, week)` mirrors
`projectionForWeek()` exactly — same current-then-next slot check, same
`undefined` (no slot covers this week) vs. `null` (slot matched, no value)
distinction — and `playerScore()` surfaces the result as `.opponent` so both
the weekly picker's lineup tables and the Rosters tab render it without a
separate lookup path.

**Same-name collision gotcha:** the Draft Sharks CSV can contain two
different real players who share an exact name — e.g. WR Justin Jefferson
(MIN) and a linebacker also named Justin Jefferson (CLE) both appeared in the
week 2 pull. `refresh-weekly-projection.js` used to key its per-week lookup
by name alone, so whichever row came later in the CSV silently won,
overwriting the WR's ~14.5 projection with the LB's 2.3. Fixed 2026-09-16:
the script now keeps every same-normalized-name candidate row and picks the
one whose `position` matches `vampire_player_values.position` for that
player; if none match, it zeroes out that slot (logged as "ambiguous") rather
than guessing. If a known-good player's projection looks implausibly low
after a refresh, check the script's "Ambiguous name collisions" log line
first before assuming a data-quality issue upstream.

## The player-name gotcha

`rosters.csv` and the DraftSharks CSV are maintained by different pipelines
and spell the same player differently often enough to matter:
punctuation/suffix differences ("DK Metcalf" vs "D.K. Metcalf", "Michael
Pittman" vs "Michael Pittman Jr.", "Kenneth Walker" vs "Kenneth Walker III")
and real nicknames ("Cam Skattebo" vs "Cameron Skattebo").

**Do not join these two files by exact string match.** `src/name-matching.js`
exports `normalizeName()` — lowercases, strips `.`/`'`/`-`, drops
generational suffixes, then resolves a small hardcoded alias table (sourced
from `../../Draft/data/aliases.csv`'s `canonical_name` column) for nicknames
normalization alone can't fix. `src/scoring.js`'s `findPlayerInfo()` uses
this for both the weekly picker's scoring AND the Rosters tab's lookup —
both call sites must use `findPlayerInfo`, not `draftSharksData[name]`
directly, or names silently fall back to a blank/zero display again (this
exact regression happened once already — the Rosters tab was fixed after
the fact to also use it).

If a name genuinely doesn't resolve after normalization + aliases, it's a
**typo in `rosters.csv`**, not a name-matching gap — fix the source file,
don't add an alias entry for it. (Three such typos were found and fixed in
this session: "Tetoaria"→"Tetairoa" McMillan, "Mongtomery"→"Montgomery",
"Wastson"→"Watson".)

## `Draft/data/aliases.csv` (external, read-only from here)

Columns: `raw_name,raw_team,source,canonical_name`. `raw_name`+`raw_team`+
`source` is the matching key in the Draft project's own Python matching
logic (`Draft/src/matching.py`); this repo only ever reads the
`canonical_name` column values (normalized) to build the JS alias table —
it doesn't replicate the source/team-scoped lookup, just the flat nickname
mapping. If a name normalizes differently per source/team there in a way
that actually matters for the Vampire tool, that nuance is currently lost —
revisit if that ever causes a real mismatch.
