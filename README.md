# Vampire Matchup Picker

A tool for picking the Vampire's weekly opponent in Jared's fantasy football
league. Ranks the 9 other teams weakest-to-strongest by projected score,
enforces the league's Vampire scheduling rules (see `../rules.md`), flags
schedule violations (a team played twice in the weeks 5–13 window, or more
than twice all season), and tracks the season schedule. See `../strategy.md`
for the scheduling doctrine this tool is meant to eventually support (a
recommendation engine — not yet built, see "Not yet built" below).

Live at: https://jfrank136.github.io/vampire-schedule/
(repo: https://github.com/JFrank136/vampire-schedule)

No login required — it's a plain public static page. This replaced the
original Claude Artifact publish because a co-user of the tool (Jared's
brother) won't create a Claude account, and Artifacts require one to view
even when shared.

## How it's built

`build.js` concatenates the pure-logic modules in `src/*.js` (CSV parsing,
scoring, scheduling rules, name matching) into `template.html` at the
`/* LOGIC_INJECTION_POINT */` marker, producing `dist/index.html`.

```bash
npm test          # run the src/*.js test suite (node:test, no framework)
node build.js      # produce dist/index.html
```

Deployment is automatic: `.github/workflows/deploy.yml` runs the test
suite, rebuilds `dist/index.html`, and publishes it to GitHub Pages on
every push to `main`. No manual publish step. (The workflow deliberately
does **not** run `npm ci`/`npm install` — `npm test` and `build.js` need no
npm dependencies; see "Current state" below for why a dependency is even
declared in `package.json`.)

## Data

Two source files feed this tool at draft time, both maintained outside this repo:

- `../rosters.csv` — this season's rosters, one row per player
- A DraftSharks CSV export (path varies; see `docs/DATA.md`) — player values,
  bye weeks, injury risk

See `docs/DATA.md` for the full schema, the Supabase tables the app actually
reads/writes, and — importantly — the player-name mismatch problem between
these two files and how it's handled.

Refreshing this data is a repeatable process — see the "Matchup Tool" section
of `INSTRUCTIONS.md` at the Vampire project root rather than re-deriving the
steps each time (there is no separate `vampire-matchup-refresh` skill,
despite this file previously referencing one).

Once the season starts, `scripts/refresh-weekly-projection.js` separately
keeps two rolling projection slots current (current week + next week, see
"Current state" below) from the sibling `../../in-season/` project's weekly
Draft Sharks pull — see `docs/DATA.md`'s "Weekly projection refresh" section.
That project's own Windows Task Scheduler job (`FantasyInSeasonPull`) drives
this daily without a manual step; it's hardened against the wake-from-sleep
network race (connectivity gate + auto-retry + a failure email to Jared) —
see the `harden-scheduled-task` skill for the general pattern if this needs
touching again.

## Architecture note: why this uses Supabase, not a Claude Artifact

An earlier version tried moving the data layer to Supabase so data could be
refreshed with a plain script, independent of any Claude session — that
attempt was reverted because a published Claude Artifact's CSP blocks
outbound `fetch`/`XHR` calls to any host outside a small CDN allowlist, even
after successfully loading a library (like `supabase-js`) from an allowed
CDN. The library loads; its own network calls get silently blocked.

That CSP restriction only applies to Claude Artifacts. Once the tool moved
to self-hosting (GitHub Pages) to drop the Claude-account requirement, the
CSP problem disappeared for free — a self-hosted static page has no such
restriction. So the Supabase data layer came back, this time for real:
viewers read/write shared data directly from the browser (Supabase's public
anon key is embedded in the page — this is safe by Supabase's design, since
it's meant to be public; Row Level Security is intentionally left off on
these tables, a deliberate call given the low-stakes data and no-login
model). A **full roster/DraftSharks data refresh still needs a script run
locally** (`scripts/refresh-data.js`, using a service-role key kept in a
git-ignored `.env`) — day-to-day use (picking opponents, locking weeks,
browsing rosters) needs zero Claude/script involvement.

## Current state (as of this session)

- Weekly picker: card-grid layout, every opponent's full lineup visible by
  default (no click-to-expand), bye/injury-risk info always shown, fuzzy
  player-name matching against DraftSharks data.
- Rosters tab: browse any team's full lineup, one team at a time.
- Season overview: week table + meeting tally, plus a rule-violation banner
  (`findScheduleViolations` in `src/rules.js`) that flags any team scheduled
  twice in the weeks 5–13 window or more than the season max. Result/note
  columns were removed — Jared tracks those manually now. Settings
  (restricted window, max meetings, last regular season week) aren't
  editable in-app; change them via direct SQL on `vampire_settings` if a
  league rule changes.
- Schedule changes (lock-ins, schedule generation) sync live between
  simultaneous viewers via a Supabase realtime subscription on
  `vampire_schedule`. Roster/player-value/settings data loads once per page
  open — a data refresh needs a reload to show up for other viewers.
- `package.json` declares `@supabase/supabase-js` as a dependency, but only
  `scripts/refresh-data.js` (run locally by Jared) uses it — the browser
  page loads its own copy from a CDN `<script>` tag, and the test/build
  steps don't touch it. Don't add an `npm ci`/`npm install` step to CI for
  this reason (it hung for 5+ minutes on the hosted runner installing a
  dependency nothing in CI actually needs).
- `scripts/refresh-weekly-projection.js` (new this session) is the other
  Supabase-writing script alongside `refresh-data.js` — also uses
  `@supabase/supabase-js`, also local-only, also not part of CI.
- Two rolling weekly-projection slots (as of 2026-09-10): `vampire_player_values`
  keeps both the current week's and next week's numbers at once
  (`weekly_projection`/`weekly_projection_week` and
  `weekly_projection_next`/`weekly_projection_next_week`), so every available
  week's projection stays visible until that week has actually passed instead
  of only the single nearest one. `src/scoring.js`'s `projectionForWeek()` is
  the shared lookup — `playerScore()` and the roster-view render both go
  through it rather than checking either column directly. See `docs/DATA.md`.
- Each opponent's lineup card shows both `Weekly Proj.` and `3D Value` as
  separate columns (not blended into one number), plus a `Status` column: a
  starter who's on bye, or who Draft Sharks excludes from a week it HAS
  published data for (their weekly rankings drop inactive/injured players
  entirely rather than listing them at 0 — confirmed live against
  draftsharks.com), is flagged `out` and matched to the best eligible bench
  replacement by slot position (FLEX = RB/WR/TE). The card's total projected
  score substitutes that replacement's value in place of the out starter's 0.
  A `BENCH` row also shows the roster's best FLEX-eligible bench player
  (RB/WR/TE only — a backup QB isn't a usable flex), scored the same
  week-aware way. See `docs/DATA.md`'s "Weekly projection: week-scoped, and
  what 'out' means" section for the full mechanics.
- (2026-09-16) The weekly picker's "Me" card now shows the same per-player
  lineup table opponent cards do (not just the aggregate score), and every
  lineup table (Me, each opponent, and the Rosters tab) has an `Opp` column
  showing that player's real-world opponent for the week (e.g. `@DAL`) —
  see `docs/DATA.md`'s "Weekly opponent" section.
- (2026-09-16) Eligibility (`src/rules.js`) now enforces "played this team at
  most once" per season **stretch** (pre-window / restricted-window /
  post-window), not just within the restricted window — locking a team in
  weeks 1–4 now excludes them from the rest of weeks 1–4 too.
- (2026-09-16) Weekly picker defaults to a hardcoded starting week and the
  page widens on desktop (≥1100px) to fit more cards per row; mobile layout
  is unchanged. (See 2026-09-22 entry below — that default now advances
  itself weekly instead of being a fixed number.)
- (2026-09-21) No more fixed draft-time lineup assignment: `rosters.csv` is
  now just `team,player,position`, and every lineup shown anywhere (weekly
  picker cards, the Rosters tab) is picked fresh each week by projected
  value (`autoLineup`/`scoredRoster` in `src/scoring.js`) -- see
  `docs/DATA.md`'s "Auto-picked lineup" section. The Rosters tab now shows a
  `BENCH` divider between starters and bench, with the bench sorted by 3D
  Value. An ineligible opponent is fully removed from the weekly picker
  board instead of grayed out, and Ray/Sandusky (already at their season
  meeting cap, matchups locked in for good) no longer show an Unlock button.
  `vampire_settings.data_updated_at` is now stamped by both refresh scripts
  and shown on the page as "Data last updated."
- (2026-09-22) The weekly picker's `currentWeek` default (`template.html`,
  in the `state` object near the top of the injected script) no longer needs
  a manual bump each week: `.github/workflows/bump-week.yml` runs every
  Tuesday (11:00 UTC) via GitHub Actions, calls `scripts/bump-week.js` to
  increment it by one (capped at `lastRegularSeasonWeek`), and pushes the
  change to `main`, which triggers the existing `deploy.yml` the same as any
  other push. Deliberately built as native GitHub Actions automation rather
  than a Claude-scheduled task, so it keeps running independent of any
  Claude session — same reasoning as `FantasyInSeasonPull`'s Windows Task
  Scheduler job. Manual override still works the same way it always did: edit
  `currentWeek` in `template.html` directly and push.

## Not yet built

A strategy.md-driven recommendation/optimizer engine (weekly-projection
margins, bye-week vulnerability scoring, 9×9 opportunity-cost optimization
for weeks 5–13, explainability) — scoped as a separate future project in
`../docs/superpowers/specs/2026-09-03-vampire-picker-v1.1-design.md`, not
started.

(A side-by-side Me-vs-opponent lineup comparison was also listed here as
deferred — partially addressed 2026-09-16: the "Me" card now shows its own
lineup breakdown in the same grid as opponents, though it's not a literal
side-by-side single view.)
