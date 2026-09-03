// matchup-tool/src/schedule-generator.js
(function (global) {
  const isEligible = typeof module !== 'undefined'
    ? require('./rules.js').isEligible
    : global.isEligible;

  function generateSeasonSchedule(teamNames, settings, existingSchedule) {
    const existingByWeek = {};
    (existingSchedule || []).forEach((w) => { existingByWeek[w.week] = w; });

    const working = [];
    const newlyGeneratedWeeks = new Set();
    let cursor = 0;

    for (let week = 1; week <= settings.lastRegularSeasonWeek; week += 1) {
      const existing = existingByWeek[week];
      if (existing && existing.locked) {
        working.push({ ...existing });
        continue;
      }

      let opponent = null;
      for (let attempt = 0; attempt < teamNames.length; attempt += 1) {
        const candidate = teamNames[(cursor + attempt) % teamNames.length];
        if (isEligible(candidate, week, working, settings)) {
          opponent = candidate;
          cursor = (cursor + attempt + 1) % teamNames.length;
          break;
        }
      }
      // Marked locked here only so isEligible's scan (which counts locked
      // meetings) sees this pick when evaluating later weeks in this same
      // pass; flipped back to unlocked below since it's still tentative.
      working.push({ week, opponent, locked: true, result: null, note: '' });
      newlyGeneratedWeeks.add(week);
    }

    return working.map((w) => (
      newlyGeneratedWeeks.has(w.week) ? { ...w, locked: false } : w
    ));
  }

  global.generateSeasonSchedule = generateSeasonSchedule;
  if (typeof module !== 'undefined') module.exports = { generateSeasonSchedule };
})(typeof window !== 'undefined' ? window : global);
