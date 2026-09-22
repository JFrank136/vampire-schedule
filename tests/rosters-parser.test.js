// matchup-tool/tests/rosters-parser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRosters } = require('../src/rosters-parser.js');

const SAMPLE = `team,player,position
Me,Kyler Murray,QB
Me,Rachaad White,RB
Ray,Jaxson Dart,QB
Ray,Davante Adams,WR
,,
,,
`;

test('groups players by team', () => {
  const result = parseRosters(SAMPLE);
  assert.deepEqual(Object.keys(result), ['Me', 'Ray']);
  assert.equal(result.Me.length, 2);
  assert.equal(result.Ray.length, 2);
});

test('parses player fields (position only -- no more lineup_slot/starter)', () => {
  const result = parseRosters(SAMPLE);
  assert.deepEqual(result.Me[0], { player: 'Kyler Murray', position: 'QB' });
  assert.deepEqual(result.Ray[1], { player: 'Davante Adams', position: 'WR' });
});

test('skips fully blank trailing rows', () => {
  const result = parseRosters(SAMPLE);
  const total = Object.values(result).reduce((sum, players) => sum + players.length, 0);
  assert.equal(total, 4);
});

test('returns an empty object for empty input', () => {
  assert.deepEqual(parseRosters(''), {});
});
