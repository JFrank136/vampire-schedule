// matchup-tool/src/scoring.js
(function (global) {
  const normalizeName = typeof module !== 'undefined'
    ? require('./name-matching.js').normalizeName
    : global.normalizeName;

  const normalizedIndexCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  // Slots the roster CSV actually uses (see rosters.csv) -- FLEX is the only
  // one eligible for more than one position.
  const SLOT_POSITIONS = {
    QB: ['QB'],
    RB1: ['RB'],
    RB2: ['RB'],
    WR1: ['WR'],
    WR2: ['WR'],
    TE: ['TE'],
    FLEX: ['RB', 'WR', 'TE'],
  };

  function eligiblePositionsForSlot(slot) {
    return SLOT_POSITIONS[slot] || [slot];
  }

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

  // Is `week` a week Draft Sharks actually published projections for, at
  // all (i.e. at least one player in the pool has weeklyProjectionWeek ===
  // week)? Distinguishes "this player is missing because the week hasn't
  // been pulled yet" (blank -- nobody has a number) from "this player is
  // missing even though the week WAS pulled" (they were excluded -- Draft
  // Sharks drops inactive/injured players from the list entirely instead of
  // ranking them at 0, confirmed live on draftsharks.com/weekly-rankings/rb).
  function weekHasPublishedData(draftSharksData, week) {
    return Object.values(draftSharksData).some((info) => info.weeklyProjectionWeek === week);
  }

  // weekly_projection is a single column that always reflects whichever week
  // was last pushed by refresh-weekly-projection.js -- weeklyProjectionWeek
  // records which week that actually was, so viewing any other week (e.g.
  // paging forward to a future week that hasn't been pulled yet) correctly
  // shows no weekly number instead of stale/mismatched data.
  function playerScore(playerName, draftSharksData, week, weekHasData) {
    const info = findPlayerInfo(playerName, draftSharksData);
    if (!info) return { value: 0, hasData: false, onBye: false, injuryRisk: null, found: false, weeklyProjection: null, threeDValue: null };

    const hasWeekData = weekHasData !== undefined ? weekHasData : weekHasPublishedData(draftSharksData, week);
    const onBye = info.bye === week;
    const threeDValue = info.threeDValue != null ? info.threeDValue : null;

    let weeklyProjection;
    if (info.weeklyProjectionWeek === week && info.weeklyProjection != null) {
      weeklyProjection = info.weeklyProjection;
    } else if (!onBye && hasWeekData) {
      // This week was published but this player isn't in it -- excluded
      // (inactive/injured), which functionally means 0, not "unknown".
      weeklyProjection = 0;
    } else {
      weeklyProjection = null;
    }

    const base = weeklyProjection != null ? weeklyProjection : threeDValue;
    const hasData = onBye || base != null;
    const value = onBye ? 0 : base;

    return { value, hasData, onBye, injuryRisk: info.injuryRisk, found: true, weeklyProjection, threeDValue };
  }

  function isOutScore(score) {
    return score.onBye || (score.hasData && score.value === 0);
  }

  // Bench players scored the same way starters are -- prefers this week's
  // real weekly projection over the season-long 3D Value fallback, so a
  // bench replacement suggestion reflects who's actually projected well
  // *this week*, not just who was highly valued on draft day.
  function scoredBench(teamPlayers, draftSharksData, week, hasWeekData) {
    return teamPlayers
      .filter((p) => !p.starter)
      .map((p) => ({ player: p.player, position: p.position, ...playerScore(p.player, draftSharksData, week, hasWeekData) }));
  }

  function teamWeekBreakdown(teamPlayers, draftSharksData, week) {
    const hasWeekData = weekHasPublishedData(draftSharksData, week);
    const starters = teamPlayers.filter((p) => p.starter);
    const bench = scoredBench(teamPlayers, draftSharksData, week, hasWeekData)
      .filter((b) => b.value != null)
      .sort((a, b) => b.value - a.value);

    const usedBench = new Set();
    return starters.map((p) => {
      const score = playerScore(p.player, draftSharksData, week, hasWeekData);
      const out = isOutScore(score);
      let replacement = null;
      if (out) {
        const eligible = eligiblePositionsForSlot(p.lineupSlot);
        const candidate = bench.find((b) => !usedBench.has(b.player) && eligible.includes(b.position));
        if (candidate) {
          usedBench.add(candidate.player);
          replacement = { player: candidate.player, value: candidate.value, weeklyProjection: candidate.weeklyProjection, threeDValue: candidate.threeDValue };
        }
      }
      return {
        player: p.player,
        slot: p.lineupSlot,
        value: score.value,
        hasData: score.hasData,
        onBye: score.onBye,
        injuryRisk: score.injuryRisk,
        weeklyProjection: score.weeklyProjection,
        threeDValue: score.threeDValue,
        isOut: out,
        replacement,
      };
    });
  }

  // The bench's best FLEX-eligible player (RB/WR/TE -- a backup QB isn't a
  // usable bench option in a 1-QB league), scored the same week-aware way as
  // starters -- shown alongside the lineup as "best available" context.
  function teamBenchTopPlayer(teamPlayers, draftSharksData, week) {
    const hasWeekData = weekHasPublishedData(draftSharksData, week);
    const flexEligible = eligiblePositionsForSlot('FLEX');
    const bench = scoredBench(teamPlayers, draftSharksData, week, hasWeekData)
      .filter((b) => flexEligible.includes(b.position) && b.value != null)
      .sort((a, b) => b.value - a.value);
    return bench[0] || null;
  }

  // An out starter with a bench replacement contributes the replacement's
  // value, not their own 0 -- a realistic manager swaps them in, so the
  // team's projected total (and the weakest-opponent ranking/margin built on
  // it) should reflect that lineup, not count a guaranteed zero.
  function teamWeekScore(teamPlayers, draftSharksData, week) {
    return teamWeekBreakdown(teamPlayers, draftSharksData, week)
      .reduce((total, row) => total + ((row.replacement ? row.replacement.value : row.value) || 0), 0);
  }

  global.playerScore = playerScore;
  global.teamWeekBreakdown = teamWeekBreakdown;
  global.teamBenchTopPlayer = teamBenchTopPlayer;
  global.teamWeekScore = teamWeekScore;
  global.findPlayerInfo = findPlayerInfo;
  global.eligiblePositionsForSlot = eligiblePositionsForSlot;
  global.weekHasPublishedData = weekHasPublishedData;
  if (typeof module !== 'undefined') {
    module.exports = {
      playerScore, teamWeekBreakdown, teamBenchTopPlayer, teamWeekScore, findPlayerInfo,
      eligiblePositionsForSlot, weekHasPublishedData,
    };
  }
})(typeof window !== 'undefined' ? window : global);
