// matchup-tool/src/rosters-parser.js
(function (global) {
  const parseCSV = typeof module !== 'undefined'
    ? require('./csv-parser.js').parseCSV
    : global.parseCSV;

  function parseRosters(text) {
    const records = parseCSV(text);
    const rosters = {};
    for (const record of records) {
      const team = (record.team || '').trim();
      const player = (record.player || '').trim();
      if (!team || !player) continue;
      if (!rosters[team]) rosters[team] = [];
      rosters[team].push({
        player,
        position: record.position,
        lineupSlot: record.lineup_slot,
        starter: record.starter === '1',
      });
    }
    return rosters;
  }

  global.parseRosters = parseRosters;
  if (typeof module !== 'undefined') module.exports = { parseRosters };
})(typeof window !== 'undefined' ? window : global);
