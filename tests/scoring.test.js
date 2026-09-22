// matchup-tool/tests/scoring.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  playerScore, teamWeekBreakdown, teamBenchTopPlayer, teamWeekScore, autoLineup, scoredRoster,
  findPlayerInfo, eligiblePositionsForSlot, weekHasPublishedData, projectionForWeek, opponentForWeek,
} = require('../src/scoring.js');

// A "published" week (some player has weeklyProjectionWeek === 3) vs weeks
// 4/5/9 which nothing was ever pulled for, in this fixture.
const DRAFTSHARKS = {
  'Bijan Robinson': { bye: 5, injuryRisk: 12, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null },
  'Drake London': { bye: 5, injuryRisk: 8, threeDValue: 80, weeklyProjection: 24.5, weeklyProjectionWeek: 3 },
  'Ashton Jeanty': { bye: 9, injuryRisk: 15, threeDValue: 70, weeklyProjection: null, weeklyProjectionWeek: null },
  'Davante Adams': { bye: 5, injuryRisk: 10, threeDValue: 60, weeklyProjection: null, weeklyProjectionWeek: null },
  'Backup Runner': { bye: 9, injuryRisk: 5, threeDValue: 40, weeklyProjection: null, weeklyProjectionWeek: null },
};

test('weekHasPublishedData is true only for a week at least one player has a weekly projection for', () => {
  assert.equal(weekHasPublishedData(DRAFTSHARKS, 3), true);
  assert.equal(weekHasPublishedData(DRAFTSHARKS, 9), false);
});

test('falls back to 3D Value when the viewed week has not been published at all yet', () => {
  const score = playerScore('Bijan Robinson', DRAFTSHARKS, 4); // week 4: nobody has data
  assert.equal(score.value, 90);
  assert.equal(score.weeklyProjection, null); // not displayed as a "weekly" number
});

test('treats a player missing from a published week as excluded (out, 0) rather than "no data"', () => {
  const score = playerScore('Bijan Robinson', DRAFTSHARKS, 3); // week 3 IS published (Drake London has it)
  assert.equal(score.value, 0);
  assert.equal(score.weeklyProjection, 0);
  assert.equal(score.hasData, true);
  assert.equal(score.onBye, false);
});

test('prefers a real weekly projection over the excluded/0 inference when both a week is published and this player has a number', () => {
  const score = playerScore('Drake London', DRAFTSHARKS, 3);
  assert.equal(score.value, 24.5);
  assert.equal(score.weeklyProjection, 24.5);
});

test('a weekly projection pulled for a different week than the one being viewed is ignored', () => {
  const score = playerScore('Drake London', DRAFTSHARKS, 4); // week 4 not published; London's number is for week 3
  assert.equal(score.value, 80); // falls back to 3D Value
  assert.equal(score.weeklyProjection, null);
});

test('the "next" slot is checked when the viewed week is not the current slot\'s week', () => {
  const draftsharks = {
    'Two Slot Guy': {
      bye: null, injuryRisk: 10, threeDValue: 50,
      weeklyProjection: 12.3, weeklyProjectionWeek: 3,
      weeklyProjectionNext: 18.7, weeklyProjectionNextWeek: 4,
    },
  };
  assert.equal(playerScore('Two Slot Guy', draftsharks, 3).weeklyProjection, 12.3);
  assert.equal(playerScore('Two Slot Guy', draftsharks, 4).weeklyProjection, 18.7);
  assert.equal(playerScore('Two Slot Guy', draftsharks, 5).weeklyProjection, null);
});

test('weekHasPublishedData is true for a week that only appears in the "next" slot', () => {
  const draftsharks = {
    'Next Only': { bye: null, injuryRisk: null, threeDValue: 50, weeklyProjection: null, weeklyProjectionWeek: null, weeklyProjectionNext: 9.5, weeklyProjectionNextWeek: 4 },
  };
  assert.equal(weekHasPublishedData(draftsharks, 4), true);
  assert.equal(weekHasPublishedData(draftsharks, 5), false);
});

test('projectionForWeek distinguishes "no slot for this week" (undefined) from "slot matched but no number" (null)', () => {
  const info = { weeklyProjection: null, weeklyProjectionWeek: 3, weeklyProjectionNext: null, weeklyProjectionNextWeek: null };
  assert.equal(projectionForWeek(info, 3), null);
  assert.equal(projectionForWeek(info, 4), undefined);
});

