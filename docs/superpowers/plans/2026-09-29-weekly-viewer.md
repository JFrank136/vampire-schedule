# Roster Weekly Viewer (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Rosters tab, show each team's week-by-week realistic lineup totals (current week through week 15) with best/worst weeks, expandable lineups, and a top-3-by-3D-value steal-target picker that hides that player's bye week.

**Architecture:** A new pure-logic module `src/weekly-viewer.js` builds lineups by 3D value and totals them from a new `vampire_weekly_projections` table (all DraftSharks weeks). A new script loads that table from `rankings_long.csv`. `template.html` renders the view under the roster table. Phase 2 (Free Agent page) gets its own plan afterwards, per the spec.

**Tech Stack:** Vanilla JS (UMD-style modules concatenated by `build.js` into one HTML page), Node `node:test`, Supabase (project `tdtchffawcmkvgrccjza`, tables prefixed `vampire_`, RLS off), GitHub Pages.

Spec: `docs/superpowers/specs/2026-09-29-weekly-viewer-and-free-agents-design.md`. One deviation from the spec: the new table has no `bye` column. Byes come from `vampire_player_values.bye`, which the page already loads, so a column would duplicate it.

All commands run from `matchup-tool/`. Commit directly to `main` (Jared's preference for this repo). **Never `git add` `dist/`** (gitignored build output).

---

## File Structure

- Modify `src/scoring.js`: export `STARTER_COUNTS` and `FLEX_ELIGIBLE` so the new module reuses the league's slot rules.
- Create `src/weekly-viewer.js`: `valueLineup`, `lineupTotals`, `buildWeeklyView`, `topByValue`, `rowsToWeeklyProjections`. Pure functions, no DOM.
- Modify `build.js`: add `weekly-viewer.js` to `SRC_ORDER` after `scoring.js`.
- Create `scripts/build-weekly-rows.js`: pure `buildWeeklyProjectionRows(csvRows, playerValues, scoring)`.
- Create `scripts/refresh-weekly-projections-all.js`: reads the CSV, upserts into `vampire_weekly_projections`.
- Modify `package.json`: add `refresh-weekly-all` npm script.
- Modify `template.html`: state fields, CSS, `#weekly-viewer` container, loader, renderer, click handling.
- Modify `docs/DATA.md` and `../INSTRUCTIONS.md`: document the table and command.
- Tests: `tests/weekly-viewer.test.js`, `tests/build-weekly-rows.test.js`, and a case added to `tests/scoring.test.js`.

---

### Task 1: Export slot constants from scoring.js

**Files:**
- Modify: `src/scoring.js` (export blocks near the bottom)
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/scoring.test.js`)

```js
test('exports the league slot rules for reuse', () => {
  const { STARTER_COUNTS, FLEX_ELIGIBLE } = require('../src/scoring.js');
  assert.deepEqual(STARTER_COUNTS, { QB: 1, RB: 2, WR: 2, TE: 1 });
  assert.deepEqual(FLEX_ELIGIBLE, ['RB', 'WR', 'TE']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/scoring.test.js`
Expected: FAIL (`STARTER_COUNTS` is undefined, so `deepEqual` fails).

- [ ] **Step 3: Implement.** In `src/scoring.js`, add before `if (typeof module !== 'undefined') {`:

```js
  global.STARTER_COUNTS = STARTER_COUNTS;
  global.FLEX_ELIGIBLE = FLEX_ELIGIBLE;
```

and change the `module.exports` object to include them:

```js
    module.exports = {
      playerScore, teamWeekBreakdown, teamBenchTopPlayer, teamWeekScore, findPlayerInfo,
      eligiblePositionsForSlot, weekHasPublishedData, projectionForWeek, opponentForWeek,
      autoLineup, scoredRoster, STARTER_COUNTS, FLEX_ELIGIBLE,
    };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scoring.js tests/scoring.test.js
git commit -m "Export STARTER_COUNTS and FLEX_ELIGIBLE from scoring"
```

---

### Task 2: weekly-viewer.js pure logic

**Files:**
- Create: `src/weekly-viewer.js`
- Create: `tests/weekly-viewer.test.js`
- Modify: `build.js:5-14`

Data shapes used throughout:
- `playerInfo`: `{ [player]: { bye, threeDValue, ... } }` (same as `state.draftsharks`).
- `projections`: `{ [player]: { [week]: { floor, proj, ceiling, opponent } } }`.
- `teamPlayers`: `[{ player, position }]`.

- [ ] **Step 1: Write the failing tests** — create `tests/weekly-viewer.test.js`:

```js
// matchup-tool/tests/weekly-viewer.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  valueLineup, lineupTotals, buildWeeklyView, topByValue, rowsToWeeklyProjections,
} = require('../src/weekly-viewer.js');

const TEAM = [
  { player: 'Q1', position: 'QB' },
  { player: 'R1', position: 'RB' }, { player: 'R2', position: 'RB' }, { player: 'R3', position: 'RB' },
  { player: 'W1', position: 'WR' }, { player: 'W2', position: 'WR' }, { player: 'W3', position: 'WR' },
  { player: 'T1', position: 'TE' },
];
const INFO = {
  Q1: { bye: 9, threeDValue: 50 },
  R1: { bye: 3, threeDValue: 90 },
  R2: { bye: 9, threeDValue: 80 },
  R3: { bye: 9, threeDValue: 70 },
  W1: { bye: 9, threeDValue: 60 },
  W2: { bye: 9, threeDValue: 55 },
  W3: { bye: 9, threeDValue: 40 },
  T1: { bye: 9, threeDValue: 30 },
};

// Every player: floor 5 / proj 10 / ceiling 15 in weeks 1-3, except
// R1 proj 20 in week 2 and W3 proj 4 in week 3.
function makeProjections() {
  const out = {};
  for (const { player } of TEAM) {
    out[player] = {};
    for (const week of [1, 2, 3]) out[player][week] = { floor: 5, proj: 10, ceiling: 15, opponent: 'BUF' };
  }
  out.R1[2].proj = 20;
  out.W3[3].proj = 4;
  return out;
}

const slotsOf = (starters) => starters.map((s) => s.slot + ':' + s.player);

test('valueLineup fills slots by 3D value only, FLEX from the best leftover RB/WR/TE', () => {
  const starters = valueLineup(TEAM, INFO, 1);
  assert.deepEqual(slotsOf(starters), [
    'QB:Q1', 'RB1:R1', 'RB2:R2', 'WR1:W1', 'WR2:W2', 'TE:T1', 'FLEX:R3',
  ]);
});

test('valueLineup skips a player on bye that week', () => {
  const starters = valueLineup(TEAM, INFO, 3); // R1 is on bye in week 3
  assert.deepEqual(slotsOf(starters), [
    'QB:Q1', 'RB1:R2', 'RB2:R3', 'WR1:W1', 'WR2:W2', 'TE:T1', 'FLEX:W3',
  ]);
});

test('valueLineup leaves a slot empty rather than crashing when a position has no players', () => {
  const starters = valueLineup(TEAM.filter((p) => p.position !== 'TE'), INFO, 1);
  assert.equal(starters.some((s) => s.slot === 'TE'), false);
});

test('valueLineup puts players with no 3D value last', () => {
  const team = [{ player: 'A', position: 'RB' }, { player: 'B', position: 'RB' }, { player: 'C', position: 'RB' }];
  const info = { A: { bye: 9, threeDValue: null }, B: { bye: 9, threeDValue: 10 }, C: { bye: 9, threeDValue: 20 } };
  assert.deepEqual(slotsOf(valueLineup(team, info, 1)), ['RB1:C', 'RB2:B', 'FLEX:A']);
});

test('lineupTotals sums floor/proj/ceiling and counts players with no projection row', () => {
  const projections = makeProjections();
  delete projections.T1[1];
  const starters = valueLineup(TEAM, INFO, 1);
  const totals = lineupTotals(starters, projections, 1);
  assert.equal(totals.proj, 60); // 6 of 7 starters have a row
  assert.equal(totals.floor, 30);
  assert.equal(totals.ceiling, 90);
  assert.equal(totals.missing, 1);
  const te = totals.rows.find((r) => r.player === 'T1');
  assert.equal(te.proj, null);
});

test('buildWeeklyView returns one entry per week with best and worst by DS proj total', () => {
  const view = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 1, endWeek: 3 });
  assert.deepEqual(view.weeks.map((w) => [w.week, w.proj]), [[1, 70], [2, 80], [3, 64]]);
  assert.equal(view.bestWeek, 2);
  assert.equal(view.worstWeek, 3);
});

test('buildWeeklyView drops the steal target\'s bye week and recomputes best/worst', () => {
  const view = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 1, endWeek: 3, stealTarget: 'R1' });
  assert.deepEqual(view.weeks.map((w) => w.week), [1, 2]);
  assert.equal(view.bestWeek, 2);
  assert.equal(view.worstWeek, 1);
});

