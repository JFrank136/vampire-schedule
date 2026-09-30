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
