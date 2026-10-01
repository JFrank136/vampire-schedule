// matchup-tool/src/weekly-viewer.js
//
// Pure logic for the Rosters tab "weekly viewer": what a team's realistic
// lineup looks like each week, its DS projection total, and who is on bye.
//
// The lineup is built from 3D value ONLY (a proxy for who the opponent
// realistically starts) -- deliberately different from autoLineup in
// scoring.js, which ranks by weekly projection. Projections are used only to
// score the lineup once it's chosen.
(function (global) {
  const scoring = typeof module !== 'undefined' ? require('./scoring.js') : global;
  const STARTER_COUNTS = scoring.STARTER_COUNTS;
  const FLEX_ELIGIBLE = scoring.FLEX_ELIGIBLE;
  const normalizeName = typeof module !== 'undefined' ? require('./name-matching.js').normalizeName : global.normalizeName;

  // The rosters sheet and DraftSharks spell some names differently
  // ("Kenneth Walker" vs "Kenneth Walker III"). Re-key a name-keyed source
  // (player info or weekly projections) by the roster's own spelling so every
  // lookup below can stay a plain `source[player]`.
  function rekeyByRoster(source, rosterPlayers) {
    const index = {};
    for (const name of Object.keys(source || {})) index[normalizeName(name)] = name;
    const out = {};
    for (const p of rosterPlayers) {
      const key = source && source[p.player] ? p.player : index[normalizeName(p.player)];
      if (key !== undefined) out[p.player] = source[key];
    }
    return out;
  }

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

  const REPLACEMENT_NAME = 'Free agent';

  // A player with no weekly-projection row in a week DraftSharks has published
  // is inactive/injured (same rule the picker uses), so he can't be started
  // even though his draft-day 3D value is still high.
  function outPlayersForWeek(teamPlayers, projections, week, fullProjections) {
    if (!projections) return new Set();
    const have = teamPlayers.filter((p) => projections[p.player] && projections[p.player][week]).length;
    const published = Object.keys(projections).some((n) => projections[n] && projections[n][week]);
    if (!published || have === 0) return new Set();
    return new Set(teamPlayers.filter((p) => !(projections[p.player] && projections[p.player][week])).map((p) => p.player));
  }

  function valueLineup(teamPlayers, playerInfo, week, outSet) {
    const out = outSet || new Set();
    const candidates = teamPlayers
      .filter((p) => !out.has(p.player))
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
      // A position the team can't fill (bye / no depth) gets a free-agent
      // stand-in instead of an empty slot, scored at replacement level.
      const filled = starters.filter((p) => p.position === position).length;
      for (let i = filled; i < count; i += 1) {
        starters.push({ player: REPLACEMENT_NAME, position, threeDValue: null, replacement: true, slot: count > 1 ? position + (i + 1) : position });
      }
    }
    const flex = candidates
      .filter((p) => FLEX_ELIGIBLE.includes(p.position) && !used.has(p.player))
      .sort(byThreeDDescending)[0];
    starters.push(flex
      ? { ...flex, slot: 'FLEX' }
      : { player: REPLACEMENT_NAME, position: 'FLEX', threeDValue: null, replacement: true, slot: 'FLEX' });
    return starters;
  }

  // Median DS proj of the league's bench-tier players at each position (those
  // ranked past the league's starter count), per week: what a streamer off the
  // waiver wire realistically scores. Used to fill a slot the team can't.
  function replacementLevels(rosters, playerInfo, projections, startWeek, endWeek) {
    const teams = Object.keys(rosters);
    const players = [];
    for (const team of teams) for (const p of rosters[team]) players.push(p);
    playerInfo = rekeyByRoster(playerInfo, players);
    projections = rekeyByRoster(projections, players);
    const levels = {};
    for (let week = startWeek; week <= endWeek; week += 1) {
      levels[week] = {};
      for (const position of Object.keys(STARTER_COUNTS)) {
        const values = players
          .filter((p) => p.position === position && !(playerInfo[p.player] && playerInfo[p.player].bye === week))
          .map((p) => projections[p.player] && projections[p.player][week] && projections[p.player][week].proj)
          .filter((v) => v != null)
          .sort((x, y) => y - x);
        const tail = values.slice(teams.length * STARTER_COUNTS[position]);
        const pool = tail.length ? tail : values.slice(-1);
        levels[week][position] = pool.length ? pool[Math.floor((pool.length - 1) / 2)] : 0;
      }
    }
    return levels;
  }

  function replacementProj(position, levelsForWeek) {
    if (!levelsForWeek) return 0;
    if (position === 'FLEX') return Math.max(...FLEX_ELIGIBLE.map((pos) => levelsForWeek[pos] || 0));
    return levelsForWeek[position] || 0;
  }

  // Scores a chosen lineup for one week. A real starter with no projection row
  // for that week contributes 0 and is counted in `missing` so the UI can flag
  // it. A replacement stand-in (or, when `levelsForWeek` is given, a starter
  // with no row, also counted in `missing`) is scored at replacement level.
  function lineupTotals(starters, projections, week, levelsForWeek) {
    let floor = 0; let proj = 0; let ceiling = 0; let missing = 0;
    const rows = starters.map((s) => {
      if (s.replacement) {
        const value = replacementProj(s.position, levelsForWeek);
        proj += value;
        return { ...s, floor: null, proj: value, ceiling: null, opponent: null };
      }
      const p = projections[s.player] && projections[s.player][week];
      if (!p) {
        missing += 1;
        // With levels supplied (the weekly viewer) a starter with no row is
        // estimated at replacement level so one gap doesn't sink the week.
        if (!levelsForWeek) return { ...s, floor: null, proj: null, ceiling: null, opponent: null };
        const value = replacementProj(s.position, levelsForWeek);
        proj += value;
        return { ...s, floor: null, proj: value, ceiling: null, opponent: null, estimated: true };
      }
      floor += p.floor || 0;
      proj += p.proj || 0;
      ceiling += p.ceiling || 0;
      return { ...s, floor: p.floor, proj: p.proj, ceiling: p.ceiling, opponent: p.opponent };
    });
    return { floor, proj, ceiling, missing, rows };
  }

  // One entry per week: the lineup, its DS proj total, and who is on bye.
  function buildWeeklyView(teamPlayers, playerInfo, projections, options) {
    const { startWeek, endWeek, levels } = options;
    // Published-week detection needs the whole league's rows, so keep the
    // original map for that and re-key only this team's lookups.
    const fullProjections = projections;
    projections = rekeyByRoster(projections, teamPlayers);
    playerInfo = rekeyByRoster(playerInfo, teamPlayers);
    const weeks = [];
    for (let week = startWeek; week <= endWeek; week += 1) {
      const outSet = outPlayersForWeek(teamPlayers, projections, week);
      const starters = valueLineup(teamPlayers, playerInfo, week, outSet);
      const outPlayers = teamPlayers
        .filter((p) => outSet.has(p.player) && !(playerInfo[p.player] && playerInfo[p.player].bye === week))
        .map((p) => ({ player: p.player, position: p.position, threeDValue: threeDOf(playerInfo, p.player) }))
        .sort(byThreeDDescending);
      const byePlayers = teamPlayers
        .filter((p) => playerInfo[p.player] && playerInfo[p.player].bye === week)
        .map((p) => ({ player: p.player, position: p.position, threeDValue: threeDOf(playerInfo, p.player) }))
        .sort(byThreeDDescending);
      const totals = lineupTotals(starters, projections, week, levels && levels[week]);
      const threeD = totals.rows.reduce((sum, r) => sum + (r.threeDValue || 0), 0);
      weeks.push({ week, byePlayers, outPlayers, threeD, ...totals });
    }
    return { weeks };
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
  global.replacementLevels = replacementLevels;
  global.rowsToWeeklyProjections = rowsToWeeklyProjections;
  if (typeof module !== 'undefined') {
    module.exports = { valueLineup, lineupTotals, buildWeeklyView, replacementLevels, rowsToWeeklyProjections };
  }
})(typeof window !== 'undefined' ? window : global);
