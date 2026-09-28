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
