// matchup-tool/src/weekly-viewer.js
//
// Pure logic for the Rosters tab "weekly viewer": what a team's realistic
// lineup looks like each week, and its floor / DS projection / ceiling totals.
//
// The lineup is built from 3D value ONLY (a proxy for who the opponent
// realistically starts) -- deliberately different from autoLineup in
// scoring.js, which ranks by weekly projection. Projections are used only to
// score the lineup once it's chosen.
(function (global) {
  const scoring = typeof module !== 'undefined' ? require('./scoring.js') : global;
  const STARTER_COUNTS = scoring.STARTER_COUNTS;
  const FLEX_ELIGIBLE = scoring.FLEX_ELIGIBLE;

  // Highest 3D value first; a player with no 3D value sorts last. Name is the
  // tiebreak so lineups are deterministic.
  function byThreeDDescending(a, b) {
    const av = a.threeDValue == null ? -Infinity : a.threeDValue;
    const bv = b.threeDValue == null ? -Infinity : b.threeDValue;
    if (bv !== av) return bv > av ? 1 : -1;
    return a.player < b.player ? -1 : a.player > b.player ? 1 : 0;
  }

  function threeDOf(playerInfo, player) {
    const info = playerInfo[player];
    return info && info.threeDValue != null ? info.threeDValue : null;
  }

  function valueLineup(teamPlayers, playerInfo, week) {
    const candidates = teamPlayers
      .filter((p) => !(playerInfo[p.player] && playerInfo[p.player].bye === week))
      .map((p) => ({ player: p.player, position: p.position, threeDValue: threeDOf(playerInfo, p.player) }));

    const used = new Set();
    const starters = [];
    for (const position of Object.keys(STARTER_COUNTS)) {
      const count = STARTER_COUNTS[position];
      candidates
        .filter((p) => p.position === position)
        .sort(byThreeDDescending)
        .slice(0, count)
        .forEach((p, i) => {
          used.add(p.player);
          starters.push({ ...p, slot: count > 1 ? position + (i + 1) : position });
        });
    }
    const flex = candidates
      .filter((p) => FLEX_ELIGIBLE.includes(p.position) && !used.has(p.player))
      .sort(byThreeDDescending)[0];
    if (flex) starters.push({ ...flex, slot: 'FLEX' });
    return starters;
  }

  // Scores a chosen lineup for one week. A starter with no projection row for
  // that week contributes 0 and is counted in `missing` so the UI can flag it.
  function lineupTotals(starters, projections, week) {
    let floor = 0; let proj = 0; let ceiling = 0; let missing = 0;
    const rows = starters.map((s) => {
      const p = projections[s.player] && projections[s.player][week];
      if (!p) {
        missing += 1;
        return { ...s, floor: null, proj: null, ceiling: null, opponent: null };
      }
      floor += p.floor || 0;
      proj += p.proj || 0;
      ceiling += p.ceiling || 0;
      return { ...s, floor: p.floor, proj: p.proj, ceiling: p.ceiling, opponent: p.opponent };
    });
    return { floor, proj, ceiling, missing, rows };
  }

  // Best week = highest DS proj lineup total, worst = lowest (first week wins
  // ties). With a stealTarget, weeks where that player is on bye are dropped
  // first (you can only steal a player who starts), so best/worst are over
  // the remaining weeks only.
  function buildWeeklyView(teamPlayers, playerInfo, projections, options) {
    const { startWeek, endWeek, stealTarget } = options;
    const stealBye = stealTarget && playerInfo[stealTarget] ? playerInfo[stealTarget].bye : null;
    const weeks = [];
    for (let week = startWeek; week <= endWeek; week += 1) {
      if (stealBye != null && stealBye === week) continue;
      const starters = valueLineup(teamPlayers, playerInfo, week);
      weeks.push({ week, ...lineupTotals(starters, projections, week) });
    }
    let best = null; let worst = null;
    for (const w of weeks) {
      if (best === null || w.proj > best.proj) best = w;
      if (worst === null || w.proj < worst.proj) worst = w;
    }
    return {
      weeks,
      bestWeek: best ? best.week : null,
      worstWeek: weeks.length >= 2 && worst ? worst.week : null,
    };
  }

  function topByValue(teamPlayers, playerInfo, count) {
    const n = count == null ? 3 : count;
    return teamPlayers
      .map((p) => ({ player: p.player, position: p.position, threeDValue: threeDOf(playerInfo, p.player) }))
      .filter((p) => p.threeDValue != null)
      .sort(byThreeDDescending)
      .slice(0, n);
  }

  function rowsToWeeklyProjections(rows) {
    const out = {};
    for (const row of rows) {
      if (!out[row.player]) out[row.player] = {};
      out[row.player][row.week] = {
        floor: row.floor_proj, proj: row.ds_proj, ceiling: row.ceiling_proj, opponent: row.opponent,
      };
    }
    return out;
  }

  global.valueLineup = valueLineup;
  global.lineupTotals = lineupTotals;
  global.buildWeeklyView = buildWeeklyView;
  global.topByValue = topByValue;
  global.rowsToWeeklyProjections = rowsToWeeklyProjections;
  if (typeof module !== 'undefined') {
    module.exports = { valueLineup, lineupTotals, buildWeeklyView, topByValue, rowsToWeeklyProjections };
  }
})(typeof window !== 'undefined' ? window : global);
