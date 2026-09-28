# Lineup Flag Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a click on a player's row in the Weekly picker's lineup tables cycle it through default → green (good matchup) → yellow (injury concern) → red (bad option) → default, synced live across viewers via a new Supabase table.

**Architecture:** A new pure module `src/lineup-flags.js` (built the same way as `src/rules.js`) holds the flag-cycling logic and is unit-tested with `node --test`. `template.html`'s existing render/glue code (untested, same as its other Supabase/DOM wiring) gets a `state.lineupFlags` map, a load/realtime-sync pair mirroring the existing `vampire_schedule` pattern, and a click-delegated handler on `#panel-picker`.

**Tech Stack:** Vanilla JS (no framework), `@supabase/supabase-js` v2 (realtime + upsert/delete), Node's built-in test runner (`node --test`).

---

### Task 1: `vampire_lineup_flags` pure logic module

**Files:**
- Create: `src/lineup-flags.js`
- Test: `tests/lineup-flags.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// matchup-tool/tests/lineup-flags.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { lineupFlagKey, nextLineupFlag, rowsToLineupFlags } = require('../src/lineup-flags.js');

test('lineupFlagKey joins week, team, and player', () => {
  assert.equal(lineupFlagKey(3, 'Me', 'Josh Allen'), '3:Me:Josh Allen');
});

test('nextLineupFlag cycles good -> injury -> bad -> default', () => {
  assert.equal(nextLineupFlag(null), 'good');
  assert.equal(nextLineupFlag(undefined), 'good');
  assert.equal(nextLineupFlag('good'), 'injury');
  assert.equal(nextLineupFlag('injury'), 'bad');
  assert.equal(nextLineupFlag('bad'), null);
});

test('rowsToLineupFlags keys flags by week, team, and player', () => {
  const rows = [
    { week: 3, team: 'Me', player: 'Josh Allen', flag: 'good' },
    { week: 3, team: 'Ray', player: 'Derrick Henry', flag: 'bad' },
  ];
  assert.deepEqual(rowsToLineupFlags(rows), {
    '3:Me:Josh Allen': 'good',
    '3:Ray:Derrick Henry': 'bad',
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail on the missing module**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/lineup-flags.js'`

- [ ] **Step 3: Write the module**

```javascript
// matchup-tool/src/lineup-flags.js
(function (global) {
  const LINEUP_FLAG_ORDER = ['good', 'injury', 'bad'];

  function lineupFlagKey(week, team, player) {
    return week + ':' + team + ':' + player;
  }

  // null/undefined (default, unflagged) -> 'good' -> 'injury' -> 'bad' -> null.
  function nextLineupFlag(current) {
    if (!current) return LINEUP_FLAG_ORDER[0];
    const index = LINEUP_FLAG_ORDER.indexOf(current);
    if (index === -1 || index === LINEUP_FLAG_ORDER.length - 1) return null;
    return LINEUP_FLAG_ORDER[index + 1];
  }

  function rowsToLineupFlags(rows) {
    const flags = {};
    for (const row of rows) {
      flags[lineupFlagKey(row.week, row.team, row.player)] = row.flag;
    }
    return flags;
  }

  global.lineupFlagKey = lineupFlagKey;
  global.nextLineupFlag = nextLineupFlag;
  global.rowsToLineupFlags = rowsToLineupFlags;
  if (typeof module !== 'undefined') {
    module.exports = { lineupFlagKey, nextLineupFlag, rowsToLineupFlags };
  }
})(typeof window !== 'undefined' ? window : global);
```

- [ ] **Step 4: Run the tests again and confirm they pass**

Run: `npm test`
Expected: PASS — all 3 new tests green, and every pre-existing test still passes.

- [ ] **Step 5: Commit**