test('buildWeeklyView with a single week has a best week but no worst week', () => {
  const view = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 2, endWeek: 2 });
  assert.equal(view.bestWeek, 2);
  assert.equal(view.worstWeek, null);
});

test('buildWeeklyView is empty when startWeek is past endWeek', () => {
  const view = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 16, endWeek: 15 });
  assert.deepEqual(view.weeks, []);
  assert.equal(view.bestWeek, null);
});

test('topByValue returns the top 3 by 3D value, skipping players with no value', () => {
  const info = { ...INFO, Q1: { bye: 9, threeDValue: null } };
  assert.deepEqual(topByValue(TEAM, info).map((p) => p.player), ['R1', 'R2', 'R3']);
  assert.deepEqual(topByValue(TEAM, info, 2).map((p) => p.player), ['R1', 'R2']);
});

test('rowsToWeeklyProjections nests DB rows by player then week', () => {
  const nested = rowsToWeeklyProjections([
    { player: 'A', week: 4, floor_proj: 1.5, ds_proj: 2.5, ceiling_proj: 3.5, opponent: '@DAL' },
    { player: 'A', week: 5, floor_proj: null, ds_proj: 6, ceiling_proj: null, opponent: null },
  ]);
  assert.deepEqual(nested.A[4], { floor: 1.5, proj: 2.5, ceiling: 3.5, opponent: '@DAL' });
  assert.deepEqual(nested.A[5], { floor: null, proj: 6, ceiling: null, opponent: null });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/weekly-viewer.test.js`
Expected: FAIL with "Cannot find module '../src/weekly-viewer.js'".

- [ ] **Step 3: Implement** — create `src/weekly-viewer.js`:

```js
// matchup-tool/src/weekly-viewer.js
//
// Pure logic for the Rosters tab "weekly viewer": what a team's realistic
// lineup looks like each week, and its floor / DS projection / ceiling totals.
//
// The lineup is built from 3D value ONLY (a proxy for who the opponent
// realistically starts) -- deliberately different from autoLineup in
// scoring.js, which ranks by weekly projection. Projections are used only to
// score the lineup once it's chosen.
(function (global) {
  const scoring = typeof module !== 'undefined' ? require('./scoring.js') : global;
  const STARTER_COUNTS = scoring.STARTER_COUNTS;
  const FLEX_ELIGIBLE = scoring.FLEX_ELIGIBLE;

  // Highest 3D value first; a player with no 3D value sorts last. Name is the
  // tiebreak so lineups are deterministic.
  function byThreeDDescending(a, b) {
    const av = a.threeDValue == null ? -Infinity : a.threeDValue;
    const bv = b.threeDValue == null ? -Infinity : b.threeDValue;
    if (bv !== av) return bv > av ? 1 : -1;
    return a.player < b.player ? -1 : a.player > b.player ? 1 : 0;
  }

  function threeDOf(playerInfo, player) {
    const info = playerInfo[player];
    return info && info.threeDValue != null ? info.threeDValue : null;
  }

  function valueLineup(teamPlayers, playerInfo, week) {
    const candidates = teamPlayers
      .filter((p) => !(playerInfo[p.player] && playerInfo[p.player].bye === week))
      .map((p) => ({ player: p.player, position: p.position, threeDValue: threeDOf(playerInfo, p.player) }));

    const used = new Set();
    const starters = [];
    for (const position of Object.keys(STARTER_COUNTS)) {
      const count = STARTER_COUNTS[position];
      candidates
        .filter((p) => p.position === position)
        .sort(byThreeDDescending)
        .slice(0, count)
        .forEach((p, i) => {
          used.add(p.player);
          starters.push({ ...p, slot: count > 1 ? position + (i + 1) : position });
        });
    }
    const flex = candidates
      .filter((p) => FLEX_ELIGIBLE.includes(p.position) && !used.has(p.player))
      .sort(byThreeDDescending)[0];
    if (flex) starters.push({ ...flex, slot: 'FLEX' });
    return starters;
  }

  // Scores a chosen lineup for one week. A starter with no projection row for
  // that week contributes 0 and is counted in `missing` so the UI can flag it.
  function lineupTotals(starters, projections, week) {
    let floor = 0; let proj = 0; let ceiling = 0; let missing = 0;
    const rows = starters.map((s) => {
      const p = projections[s.player] && projections[s.player][week];
      if (!p) {
        missing += 1;
        return { ...s, floor: null, proj: null, ceiling: null, opponent: null };
      }
      floor += p.floor || 0;
      proj += p.proj || 0;
      ceiling += p.ceiling || 0;
      return { ...s, floor: p.floor, proj: p.proj, ceiling: p.ceiling, opponent: p.opponent };
    });
    return { floor, proj, ceiling, missing, rows };
  }

  // Best week = highest DS proj lineup total, worst = lowest (first week wins
  // ties). With a stealTarget, weeks where that player is on bye are dropped
  // first (you can only steal a player who starts), so best/worst are over
  // the remaining weeks only.
  function buildWeeklyView(teamPlayers, playerInfo, projections, options) {
    const { startWeek, endWeek, stealTarget } = options;
    const stealBye = stealTarget && playerInfo[stealTarget] ? playerInfo[stealTarget].bye : null;
    const weeks = [];
    for (let week = startWeek; week <= endWeek; week += 1) {
      if (stealBye != null && stealBye === week) continue;
      const starters = valueLineup(teamPlayers, playerInfo, week);
      weeks.push({ week, ...lineupTotals(starters, projections, week) });
    }
    let best = null; let worst = null;
    for (const w of weeks) {
      if (best === null || w.proj > best.proj) best = w;
      if (worst === null || w.proj < worst.proj) worst = w;
    }
    return {
      weeks,
      bestWeek: best ? best.week : null,
      worstWeek: weeks.length >= 2 && worst ? worst.week : null,
    };
  }

  function topByValue(teamPlayers, playerInfo, count) {
    const n = count == null ? 3 : count;
    return teamPlayers
      .map((p) => ({ player: p.player, position: p.position, threeDValue: threeDOf(playerInfo, p.player) }))
      .filter((p) => p.threeDValue != null)
      .sort(byThreeDDescending)
      .slice(0, n);
  }

  function rowsToWeeklyProjections(rows) {
    const out = {};
    for (const row of rows) {
      if (!out[row.player]) out[row.player] = {};
      out[row.player][row.week] = {
        floor: row.floor_proj, proj: row.ds_proj, ceiling: row.ceiling_proj, opponent: row.opponent,
      };
    }
    return out;
  }

  global.valueLineup = valueLineup;
  global.lineupTotals = lineupTotals;
  global.buildWeeklyView = buildWeeklyView;
  global.topByValue = topByValue;
  global.rowsToWeeklyProjections = rowsToWeeklyProjections;
  if (typeof module !== 'undefined') {
    module.exports = { valueLineup, lineupTotals, buildWeeklyView, topByValue, rowsToWeeklyProjections };
  }
})(typeof window !== 'undefined' ? window : global);
```

- [ ] **Step 4: Register the module in the build.** In `build.js`, change `SRC_ORDER` so `'weekly-viewer.js'` follows `'scoring.js'`:

```js
  'scoring.js',
  'weekly-viewer.js',
  'rules.js',
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: all tests PASS, including the 10 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/weekly-viewer.js tests/weekly-viewer.test.js build.js
git commit -m "Add weekly-viewer lineup and totals logic"
```

---

### Task 3: buildWeeklyProjectionRows (CSV to table rows)

**Files:**
- Create: `scripts/build-weekly-rows.js`
- Create: `tests/build-weekly-rows.test.js`

- [ ] **Step 1: Write the failing tests** — create `tests/build-weekly-rows.test.js`:

```js
// matchup-tool/tests/build-weekly-rows.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWeeklyProjectionRows } = require('../scripts/build-weekly-rows.js');

function csvRow(overrides) {
  return {
    source: 'draftsharks', scoring: 'half-ppr', week: '5', pulled_at: '2026-09-20T00:00:00+00:00',
    player_name: 'Some Player', position: 'WR', projection: '10', floor_proj: '5', ceiling_proj: '16', opponent: 'BUF',
    ...overrides,
  };
}
const PLAYER_VALUES = [
  { player: 'Alpha Back', position: 'RB' },
  { player: 'Justin Jefferson', position: 'WR' },
];

test('maps matched players to weekly rows with numeric fields', () => {
  const { rows } = buildWeeklyProjectionRows(
    [csvRow({ player_name: 'Alpha Back', position: 'RB', projection: '12.5', floor_proj: '7', ceiling_proj: '20.1', opponent: '@DAL' })],
    PLAYER_VALUES
  );
  assert.deepEqual(rows, [
    { player: 'Alpha Back', week: 5, floor_proj: 7, ds_proj: 12.5, ceiling_proj: 20.1, opponent: '@DAL' },
  ]);
});

test('ignores other sources and other scoring formats', () => {
  const { rows } = buildWeeklyProjectionRows([
    csvRow({ player_name: 'Alpha Back', source: 'boone' }),
    csvRow({ player_name: 'Alpha Back', scoring: 'ppr' }),
  ], PLAYER_VALUES);
  assert.deepEqual(rows, []);
});

test('only the most recent pull of each week counts', () => {
  const { rows } = buildWeeklyProjectionRows([
    csvRow({ player_name: 'Alpha Back', projection: '1', pulled_at: '2026-09-10T00:00:00+00:00' }),
    csvRow({ player_name: 'Alpha Back', projection: '9', pulled_at: '2026-09-20T00:00:00+00:00' }),
  ], PLAYER_VALUES);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ds_proj, 9);
});

test('a player absent from the latest pull of a week gets no row that week', () => {
  const { rows } = buildWeeklyProjectionRows([
    csvRow({ player_name: 'Alpha Back', week: '5', pulled_at: '2026-09-20T00:00:00+00:00' }),
    csvRow({ player_name: 'Alpha Back', week: '6', pulled_at: '2026-09-20T00:00:00+00:00' }),
    csvRow({ player_name: 'Someone Else', week: '6', pulled_at: '2026-09-21T00:00:00+00:00' }),
  ], PLAYER_VALUES);
  assert.deepEqual(rows.map((r) => r.week), [5]);
});

test('same-name collision is resolved by position', () => {
  const { rows } = buildWeeklyProjectionRows([
    csvRow({ player_name: 'Justin Jefferson', position: 'LB', projection: '1' }),
    csvRow({ player_name: 'Justin Jefferson', position: 'WR', projection: '18' }),
  ], PLAYER_VALUES);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ds_proj, 18);
});

