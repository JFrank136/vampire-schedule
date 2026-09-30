# Free Agent Page (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Free agents" tab that shows Jared's current starting lineup, then a table of FLEX-position (RB/WR/TE) players (his own plus the Free Agents team from `rosters.csv`) with this week's floor/DS/ceiling and ROS numbers, where he can Add/Drop players and edit the starting lineup as a what-if scratchpad.

**Architecture:** New pure module `src/free-agents.js` (what-if roster, lineup assignment/swap, table rows) tested with `node:test`. A new `vampire_ros_projections` table filled by a new script from `ros_rankings_long.csv`. `template.html` gets a new tab that renders from existing state plus the two projection tables. What-if state lives only in the browser (localStorage), never written to Supabase or the CSV.

**Tech Stack:** Vanilla JS (modules concatenated by `build.js`), Node `node:test`, Supabase (project `tdtchffawcmkvgrccjza`, tables prefixed `vampire_`, RLS off), GitHub Pages.

Spec: `docs/superpowers/specs/2026-09-29-weekly-viewer-and-free-agents-design.md` (Phase 2 section). Phase 1 (`src/weekly-viewer.js`, `vampire_weekly_projections`, `fmt1` and `rowsToWeeklyProjections` in the template) is already shipped; this plan reuses it.

Decisions made in this plan (the spec left them open):
- ROS columns map from `ros_rankings_long.csv` (latest pull, `draftsharks`, `half-ppr`): `projection` -> ROS DS Proj, `ceiling_proj` -> ROS Ceiling, `ds_value` -> ROS 3D Value (this is a 0-100 scale in the file; Jared's screenshot shows the same metric on an earlier pull). The table also keeps `as_of_week`.
- Starting lineup is the existing auto lineup (best legal 7 slots by this week's projection, via `autoLineup`), NOT the 3D-value lineup from Phase 1, because this is Jared's own team.
- Any Add/Drop clears a manual lineup and re-picks automatically; edit the lineup after making roster moves.
- The Free Agents team is excluded from every opponent list (picker, overview, schedule, Rosters tab).
- Players must exist in `vampire_player_values` (i.e. in the Draft project's `rankings-half-ppr.csv`, 541 players) to have projection data; others show "—".

All commands run from `matchup-tool/`. Commit directly to `main`. **Never `git add` `dist/`.** End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## File Structure

- Create `scripts/build-ros-rows.js`: pure `buildRosProjectionRows(csvRows, playerValues, scoring)`.
- Create `scripts/refresh-ros-projections.js`: reads the ROS CSV, upserts `vampire_ros_projections`.
- Modify `package.json`: `refresh-ros` npm script.
- Create `src/free-agents.js`: what-if logic, lineup assignment/swap, FLEX table rows, signature, ROS row mapping. Pure, no DOM.
- Modify `build.js`: add `free-agents.js` to `SRC_ORDER` after `weekly-viewer.js`.
- Modify `template.html`: exclude Free Agents team from opponents, new tab/panel/CSS, ROS loader (shared `fetchAll` helper), renderer, handlers, lineup editing, localStorage persistence, localhost debug hook.
- Modify `docs/DATA.md`, `../INSTRUCTIONS.md`.
- Tests: `tests/build-ros-rows.test.js`, `tests/free-agents.test.js`.

---

### Task 1: ROS projections table + refresh script

**Files:**
- Create: `scripts/build-ros-rows.js`, `tests/build-ros-rows.test.js`, `scripts/refresh-ros-projections.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests** — create `tests/build-ros-rows.test.js`:

```js
// matchup-tool/tests/build-ros-rows.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRosProjectionRows } = require('../scripts/build-ros-rows.js');

function csvRow(overrides) {
  return {
    source: 'draftsharks', scoring: 'half-ppr', pulled_at: '2026-09-29T20:00:00+00:00', as_of_week: '4',
    player_name: 'Alpha Back', position: 'RB', projection: '12.5', ceiling_proj: '18.1', ds_value: '33',
    ...overrides,
  };
}
const PLAYER_VALUES = [
  { player: 'Alpha Back', position: 'RB' },
  { player: 'Justin Jefferson', position: 'WR' },
];

test('maps projection, ceiling_proj and ds_value to ROS columns', () => {
  const { rows } = buildRosProjectionRows([csvRow({})], PLAYER_VALUES);
  assert.deepEqual(rows, [
    { player: 'Alpha Back', ros_ds_proj: 12.5, ros_ceiling_proj: 18.1, ros_3d_value: 33, as_of_week: 4 },
  ]);
});

test('ignores other sources and scoring formats', () => {
  const { rows } = buildRosProjectionRows([
    csvRow({ source: 'boone' }), csvRow({ scoring: 'ppr' }),
  ], PLAYER_VALUES);
  assert.deepEqual(rows, []);
});

test('only the most recent pull counts, so a player missing from it gets no row', () => {
  const { rows } = buildRosProjectionRows([
    csvRow({ pulled_at: '2026-09-18T00:00:00+00:00', projection: '1' }),
    csvRow({ pulled_at: '2026-09-29T20:00:00+00:00', player_name: 'Someone Else' }),
  ], PLAYER_VALUES);
  assert.deepEqual(rows, []);
});

test('same-name collision resolved by position; unresolved one is reported', () => {
  const resolved = buildRosProjectionRows([
    csvRow({ player_name: 'Justin Jefferson', position: 'LB', projection: '1' }),
    csvRow({ player_name: 'Justin Jefferson', position: 'WR', projection: '17' }),
  ], PLAYER_VALUES);
  assert.equal(resolved.rows.length, 1);
  assert.equal(resolved.rows[0].ros_ds_proj, 17);

  const unresolved = buildRosProjectionRows([
    csvRow({ player_name: 'Justin Jefferson', position: 'LB' }),
    csvRow({ player_name: 'Justin Jefferson', position: 'S' }),
  ], PLAYER_VALUES);
  assert.deepEqual(unresolved.rows, []);
  assert.deepEqual(unresolved.ambiguous, ['Justin Jefferson']);
});

test('blank numeric fields become null, not 0', () => {
  const { rows } = buildRosProjectionRows([csvRow({ ceiling_proj: '', ds_value: '' })], PLAYER_VALUES);
  assert.equal(rows[0].ros_ceiling_proj, null);
  assert.equal(rows[0].ros_3d_value, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/build-ros-rows.test.js`
Expected: FAIL with "Cannot find module '../scripts/build-ros-rows.js'".

- [ ] **Step 3: Implement** — create `scripts/build-ros-rows.js`:

```js
// scripts/build-ros-rows.js
//
// Pure: turns in-season ros_rankings_long.csv rows (already parsed) into
// vampire_ros_projections rows. Draft Sharks only, one scoring format, and
// only the newest pull counts (the CSV is append-only, so older pulls are
// stale). Same-name players are disambiguated by position; an unresolved
// collision writes no row.
const { normalizeName } = require('../src/name-matching.js');

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function buildRosProjectionRows(csvRows, playerValues, scoring) {
  const format = scoring || 'half-ppr';
  const wanted = csvRows.filter((r) => r.source === 'draftsharks' && r.scoring === format);
  const latest = wanted.reduce((max, r) => (r.pulled_at > max ? r.pulled_at : max), '');
  const byName = new Map();
  for (const row of wanted.filter((r) => r.pulled_at === latest)) {
    const key = normalizeName(row.player_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  const rows = [];
  const ambiguous = [];
  for (const { player, position } of playerValues) {
    const candidates = byName.get(normalizeName(player)) || [];
    let row = null;
    if (candidates.length === 1) row = candidates[0];
    else if (candidates.length > 1) {
      row = candidates.find((c) => c.position === position) || null;
      if (!row) ambiguous.push(player);
    }
    if (!row) continue;
    rows.push({
      player,
      ros_ds_proj: numberOrNull(row.projection),
      ros_ceiling_proj: numberOrNull(row.ceiling_proj),
      ros_3d_value: numberOrNull(row.ds_value),
      as_of_week: numberOrNull(row.as_of_week),
    });
  }
  return { rows, ambiguous };
}

module.exports = { buildRosProjectionRows };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Create the table** with the Supabase MCP `apply_migration` tool (load its schema with ToolSearch first if deferred), project `tdtchffawcmkvgrccjza`, name `create_vampire_ros_projections`:

```sql
create table public.vampire_ros_projections (
  player text primary key,
  ros_ds_proj numeric,
  ros_ceiling_proj numeric,
  ros_3d_value numeric,
  as_of_week int
);
```

RLS stays off (matches every other `vampire_` table).

- [ ] **Step 6: Write the script** — create `scripts/refresh-ros-projections.js`:

```js
// scripts/refresh-ros-projections.js
//
// Loads the latest Draft Sharks rest-of-season numbers (ROS DS proj, ROS
// ceiling, ROS 3D value) from the in-season ros_rankings_long.csv into
// vampire_ros_projections, for the Free agents tab. Upsert only, never deletes.
//
// Usage: node scripts/refresh-ros-projections.js <ros_rankings_long.csv> [scoring]
//   scoring defaults to "half-ppr".
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCSV } = require('../src/csv-parser.js');
const { buildRosProjectionRows } = require('./build-ros-rows.js');

const CHUNK = 500;

async function main() {
  const [, , csvPath, scoringArg] = process.argv;
  const scoring = scoringArg || 'half-ppr';
  if (!csvPath) {
    console.error('Usage: node scripts/refresh-ros-projections.js <ros_rankings_long.csv> [scoring]');
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

  const { rows, ambiguous } = buildRosProjectionRows(csvRows, playerValues, scoring);
  console.log(`Built ${rows.length}/${playerValues.length} ROS rows (${scoring}).`);
  if (rows.length / playerValues.length < 0.5) {
    console.error('Refusing to proceed: under 50% of players matched -- likely a name-matching or CSV-shape problem.');
    process.exit(1);
  }
  if (ambiguous.length > 0) {
    console.log(`  Same-name collisions with no position match (no rows written): ${ambiguous.join(', ')}`);
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('vampire_ros_projections')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'player' });
    if (error) throw error;
  }
  console.log(`Done. Upserted ${rows.length} rows into vampire_ros_projections.`);
}

main().catch((err) => {
  console.error('ROS projections refresh failed:', err.message || err);
  process.exit(1);
});
```

- [ ] **Step 7: Add the npm script** in `package.json` after `refresh-weekly-all`:

```json
    "refresh-weekly-all": "node --env-file=.env scripts/refresh-weekly-projections-all.js",
    "refresh-ros": "node --env-file=.env scripts/refresh-ros-projections.js"
```

- [ ] **Step 8: Run it for real**

Run: `npm run refresh-ros -- ../../in-season/data/processed/ros_rankings_long.csv`
Expected: `Built N/541 ROS rows (half-ppr).` with N well over half (the ROS file only has players Draft Sharks currently ranks ROS, ~435, so ~80% is normal), then `Done. Upserted N rows`. Do not print `.env` contents.

- [ ] **Step 9: Spot-check with `execute_sql`:**

```sql
select count(*), max(as_of_week) from vampire_ros_projections;
select * from vampire_ros_projections where player in ('Deebo Samuel', 'Dalton Kincaid');
```

Expected: a few hundred rows, `as_of_week` matches the latest pull (4 as of writing), Deebo/Kincaid have proj ~9-11, ceiling ~14-15, value in the 20-40 range.

- [ ] **Step 10: Commit**

```bash
git add scripts/build-ros-rows.js scripts/refresh-ros-projections.js tests/build-ros-rows.test.js package.json
git commit -m "Add ROS projections table and refresh script"
```

---

### Task 2: free-agents.js pure logic

**Files:**
- Create: `src/free-agents.js`, `tests/free-agents.test.js`
- Modify: `build.js` (`SRC_ORDER`)

Data shapes:
- `whatIf`: `{ adds: string[], drops: string[], manualLineup: null | { [slot]: string|null } }`.
- `roster` / `faPool`: `[{ player, position }]`.
- `slots`: `{ QB, RB1, RB2, WR1, WR2, TE, FLEX }` mapping to a player name or `null`.
- `projections`: `{ [player]: { [week]: { floor, proj, ceiling, opponent } } }` (as in Phase 1).
- `ros`: `{ [player]: { dsProj, ceiling, value } }`.
- `playerInfo`: `state.draftsharks` shape (`bye`, `threeDValue`, `weeklyProjection`, `weeklyProjectionWeek`, ...), what `autoLineup` in `scoring.js` consumes.

- [ ] **Step 1: Write the failing tests** — create `tests/free-agents.test.js`:

```js
// matchup-tool/tests/free-agents.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FREE_AGENT_TEAM, LINEUP_SLOTS, emptyWhatIf, normalizeWhatIf, effectiveRoster, toggleRosterMove,
  lineupAssignment, swapIntoSlot, flexTableRows, rosterSignature, rowsToRos,
} = require('../src/free-agents.js');

const WEEK = 4;
const BASE = [
  { player: 'Q1', position: 'QB' },
  { player: 'R1', position: 'RB' }, { player: 'R2', position: 'RB' }, { player: 'R3', position: 'RB' },
  { player: 'W1', position: 'WR' }, { player: 'W2', position: 'WR' }, { player: 'W3', position: 'WR' },
  { player: 'T1', position: 'TE' },
];
const POOL = [
  { player: 'F1', position: 'RB' }, { player: 'F2', position: 'WR' }, { player: 'K1', position: 'K' },
];
// Weekly projection per player (week 4 published for everyone).
const PROJ = { Q1: 20, R1: 15, R2: 12, R3: 11, W1: 14, W2: 13, W3: 9, T1: 8, F1: 16, F2: 10, K1: 7 };
const INFO = {};
for (const [player, value] of Object.entries(PROJ)) {
  INFO[player] = { bye: 9, threeDValue: 10, weeklyProjection: value, weeklyProjectionWeek: WEEK };
}
const positionOf = (name) => [...BASE, ...POOL].find((p) => p.player === name).position;

test('constants', () => {
  assert.equal(FREE_AGENT_TEAM, 'Free Agents');
  assert.deepEqual(LINEUP_SLOTS, ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX']);
});

test('effectiveRoster applies adds from the pool and drops from the base roster', () => {
  const roster = effectiveRoster(BASE, POOL, { adds: ['F1'], drops: ['R3'], manualLineup: null });
  const names = roster.map((p) => p.player);
  assert.ok(names.includes('F1'));
  assert.equal(names.includes('R3'), false);
  assert.equal(roster.length, BASE.length);
});

test('effectiveRoster ignores adds that are not in the pool', () => {
  const roster = effectiveRoster(BASE, POOL, { adds: ['Nobody'], drops: [], manualLineup: null });
  assert.equal(roster.length, BASE.length);
});

test('toggleRosterMove adds a free agent, then un-adds on a second toggle', () => {
  let w = toggleRosterMove(emptyWhatIf(), 'F1', false);
  assert.deepEqual(w.adds, ['F1']);
  w = toggleRosterMove(w, 'F1', true);
  assert.deepEqual(w.adds, []);
  assert.deepEqual(w.drops, []);
});

test('toggleRosterMove drops one of my players, then re-adds on a second toggle', () => {
  let w = toggleRosterMove(emptyWhatIf(), 'R3', true);
  assert.deepEqual(w.drops, ['R3']);
  w = toggleRosterMove(w, 'R3', false);
  assert.deepEqual(w.drops, []);
  assert.deepEqual(w.adds, []);
});

test('toggleRosterMove clears any manual lineup and does not mutate its input', () => {
  const before = { adds: [], drops: [], manualLineup: { QB: 'Q1' } };
  const after = toggleRosterMove(before, 'F1', false);
  assert.equal(after.manualLineup, null);
  assert.deepEqual(before.adds, []);
});

test('normalizeWhatIf repairs junk into an empty what-if', () => {
  assert.deepEqual(normalizeWhatIf(null), emptyWhatIf());
  assert.deepEqual(normalizeWhatIf({ adds: 'x', drops: 5 }), emptyWhatIf());
  assert.deepEqual(normalizeWhatIf({ adds: ['A'], drops: ['B'], manualLineup: { QB: 'Q1' } }),
    { adds: ['A'], drops: ['B'], manualLineup: { QB: 'Q1' } });
});

test('lineupAssignment auto-picks by this week\'s projection', () => {
  const { slots, bench } = lineupAssignment(BASE, INFO, WEEK, emptyWhatIf());
  assert.deepEqual(slots, { QB: 'Q1', RB1: 'R1', RB2: 'R2', WR1: 'W1', WR2: 'W2', TE: 'T1', FLEX: 'R3' });
  assert.deepEqual(bench, ['W3']);
});

test('lineupAssignment reflects an added free agent', () => {
  const roster = effectiveRoster(BASE, POOL, { adds: ['F1'], drops: [], manualLineup: null });
  const { slots } = lineupAssignment(roster, INFO, WEEK, emptyWhatIf());
  assert.equal(slots.RB1, 'F1');
  assert.equal(slots.RB2, 'R1');
  assert.equal(slots.FLEX, 'R2');
});

test('lineupAssignment uses a manual lineup when every player in it is still on the roster', () => {
  const manual = { QB: 'Q1', RB1: 'R2', RB2: 'R1', WR1: 'W1', WR2: 'W2', TE: 'T1', FLEX: 'W3' };
  const { slots, bench } = lineupAssignment(BASE, INFO, WEEK, { adds: [], drops: [], manualLineup: manual });
  assert.deepEqual(slots, manual);
  assert.deepEqual(bench, ['R3']);
});

test('lineupAssignment falls back to auto when the manual lineup names someone off the roster', () => {
  const manual = { QB: 'Q1', RB1: 'GONE', RB2: 'R1', WR1: 'W1', WR2: 'W2', TE: 'T1', FLEX: 'W3' };
  const { slots } = lineupAssignment(BASE, INFO, WEEK, { adds: [], drops: [], manualLineup: manual });
  assert.equal(slots.RB1, 'R1');
});

const AUTO = { QB: 'Q1', RB1: 'R1', RB2: 'R2', WR1: 'W1', WR2: 'W2', TE: 'T1', FLEX: 'R3' };

test('swapIntoSlot puts a bench player in a slot; the occupant leaves the lineup', () => {
  const next = swapIntoSlot(AUTO, 'WR2', 'W3', positionOf);
  assert.equal(next.WR2, 'W3');
  assert.equal(Object.values(next).includes('W2'), false);
});

test('swapIntoSlot swaps two starters when both stay eligible', () => {
  const next = swapIntoSlot(AUTO, 'WR1', 'W2', positionOf);
  assert.equal(next.WR1, 'W2');
  assert.equal(next.WR2, 'W1');
});

test('swapIntoSlot lets a FLEX RB swap into RB1 (displaced RB goes to FLEX)', () => {
  const next = swapIntoSlot(AUTO, 'RB1', 'R3', positionOf);
  assert.equal(next.RB1, 'R3');
  assert.equal(next.FLEX, 'R1');
});

test('swapIntoSlot rejects an ineligible position or a swap that strands the displaced player', () => {
  assert.equal(swapIntoSlot(AUTO, 'WR1', 'R3', positionOf), null); // RB into a WR slot
  assert.equal(swapIntoSlot(AUTO, 'QB', 'F2', positionOf), null); // WR into QB
  // W1 into FLEX would push FLEX's R3 into WR1, which an RB can't fill
  assert.equal(swapIntoSlot(AUTO, 'FLEX', 'W1', positionOf), null);
});

test('swapIntoSlot does not mutate its input', () => {
  const copy = { ...AUTO };
  swapIntoSlot(AUTO, 'WR2', 'W3', positionOf);
  assert.deepEqual(AUTO, copy);
});

const PROJECTIONS = {
  R1: { 4: { floor: 9, proj: 15, ceiling: 20, opponent: 'BUF' } },
  R3: { 4: { floor: 5, proj: 11, ceiling: 16, opponent: 'MIA' } },
  F1: { 4: { floor: 10, proj: 16, ceiling: 21, opponent: 'DAL' } },
  F2: { 4: { floor: 4, proj: 10, ceiling: 15, opponent: 'NYJ' } },
  W1: { 4: { floor: 8, proj: 14, ceiling: 19, opponent: 'LAR' } },
};
const ROS = { F1: { dsProj: 12.1, ceiling: 17.2, value: 30 }, R1: { dsProj: 14, ceiling: 19, value: 55 } };

test('flexTableRows lists only RB/WR/TE from my base roster plus the pool, sorted by week DS proj', () => {
  const eff = effectiveRoster(BASE, POOL, emptyWhatIf());
  const rows = flexTableRows({
    base: BASE, pool: POOL, effective: eff, starters: Object.values(AUTO),
    playerInfo: { ...INFO, W2: { ...INFO.W2, bye: WEEK } }, projections: PROJECTIONS, ros: ROS, week: WEEK,
  });
  const names = rows.map((r) => r.player);
  assert.equal(names.includes('Q1'), false);
  assert.equal(names.includes('K1'), false);
  assert.equal(names.includes('F1'), true);
  // Rows with a projection first, best first; rows without one (incl. bye) last
  assert.deepEqual(names.slice(0, 5), ['F1', 'R1', 'W1', 'R3', 'F2']);
  assert.ok(rows.slice(5).every((r) => r.proj === null));
});

test('flexTableRows flags mine / starter and carries week + ROS numbers', () => {
  const eff = effectiveRoster(BASE, POOL, emptyWhatIf());
  const rows = flexTableRows({
    base: BASE, pool: POOL, effective: eff, starters: Object.values(AUTO),
    playerInfo: INFO, projections: PROJECTIONS, ros: ROS, week: WEEK,
  });
  const r1 = rows.find((r) => r.player === 'R1');
  assert.equal(r1.mine, true);
  assert.equal(r1.starter, true);
  assert.deepEqual([r1.floor, r1.proj, r1.ceiling], [9, 15, 20]);
  assert.deepEqual([r1.rosDsProj, r1.rosCeiling, r1.rosValue], [14, 19, 55]);
  const f1 = rows.find((r) => r.player === 'F1');
  assert.equal(f1.mine, false);
  assert.equal(f1.starter, false);
  const w3 = rows.find((r) => r.player === 'W3');
  assert.equal(w3.proj, null);
  assert.equal(w3.rosValue, null);
});

test('flexTableRows keeps a dropped player listed (not mine) so he can be re-added', () => {
  const what = { adds: [], drops: ['R3'], manualLineup: null };
  const eff = effectiveRoster(BASE, POOL, what);
  const rows = flexTableRows({
    base: BASE, pool: POOL, effective: eff, starters: [],
    playerInfo: INFO, projections: PROJECTIONS, ros: ROS, week: WEEK,
  });
  assert.equal(rows.find((r) => r.player === 'R3').mine, false);
});

test('flexTableRows marks a player on bye and does not duplicate a player in both lists', () => {
  const eff = effectiveRoster(BASE, [...POOL, { player: 'R1', position: 'RB' }], emptyWhatIf());
  const rows = flexTableRows({
    base: BASE, pool: [...POOL, { player: 'R1', position: 'RB' }], effective: eff, starters: [],
    playerInfo: { ...INFO, R2: { ...INFO.R2, bye: WEEK } }, projections: PROJECTIONS, ros: ROS, week: WEEK,
  });
  assert.equal(rows.filter((r) => r.player === 'R1').length, 1);
  assert.equal(rows.find((r) => r.player === 'R2').onBye, true);
});

test('rosterSignature changes when either roster changes and ignores order', () => {
  const a = rosterSignature(BASE, POOL);
  assert.equal(rosterSignature([...BASE].reverse(), POOL), a);
  assert.notEqual(rosterSignature(BASE.slice(1), POOL), a);
  assert.notEqual(rosterSignature(BASE, POOL.slice(1)), a);
});

test('rowsToRos maps DB rows by player', () => {
  const ros = rowsToRos([{ player: 'A', ros_ds_proj: 1.5, ros_ceiling_proj: 2.5, ros_3d_value: 30 }]);
  assert.deepEqual(ros.A, { dsProj: 1.5, ceiling: 2.5, value: 30 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/free-agents.test.js`
Expected: FAIL with "Cannot find module '../src/free-agents.js'".

- [ ] **Step 3: Implement** — create `src/free-agents.js`:

```js
// matchup-tool/src/free-agents.js
//
// Pure logic for the "Free agents" tab: a what-if scratchpad over Jared's
// roster (add/drop free agents, edit the starting lineup) plus the FLEX-only
// table rows. Nothing here reads or writes Supabase, the CSV, or the DOM.
(function (global) {
  const scoring = typeof module !== 'undefined' ? require('./scoring.js') : global;

  const FREE_AGENT_TEAM = 'Free Agents';
  const LINEUP_SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX'];
  const FLEX_POSITIONS = ['RB', 'WR', 'TE'];

  function slotPositions(slot) {
    return slot === 'FLEX' ? FLEX_POSITIONS : [slot.replace(/\d+$/, '')];
  }

  function emptyWhatIf() {
    return { adds: [], drops: [], manualLineup: null };
  }

  // Anything read back from localStorage goes through here: wrong shapes
  // become an empty what-if rather than crashing the page.
  function normalizeWhatIf(value) {
    if (!value || !Array.isArray(value.adds) || !Array.isArray(value.drops)) return emptyWhatIf();
    const manual = value.manualLineup && typeof value.manualLineup === 'object' && !Array.isArray(value.manualLineup)
      ? value.manualLineup : null;
    return { adds: value.adds.slice(), drops: value.drops.slice(), manualLineup: manual };
  }

  function effectiveRoster(baseRoster, faPool, whatIf) {
    const drops = new Set(whatIf.drops);
    const kept = baseRoster.filter((p) => !drops.has(p.player));
    const have = new Set(kept.map((p) => p.player));
    const added = whatIf.adds
      .map((name) => faPool.find((p) => p.player === name))
      .filter((p) => p && !have.has(p.player));
    return [...kept, ...added];
  }

  // `isMine` is whether the player is on the effective roster right now.
  // Toggling a mine player drops him (or un-adds a free agent I added);
  // toggling a non-mine player adds him (or un-drops one I dropped). Any
  // roster move clears a manual lineup so the lineup is re-picked.
  function toggleRosterMove(whatIf, player, isMine) {
    const adds = whatIf.adds.filter((n) => n !== player);
    const drops = whatIf.drops.filter((n) => n !== player);
    if (isMine) {
      if (!whatIf.adds.includes(player)) drops.push(player);
    } else if (!whatIf.drops.includes(player)) {
      adds.push(player);
    }
    return { adds, drops, manualLineup: null };
  }

  function lineupAssignment(effective, playerInfo, week, whatIf) {
    const names = new Set(effective.map((p) => p.player));
    const manual = whatIf.manualLineup;
    let slots;
    if (manual && Object.values(manual).every((n) => n == null || names.has(n))) {
      slots = {};
      for (const slot of LINEUP_SLOTS) slots[slot] = manual[slot] || null;
    } else {
      slots = {};
      for (const slot of LINEUP_SLOTS) slots[slot] = null;
      for (const s of scoring.autoLineup(effective, playerInfo, week).starters) slots[s.slot] = s.player;
    }
    const inLineup = new Set(Object.values(slots).filter(Boolean));
    const bench = effective.map((p) => p.player).filter((n) => !inLineup.has(n));
    return { slots, bench };
  }

  // Returns a new slots map with `player` in `slot`, or null if that's not a
  // legal move: the player's position must fit the slot, and if he's coming
  // from another starting slot, the player he displaces must fit THAT slot.
  function swapIntoSlot(slots, slot, player, positionOf) {
    if (!slotPositions(slot).includes(positionOf(player))) return null;
    const next = { ...slots };
    const displaced = slots[slot] || null;
    const from = LINEUP_SLOTS.find((s) => slots[s] === player);
    if (from === slot) return next;
    if (from) {
      if (displaced && !slotPositions(from).includes(positionOf(displaced))) return null;
      next[from] = displaced;
    }
    next[slot] = player;
    return next;
  }

  // FLEX-position players only (RB/WR/TE): everyone on my base roster plus
  // the Free Agents pool, each listed once. `mine` follows the what-if (a
  // player I dropped shows as not mine so he can be re-added). Sorted by this
  // week's DS proj, best first; players with no projection (bye, missing) last.
  function flexTableRows({ base, pool, effective, starters, playerInfo, projections, ros, week }) {
    const mineNames = new Set(effective.map((p) => p.player));
    const starterNames = new Set(starters);
    const seen = new Set();
    const rows = [];
    for (const { player, position } of [...base, ...pool]) {
      if (!FLEX_POSITIONS.includes(position) || seen.has(player)) continue;
      seen.add(player);
      const wk = projections[player] && projections[player][week];
      const r = ros[player];
      const info = playerInfo[player];
      rows.push({
        player,
        position,
        mine: mineNames.has(player),
        starter: starterNames.has(player),
        onBye: !!(info && info.bye === week),
        floor: wk ? wk.floor : null,
        proj: wk ? wk.proj : null,
        ceiling: wk ? wk.ceiling : null,
        rosDsProj: r ? r.dsProj : null,
        rosCeiling: r ? r.ceiling : null,
        rosValue: r ? r.value : null,
      });
    }
    rows.sort((a, b) => {
      const av = a.proj == null ? -Infinity : a.proj;
      const bv = b.proj == null ? -Infinity : b.proj;
      if (bv !== av) return bv > av ? 1 : -1;
      return a.player < b.player ? -1 : a.player > b.player ? 1 : 0;
    });
    return rows;
  }

  // Stored what-if state is only valid for the roster data it was made
  // against; when rosters.csv changes the signature changes and the stored
  // state is discarded (the CSV is the source of truth).
  function rosterSignature(base, pool) {
    const names = (list) => list.map((p) => p.player).sort().join('|');
    return names(base) + '#' + names(pool);
  }

  function rowsToRos(rows) {
    const out = {};
    for (const row of rows) {
      out[row.player] = { dsProj: row.ros_ds_proj, ceiling: row.ros_ceiling_proj, value: row.ros_3d_value };
    }
    return out;
  }

  const api = {
    FREE_AGENT_TEAM, LINEUP_SLOTS, emptyWhatIf, normalizeWhatIf, effectiveRoster, toggleRosterMove,
    lineupAssignment, swapIntoSlot, flexTableRows, rosterSignature, rowsToRos,
  };
  Object.assign(global, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : global);
```

- [ ] **Step 4: Register the module.** In `build.js`, add `'free-agents.js',` right after `'weekly-viewer.js',` in `SRC_ORDER`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: all PASS. If the ordering assertion in `flexTableRows sorted` fails, note the rows without a projection (`R2`, `W2`, `W3`, `T1`) tie on `-Infinity` and sort by name, which is why the test only checks the first five names and that the rest have `proj === null`.

- [ ] **Step 6: Commit**

```bash
git add src/free-agents.js tests/free-agents.test.js build.js
git commit -m "Add free-agents what-if lineup and table logic"
```

---

### Task 3: Free agents tab: lineup + FLEX table + Add/Drop

**Files:**
- Modify: `template.html`

Anchors (verify before editing; line numbers drift): the `.tabs` div, `#panel-rosters`, `nonVampireTeams()`, `const state = {`, `switchTab`, the `Promise.all` in `init()`, and `loadWeeklyProjections` (added in Phase 1).

- [ ] **Step 1: Exclude the Free Agents team from opponent lists.** Replace `nonVampireTeams`:

```js
  function nonVampireTeams() {
    return Object.keys(state.rosters).filter((t) => t !== 'Me' && t !== FREE_AGENT_TEAM);
  }
```

(`FREE_AGENT_TEAM` is a global from `free-agents.js`, which is concatenated before this script block.)

- [ ] **Step 2: State.** Add to `const state = { ... }` after `expandedWeeks: {},`:

```js
    rosProjections: {},
    whatIf: emptyWhatIf(),
    editingLineup: false,
```

- [ ] **Step 3: Tab button + panel.** In `.tabs`, after the Rosters button add:

```html
    <button class="tab" data-tab="freeagents">Free agents</button>
```

After the closing `</div>` of `#panel-rosters` add:

```html
  <div class="panel" id="panel-freeagents">
    <p class="weekly-note" id="fa-note"></p>
    <div id="fa-lineup"></div>
    <div id="fa-table-wrap"></div>
  </div>
```

- [ ] **Step 4: switchTab.** Add `if (name === 'freeagents') renderFreeAgents();` after the `rosters` line.

- [ ] **Step 5: CSS** (flat tints, no glows or colored accent borders; the yellow matches the highlighted rows in Jared's spreadsheet screenshot):

```css
  .fa-scroll { overflow-x: auto; }
  #fa-table tr.fa-mine td { background: var(--warn-bg); }
  #fa-table tr.fa-starter td:nth-child(2) { font-weight: 600; }
  #fa-table td.num, #fa-table th.num { text-align: right; }
  .fa-btn { font-size: 12px; padding: 3px 10px; }
  .fa-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0 12px; }
  .fa-lineup-total td { font-weight: 600; border-top: 1px solid var(--border); }
```

- [ ] **Step 6: Shared paginated fetch helper + ROS loader.** Replace the body of `loadWeeklyProjections` so it uses a shared helper, and add the ROS loader beside it:

```js
  // Supabase returns at most 1000 rows per request; page until a short page.
  async function fetchAll(supabase, table, orderColumns) {
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from(table).select('*');
      for (const column of orderColumns) query = query.order(column);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) return { error, rows: [] };
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return { error: null, rows };
  }

  async function loadWeeklyProjections(supabase) {
    const { error, rows } = await fetchAll(supabase, 'vampire_weekly_projections', ['player', 'week']);
    if (!error) state.weeklyProjections = rowsToWeeklyProjections(rows);
    return error;
  }

  async function loadRosProjections(supabase) {
    const { error, rows } = await fetchAll(supabase, 'vampire_ros_projections', ['player']);
    if (!error) state.rosProjections = rowsToRos(rows);
    return error;
  }
```

In `init()`, add `loadRosProjections(supabase),` to the `Promise.all` list, and after the `renderRosters();` call add `renderFreeAgents();`.

- [ ] **Step 7: Renderer.** Add above `renderRosters` (reuses `esc`, `fmt1`, `$`, and Phase 1's globals `lineupTotals`):

```js
  function fmt0(value) { return value == null ? '—' : String(Math.round(value)); }

  function slotPlayerCell(slot, player) {
    return player ? esc(player) : '<span class="weekly-note">— empty —</span>';
  }

  function faLineupHTML(assignment, positionOf, week) {
    const starters = LINEUP_SLOTS
      .filter((slot) => assignment.slots[slot])
      .map((slot) => ({ slot, player: assignment.slots[slot], position: positionOf(assignment.slots[slot]) }));
    const totals = lineupTotals(starters, state.weeklyProjections, week);
    const byPlayer = {};
    totals.rows.forEach((r) => { byPlayer[r.player] = r; });
    const body = LINEUP_SLOTS.map((slot) => {
      const player = assignment.slots[slot];
      const r = player ? byPlayer[player] : null;
      const info = player ? state.draftsharks[player] : null;
      const opp = r && r.opponent ? esc(r.opponent) : (info && info.bye === week ? 'BYE' : '—');
      return '<tr><td>' + esc(slot) + '</td>'
        + '<td>' + slotPlayerCell(slot, player) + '</td>'
        + '<td>' + opp + '</td>'
        + '<td class="num">' + fmt1(r && r.floor) + '</td>'
        + '<td class="num">' + fmt1(r && r.proj) + '</td>'
        + '<td class="num">' + fmt1(r && r.ceiling) + '</td></tr>';
    }).join('');
    const total = '<tr class="fa-lineup-total"><td colspan="3">Total</td>'
      + '<td class="num">' + totals.floor.toFixed(1) + '</td>'
      + '<td class="num">' + totals.proj.toFixed(1) + '</td>'
      + '<td class="num">' + totals.ceiling.toFixed(1) + '</td></tr>';
    const bench = assignment.bench.length
      ? '<p class="weekly-note">Bench: ' + assignment.bench.map(esc).join(', ') + '</p>' : '';
    return '<h3>My starting lineup (week ' + week + ')</h3>'
      + '<div class="fa-scroll"><table id="fa-lineup-table"><thead><tr><th>Slot</th><th>Player</th><th>Opp</th>'
      + '<th class="num">Floor</th><th class="num">DS Proj</th><th class="num">Ceiling</th></tr></thead><tbody>'
      + body + total + '</tbody></table></div>' + bench;
  }

  function faTableHTML(rows, week) {
    const body = rows.map((r) => {
      const cls = (r.mine ? 'fa-mine' : '') + (r.starter ? ' fa-starter' : '');
      return '<tr class="' + cls.trim() + '">'
        + '<td>' + esc(r.position) + '</td>'
        + '<td>' + esc(r.player) + (r.onBye ? ' <span class="bye">(bye)</span>' : '') + '</td>'
        + '<td class="num">' + fmt1(r.floor) + '</td>'
        + '<td class="num">' + fmt1(r.proj) + '</td>'
        + '<td class="num">' + fmt1(r.ceiling) + '</td>'
        + '<td class="num">' + fmt1(r.rosDsProj) + '</td>'
        + '<td class="num">' + fmt1(r.rosCeiling) + '</td>'
        + '<td class="num">' + fmt0(r.rosValue) + '</td>'
        + '<td><button class="fa-btn fa-move" data-player="' + esc(r.player) + '" data-mine="' + r.mine + '">'
        + (r.mine ? 'Drop' : 'Add') + '</button></td></tr>';
    }).join('');
    return '<h3>FLEX players (RB / WR / TE)</h3>'
      + '<p class="weekly-note">Highlighted rows are on my roster; bold names are in my starting lineup.</p>'
      + '<div class="fa-scroll"><table id="fa-table"><thead><tr><th>Pos</th><th>Player</th>'
      + '<th class="num">Wk ' + week + ' Floor</th><th class="num">Wk ' + week + ' DS Proj</th><th class="num">Wk ' + week + ' Ceiling</th>'
      + '<th class="num">ROS DS Proj</th><th class="num">ROS Ceiling</th><th class="num">ROS 3D Value</th><th></th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderFreeAgents() {
    const base = state.rosters.Me || [];
    const pool = state.rosters[FREE_AGENT_TEAM] || [];
    const week = state.currentWeek;
    $('fa-note').textContent = pool.length
      ? 'What-if scratchpad: nothing here changes your league or rosters.csv. Make the real moves in your league, then update rosters.csv.'
      : 'No "Free Agents" team in rosters.csv yet. Add players with team "Free Agents" to use this page.';

    const effective = effectiveRoster(base, pool, state.whatIf);
    const lookup = {};
    [...base, ...pool].forEach((p) => { lookup[p.player] = p.position; });
    const positionOf = (name) => lookup[name];
    const assignment = lineupAssignment(effective, state.draftsharks, week, state.whatIf);
    const rows = flexTableRows({
      base, pool, effective, starters: Object.values(assignment.slots).filter(Boolean),
      playerInfo: state.draftsharks, projections: state.weeklyProjections, ros: state.rosProjections, week,
    });

    const changes = state.whatIf.adds.map((n) => '+ ' + n).concat(state.whatIf.drops.map((n) => '− ' + n));
    const toolbar = '<div class="fa-toolbar">'
      + (changes.length ? '<span class="weekly-note">Changes: ' + changes.map(esc).join(', ') + '</span>' : '')
      + (changes.length || state.whatIf.manualLineup ? '<button class="fa-btn" id="fa-reset">Reset</button>' : '')
      + '</div>';

    $('fa-lineup').innerHTML = toolbar + faLineupHTML(assignment, positionOf, week);
    $('fa-table-wrap').innerHTML = faTableHTML(rows, week);
  }
```

- [ ] **Step 8: Handlers.** Add after the `weekly-viewer` click handler:

```js
  $('panel-freeagents').addEventListener('click', (event) => {
    const move = event.target.closest('.fa-move');
    if (move) {
      state.whatIf = toggleRosterMove(state.whatIf, move.dataset.player, move.dataset.mine === 'true');
      renderFreeAgents();
      return;
    }
    if (event.target.closest('#fa-reset')) {
      state.whatIf = emptyWhatIf();
      renderFreeAgents();
    }
  });
```

- [ ] **Step 9: Localhost debug hook** (lets a browser session set up a test Free Agents team without touching the shared database). Add right after `const state = { ... };`:

```js
  // Dev-only: lets a local preview seed state without writing to Supabase.
  if (location.hostname === 'localhost') window.__vampireState = state;
```

- [ ] **Step 10: Build and verify in the browser.**

Run `node build.js` and `npm test` (all PASS). Serve `dist/` locally (see `../.claude/launch.json`; if the configured server does not answer, run `python -m http.server 4174` from `dist/` in the background and stop it afterwards) and open it on localhost. The real `rosters.csv` may not have a Free Agents team yet, so seed one in the page from the console (`javascript_tool`):

```js
const S = window.__vampireState;
const owned = new Set(Object.values(S.rosters).flat().map((p) => p.player));
S.rosters['Free Agents'] = Object.entries(S.draftsharks)
  .filter(([n, i]) => ['RB', 'WR', 'TE'].includes(i.position) && !owned.has(n))
  .sort((a, b) => (b[1].threeDValue || 0) - (a[1].threeDValue || 0))
  .slice(0, 12).map(([n, i]) => ({ player: n, position: i.position }));
document.querySelector('[data-tab=freeagents]').click();
```

Check:
- The lineup table shows QB, RB1, RB2, WR1, WR2, TE, FLEX with opponents and a Total row.
- The FLEX table lists only RB/WR/TE, sorted by week DS proj; my players highlighted (yellow tint), my starters bold; ROS columns filled.
- Clicking Add on a free agent highlights him and the lineup/Total update if he cracks the lineup; the toolbar shows `+ Name` and a Reset button; clicking Drop on my own player highlights the removal; Reset restores everything.
- The Weekly picker, Rosters and Season overview tabs do not list "Free Agents" as a team (cycle the Rosters tab arrows through all teams).
- No console errors; a screenshot at desktop width, and at 375px (the table scrolls horizontally inside `.fa-scroll`, the page itself must not). Reset the viewport to desktop afterwards.

- [ ] **Step 11: Commit** (not `dist/`)

```bash
git add template.html
git commit -m "Add Free agents tab with lineup, FLEX table, add/drop what-if"
```

---

### Task 4: Lineup editing and localStorage persistence

**Files:**
- Modify: `template.html`

- [ ] **Step 1: Lineup edit mode.** Replace `slotPlayerCell` from Task 3 with a version that renders a `<select>` per slot while editing. Options are the roster players for whom `swapIntoSlot` is legal (this reuses the same rules the lineup enforces, so an illegal swap can't be picked):

```js
  function slotPlayerCell(slot, player, assignment, positionOf, roster) {
    if (!state.editingLineup) {
      return player ? esc(player) : '<span class="weekly-note">— empty —</span>';
    }
    const options = roster
      .map((p) => p.player)
      .filter((name) => name === player || swapIntoSlot(assignment.slots, slot, name, positionOf))
      .map((name) => '<option value="' + esc(name) + '"' + (name === player ? ' selected' : '') + '>' + esc(name) + '</option>')
      .join('');
    return '<select class="fa-slot" data-slot="' + esc(slot) + '">' + options + '</select>';
  }
```

Update the call in `faLineupHTML` to `slotPlayerCell(slot, player, assignment, positionOf, roster)` and change its signature to `faLineupHTML(assignment, positionOf, week, roster)`; in `renderFreeAgents` pass `effective` as the last argument. Add an Edit/Done toggle and an Auto button to the toolbar string in `renderFreeAgents`:

```js
      + '<button class="fa-btn" id="fa-edit">' + (state.editingLineup ? 'Done editing' : 'Edit lineup') + '</button>'
      + (state.whatIf.manualLineup ? '<button class="fa-btn" id="fa-auto">Auto lineup</button>' : '')
```

(place these before the Reset button expression).

- [ ] **Step 2: Handlers.** Extend the `#panel-freeagents` click handler with two branches (before the reset branch):

```js
    if (event.target.closest('#fa-edit')) {
      state.editingLineup = !state.editingLineup;
      renderFreeAgents();
      return;
    }
    if (event.target.closest('#fa-auto')) {
      state.whatIf = { ...state.whatIf, manualLineup: null };
      saveWhatIf();
      renderFreeAgents();
      return;
    }
```

and add a `change` listener after it:

```js
  $('panel-freeagents').addEventListener('change', (event) => {
    const select = event.target.closest('.fa-slot');
    if (!select) return;
    const base = state.rosters.Me || [];
    const pool = state.rosters[FREE_AGENT_TEAM] || [];
    const effective = effectiveRoster(base, pool, state.whatIf);
    const lookup = {};
    [...base, ...pool].forEach((p) => { lookup[p.player] = p.position; });
    const assignment = lineupAssignment(effective, state.draftsharks, state.currentWeek, state.whatIf);
    const next = swapIntoSlot(assignment.slots, select.dataset.slot, select.value, (n) => lookup[n]);
    if (next) {
      state.whatIf = { ...state.whatIf, manualLineup: next };
      saveWhatIf();
    }
    renderFreeAgents();
  });
```

- [ ] **Step 3: Persistence.** Add above `renderFreeAgents` (all storage access is wrapped: it can throw or be empty in private windows):

```js
  const WHATIF_KEY = 'vampire_fa_whatif';

  function currentSignature() {
    return rosterSignature(state.rosters.Me || [], state.rosters[FREE_AGENT_TEAM] || []);
  }

  function saveWhatIf() {
    try {
      localStorage.setItem(WHATIF_KEY, JSON.stringify({ sig: currentSignature(), whatIf: state.whatIf }));
    } catch (e) { /* storage unavailable: the what-if just won't survive a reload */ }
  }

  function loadWhatIf() {
    try {
      const saved = JSON.parse(localStorage.getItem(WHATIF_KEY) || 'null');
      if (saved && saved.sig === currentSignature()) return normalizeWhatIf(saved.whatIf);
    } catch (e) { /* fall through to an empty what-if */ }
    return emptyWhatIf();
  }
```

Call `saveWhatIf()` after every state change: in the `.fa-move` branch and the `#fa-reset` branch of the click handler (right after assigning `state.whatIf`). In `init()`, right after the `Promise.all` resolves (so rosters are loaded) and before `renderFreeAgents();`, add `state.whatIf = loadWhatIf();`.

- [ ] **Step 4: Build and verify in the browser.**

Run `node build.js`, `npm test`, then reload the local preview and seed the Free Agents team as in Task 3 step 10 (the signature includes the seeded team, so seed BEFORE the first Add/Drop; note that seeding after load means a reload will discard the stored what-if because the real CSV has no such team, which is the intended CSV-is-truth behavior).

Check:
- Edit lineup shows a select per slot; each list only contains legal choices (RB slots list RBs and, for RB1/RB2, the FLEX RB; no QBs in a WR slot); choosing a bench player puts him in the slot and the old occupant goes to the Bench line; Total updates; "Auto lineup" button appears and clears it.
- Choosing a starter from another slot swaps the two.
- After a manual lineup, an Add/Drop clears the manual lineup (Auto button disappears).
- Persistence: with a Free Agents team present in the real data, make an Add, reload, and confirm it is still applied; then change the roster signature (e.g. `S.rosters.Me.pop()` before reload is not possible, so instead call `localStorage.getItem('vampire_fa_whatif')` and confirm it stores `{sig, whatIf}`, then edit the stored `sig` to a wrong value and reload: the what-if must be discarded).
- Console has no errors, and with `localStorage` blocked (`Storage.prototype.setItem = () => { throw new Error('x'); }` in the console) Add/Drop still works.

- [ ] **Step 5: Commit**

```bash
git add template.html
git commit -m "Add lineup editing and localStorage persistence to Free agents tab"
```

---

### Task 5: Docs, deploy, hand-off

**Files:**
- Modify: `docs/DATA.md`, `../INSTRUCTIONS.md`

- [ ] **Step 1: DATA.md.** After the `vampire_weekly_projections` bullet, add:

```md
- **`vampire_ros_projections`** — `player` PK, `ros_ds_proj`, `ros_ceiling_proj`,
  `ros_3d_value`, `as_of_week`. The latest Draft Sharks (half-PPR) rest-of-season
  pull from `in-season/data/processed/ros_rankings_long.csv` (`projection`,
  `ceiling_proj`, `ds_value`), loaded by `scripts/refresh-ros-projections.js`
  (`npm run refresh-ros -- <csv>`). Feeds the Free agents tab. Only players in
  `vampire_player_values` get a row; ones Draft Sharks isn't ranking ROS have none
  (shown as "—").

  **Free agents tab:** a what-if scratchpad. It reads a team named `Free Agents`
  from `rosters.csv` (excluded from every opponent list via `nonVampireTeams()`)
  and shows RB/WR/TE only. Add/Drop and lineup edits live in the browser's
  localStorage (`vampire_fa_whatif`, tied to a roster signature; discarded when
  rosters change) and are never written to Supabase or the CSV. Free agents need
  to be in the Draft project's `rankings-half-ppr.csv` to have any data.
```

- [ ] **Step 2: INSTRUCTIONS.md** (Vampire root, Matchup Tool section). After step 4 of "Update rosters" add:

```md
5. Free agents tab: to change who's listed, edit the `Free Agents` team in
   `rosters.csv` (same `team,player,position` columns), then rerun step 2.
   Refresh the rest-of-season numbers whenever you want fresher ROS data:
```bash
cd "C:\Users\jmfra\OneDrive\Documents\Fantasy Football\Vampire\matchup-tool"
npm run refresh-ros -- ../../in-season/data/processed/ros_rankings_long.csv
```
```

- [ ] **Step 3: Commit and push** (deploys via GitHub Actions on push to `main`)

```bash
git add docs/DATA.md
git commit -m "Document Free agents tab and vampire_ros_projections"
git push origin main
```

`../INSTRUCTIONS.md` is outside this repo (the Vampire root is not a git repo); the edit saves in place.

- [ ] **Step 4: Confirm the deploy.** Load https://jfrank136.github.io/vampire-schedule/ and confirm the "Free agents" tab exists. Until `rosters.csv` has a `Free Agents` team it shows the "No Free Agents team" note; that is expected.

- [ ] **Step 5: Hand-off to Jared** (do not edit `rosters.csv` for him): tell him to add his free-agent candidates to `rosters.csv` as team `Free Agents` and run the "Update rosters" steps, and that the daily scheduled pull does not refresh `vampire_weekly_projections` or `vampire_ros_projections` yet (manual `refresh-weekly-all` / `refresh-ros`, until they are added to `in-season/scripts/scheduled_pull.ps1`).

---

## Self-review notes

- Spec coverage: Free Agents team in rosters.csv, excluded from opponents (T3 step 1); starting lineup at top, FLEX-only table with my players marked, Add/Drop, edit lineup (T3, T4); localStorage-only persistence, discarded on roster change (T4); week + ROS columns incl. ROS 3D Value (T1, T2, T3); no writes to Supabase/CSV (whole plan).
- Spec said "(Exact column mapping confirmed against that CSV's schema at plan time.)": confirmed as `projection` / `ceiling_proj` / `ds_value` / `as_of_week`.
- Type consistency: `whatIf` shape, `slots` keys (`LINEUP_SLOTS`), `ros` `{dsProj, ceiling, value}`, and `flexTableRows` row fields (`rosDsProj`, `rosCeiling`, `rosValue`) are used identically in T2 tests, T2 implementation, and T3/T4 renderer.
- Known limitation: ROS Ceiling "heat map" coloring from the screenshot is intentionally not included (YAGNI); can be added later.