```bash
git add src/lineup-flags.js tests/lineup-flags.test.js
git commit -m "Add pure lineup-flag cycling logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire the new module into the build

**Files:**
- Modify: `build.js:5-13` (the `SRC_ORDER` array)

- [ ] **Step 1: Add `lineup-flags.js` to `SRC_ORDER`**

In `build.js`, change:

```javascript
const SRC_ORDER = [
  'csv-parser.js',
  'rosters-parser.js',
  'draftsharks-parser.js',
  'name-matching.js',
  'scoring.js',
  'rules.js',
  'schedule-generator.js',
];
```

to:

```javascript
const SRC_ORDER = [
  'csv-parser.js',
  'rosters-parser.js',
  'draftsharks-parser.js',
  'name-matching.js',
  'scoring.js',
  'rules.js',
  'schedule-generator.js',
  'lineup-flags.js',
];
```

- [ ] **Step 2: Build and confirm the new globals are present**

Run: `npm run build`
Expected: `Built dist/index.html` with no errors.

Run (PowerShell): `Select-String -Path dist/index.html -Pattern "function nextLineupFlag"`
Expected: one match, confirming the module's code was inlined.

- [ ] **Step 3: Commit**

Do not commit `dist/index.html` — `dist/` is gitignored and rebuilt automatically by `.github/workflows/deploy.yml` on every push to `main` (see `README.md`'s "How it's built" section). Only `build.js` itself is a real source change here.

```bash
git add build.js
git commit -m "Inline lineup-flags module into the built page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Create the `vampire_lineup_flags` Supabase table

**Files:** none (remote schema change on the `Fantasy Football` project, id `tdtchffawcmkvgrccjza`)

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP tool's `apply_migration` with:
- `project_id`: `tdtchffawcmkvgrccjza`
- `name`: `create_vampire_lineup_flags`
- `query`:

```sql
create table public.vampire_lineup_flags (
  week int not null,
  team text not null,
  player text not null,
  flag text not null check (flag in ('good', 'injury', 'bad')),
  updated_at timestamptz not null default now(),
  primary key (week, team, player)
);
```

- [ ] **Step 2: Verify**

Use the Supabase MCP tool's `list_tables` for `project_id: tdtchffawcmkvgrccjza`, schema `public`. Expected: `vampire_lineup_flags` appears alongside `vampire_rosters`, `vampire_player_values`, `vampire_settings`, `vampire_schedule`.

No code change, no commit for this task.

---

### Task 4: Load and sync `state.lineupFlags`

**Files:**
- Modify: `template.html` (the `state` object, the `rowsTo*`/`load*` helpers, and `init()`)

- [ ] **Step 1: Add `lineupFlags` to `state`**

In `template.html`, find the `state` object (currently):

```javascript
  const state = {
    rosters: {},
    draftsharks: {},
    settings: { lastRegularSeasonWeek: 13, restrictedWindowStart: 5, restrictedWindowEnd: 13, maxMeetingsPerOpponent: 2 },
    scheduleWeeks: [],
    currentWeek: 3,
    rosterIndex: 0,
    dataUpdatedAt: null,
    db: null,
  };
```

Change to:

```javascript
  const state = {
    rosters: {},
    draftsharks: {},
    settings: { lastRegularSeasonWeek: 13, restrictedWindowStart: 5, restrictedWindowEnd: 13, maxMeetingsPerOpponent: 2 },
    scheduleWeeks: [],
    currentWeek: 3,
    rosterIndex: 0,
    dataUpdatedAt: null,
    lineupFlags: {},
    db: null,
  };
```

- [ ] **Step 2: Add `loadLineupFlags`, next to the other `load*` helpers**

Find `async function loadSchedule(supabase) { ... }` (just above `async function init()`). Add immediately after it:

```javascript
  async function loadLineupFlags(supabase) {
    const { data, error } = await supabase.from('vampire_lineup_flags').select('*');
    state.lineupFlags = rowsToLineupFlags(data || []);
    return error;
  }
```

- [ ] **Step 3: Load it in `init()` and subscribe to realtime changes**

