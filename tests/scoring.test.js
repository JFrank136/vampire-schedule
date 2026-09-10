// matchup-tool/tests/scoring.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  playerScore, teamWeekBreakdown, teamBenchTopPlayer, teamWeekScore,
  findPlayerInfo, eligiblePositionsForSlot, weekHasPublishedData, projectionForWeek,
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

const TEAM = [
  { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
  { player: 'Drake London', position: 'WR', lineupSlot: 'WR1', starter: true },
  { player: 'Davante Adams', position: 'WR', lineupSlot: 'BENCH', starter: false },
];

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
  assert.deepEqual(eligiblePositionsForSlot('RB1'), ['RB']);
  assert.deepEqual(eligiblePositionsForSlot('QB'), ['QB']);
});

test('teamWeekBreakdown only includes starters', () => {
  const breakdown = teamWeekBreakdown(TEAM, DRAFTSHARKS, 4); // unpublished week, avoids the excluded-player path
  assert.equal(breakdown.length, 2);
  assert.deepEqual(breakdown.map((row) => row.player), ['Bijan Robinson', 'Drake London']);
});

test('teamWeekScore sums starter values on an unpublished week (3D Value fallback)', () => {
  const score = teamWeekScore(TEAM, DRAFTSHARKS, 4);
  assert.equal(score, 90 + 80);
});

test('teamWeekScore zeroes out a starter on bye', () => {
  const score = teamWeekScore(TEAM, DRAFTSHARKS, 5);
  assert.equal(score, 0 + 0);
});

