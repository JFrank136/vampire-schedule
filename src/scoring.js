// matchup-tool/src/scoring.js
(function (global) {
  const normalizeName = typeof module !== 'undefined'
    ? require('./name-matching.js').normalizeName
    : global.normalizeName;

  const normalizedIndexCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  // How many starters each strict position needs, filled in this order
  // before FLEX. QB gets exactly 1 slot (this is a 1-QB league); RB/WR get
  // 2 each; TE gets 1. FLEX (below) is filled last from whatever RB/WR/TE
  // is left over.
  const STARTER_COUNTS = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];

  function eligiblePositionsForSlot(slot) {
    if (slot === 'FLEX') return FLEX_ELIGIBLE;
    return STARTER_COUNTS[slot] ? [slot] : [slot];
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
  // all (i.e. at least one player in the pool has that week in either slot
  // below)? Distinguishes "this player is missing because the week hasn't
  // been pulled yet" (blank -- nobody has a number) from "this player is
  // missing even though the week WAS pulled" (they were excluded -- Draft
  // Sharks drops inactive/injured players from the list entirely instead of
  // ranking them at 0, confirmed live on draftsharks.com/weekly-rankings/rb).
  function weekHasPublishedData(draftSharksData, week) {
    return Object.values(draftSharksData).some(
      (info) => info.weeklyProjectionWeek === week || info.weeklyProjectionNextWeek === week
    );
  }

  // Two rolling slots ("current" and "next") are kept pushed at once, per
  // Jared: every available week's projection should stay visible until that
  // week has actually passed, not just the single nearest one. Returns the
  // matched projection for `week` (from whichever slot holds it, checked
  // current-then-next since a scheduling hiccup could leave next stale after
  // current has already rolled forward), or undefined if neither slot is for
  // this week at all (as opposed to null, meaning the slot matched but Draft
  // Sharks had no number for this player).
  function projectionForWeek(info, week) {
    if (info.weeklyProjectionWeek === week) return info.weeklyProjection != null ? info.weeklyProjection : null;
    if (info.weeklyProjectionNextWeek === week) return info.weeklyProjectionNext != null ? info.weeklyProjectionNext : null;
    return undefined;
  }

  // Same two-slot lookup as projectionForWeek, but for the player's game
  // opponent that week (e.g. "@DAL", "BUF") -- pulled from the same Draft
  // Sharks row as the projection, so it's only ever present for a week that
  // slot actually covers.
  function opponentForWeek(info, week) {
    if (info.weeklyProjectionWeek === week) return info.weeklyOpponent || null;
    if (info.weeklyProjectionNextWeek === week) return info.weeklyOpponentNext || null;
    return undefined;
  }

  function playerScore(playerName, draftSharksData, week, weekHasData) {
    const info = findPlayerInfo(playerName, draftSharksData);
    if (!info) {
      return {
        value: 0, hasData: false, onBye: false, injuryRisk: null, found: false,
        weeklyProjection: null, threeDValue: null, opponent: null,
      };
    }

    const hasWeekData = weekHasData !== undefined ? weekHasData : weekHasPublishedData(draftSharksData, week);
    const onBye = info.bye === week;
    const threeDValue = info.threeDValue != null ? info.threeDValue : null;

    const slotProjection = projectionForWeek(info, week);
    let weeklyProjection;
    if (slotProjection !== undefined && slotProjection != null) {
      weeklyProjection = slotProjection;
    } else if (!onBye && hasWeekData) {
      // This week was published but this player isn't in it -- excluded
      // (inactive/injured), which functionally means 0, not "unknown".
      weeklyProjection = 0;
    } else {
      weeklyProjection = null;
    }
    const opponent = opponentForWeek(info, week) || null;

    const base = weeklyProjection != null ? weeklyProjection : threeDValue;
    const hasData = onBye || base != null;
    const value = onBye ? 0 : base;

    return { value, hasData, onBye, injuryRisk: info.injuryRisk, found: true, weeklyProjection, threeDValue, opponent };
  }

  function isOutScore(score) {
    return score.onBye || (score.hasData && score.value === 0);
  }

  // Sorts highest-value-first; a null/undefined value (no data at all, not
  // even a 3D Value) sorts last rather than crashing the comparison.
  function byValueDescending(a, b) {
    const av = a.value == null ? -Infinity : a.value;
    const bv = b.value == null ? -Infinity : b.value;
    return bv - av;
  }

  // Builds this week's actual best lineup purely from projected value --
  // there is no more fixed CSV lineup_slot/starter assignment (see
  // docs/DATA.md). Every rostered player at a position is a candidate; the
  // best STARTER_COUNTS[position] players fill that position's slots, then
  // the single best remaining RB/WR/TE fills FLEX. A player who'd be forced
  // into their own slot on a bye/out week only stays there if the roster has
  // no healthy alternative at that position -- with one, they're bumped to
  // the bench automatically.
  function autoLineup(teamPlayers, draftSharksData, week) {
    const hasWeekData = weekHasPublishedData(draftSharksData, week);
    const scored = teamPlayers.map((p) => ({
      player: p.player,
      position: p.position,
      ...playerScore(p.player, draftSharksData, week, hasWeekData),
    }));

    const used = new Set();
    const starters = [];

    for (const position of Object.keys(STARTER_COUNTS)) {
      const pool = scored.filter((p) => p.position === position && !used.has(p.player)).sort(byValueDescending);
      const count = STARTER_COUNTS[position];
      pool.slice(0, count).forEach((p, i) => {
        used.add(p.player);
        starters.push({ ...p, slot: count > 1 ? position + (i + 1) : position });
      });
    }

    const flexPool = scored.filter((p) => FLEX_ELIGIBLE.includes(p.position) && !used.has(p.player)).sort(byValueDescending);
    if (flexPool[0]) {
      used.add(flexPool[0].player);
      starters.push({ ...flexPool[0], slot: 'FLEX' });
    }

    const bench = scored.filter((p) => !used.has(p.player));
    return { starters, bench };
  }

  function toBreakdownRow(s) {
    return {
      player: s.player,
      position: s.position,
      slot: s.slot,
      value: s.value,
      hasData: s.hasData,
      onBye: s.onBye,
      injuryRisk: s.injuryRisk,
      weeklyProjection: s.weeklyProjection,
      threeDValue: s.threeDValue,
      opponent: s.opponent,
      isOut: isOutScore(s),
    };
  }

  function teamWeekBreakdown(teamPlayers, draftSharksData, week) {
    return autoLineup(teamPlayers, draftSharksData, week).starters.map(toBreakdownRow);
  }

  // The bench's best FLEX-eligible player (RB/WR/TE -- a backup QB isn't a
  // usable bench option in a 1-QB league), scored the same week-aware way as
  // starters -- shown alongside the lineup as "best available" context.
  function teamBenchTopPlayer(teamPlayers, draftSharksData, week) {
    const { bench } = autoLineup(teamPlayers, draftSharksData, week);
    const eligible = bench.filter((b) => FLEX_ELIGIBLE.includes(b.position) && b.value != null).sort(byValueDescending);
    return eligible[0] || null;
  }

  function teamWeekScore(teamPlayers, draftSharksData, week) {
    return autoLineup(teamPlayers, draftSharksData, week).starters
      .reduce((total, s) => total + (s.value || 0), 0);
  }

  // Full roster view for the Rosters tab: starters in slot order (the order
  // a lineup card is normally read in), and the bench sorted by 3D Value --
  // the season-long draft-day number, not this week's projection, since the
  // Rosters tab is meant for browsing depth, not this week's decision.
  const SLOT_ORDER = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX'];
  function scoredRoster(teamPlayers, draftSharksData, week) {
    const { starters, bench } = autoLineup(teamPlayers, draftSharksData, week);
    const orderedStarters = SLOT_ORDER
      .map((slot) => starters.find((s) => s.slot === slot))
      .filter(Boolean)
      .map(toBreakdownRow);
    const sortedBench = bench.slice().sort((a, b) => {
      const av = a.threeDValue == null ? -Infinity : a.threeDValue;
      const bv = b.threeDValue == null ? -Infinity : b.threeDValue;
      return bv - av;
    }).map(toBreakdownRow);
    return { starters: orderedStarters, bench: sortedBench };
  }

  global.playerScore = playerScore;
  global.teamWeekBreakdown = teamWeekBreakdown;
  global.teamBenchTopPlayer = teamBenchTopPlayer;
  global.teamWeekScore = teamWeekScore;
  global.findPlayerInfo = findPlayerInfo;
  global.eligiblePositionsForSlot = eligiblePositionsForSlot;
  global.weekHasPublishedData = weekHasPublishedData;
  global.projectionForWeek = projectionForWeek;
  global.opponentForWeek = opponentForWeek;
  global.autoLineup = autoLineup;
  global.scoredRoster = scoredRoster;
  if (typeof module !== 'undefined') {
    module.exports = {
      playerScore, teamWeekBreakdown, teamBenchTopPlayer, teamWeekScore, findPlayerInfo,
      eligiblePositionsForSlot, weekHasPublishedData, projectionForWeek, opponentForWeek,
      autoLineup, scoredRoster,
    };
  }
})(typeof window !== 'undefined' ? window : global);
