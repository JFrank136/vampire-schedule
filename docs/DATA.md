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
  `position`, `bye`, `injury_risk`, `three_d_value`, `weekly_projection`
  (nullable — populated once DraftSharks publishes in-season weekly numbers;
  scoring falls back to `three_d_value` until then). Also wholesale-replaced
  by `scripts/refresh-data.js`.
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
