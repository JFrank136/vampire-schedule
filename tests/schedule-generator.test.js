// matchup-tool/tests/schedule-generator.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSeasonSchedule } = require('../src/schedule-generator.js');
const { meetingCounts, isRestrictedWeek } = require('../src/rules.js');

const TEAMS = ['Ray', 'Janek', 'Neutang', 'Timko', 'Zavakos', 'Handel', 'Bryant', 'Sandusky', 'Farrell'];
const SETTINGS = {
  lastRegularSeasonWeek: 14,
  restrictedWindowStart: 5,
  restrictedWindowEnd: 13,
  maxMeetingsPerOpponent: 2,
};

test('assigns an opponent to every week', () => {
  const schedule = generateSeasonSchedule(TEAMS, SETTINGS);
  assert.equal(schedule.length, 14);
  assert.ok(schedule.every((w) => typeof w.opponent === 'string' && w.opponent.length > 0));
});

test('no team is scheduled more than the max meetings allowed', () => {
  const generated = generateSeasonSchedule(TEAMS, SETTINGS);
  const locked = generated.map((w) => ({ ...w, locked: true }));
  const counts = meetingCounts(locked);
  for (const team of TEAMS) {
    assert.ok((counts[team] || 0) <= SETTINGS.maxMeetingsPerOpponent, `${team} exceeded max meetings`);
  }
});

test('no team repeats inside the restricted window', () => {
  const generated = generateSeasonSchedule(TEAMS, SETTINGS);
  const restrictedOpponents = generated
    .filter((w) => isRestrictedWeek(w.week, SETTINGS))
    .map((w) => w.opponent);
  const unique = new Set(restrictedOpponents);
  assert.equal(unique.size, restrictedOpponents.length);
});

test('generated weeks are tentative (unlocked)', () => {
  const generated = generateSeasonSchedule(TEAMS, SETTINGS);
  assert.ok(generated.every((w) => w.locked === false));
});

test('preserves an existing locked week and still respects it when generating others', () => {
  const existing = [{ week: 3, opponent: 'Ray', locked: true, result: 'W', note: '' }];
  const generated = generateSeasonSchedule(TEAMS, SETTINGS, existing);
  const week3 = generated.find((w) => w.week === 3);
  assert.deepEqual(week3, existing[0]);
  const rayCount = generated.filter((w) => w.opponent === 'Ray').length;
  assert.ok(rayCount <= SETTINGS.maxMeetingsPerOpponent);
});

test('a week with no eligible opponent gets a null opponent and an explanatory note', () => {
  const twoTeams = ['Ray', 'Janek'];
  const tightSettings = {
    lastRegularSeasonWeek: 4,
    restrictedWindowStart: 5,
    restrictedWindowEnd: 13,
    maxMeetingsPerOpponent: 1,
  };
  const generated = generateSeasonSchedule(twoTeams, tightSettings);
  const failedWeeks = generated.filter((w) => w.opponent === null);
  assert.ok(failedWeeks.length > 0, 'expected at least one week to fail to find an eligible opponent');
  failedWeeks.forEach((w) => {
    assert.equal(w.note, 'no eligible opponent found');
  });
});
