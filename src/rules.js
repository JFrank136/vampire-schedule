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

  // The season splits into stretches around the restricted window: weeks
  // before it, the window itself, and (if the season extends past it) weeks
  // after. A team can be played at most once per stretch -- not just once
  // inside the restricted window -- so locking someone in early weeks also
  // takes them off the board for the rest of that same early stretch.
  function seasonStretch(week, settings) {
    if (week < settings.restrictedWindowStart) return 'pre';
    if (week <= settings.restrictedWindowEnd) return 'window';
    return 'post';
  }

  function ineligibilityReason(team, week, scheduleWeeks, settings) {
    const counts = meetingCounts(scheduleWeeks);
    const totalMeetings = counts[team] || 0;
    if (totalMeetings >= settings.maxMeetingsPerOpponent) {
      return 'already played the maximum number of times this season';
    }
    const stretch = seasonStretch(week, settings);
    const metInStretch = scheduleWeeks.some((w) => (
      w.locked
      && w.opponent === team
      && seasonStretch(w.week, settings) === stretch
    ));
    if (metInStretch) {
      return stretch === 'window'
        ? 'already played this team during the once-each window'
        : 'already played this team this stretch of the season';
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
        continue;
      }
      const stretches = {};
      for (const week of weeks) {
        const stretch = seasonStretch(week, settings);
        if (stretch === 'window') continue; // already covered above
        if (!stretches[stretch]) stretches[stretch] = [];
        stretches[stretch].push(week);
      }
      for (const stretch of Object.keys(stretches)) {
        if (stretches[stretch].length > 1) {
          violations.push({ type: 'repeated-in-stretch', team, weeks: stretches[stretch] });
        }
      }
    }
    return violations;
  }

  global.meetingCounts = meetingCounts;
  global.isRestrictedWeek = isRestrictedWeek;
  global.seasonStretch = seasonStretch;
  global.ineligibilityReason = ineligibilityReason;
  global.isEligible = isEligible;
  global.findScheduleViolations = findScheduleViolations;
  if (typeof module !== 'undefined') {
    module.exports = {
      meetingCounts, isRestrictedWeek, seasonStretch, ineligibilityReason, isEligible, findScheduleViolations,
    };
  }
})(typeof window !== 'undefined' ? window : global);
