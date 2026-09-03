// matchup-tool/tests/scoring.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { playerScore, teamWeekBreakdown, teamWeekScore } = require('../src/scoring.js');

const DRAFTSHARKS = {
  'Bijan Robinson': { bye: 5, injuryRisk: 12, threeDValue: 90, weeklyProjection: null },
  'Drake London': { bye: 5, injuryRisk: 8, threeDValue: 80, weeklyProjection: 24.5 },
};

const TEAM = [
  { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
  { player: 'Drake London', position: 'WR', lineupSlot: 'WR1', starter: true },
  { player: 'Davante Adams', position: 'WR', lineupSlot: 'BENCH', starter: false },
];

test('uses 3D Value when no weekly projection is set', () => {
  const score = playerScore('Bijan Robinson', DRAFTSHARKS, 3);
  assert.equal(score.value, 90);
  assert.equal(score.onBye, false);
});

test('prefers weekly projection over 3D Value when present', () => {
  const score = playerScore('Drake London', DRAFTSHARKS, 3);
  assert.equal(score.value, 24.5);
});

test('scores a bye-week player as 0', () => {
  const score = playerScore('Bijan Robinson', DRAFTSHARKS, 5);
  assert.equal(score.value, 0);
  assert.equal(score.onBye, true);
});

test('scores an unknown player as 0 and flags not found', () => {
  const score = playerScore('Nobody', DRAFTSHARKS, 3);
  assert.equal(score.value, 0);
  assert.equal(score.found, false);
});

test('teamWeekBreakdown only includes starters', () => {
  const breakdown = teamWeekBreakdown(TEAM, DRAFTSHARKS, 3);
  assert.equal(breakdown.length, 2);
  assert.deepEqual(breakdown.map((row) => row.player), ['Bijan Robinson', 'Drake London']);
});

test('teamWeekScore sums starter values', () => {
  const score = teamWeekScore(TEAM, DRAFTSHARKS, 3);
  assert.equal(score, 90 + 24.5);
});

test('teamWeekScore zeroes out a starter on bye', () => {
  const score = teamWeekScore(TEAM, DRAFTSHARKS, 5);
  assert.equal(score, 0 + 0);
});
