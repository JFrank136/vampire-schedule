// matchup-tool/src/scoring.js
(function (global) {
  const normalizeName = typeof module !== 'undefined'
    ? require('./name-matching.js').normalizeName
    : global.normalizeName;

  const normalizedIndexCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function buildNormalizedIndex(draftSharksData) {
    const index = {};
    for (const name of Object.keys(draftSharksData)) {
      index[normalizeName(name)] = name;
    }
    return index;
  }

  function findPlayerInfo(playerName, draftSharksData) {
    const exact = draftSharksData[playerName];
    if (exact) return exact;

    let index = normalizedIndexCache && normalizedIndexCache.get(draftSharksData);
    if (!index) {
      index = buildNormalizedIndex(draftSharksData);
      if (normalizedIndexCache) normalizedIndexCache.set(draftSharksData, index);
    }
    const matchedName = index[normalizeName(playerName)];
    return matchedName ? draftSharksData[matchedName] : undefined;
  }

  function playerScore(playerName, draftSharksData, week) {
    const info = findPlayerInfo(playerName, draftSharksData);
    if (!info) return { value: 0, onBye: false, injuryRisk: null, found: false };
    const onBye = info.bye === week;
    const base = info.weeklyProjection !== null && info.weeklyProjection !== undefined
      ? info.weeklyProjection
      : info.threeDValue;
    const value = onBye ? 0 : (base || 0);
    return { value, onBye, injuryRisk: info.injuryRisk, found: true };
  }

  function teamWeekBreakdown(teamPlayers, draftSharksData, week) {
    return teamPlayers
      .filter((p) => p.starter)
      .map((p) => {
        const score = playerScore(p.player, draftSharksData, week);
        return {
          player: p.player,
          slot: p.lineupSlot,
          value: score.value,
          onBye: score.onBye,
          injuryRisk: score.injuryRisk,
        };
      });
  }

  function teamWeekScore(teamPlayers, draftSharksData, week) {
    return teamWeekBreakdown(teamPlayers, draftSharksData, week)
      .reduce((total, row) => total + row.value, 0);
  }

  global.playerScore = playerScore;
  global.teamWeekBreakdown = teamWeekBreakdown;
  global.teamWeekScore = teamWeekScore;
  if (typeof module !== 'undefined') {
    module.exports = { playerScore, teamWeekBreakdown, teamWeekScore };
  }
})(typeof window !== 'undefined' ? window : global);