In `init()`, change:

```javascript
    const errors = await Promise.all([
      loadRosters(supabase),
      loadPlayerValues(supabase),
      loadSettings(supabase),
      loadSchedule(supabase),
    ]);
```

to:

```javascript
    const errors = await Promise.all([
      loadRosters(supabase),
      loadPlayerValues(supabase),
      loadSettings(supabase),
      loadSchedule(supabase),
      loadLineupFlags(supabase),
    ]);
```

Then, right after the existing `vampire_schedule_changes` channel subscription:

```javascript
    supabase.channel('vampire_schedule_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vampire_schedule' }, async () => {
        await loadSchedule(supabase);
        renderPicker();
        renderOverview();
      })
      .subscribe();
```

add:

```javascript
    supabase.channel('vampire_lineup_flags_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vampire_lineup_flags' }, async () => {
        await loadLineupFlags(supabase);
        renderPicker();
      })
      .subscribe();
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `Built dist/index.html` with no errors. (No visible behavior change yet — nothing renders `lineupFlags` until Task 5.)

- [ ] **Step 5: Commit**

```bash
git add template.html
git commit -m "Load and realtime-sync vampire_lineup_flags

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Render flag state on lineup rows

**Files:**
- Modify: `template.html` (`lineupTableHTML` and its two call sites)

- [ ] **Step 1: Add a `team` parameter and per-row flag markup to `lineupTableHTML`**

Find the current function:

```javascript
  function lineupTableHTML(breakdown, benchTop) {
    return '<table class="card-lineup"><thead><tr><th>Slot</th><th>Player</th><th>Opp</th><th>Weekly Proj.</th><th>3D Value</th><th>Status</th></tr></thead>'
      + '<tbody>' + breakdown.map((p) => {
        const weeklyText = p.weeklyProjection !== null ? p.weeklyProjection.toFixed(1) : '—';
        // 3D Value is a season-long draft-day number -- once a player is
        // flagged out for the week, it's not relevant to this decision and
        // showing it next to "out" reads as if that's what they'd score.
        const threeDText = !p.isOut && p.threeDValue !== null ? p.threeDValue.toFixed(1) : '—';
        const oppText = p.opponent ? esc(p.opponent) : '—';
        let statusText = '';
        if (p.onBye) statusText = 'bye';
        else if (p.isOut) statusText = 'out';
        const statusClass = p.onBye || p.isOut ? ' class="bye"' : '';
        return '<tr><td>' + esc(p.slot) + '</td><td>' + esc(p.player) + '</td><td>' + oppText + '</td><td>' + weeklyText + '</td>'
          + '<td>' + threeDText + '</td><td' + statusClass + '>' + statusText + '</td></tr>';
      }).join('')
      + (benchTop
        ? '<tr class="card-lineup-bench"><td>BENCH</td><td>' + esc(benchTop.player) + '</td>'
          + '<td>' + (benchTop.opponent ? esc(benchTop.opponent) : '—') + '</td>'
          + '<td>' + (benchTop.weeklyProjection !== null ? benchTop.weeklyProjection.toFixed(1) : '—') + '</td>'
          + '<td>' + (benchTop.threeDValue !== null ? benchTop.threeDValue.toFixed(1) : '—') + '</td><td>top bench</td></tr>'
        : '')
      + '</tbody></table>';
  }
```

Replace with:

