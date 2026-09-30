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
