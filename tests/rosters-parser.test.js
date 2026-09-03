// matchup-tool/tests/rosters-parser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRosters } = require('../src/rosters-parser.js');

const SAMPLE = `team,player,position,lineup_slot,starter
Me,Kyler Murray,QB,QB,1
Me,Rachaad White,RB,RB1,1
Ray,Jaxson Dart,QB,QB,1
Ray,Davante Adams,WR,BENCH,0
,,,,
,,,,
`;

test('groups players by team', () => {
  const result = parseRosters(SAMPLE);
  assert.deepEqual(Object.keys(result), ['Me', 'Ray']);
  assert.equal(result.Me.length, 2);
  assert.equal(result.Ray.length, 2);
});

test('parses player fields with starter as a boolean', () => {
  const result = parseRosters(SAMPLE);
  assert.deepEqual(result.Me[0], {
    player: 'Kyler Murray',
    position: 'QB',
    lineupSlot: 'QB',
    starter: true,
  });
  assert.equal(result.Ray[1].starter, false);
});

test('skips fully blank trailing rows', () => {
  const result = parseRosters(SAMPLE);
  const total = Object.values(result).reduce((sum, players) => sum + players.length, 0);
  assert.equal(total, 4);
});

test('returns an empty object for empty input', () => {
  assert.deepEqual(parseRosters(''), {});
});