test('same-name collision with no position match writes nothing and is reported', () => {
  const { rows, ambiguous } = buildWeeklyProjectionRows([
    csvRow({ player_name: 'Justin Jefferson', position: 'LB', projection: '1' }),
    csvRow({ player_name: 'Justin Jefferson', position: 'S', projection: '2' }),
  ], PLAYER_VALUES);
  assert.deepEqual(rows, []);
  assert.deepEqual(ambiguous, ['Justin Jefferson']);
});

test('blank floor/ceiling become null, not 0', () => {
  const { rows } = buildWeeklyProjectionRows(
    [csvRow({ player_name: 'Alpha Back', position: 'RB', floor_proj: '', ceiling_proj: '' })],
    PLAYER_VALUES
  );
  assert.equal(rows[0].floor_proj, null);
  assert.equal(rows[0].ceiling_proj, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/build-weekly-rows.test.js`
Expected: FAIL with "Cannot find module '../scripts/build-weekly-rows.js'".

- [ ] **Step 3: Implement** — create `scripts/build-weekly-rows.js`:

```js
// scripts/build-weekly-rows.js
//
// Pure: turns the in-season rankings_long.csv rows (already parsed) into
// vampire_weekly_projections rows for every week in the file. Same rules as
// refresh-weekly-projection.js: Draft Sharks only, one scoring format, only
// the newest pull of each week counts, and same-name players are
// disambiguated by position (an unresolved collision writes no row).
const { normalizeName } = require('../src/name-matching.js');

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function buildWeeklyProjectionRows(csvRows, playerValues, scoring) {
  const format = scoring || 'half-ppr';
  const wanted = csvRows.filter((r) => r.source === 'draftsharks' && r.scoring === format);

  const byWeek = new Map();
  for (const row of wanted) {
    const week = Number(row.week);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(row);
  }

  const rows = [];
  const ambiguous = new Set();
  for (const [week, weekRows] of byWeek) {
    const latest = weekRows.reduce((max, r) => (r.pulled_at > max ? r.pulled_at : max), '');
    const byName = new Map();
    for (const row of weekRows.filter((r) => r.pulled_at === latest)) {
      const key = normalizeName(row.player_name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(row);
    }
    for (const { player, position } of playerValues) {
      const candidates = byName.get(normalizeName(player)) || [];
      let row = null;
      if (candidates.length === 1) row = candidates[0];
      else if (candidates.length > 1) {
        row = candidates.find((c) => c.position === position) || null;
        if (!row) ambiguous.add(player);
      }
      if (!row) continue;
      rows.push({
        player,
        week,
        floor_proj: numberOrNull(row.floor_proj),
        ds_proj: numberOrNull(row.projection),
        ceiling_proj: numberOrNull(row.ceiling_proj),
        opponent: row.opponent || null,
      });
    }
  }
  rows.sort((a, b) => a.week - b.week || (a.player < b.player ? -1 : 1));
  return { rows, ambiguous: [...ambiguous] };
}

module.exports = { buildWeeklyProjectionRows };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-weekly-rows.js tests/build-weekly-rows.test.js
git commit -m "Add CSV to weekly projection rows builder"
```

---

### Task 4: Database table + refresh script

**Files:**
- Create: `scripts/refresh-weekly-projections-all.js`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create the table** using the Supabase MCP `apply_migration` tool on project `tdtchffawcmkvgrccjza`, name `create_vampire_weekly_projections`, query:

```sql
create table public.vampire_weekly_projections (
  player text not null,
  week int not null,
  floor_proj numeric,
  ds_proj numeric,
  ceiling_proj numeric,
  opponent text,
  primary key (player, week)
);
```

Match the other `vampire_` tables (RLS off). Verify with `execute_sql`: `select count(*) from vampire_weekly_projections;` returns 0, and `select relrowsecurity from pg_class where relname = 'vampire_weekly_projections';` returns `false`. If another `vampire_` table turns out to have RLS on, stop and ask Jared.

- [ ] **Step 2: Write the script** — create `scripts/refresh-weekly-projections-all.js`:

```js
// scripts/refresh-weekly-projections-all.js
//
// Loads EVERY Draft Sharks week (floor / DS proj / ceiling / opponent) from
// the in-season rankings_long.csv into vampire_weekly_projections, for the
// Rosters tab weekly viewer. Independent of the two-slot columns on
// vampire_player_values that refresh-weekly-projection.js maintains -- this
// only upserts into its own table and never deletes.
//
// Usage: node scripts/refresh-weekly-projections-all.js <rankings_long.csv> [scoring]
//   scoring defaults to "half-ppr" (this league is 0.5 PPR).
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCSV } = require('../src/csv-parser.js');
const { buildWeeklyProjectionRows } = require('./build-weekly-rows.js');

const CHUNK = 500;

async function main() {
  const [, , csvPath, scoringArg] = process.argv;
  const scoring = scoringArg || 'half-ppr';
  if (!csvPath) {
    console.error('Usage: node scripts/refresh-weekly-projections-all.js <rankings_long.csv> [scoring]');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const csvRows = parseCSV(fs.readFileSync(path.resolve(csvPath), 'utf8'));
  const supabase = createClient(url, serviceKey);
  const { data: playerValues, error: fetchError } = await supabase
    .from('vampire_player_values')
    .select('player, position');
  if (fetchError) throw fetchError;
  if (!playerValues || playerValues.length === 0) {
    console.error('Refusing to continue: vampire_player_values is empty. Run refresh-data.js first.');
    process.exit(1);
  }

  const { rows, ambiguous } = buildWeeklyProjectionRows(csvRows, playerValues, scoring);
  const matchedPlayers = new Set(rows.map((r) => r.player)).size;
  const weeks = new Set(rows.map((r) => r.week)).size;
  console.log(`Built ${rows.length} rows: ${matchedPlayers}/${playerValues.length} players across ${weeks} weeks (${scoring}).`);
  if (matchedPlayers / playerValues.length < 0.5) {
    console.error('Refusing to proceed: under 50% of players matched -- likely a name-matching or CSV-shape problem.');
    process.exit(1);
  }
  if (ambiguous.length > 0) {
    console.log(`  Same-name collisions with no position match (no rows written): ${ambiguous.join(', ')}`);
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('vampire_weekly_projections')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'player,week' });
    if (error) throw error;
  }
  console.log(`Done. Upserted ${rows.length} rows into vampire_weekly_projections.`);
}

main().catch((err) => {
  console.error('Weekly projections (all weeks) refresh failed:', err.message || err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script.** In `package.json` `scripts`, after `refresh-data`:

```json
    "refresh-data": "node --env-file=.env scripts/refresh-data.js",
    "refresh-weekly-all": "node --env-file=.env scripts/refresh-weekly-projections-all.js"
```

- [ ] **Step 4: Run it for real**

Run: `npm run refresh-weekly-all -- ../../in-season/data/processed/rankings_long.csv`
Expected: `Built N rows: X/Y players across 18 weeks (half-ppr).` with X/Y at least ~90%, then `Done. Upserted N rows`. Note any collision or low match. Do not print `.env` contents.

- [ ] **Step 5: Spot-check data.** With `execute_sql`:

```sql
select week, count(*) from vampire_weekly_projections group by week order by week;
select * from vampire_weekly_projections where player = 'Deebo Samuel' order by week limit 3;
```

Expected: rows for weeks 1-18; Deebo has floor < ds_proj < ceiling.

- [ ] **Step 6: Commit**

```bash
git add scripts/refresh-weekly-projections-all.js package.json
git commit -m "Add refresh script for all-weeks projections table"
```

---

### Task 5: Render the weekly viewer in template.html

**Files:**
- Modify: `template.html` (CSS, HTML container, state, loader, renderer, handlers)

- [ ] **Step 1: State fields.** In the `const state = { ... }` object (near line 274), add after `lineupFlags: {},`:

```js
    weeklyProjections: {},
    stealTarget: null,
    expandedWeeks: {},
```

- [ ] **Step 2: Container.** In `#panel-rosters`, after the closing `</table>` of `#roster-table`, add:

```html
    <div id="weekly-viewer"></div>
```

- [ ] **Step 3: CSS.** Add next to the other roster styles (after the `.bye`/`.badge` rules). Flat tints only, no glows or colored accent borders:

```css
  #weekly-viewer { margin-top: 2rem; }
  #weekly-viewer h3 { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 4px; }
  .weekly-note { color: var(--text-2); font-size: 12px; margin: 4px 0 10px; }
  .weekly-row { cursor: pointer; }
  .weekly-row.week-best td { background: var(--good-bg); }
  .weekly-row.week-worst td { background: var(--bad-bg); }
  .weekly-detail td { padding: 0 0 10px 0; border-bottom: 1px solid var(--border); }
  .weekly-detail table { margin: 0; }
  .week-tag { font-size: 11px; font-weight: 500; }
  .week-best .week-tag { color: var(--good); }
  .week-worst .week-tag { color: var(--bad); }
  .steal-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
  .steal-chip { font-size: 12px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
  .steal-chip[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
```

- [ ] **Step 4: Loader** (paginated: Supabase returns at most 1000 rows per request, and this table is several thousand). Add next to `loadLineupFlags`:

```js
  async function loadWeeklyProjections(supabase) {
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('vampire_weekly_projections')
        .select('*')
        .order('player').order('week')
        .range(from, from + PAGE - 1);
      if (error) return error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    state.weeklyProjections = rowsToWeeklyProjections(rows);
    return null;
  }
```

and in `init()`, add `loadWeeklyProjections(supabase),` to the `Promise.all` list (after `loadLineupFlags(supabase),`).

- [ ] **Step 5: Renderer.** Add above `renderRosters`:

```js
  // Playoff weeks (16+) can't be chosen as matchups, so the viewer stops here.
  const WEEKLY_VIEW_LAST_WEEK = 15;

  function fmt1(value) { return value == null ? '—' : Number(value).toFixed(1); }

  function weeklyDetailHTML(week) {
    const body = week.rows.map((r) => (
      '<tr>'
      + '<td>' + esc(r.slot) + '</td>'
      + '<td>' + esc(r.player) + '</td>'
      + '<td>' + (r.opponent ? esc(r.opponent) : '—') + '</td>'
      + '<td>' + fmt1(r.floor) + '</td>'
      + '<td>' + fmt1(r.proj) + '</td>'
      + '<td>' + fmt1(r.ceiling) + '</td>'
      + '<td>' + (r.threeDValue != null ? r.threeDValue.toFixed(1) : '—') + '</td>'
      + '</tr>'
    )).join('');
    return '<tr class="weekly-detail"><td colspan="5">'
      + '<table class="card-lineup"><thead><tr><th>Slot</th><th>Player</th><th>Opp</th><th>Floor</th><th>DS Proj</th><th>Ceiling</th><th>3D Value</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table></td></tr>';
  }

  function renderWeeklyViewer(players) {
    const el = $('weekly-viewer');
    if (state.currentWeek > WEEKLY_VIEW_LAST_WEEK) {
      el.innerHTML = '<p class="weekly-note">No weeks left to show — matchups end after week ' + WEEKLY_VIEW_LAST_WEEK + '.</p>';
      return;
    }
    const view = buildWeeklyView(players, state.draftsharks, state.weeklyProjections, {
      startWeek: state.currentWeek, endWeek: WEEKLY_VIEW_LAST_WEEK, stealTarget: state.stealTarget,
    });
    const noData = view.weeks.length > 0 && view.weeks.every((w) => w.missing === w.rows.length);
    const rowsHTML = view.weeks.map((w) => {
      const cls = 'weekly-row' + (w.week === view.bestWeek ? ' week-best' : '') + (w.week === view.worstWeek ? ' week-worst' : '');
      const tag = w.week === view.bestWeek ? 'Best' : (w.week === view.worstWeek ? 'Worst' : '');
      const warn = w.missing > 0 ? ' <span class="bye" title="' + w.missing + ' starter(s) have no projection">(' + w.missing + ' missing)</span>' : '';
      return '<tr class="' + cls + '" data-week="' + w.week + '">'
        + '<td>Week ' + w.week + warn + '</td>'
        + '<td>' + w.floor.toFixed(1) + '</td>'
        + '<td>' + w.proj.toFixed(1) + '</td>'
        + '<td>' + w.ceiling.toFixed(1) + '</td>'
        + '<td class="week-tag">' + tag + '</td></tr>'
        + (state.expandedWeeks[w.week] ? weeklyDetailHTML(w) : '');
    }).join('');

    const chips = topByValue(players, state.draftsharks).map((p) => (
      '<button class="steal-chip" data-player="' + esc(p.player) + '" aria-pressed="' + (state.stealTarget === p.player) + '">'
      + esc(p.player) + ' (' + p.threeDValue.toFixed(0) + ')</button>'
    )).join('');

    el.innerHTML = '<h3>Weekly lineups (weeks ' + state.currentWeek + '–' + WEEKLY_VIEW_LAST_WEEK + ')</h3>'
      + '<p class="weekly-note">Lineups are built from 3D value (who they would realistically start) and scored with DraftSharks projections. Click a week to see the lineup.</p>'
      + (noData ? '<p class="weekly-note">No weekly projections loaded yet — run <code>npm run refresh-weekly-all</code>.</p>' : '')
      + '<table id="weekly-table"><thead><tr><th>Week</th><th>Floor</th><th>DS Proj</th><th>Ceiling</th><th></th></tr></thead><tbody>' + rowsHTML + '</tbody></table>'
      + (chips
        ? '<p class="weekly-note" style="margin-top:14px">Top 3D value players — pick a steal target to hide the week they are on bye:</p><div class="steal-chips">' + chips + '</div>'
        : '');
  }
```

- [ ] **Step 6: Hook into renderRosters.** At the end of `renderRosters()` (after `tbody.innerHTML = ...`), add:

```js
    renderWeeklyViewer(players);
```

- [ ] **Step 7: Handlers.** In the `roster-prev` and `roster-next` click handlers, reset per-team view state before `renderRosters()`:

```js
    state.stealTarget = null;
    state.expandedWeeks = {};
```

Then add (after the `roster-next` handler) the delegated click handler:

```js
  $('weekly-viewer').addEventListener('click', (event) => {
    const chip = event.target.closest('.steal-chip');
    if (chip) {
      state.stealTarget = state.stealTarget === chip.dataset.player ? null : chip.dataset.player;
      renderRosters();
      return;
    }
    const row = event.target.closest('tr.weekly-row');
    if (row) {
      const week = Number(row.dataset.week);
      state.expandedWeeks[week] = !state.expandedWeeks[week];
      renderRosters();
    }
  });
```

- [ ] **Step 8: Build and verify in the browser.**

Run: `node build.js` (expect `Built dist/index.html`), then `npm test` (all PASS). Serve `dist/` with `preview_start` (add a `.claude/launch.json` entry if none exists, e.g. `python -m http.server` on `dist/`, and open it). Live Supabase data loads via the embedded anon key. On the Rosters tab check:
- The weekly table appears below the roster with weeks from the current week through 15, exactly one Best and one Worst tag, and no console errors (`read_console_messages`).
- Clicking a row expands a 7-row lineup with an opponent per player; clicking again collapses.
- Three chips appear; clicking one removes that player's bye week from the table (and best/worst update); clicking again restores it; switching team clears the selection.
- Dark mode (`resize_window` with `colorScheme: "dark"`) and mobile width (375) both render without horizontal page scroll. If the nested lineup table overflows on mobile, wrap the weekly tables in `overflow-x: auto`.

Take a screenshot to confirm.

- [ ] **Step 9: Commit** (not `dist/`)

```bash
git add template.html
git commit -m "Add weekly lineup viewer to Rosters tab"
```

---

### Task 6: Docs and deploy

**Files:**
- Modify: `docs/DATA.md`
- Modify: `../INSTRUCTIONS.md`

- [ ] **Step 1: DATA.md.** Next to the `vampire_player_values` bullet in the table list, add a bullet:

```md
- **`vampire_weekly_projections`** — `(player, week)` PK, `floor_proj`,
  `ds_proj`, `ceiling_proj`, `opponent`. Every Draft Sharks (half-PPR) week
  from `in-season/data/processed/rankings_long.csv`, loaded by
  `scripts/refresh-weekly-projections-all.js`. Independent of the two-slot
  `weekly_projection*` columns. Feeds the Rosters tab weekly viewer (current
  week through 15). A player absent from a week's latest pull has no row for
  it, which the page shows as "(N missing)".
```

- [ ] **Step 2: INSTRUCTIONS.md** (Vampire root, Matchup Tool section). After the "Update rosters" step 3, add a step 4 explaining that the Rosters tab weekly viewer data needs refreshing after a roster change or a new weekly pull, with this command:

```bash
cd "C:\Users\jmfra\OneDrive\Documents\Fantasy Football\Vampire\matchup-tool"
npm run refresh-weekly-all -- ../../in-season/data/processed/rankings_long.csv
```

- [ ] **Step 3: Commit and push** (deploys via GitHub Actions on push to `main`)

```bash
git add docs/DATA.md
git commit -m "Document vampire_weekly_projections"
git push origin main
```

`../INSTRUCTIONS.md` is outside this repo (the Vampire root is not a git repo); it is saved in place by the edit.

- [ ] **Step 4: Confirm the deploy.** Watch the GitHub Actions run for the push, then load https://jfrank136.github.io/vampire-schedule/, open Rosters, and confirm the weekly viewer shows.

---

## Self-review notes

- Spec coverage: weeks current-15 (T2 options + T5 constant); 3D-only lineup (T2 `valueLineup`); best/worst by DS proj (T2); expandable rows (T5); steal picker hiding the bye week and recomputing (T2/T5); new table + script (T3/T4); missing-data flag (T2/T5); docs (T6). The Free Agent page is Phase 2 (separate plan).
- Follow-up outside this plan: `in-season/scripts/scheduled_pull.ps1` does not yet call `refresh-weekly-all`, so the all-weeks table refreshes manually until that call is added after the existing slot refresh loop.
