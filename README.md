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

Two source files feed this tool, both maintained outside this repo:

- `../rosters.csv` — this season's rosters, one row per player
- A DraftSharks CSV export (path varies; see `docs/DATA.md`) — player values,
  bye weeks, injury risk

See `docs/DATA.md` for the full schema, the Supabase tables the app actually
reads/writes, and — importantly — the player-name mismatch problem between
these two files and how it's handled.

Refreshing this data is a repeatable process — see the `vampire-matchup-refresh`
skill rather than re-deriving the steps each time.

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

## Not yet built

A strategy.md-driven recommendation/optimizer engine (weekly-projection
margins, bye-week vulnerability scoring, 9×9 opportunity-cost optimization
for weeks 5–13, explainability) — scoped as a separate future project in
`../docs/superpowers/specs/2026-09-03-vampire-picker-v1.1-design.md`, not
started.

A side-by-side Me-vs-opponent lineup comparison view — also deferred.
