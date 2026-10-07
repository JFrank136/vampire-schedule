// matchup-tool/tests/free-agents.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FREE_AGENT_TEAM, findFreeAgentTeam, sortFlexRows, LINEUP_SLOTS, emptyWhatIf, normalizeWhatIf, effectiveRoster, toggleRosterMove,
  lineupAssignment, swapIntoSlot, flexTableRows, rosterSignature, rowsToRos, aliasToRosterNames,
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

test('findFreeAgentTeam accepts either spelling, case-insensitively', () => {
  assert.equal(findFreeAgentTeam({ Me: [], 'FREE AGENT': [] }), 'FREE AGENT');
  assert.equal(findFreeAgentTeam({ 'Free Agents': [] }), 'Free Agents');
  assert.equal(findFreeAgentTeam({ Me: [] }), null);
});

test('sortFlexRows sorts by a column, keeps blanks last in both directions', () => {
  const rows = [
    { player: 'B', position: 'RB', proj: 5 },
    { player: 'A', position: 'WR', proj: null },
    { player: 'C', position: 'TE', proj: 9 },
  ];
  assert.deepEqual(sortFlexRows(rows, 'proj', 'desc').map((r) => r.player), ['C', 'B', 'A']);
  assert.deepEqual(sortFlexRows(rows, 'proj', 'asc').map((r) => r.player), ['B', 'C', 'A']);
  assert.deepEqual(sortFlexRows(rows, 'player', 'asc').map((r) => r.player), ['A', 'B', 'C']);
  assert.deepEqual(sortFlexRows(rows, 'position', 'asc').map((r) => r.position), ['RB', 'TE', 'WR']);
});

test('aliasToRosterNames lets a roster spelling find a suffixed projection key', () => {
  const byPlayer = { 'Ollie Gordon II': { proj: 9.9 }, 'Other Guy': { proj: 1 } };
  const rosters = { 'FREE AGENT': [{ player: 'Ollie Gordon', position: 'RB' }], Me: [{ player: 'Other Guy', position: 'WR' }] };
  const out = aliasToRosterNames(byPlayer, rosters);
  assert.deepEqual(out['Ollie Gordon'], { proj: 9.9 });
  assert.deepEqual(out['Other Guy'], { proj: 1 });
  assert.equal(byPlayer['Ollie Gordon'], undefined);
});
