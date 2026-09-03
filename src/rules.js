// matchup-tool/src/rules.js
(function (global) {
  function meetingCounts(scheduleWeeks) {
    const counts = {};
    for (const week of scheduleWeeks) {
      if (!week.locked || !week.opponent) continue;
      counts[week.opponent] = (counts[week.opponent] || 0) + 1;
    }
    return counts;
  }

  function isRestrictedWeek(week, settings) {
    return week >= settings.restrictedWindowStart && week <= settings.restrictedWindowEnd;
  }

  function ineligibilityReason(team, week, scheduleWeeks, settings) {
    const counts = meetingCounts(scheduleWeeks);
    const totalMeetings = counts[team] || 0;
    if (totalMeetings >= settings.maxMeetingsPerOpponent) {
      return 'already played the maximum number of times this season';
    }
    if (isRestrictedWeek(week, settings)) {
      const metInWindow = scheduleWeeks.some((w) => (
        w.locked
        && w.opponent === team
        && w.week >= settings.restrictedWindowStart
        && w.week <= settings.restrictedWindowEnd
      ));
      if (metInWindow) {
        return 'already played this team during the once-each window';
      }
    }
    return null;
  }

  function isEligible(team, week, scheduleWeeks, settings) {
    return ineligibilityReason(team, week, scheduleWeeks, settings) === null;
  }

  global.meetingCounts = meetingCounts;
  global.isRestrictedWeek = isRestrictedWeek;
  global.ineligibilityReason = ineligibilityReason;
  global.isEligible = isEligible;
  if (typeof module !== 'undefined') {
    module.exports = { meetingCounts, isRestrictedWeek, ineligibilityReason, isEligible };
  }
})(typeof window !== 'undefined' ? window : global);
