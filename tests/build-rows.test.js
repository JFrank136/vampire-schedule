const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRosterRows, buildPlayerValueRows } = require('../scripts/build-rows.js');

test('buildRosterRows flattens the team->players map into flat rows', () => {
  const rosters = {
    Me: [{ player: 'Kyler Murray', position: 'QB', lineupSlot: 'QB', starter: true }],
    Ray: [{ player: 'Davante Adams', position: 'WR', lineupSlot: 'BENCH', starter: false }],
  };
  const rows = buildRosterRows(rosters);
  assert.deepEqual(rows, [
    { team: 'Me', player: 'Kyler Murray', position: 'QB', lineup_slot: 'QB', starter: true },
    { team: 'Ray', player: 'Davante Adams', position: 'WR', lineup_slot: 'BENCH', starter: false },
  ]);
});

test('buildRosterRows returns an empty array for an empty map', () => {
  assert.deepEqual(buildRosterRows({}), []);
});

test('buildPlayerValueRows flattens the player map into flat rows', () => {
  const players = {
    'Ja\'Marr Chase': {
      team: 'CIN', position: 'WR', bye: 12, injuryRisk: 8, threeDValue: 95.2, weeklyProjection: null,
    },
  };
  const rows = buildPlayerValueRows(players);
  assert.deepEqual(rows, [
    {
      player: 'Ja\'Marr Chase', team: 'CIN', position: 'WR', bye: 12,
      injury_risk: 8, three_d_value: 95.2, weekly_projection: null,
    },
  ]);
});

test('buildPlayerValueRows returns an empty array for an empty map', () => {
  assert.deepEqual(buildPlayerValueRows({}), []);
});