test('teamWeekScore substitutes an out starter\'s bench replacement value instead of counting them as 0', () => {
  const draftsharks = {
    'Bijan Robinson': { bye: null, injuryRisk: 12, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null }, // excluded from week 3
    'Drake London': { bye: 5, injuryRisk: 8, threeDValue: 80, weeklyProjection: 24.5, weeklyProjectionWeek: 3 },
    'Backup Runner': { bye: null, injuryRisk: 5, threeDValue: 22, weeklyProjection: 15.5, weeklyProjectionWeek: 3 },
  };
  const team = [
    { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
    { player: 'Drake London', position: 'WR', lineupSlot: 'WR1', starter: true },
    { player: 'Backup Runner', position: 'RB', lineupSlot: 'BENCH', starter: false },
  ];
  const score = teamWeekScore(team, draftsharks, 3); // week 3 is published -> Bijan is excluded/out
  assert.equal(score, 15.5 + 24.5); // Backup Runner's real week-3 number swapped in for Bijan's 0, plus London's
});

test('teamBenchTopPlayer picks the highest 3D Value bench player', () => {
  const team = [
    { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
    { player: 'Davante Adams', position: 'WR', lineupSlot: 'BENCH', starter: false },
    { player: 'Backup Runner', position: 'RB', lineupSlot: 'BENCH', starter: false },
  ];
  const top = teamBenchTopPlayer(team, DRAFTSHARKS, 4);
  assert.equal(top.player, 'Davante Adams');
  assert.equal(top.threeDValue, 60);
});

test('teamBenchTopPlayer returns null with no bench', () => {
  assert.equal(teamBenchTopPlayer([{ player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true }], DRAFTSHARKS, 4), null);
});

test('teamBenchTopPlayer prefers a bench player\'s published weekly projection over a higher-3D-Value rival', () => {
  const draftsharks = {
    'Bijan Robinson': { bye: 9, injuryRisk: 12, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null },
    'High 3D Bench': { bye: 9, injuryRisk: 10, threeDValue: 60, weeklyProjection: null, weeklyProjectionWeek: null }, // excluded from week 3 -> scores 0
    'Hot Weekly Bench': { bye: 9, injuryRisk: 10, threeDValue: 20, weeklyProjection: 18.5, weeklyProjectionWeek: 3 },
  };
  const team = [
    { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
    { player: 'High 3D Bench', position: 'WR', lineupSlot: 'BENCH', starter: false },
    { player: 'Hot Weekly Bench', position: 'WR', lineupSlot: 'BENCH', starter: false },
  ];
  const top = teamBenchTopPlayer(team, draftsharks, 3); // week 3 is published (Hot Weekly Bench has a number)
  assert.equal(top.player, 'Hot Weekly Bench');
  assert.equal(top.weeklyProjection, 18.5);
});

test('teamBenchTopPlayer excludes bench QBs even with the highest score -- only RB/WR/TE are usable as a flex', () => {
  const draftsharks = {
    'Bijan Robinson': { bye: 9, injuryRisk: 12, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null },
    'Backup QB': { bye: 9, injuryRisk: 5, threeDValue: 95, weeklyProjection: null, weeklyProjectionWeek: null },
    'Bench WR': { bye: 9, injuryRisk: 10, threeDValue: 30, weeklyProjection: null, weeklyProjectionWeek: null },
  };
  const team = [
    { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
    { player: 'Backup QB', position: 'QB', lineupSlot: 'BENCH', starter: false },
    { player: 'Bench WR', position: 'WR', lineupSlot: 'BENCH', starter: false },
  ];
  const top = teamBenchTopPlayer(team, draftsharks, 4); // unpublished week -> falls back to 3D Value
  assert.equal(top.player, 'Bench WR'); // not Backup QB, despite its higher 3D Value
});

test('a starter on bye is flagged out and matched to the best eligible bench replacement', () => {
  const team = [
    { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
    { player: 'Davante Adams', position: 'WR', lineupSlot: 'BENCH', starter: false },
    { player: 'Backup Runner', position: 'RB', lineupSlot: 'BENCH', starter: false },
  ];
  const breakdown = teamWeekBreakdown(team, DRAFTSHARKS, 5); // week 5 = Bijan's bye
  const bijan = breakdown.find((row) => row.player === 'Bijan Robinson');
  assert.equal(bijan.isOut, true);
  assert.equal(bijan.replacement.player, 'Backup Runner'); // RB-eligible, not the higher-3D WR
});

test('a player missing from an unpublished week (not on bye) is not flagged out -- falls back to 3D Value', () => {
  const team = [
    { player: 'Ashton Jeanty', position: 'RB', lineupSlot: 'RB1', starter: true },
    { player: 'Backup Runner', position: 'RB', lineupSlot: 'BENCH', starter: false },
  ];
  const breakdown = teamWeekBreakdown(team, DRAFTSHARKS, 4); // week 4 unpublished, not Jeanty's bye (9)
  const jeanty = breakdown.find((row) => row.player === 'Ashton Jeanty');
  assert.equal(jeanty.hasData, true); // falls back to 3D Value (70)
  assert.equal(jeanty.value, 70);
  assert.equal(jeanty.isOut, false);
  assert.equal(jeanty.replacement, null);
});

test('a player missing from a published week (not on bye) IS flagged out -- Draft Sharks excluded them', () => {
  const team = [
    { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true }, // no week-3 number
    { player: 'Backup Runner', position: 'RB', lineupSlot: 'BENCH', starter: false },
  ];
  const breakdown = teamWeekBreakdown(team, DRAFTSHARKS, 3); // week 3 IS published (Drake London has it)
  const bijan = breakdown.find((row) => row.player === 'Bijan Robinson');
  assert.equal(bijan.value, 0);
  assert.equal(bijan.isOut, true);
  assert.equal(bijan.onBye, false);
  assert.equal(bijan.replacement.player, 'Backup Runner');
});

test('does not suggest the same bench player as a replacement twice', () => {
  const draftsharks = {
    'Bijan Robinson': { bye: 9, injuryRisk: 12, threeDValue: 90, weeklyProjection: null, weeklyProjectionWeek: null },
    'Ashton Jeanty': { bye: 9, injuryRisk: 15, threeDValue: 70, weeklyProjection: null, weeklyProjectionWeek: null },
    'Backup Runner': { bye: 1, injuryRisk: 5, threeDValue: 40, weeklyProjection: null, weeklyProjectionWeek: null },
  };
  const team = [
    { player: 'Bijan Robinson', position: 'RB', lineupSlot: 'RB1', starter: true },
    { player: 'Ashton Jeanty', position: 'RB', lineupSlot: 'RB2', starter: true },
    { player: 'Backup Runner', position: 'RB', lineupSlot: 'BENCH', starter: false },
  ];
  const breakdown = teamWeekBreakdown(team, draftsharks, 9); // both RBs on bye week 9
  const bijan = breakdown.find((row) => row.player === 'Bijan Robinson');
  const jeanty = breakdown.find((row) => row.player === 'Ashton Jeanty');
  assert.equal(bijan.isOut, true);
  assert.equal(jeanty.isOut, true);
  assert.equal(bijan.replacement.player, 'Backup Runner');
  assert.equal(jeanty.replacement, null); // only one RB-eligible bench player available
});
