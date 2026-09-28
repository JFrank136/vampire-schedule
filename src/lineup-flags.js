// matchup-tool/src/lineup-flags.js
(function (global) {
  const LINEUP_FLAG_ORDER = ['good', 'injury', 'bad'];

  function lineupFlagKey(week, team, player) {
    return week + ':' + team + ':' + player;
  }

  // null/undefined (default, unflagged) -> 'good' -> 'injury' -> 'bad' -> null.
  function nextLineupFlag(current) {
    if (!current) return LINEUP_FLAG_ORDER[0];
    const index = LINEUP_FLAG_ORDER.indexOf(current);
    if (index === -1 || index === LINEUP_FLAG_ORDER.length - 1) return null;
    return LINEUP_FLAG_ORDER[index + 1];
  }

  function rowsToLineupFlags(rows) {
    const flags = {};
    for (const row of rows) {
      flags[lineupFlagKey(row.week, row.team, row.player)] = row.flag;
    }
    return flags;
  }

  global.lineupFlagKey = lineupFlagKey;
  global.nextLineupFlag = nextLineupFlag;
  global.rowsToLineupFlags = rowsToLineupFlags;
  if (typeof module !== 'undefined') {
    module.exports = { lineupFlagKey, nextLineupFlag, rowsToLineupFlags };
  }
})(typeof window !== 'undefined' ? window : global);