```javascript
  function lineupTableHTML(breakdown, benchTop, team) {
    return '<table class="card-lineup"><thead><tr><th>Slot</th><th>Player</th><th>Opp</th><th>Weekly Proj.</th><th>3D Value</th><th>Status</th></tr></thead>'
      + '<tbody>' + breakdown.map((p) => {
        const weeklyText = p.weeklyProjection !== null ? p.weeklyProjection.toFixed(1) : '—';
        // 3D Value is a season-long draft-day number -- once a player is
        // flagged out for the week, it's not relevant to this decision and
        // showing it next to "out" reads as if that's what they'd score.
        const threeDText = !p.isOut && p.threeDValue !== null ? p.threeDValue.toFixed(1) : '—';
        const oppText = p.opponent ? esc(p.opponent) : '—';
        let statusText = '';
        if (p.onBye) statusText = 'bye';
        else if (p.isOut) statusText = 'out';
        const statusClass = p.onBye || p.isOut ? ' class="bye"' : '';
        // Clicking a row cycles it default -> good -> injury -> bad -> default
        // (see toggleLineupFlag); the flag is keyed by week+team+player so it's
        // specific to this week's matchup call, not a standing note on the player.
        const flag = state.lineupFlags[lineupFlagKey(state.currentWeek, team, p.player)];
        const rowClass = flag ? ' class="flag-' + flag + '"' : '';
        return '<tr data-week="' + state.currentWeek + '" data-team="' + esc(team) + '" data-player="' + esc(p.player) + '"' + rowClass + '><td>' + esc(p.slot) + '</td><td>' + esc(p.player) + '</td><td>' + oppText + '</td><td>' + weeklyText + '</td>'
          + '<td>' + threeDText + '</td><td' + statusClass + '>' + statusText + '</td></tr>';
      }).join('')
      + (benchTop
        ? '<tr class="card-lineup-bench"><td>BENCH</td><td>' + esc(benchTop.player) + '</td>'
          + '<td>' + (benchTop.opponent ? esc(benchTop.opponent) : '—') + '</td>'
          + '<td>' + (benchTop.weeklyProjection !== null ? benchTop.weeklyProjection.toFixed(1) : '—') + '</td>'
          + '<td>' + (benchTop.threeDValue !== null ? benchTop.threeDValue.toFixed(1) : '—') + '</td><td>top bench</td></tr>'
        : '')
      + '</tbody></table>';
  }
```

(The bench row deliberately gets no `data-player` attribute, so it stays outside the click delegation added in Task 6.)

- [ ] **Step 2: Pass `team` at both call sites**

In `renderPicker()`, change:

```javascript
      + lineupTableHTML(myBreakdown, myBenchTop);
```

to:

```javascript
      + lineupTableHTML(myBreakdown, myBenchTop, 'Me');
```

And change:

```javascript
      detailsWrap.innerHTML = lineupTableHTML(entry.breakdown, entry.benchTop);
```

to:

```javascript
      detailsWrap.innerHTML = lineupTableHTML(entry.breakdown, entry.benchTop, entry.team);
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `Built dist/index.html` with no errors.

- [ ] **Step 4: Commit**

```bash
git add template.html
git commit -m "Render lineup-flag state on player rows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Click-to-cycle handler and Supabase sync

**Files:**
- Modify: `template.html` (new `toggleLineupFlag`/`syncLineupFlag` functions, one new event listener)

- [ ] **Step 1: Add the click listener next to the existing tab listeners**

Find:

```javascript
  document.querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });
```

Add immediately after it:

```javascript
  // Delegated so it keeps working after renderPicker() replaces the cards'
  // innerHTML on every week change / realtime update, without re-binding.
  $('panel-picker').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-player]');
    if (!row) return;
    toggleLineupFlag(Number(row.dataset.week), row.dataset.team, row.dataset.player);
  });
```

- [ ] **Step 2: Add `toggleLineupFlag` and `syncLineupFlag`**

Add these two functions right after `lineupTableHTML` (before `renderPicker`):

