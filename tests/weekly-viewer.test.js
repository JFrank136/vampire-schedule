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
