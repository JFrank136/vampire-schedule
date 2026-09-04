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
        && isRestrictedWeek(w.week, settings)
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

  function findScheduleViolations(scheduleWeeks, settings) {
    const weeksByTeam = {};
    for (const w of scheduleWeeks) {
      if (!w.opponent) continue;
      if (!weeksByTeam[w.opponent]) weeksByTeam[w.opponent] = [];
      weeksByTeam[w.opponent].push(w.week);
    }

    const violations = [];
    for (const team of Object.keys(weeksByTeam)) {
      const weeks = weeksByTeam[team].slice().sort((a, b) => a - b);
      if (weeks.length > settings.maxMeetingsPerOpponent) {
        violations.push({ type: 'max-meetings-exceeded', team, weeks });
        continue;
      }
      const weeksInWindow = weeks.filter((week) => isRestrictedWeek(week, settings));
      if (weeksInWindow.length > 1) {
        violations.push({ type: 'repeated-in-window', team, weeks: weeksInWindow });
      }
    }
    return violations;
  }

  global.meetingCounts = meetingCounts;
  global.isRestrictedWeek = isRestrictedWeek;
  global.ineligibilityReason = ineligibilityReason;
  global.isEligible = isEligible;
  global.findScheduleViolations = findScheduleViolations;
  if (typeof module !== 'undefined') {
    module.exports = {
      meetingCounts, isRestrictedWeek, ineligibilityReason, isEligible, findScheduleViolations,
    };
  }
})(typeof window !== 'undefined' ? window : global);