```javascript
  function toggleLineupFlag(week, team, player) {
    const key = lineupFlagKey(week, team, player);
    const next = nextLineupFlag(state.lineupFlags[key]);
    if (next) {
      state.lineupFlags[key] = next;
    } else {
      delete state.lineupFlags[key];
    }
    renderPicker();
    syncLineupFlag(week, team, player, next);
  }

  async function syncLineupFlag(week, team, player, flag) {
    if (!state.db) return;
    const { error } = flag
      ? await state.db.from('vampire_lineup_flags').upsert({ week, team, player, flag })
      : await state.db.from('vampire_lineup_flags').delete().eq('week', week).eq('team', team).eq('player', player);
    $('sync-status').textContent = error ? 'Failed to save — check your connection and try again.' : '';
  }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `Built dist/index.html` with no errors.

- [ ] **Step 4: Commit**

```bash
git add template.html
git commit -m "Cycle and sync lineup flags on row click

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Styling for the flag colors

**Files:**
- Modify: `template.html` (`<style>` block, near the existing `.card-strip.*` rules)

- [ ] **Step 1: Add the flag CSS rules**

Find:

```css
  .card-strip.bye { background: var(--warn-bg); color: var(--warn); }
  .card-strip.injury { background: var(--bad-bg); color: var(--bad); }
  .card-strip.ineligible { background: var(--surface-2); color: var(--text-2); font-style: italic; }
  .card-strip.locked-in { background: var(--good-bg); color: var(--good); font-weight: 500; }
```

Add immediately after it:

```css
  .card-lineup tbody tr[data-player] { cursor: pointer; }
  .card-lineup tbody tr.flag-good { background: var(--good-bg); }
  .card-lineup tbody tr.flag-injury { background: var(--warn-bg); }
  .card-lineup tbody tr.flag-bad { background: var(--bad-bg); }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `Built dist/index.html` with no errors.

- [ ] **Step 3: Commit**

```bash
git add template.html
git commit -m "Style lineup-flag rows with the existing good/warn/bad tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Serve `dist/index.html` and open it**

Use the browser-preview tooling to open `dist/index.html` directly (it's a static file — no dev server needed) and confirm the Weekly picker tab loads with real data.

- [ ] **Step 2: Click through the cycle on one player row**

Click the same player row 4 times in the "Me" card. Expected after each click: 1) light green background, 2) light yellow background, 3) light red background, 4) back to no background. Confirm `#sync-status` shows no error text after each click.

- [ ] **Step 3: Confirm it's keyed per week**

Note the flagged player, then click `week-next`. Expected: that row shows no flag on the new week. Click `week-prev` back. Expected: the original flag is still there.

- [ ] **Step 4: Confirm an opponent card cycles independently**

Click a player row inside one opponent card. Expected: only that row changes; the "Me" card and other opponent cards are unaffected.

- [ ] **Step 5: Confirm the bench row is not clickable**

Click the `BENCH` / "top bench" row. Expected: no visual change (it has no `data-player` attribute, so the delegated handler ignores it).

- [ ] **Step 6: Confirm cross-viewer sync**

Open `dist/index.html` in a second browser tab. Set a flag in tab 1. Expected: within a couple seconds, tab 2's matching row shows the same flag without a manual reload (via the `vampire_lineup_flags_changes` realtime channel).

No code change, no commit for this task — if something's wrong, fix it in the relevant task above and re-verify.

---

### Task 9: Document the new table

**Files:**
- Modify: `docs/DATA.md`

- [ ] **Step 1: Add a `vampire_lineup_flags` entry**

In `docs/DATA.md`, after the existing `vampire_schedule` bullet (ends `"...the page also holds a realtime subscription on this table so simultaneous viewers see schedule changes live without reloading."`), add:

```markdown
- **`vampire_lineup_flags`** — one row per active flag. `week, team, player`
  (composite PK), `flag` (`'good' | 'injury' | 'bad'`). Set by clicking a
  player row in the Weekly picker's lineup tables (own card + every opponent
  card); cycling back to the unflagged default deletes the row rather than
  storing a fourth value, so the table only ever holds active flags. Same
  realtime-subscription pattern as `vampire_schedule` so simultaneous
  viewers see each other's flags live.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DATA.md
git commit -m "Document vampire_lineup_flags in DATA.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