test('opponentForWeek mirrors projectionForWeek: matched slot, wrong week, or no opponent recorded', () => {
  const info = {
    weeklyProjectionWeek: 3, weeklyOpponent: '@DAL',
    weeklyProjectionNextWeek: 4, weeklyOpponentNext: 'BUF',
  };
  assert.equal(opponentForWeek(info, 3), '@DAL');
  assert.equal(opponentForWeek(info, 4), 'BUF');
  assert.equal(opponentForWeek(info, 5), undefined); // no slot covers week 5 at all
});

test('playerScore surfaces the matched opponent for the viewed week', () => {
  const draftsharks = {
    'Two Slot Guy': {
      bye: null, injuryRisk: 10, threeDValue: 50,
      weeklyProjection: 12.3, weeklyProjectionWeek: 3, weeklyOpponent: '@DAL',
      weeklyProjectionNext: 18.7, weeklyProjectionNextWeek: 4, weeklyOpponentNext: 'BUF',
    },
  };
  assert.equal(playerScore('Two Slot Guy', draftsharks, 3).opponent, '@DAL');
  assert.equal(playerScore('Two Slot Guy', draftsharks, 4).opponent, 'BUF');
  assert.equal(playerScore('Two Slot Guy', draftsharks, 5).opponent, null);
});

test('scores a bye-week player as 0 regardless of whether the week is published', () => {
  const score = playerScore('Bijan Robinson', DRAFTSHARKS, 5);
  assert.equal(score.value, 0);
  assert.equal(score.onBye, true);
  assert.equal(score.hasData, true);
});

test('scores an unknown player as 0 and flags not found', () => {
  const score = playerScore('Nobody', DRAFTSHARKS, 3);
  assert.equal(score.value, 0);
  assert.equal(score.found, false);
});

test('has no score at all when the week is unpublished and there is no 3D Value either', () => {
  const draftsharks = { 'No Data Guy': { bye: null, injuryRisk: null, threeDValue: null, weeklyProjection: null, weeklyProjectionWeek: null } };
  const score = playerScore('No Data Guy', draftsharks, 3);
  assert.equal(score.value, null);
  assert.equal(score.hasData, false);
  assert.equal(score.found, true);
});

test('falls back to a normalized-name match when the exact name differs', () => {
  const draftsharks = { 'Michael Pittman Jr.': { bye: 9, injuryRisk: 20, threeDValue: 19, weeklyProjection: null, weeklyProjectionWeek: null } };
  const score = playerScore('Michael Pittman', draftsharks, 3);
  assert.equal(score.value, 19);
  assert.equal(score.found, true);
});

test('falls back to a known nickname alias when names differ beyond punctuation/suffix', () => {
  const draftsharks = { 'Cameron Skattebo': { bye: 8, injuryRisk: 72, threeDValue: 29, weeklyProjection: null, weeklyProjectionWeek: null } };
  const score = playerScore('Cam Skattebo', draftsharks, 3);
  assert.equal(score.value, 29);
  assert.equal(score.found, true);
});

test('findPlayerInfo is exported for lookups outside of scoring (e.g. the roster browser)', () => {
  const draftsharks = { 'Michael Pittman Jr.': { bye: 9, injuryRisk: 20, threeDValue: 19, weeklyProjection: null, weeklyProjectionWeek: null } };
  assert.deepEqual(findPlayerInfo('Michael Pittman', draftsharks), draftsharks['Michael Pittman Jr.']);
  assert.equal(findPlayerInfo('Nobody', draftsharks), undefined);
});

test('eligiblePositionsForSlot maps FLEX to RB/WR/TE and other slots to their own position', () => {
  assert.deepEqual(eligiblePositionsForSlot('FLEX'), ['RB', 'WR', 'TE']);
  assert.deepEqual(eligiblePositionsForSlot('RB1'), ['RB1']);
  assert.deepEqual(eligiblePositionsForSlot('QB'), ['QB']);
});

// --- Auto-lineup: no more fixed CSV lineup_slot/starter -- every rostered
// player is a candidate, and the lineup is picked fresh each week by value.

const FULL_ROSTER = [
  { player: 'Star QB', position: 'QB' },
  { player: 'Bijan Robinson', position: 'RB' }, // 3D 90
  { player: 'Ashton Jeanty', position: 'RB' }, // 3D 70
  { player: 'Backup Runner', position: 'RB' }, // 3D 40 -- beats a WR for FLEX below
  { player: 'Drake London', position: 'WR' }, // 3D 80, week-3 proj 24.5
  { player: 'Davante Adams', position: 'WR' }, // 3D 60
  { player: 'Star TE', position: 'TE' },
];
const FULL_DRAFTSHARKS = {
  ...DRAFTSHARKS,
  'Star QB': { bye: null, injuryRisk: null, threeDValue: 30, weeklyProjection: null, weeklyProjectionWeek: null },
  'Star TE': { bye: null, injuryRisk: null, threeDValue: 20, weeklyProjection: null, weeklyProjectionWeek: null },
};

