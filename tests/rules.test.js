// matchup-tool/tests/rules.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  meetingCounts,
  isRestrictedWeek,
  ineligibilityReason,
  isEligible,
  findScheduleViolations,
} = require('../src/rules.js');

const SETTINGS = {
  lastRegularSeasonWeek: 14,
  restrictedWindowStart: 5,
  restrictedWindowEnd: 13,
  maxMeetingsPerOpponent: 2,
};

test('meetingCounts only counts locked weeks with an opponent', () => {
  const schedule = [
    { week: 1, opponent: 'Ray', locked: true },
    { week: 2, opponent: 'Ray', locked: false },
    { week: 3, opponent: 'Janek', locked: true },
  ];
  assert.deepEqual(meetingCounts(schedule), { Ray: 1, Janek: 1 });
});

test('isRestrictedWeek is true only inside the configured window', () => {
  assert.equal(isRestrictedWeek(4, SETTINGS), false);
  assert.equal(isRestrictedWeek(5, SETTINGS), true);
  assert.equal(isRestrictedWeek(13, SETTINGS), true);
  assert.equal(isRestrictedWeek(14, SETTINGS), false);
});

test('a team never played is eligible everywhere', () => {
  assert.equal(isEligible('Ray', 7, [], SETTINGS), true);
  assert.equal(ineligibilityReason('Ray', 7, [], SETTINGS), null);
});

test('a team already played twice is ineligible everywhere', () => {
  const schedule = [
    { week: 1, opponent: 'Ray', locked: true },
    { week: 2, opponent: 'Ray', locked: true },
  ];
  assert.equal(isEligible('Ray', 10, schedule, SETTINGS), false);
  assert.equal(
    ineligibilityReason('Ray', 10, schedule, SETTINGS),
    'already played the maximum number of times this season',
  );
});

test('a team played once inside the restricted window cannot be played again inside it', () => {
  const schedule = [{ week: 6, opponent: 'Ray', locked: true }];
  assert.equal(isEligible('Ray', 9, schedule, SETTINGS), false);
  assert.equal(
    ineligibilityReason('Ray', 9, schedule, SETTINGS),
    'already played this team during the once-each window',
  );
});

test('a team played once outside the window can still be played once inside it', () => {
  const schedule = [{ week: 2, opponent: 'Ray', locked: true }];
  assert.equal(isEligible('Ray', 9, schedule, SETTINGS), true);
});

test('an unlocked (tentative) meeting does not count toward eligibility', () => {
  const schedule = [{ week: 6, opponent: 'Ray', locked: false }];
  assert.equal(isEligible('Ray', 9, schedule, SETTINGS), true);
});

test('findScheduleViolations returns nothing for a schedule with no repeats', () => {
  const schedule = [
    { week: 6, opponent: 'Ray', locked: true },
    { week: 7, opponent: 'Janek', locked: true },
  ];
  assert.deepEqual(findScheduleViolations(schedule, SETTINGS), []);
});

test('findScheduleViolations flags a team played twice inside the restricted window', () => {
  const schedule = [
    { week: 6, opponent: 'Ray', locked: true },
    { week: 9, opponent: 'Ray', locked: true },
  ];
  assert.deepEqual(findScheduleViolations(schedule, SETTINGS), [
    { type: 'repeated-in-window', team: 'Ray', weeks: [6, 9] },
  ]);
});

test('findScheduleViolations does not flag a repeat where one meeting is outside the window', () => {
  const schedule = [
    { week: 2, opponent: 'Ray', locked: true },
    { week: 9, opponent: 'Ray', locked: true },
  ];
  assert.deepEqual(findScheduleViolations(schedule, SETTINGS), []);
});

test('findScheduleViolations ignores unlocked (tentative) weeks', () => {
  const schedule = [
    { week: 6, opponent: 'Ray', locked: true },
    { week: 9, opponent: 'Ray', locked: false },
  ];
  assert.deepEqual(findScheduleViolations(schedule, SETTINGS), []);
});

test('findScheduleViolations also flags a team played more than the season max', () => {
  const schedule = [
    { week: 1, opponent: 'Ray', locked: true },
    { week: 2, opponent: 'Ray', locked: true },
    { week: 3, opponent: 'Ray', locked: true },
  ];
  assert.deepEqual(findScheduleViolations(schedule, SETTINGS), [
    { type: 'max-meetings-exceeded', team: 'Ray', weeks: [1, 2, 3] },
  ]);
});
