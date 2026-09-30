// matchup-tool/tests/weekly-viewer.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  valueLineup, lineupTotals, buildWeeklyView, replacementLevels, rowsToWeeklyProjections,
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

test('valueLineup fills a position the team cannot fill with a free-agent stand-in', () => {
  const starters = valueLineup(TEAM.filter((p) => p.position !== 'TE'), INFO, 1);
  const te = starters.find((s) => s.slot === 'TE');
  assert.equal(te.player, 'Free agent');
  assert.equal(te.replacement, true);
});

test('valueLineup stands in for FLEX only when no RB/WR/TE is left over', () => {
  const team = [{ player: 'Q', position: 'QB' }];
  const starters = valueLineup(team, { Q: { bye: 9, threeDValue: 1 } }, 1);
  assert.equal(starters.length, 7);
  assert.equal(starters.filter((s) => s.replacement).length, 6);
});

test('valueLineup puts players with no 3D value last', () => {
  const team = [{ player: 'A', position: 'RB' }, { player: 'B', position: 'RB' }, { player: 'C', position: 'RB' }];
  const info = { A: { bye: 9, threeDValue: null }, B: { bye: 9, threeDValue: 10 }, C: { bye: 9, threeDValue: 20 } };
  assert.deepEqual(slotsOf(valueLineup(team, info, 1).filter((s) => !s.replacement)), ['RB1:C', 'RB2:B', 'FLEX:A']);
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

test('lineupTotals scores a stand-in at the replacement level and does not count it missing', () => {
  const team = TEAM.filter((p) => p.position !== 'TE');
  const starters = valueLineup(team, INFO, 1);
  const totals = lineupTotals(starters, makeProjections(), 1, { QB: 8, RB: 7, WR: 6, TE: 3 });
  const te = totals.rows.find((r) => r.slot === 'TE');
  assert.equal(te.proj, 3);
  assert.equal(totals.missing, 0);
  assert.equal(totals.proj, 60 + 3); // 6 real starters at 10 + the TE stand-in
});

test('buildWeeklyView returns one entry per week with DS proj totals', () => {
  const view = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 1, endWeek: 3 });
  assert.deepEqual(view.weeks.map((w) => [w.week, w.proj]), [[1, 70], [2, 80], [3, 64]]);
});

test('buildWeeklyView lists the players on bye each week, best 3D value first', () => {
  const view = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 3, endWeek: 3 });
  assert.deepEqual(view.weeks[0].byePlayers.map((p) => p.player), ['R1']);
  const other = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 9, endWeek: 9 });
  assert.deepEqual(other.weeks[0].byePlayers.map((p) => p.player), ['R2', 'R3', 'W1', 'W2', 'Q1', 'W3', 'T1']);
});

test('buildWeeklyView is empty when startWeek is past endWeek', () => {
  const view = buildWeeklyView(TEAM, INFO, makeProjections(), { startWeek: 16, endWeek: 15 });
  assert.deepEqual(view.weeks, []);
});

test('replacementLevels is the median of bench-tier players past the league starter count', () => {
  const mk = (name, position) => ({ player: name, position });
  const rosters = { A: [mk('a1', 'QB'), mk('a2', 'QB')], B: [mk('b1', 'QB'), mk('b2', 'QB')] };
  const info = {}; const projections = {};
  [['a1', 20], ['a2', 12], ['b1', 18], ['b2', 8]].forEach(([n, v]) => {
    info[n] = { bye: 9 }; projections[n] = { 1: { proj: v } };
  });
  // 2 teams x 1 QB slot => the 2 best are starters; bench tier is 12 and 8 -> median (lower) 12
  assert.equal(replacementLevels(rosters, info, projections, 1, 1)[1].QB, 12);
  // no players at a position -> 0
  assert.equal(replacementLevels(rosters, info, projections, 1, 1)[1].TE, 0);
});

test('rowsToWeeklyProjections nests DB rows by player then week', () => {
  const nested = rowsToWeeklyProjections([
    { player: 'A', week: 4, floor_proj: 1.5, ds_proj: 2.5, ceiling_proj: 3.5, opponent: '@DAL' },
    { player: 'A', week: 5, floor_proj: null, ds_proj: 6, ceiling_proj: null, opponent: null },
  ]);
  assert.deepEqual(nested.A[4], { floor: 1.5, proj: 2.5, ceiling: 3.5, opponent: '@DAL' });
  assert.deepEqual(nested.A[5], { floor: null, proj: 6, ceiling: null, opponent: null });
});

test('lineupTotals estimates a starter with no projection row at replacement level when levels are given', () => {
  const projections = makeProjections();
  delete projections.T1[1];
  const totals = lineupTotals(valueLineup(TEAM, INFO, 1), projections, 1, { QB: 8, RB: 7, WR: 6, TE: 3 });
  const te = totals.rows.find((r) => r.player === 'T1');
  assert.equal(te.proj, 3);
  assert.equal(te.estimated, true);
  assert.equal(totals.missing, 1);
  assert.equal(totals.proj, 63);
});