test('autoLineup fills 1 QB / 2 RB / 2 WR / 1 TE / 1 FLEX by highest value, position-locked slots first', () => {
  const { starters } = autoLineup(FULL_ROSTER, FULL_DRAFTSHARKS, 4); // unpublished week -> 3D Value
  const slots = Object.fromEntries(starters.map((p) => [p.slot, p.player]));
  assert.equal(slots.QB, 'Star QB');
  assert.equal(slots.RB1, 'Bijan Robinson');
  assert.equal(slots.RB2, 'Ashton Jeanty');
  assert.equal(slots.WR1, 'Drake London');
  assert.equal(slots.WR2, 'Davante Adams');
  assert.equal(slots.TE, 'Star TE');
  assert.equal(slots.FLEX, 'Backup Runner'); // best remaining RB/WR/TE, not left on the bench
});

test('teamWeekBreakdown returns the auto-picked starters, not a fixed roster assignment', () => {
  const breakdown = teamWeekBreakdown(FULL_ROSTER, FULL_DRAFTSHARKS, 4);
  assert.equal(breakdown.length, 7); // QB, RB1, RB2, WR1, WR2, TE, FLEX
  assert.ok(breakdown.some((p) => p.player === 'Backup Runner' && p.slot === 'FLEX'));
});

test('teamWeekScore sums the auto-picked starters\' values', () => {
  const score = teamWeekScore(FULL_ROSTER, FULL_DRAFTSHARKS, 4);
  assert.equal(score, 30 + 90 + 70 + 80 + 60 + 20 + 40);
});

test('a bye-week player with a healthy alternative at the same position is auto-benched, not started at 0', () => {
  const draftsharks = {
    'Star QB': { bye: null, injuryRisk: null, threeDValue: 30, weeklyProjection: null, weeklyProjectionWeek: null },
    'Star RB': { bye: 5, injuryRisk: null, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null },
    'Solid RB': { bye: null, injuryRisk: null, threeDValue: 70, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench RB': { bye: null, injuryRisk: null, threeDValue: 40, weeklyProjection: null, weeklyProjectionWeek: null },
    'WR One': { bye: null, injuryRisk: null, threeDValue: 60, weeklyProjection: null, weeklyProjectionWeek: null },
    'WR Two': { bye: null, injuryRisk: null, threeDValue: 55, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench WR': { bye: null, injuryRisk: null, threeDValue: 45, weeklyProjection: null, weeklyProjectionWeek: null }, // beats Star RB's 0 for FLEX
    'Star TE': { bye: null, injuryRisk: null, threeDValue: 20, weeklyProjection: null, weeklyProjectionWeek: null },
  };
  const team = [
    { player: 'Star QB', position: 'QB' },
    { player: 'Star RB', position: 'RB' },
    { player: 'Solid RB', position: 'RB' },
    { player: 'Bench RB', position: 'RB' },
    { player: 'WR One', position: 'WR' },
    { player: 'WR Two', position: 'WR' },
    { player: 'Bench WR', position: 'WR' },
    { player: 'Star TE', position: 'TE' },
  ];
  // Star RB's bye (week 5); Solid RB and Bench RB are healthy, so the 2 RB
  // slots go to them, and Bench WR (a real FLEX option) beats Star RB's
  // guaranteed 0 for the FLEX slot too -- Star RB is fully benched.
  const breakdown = teamWeekBreakdown(team, draftsharks, 5);
  const starterNames = breakdown.map((p) => p.player);
  assert.ok(!starterNames.includes('Star RB'));
  assert.ok(starterNames.includes('Solid RB'));
  assert.ok(starterNames.includes('Bench RB'));
  assert.ok(starterNames.includes('Bench WR'));
});

test('a bye/out player is still started when the position has no healthy alternative', () => {
  const team = [{ player: 'Bijan Robinson', position: 'RB' }, { player: 'Ashton Jeanty', position: 'RB' }];
  const breakdown = teamWeekBreakdown(team, DRAFTSHARKS, 5); // both RB slots must be filled; Bijan's bye is week 5
  const bijan = breakdown.find((p) => p.player === 'Bijan Robinson');
  assert.equal(bijan.isOut, true);
  assert.equal(bijan.value, 0);
});

test('teamBenchTopPlayer returns null when the roster is exactly the 7-man auto lineup with nobody left over', () => {
  assert.equal(teamBenchTopPlayer(FULL_ROSTER, FULL_DRAFTSHARKS, 4), null);
});

test('teamBenchTopPlayer picks the highest-value FLEX-eligible player left off the auto lineup', () => {
  // 3 FLEX-eligible extras: the best (Bench Hi) wins the FLEX slot itself,
  // so the true bench is {Bench Mid, Bench Lo} -- the top player among
  // *those*, not just the best of all 3, is what this should return.
  const roster = [
    { player: 'Star QB', position: 'QB' },
    { player: 'RB A', position: 'RB' },
    { player: 'RB B', position: 'RB' },
    { player: 'WR A', position: 'WR' },
    { player: 'WR B', position: 'WR' },
    { player: 'Star TE', position: 'TE' },
    { player: 'Bench Hi', position: 'WR' },
    { player: 'Bench Mid', position: 'WR' },
    { player: 'Bench Lo', position: 'WR' },
  ];
  const draftsharks = {
    'Star QB': { bye: null, injuryRisk: null, threeDValue: 30, weeklyProjection: null, weeklyProjectionWeek: null },
    'RB A': { bye: null, injuryRisk: null, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null },
    'RB B': { bye: null, injuryRisk: null, threeDValue: 70, weeklyProjection: null, weeklyProjectionWeek: null },
    'WR A': { bye: null, injuryRisk: null, threeDValue: 80, weeklyProjection: null, weeklyProjectionWeek: null },
    'WR B': { bye: null, injuryRisk: null, threeDValue: 60, weeklyProjection: null, weeklyProjectionWeek: null },
    'Star TE': { bye: null, injuryRisk: null, threeDValue: 20, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench Hi': { bye: null, injuryRisk: null, threeDValue: 55, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench Mid': { bye: null, injuryRisk: null, threeDValue: 35, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench Lo': { bye: null, injuryRisk: null, threeDValue: 20, weeklyProjection: null, weeklyProjectionWeek: null },
  };
  const benchTop = teamBenchTopPlayer(roster, draftsharks, 4);
  assert.equal(benchTop.player, 'Bench Mid');
});

test('teamBenchTopPlayer excludes bench QBs even with the highest value -- only RB/WR/TE are usable as a flex', () => {
  const draftsharks = {
    ...FULL_DRAFTSHARKS,
    'Backup QB': { bye: null, injuryRisk: null, threeDValue: 95, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench WR': { bye: null, injuryRisk: null, threeDValue: 10, weeklyProjection: null, weeklyProjectionWeek: null },
  };
  const roster = [...FULL_ROSTER, { player: 'Backup QB', position: 'QB' }, { player: 'Bench WR', position: 'WR' }];
  const top = teamBenchTopPlayer(roster, draftsharks, 4);
  assert.equal(top.player, 'Bench WR'); // not Backup QB, despite its higher 3D Value
});

test('scoredRoster orders starters by slot and sorts the bench by 3D Value', () => {
  const roster = [
    { player: 'Star QB', position: 'QB' },
    { player: 'RB A', position: 'RB' },
    { player: 'RB B', position: 'RB' },
    { player: 'WR A', position: 'WR' },
    { player: 'WR B', position: 'WR' },
    { player: 'Star TE', position: 'TE' },
    { player: 'Bench Hi', position: 'WR' }, // wins FLEX -- not on the bench
    { player: 'Bench Mid', position: 'WR' },
    { player: 'Bench Lo', position: 'WR' },
  ];
  const draftsharks = {
    'Star QB': { bye: null, injuryRisk: null, threeDValue: 30, weeklyProjection: null, weeklyProjectionWeek: null },
    'RB A': { bye: null, injuryRisk: null, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null },
    'RB B': { bye: null, injuryRisk: null, threeDValue: 70, weeklyProjection: null, weeklyProjectionWeek: null },
    'WR A': { bye: null, injuryRisk: null, threeDValue: 80, weeklyProjection: null, weeklyProjectionWeek: null },
    'WR B': { bye: null, injuryRisk: null, threeDValue: 60, weeklyProjection: null, weeklyProjectionWeek: null },
    'Star TE': { bye: null, injuryRisk: null, threeDValue: 20, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench Hi': { bye: null, injuryRisk: null, threeDValue: 55, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench Mid': { bye: null, injuryRisk: null, threeDValue: 35, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench Lo': { bye: null, injuryRisk: null, threeDValue: 20, weeklyProjection: null, weeklyProjectionWeek: null },
  };
  const { starters, bench } = scoredRoster(roster, draftsharks, 4);
  assert.deepEqual(starters.map((p) => p.slot), ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX']);
  assert.equal(starters.find((p) => p.slot === 'FLEX').player, 'Bench Hi');
  assert.deepEqual(bench.map((p) => p.player), ['Bench Mid', 'Bench Lo']);
});
