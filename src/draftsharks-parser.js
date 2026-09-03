// matchup-tool/src/draftsharks-parser.js
(function (global) {
  const parseCSV = typeof module !== 'undefined'
    ? require('./csv-parser.js').parseCSV
    : global.parseCSV;

  function toNumber(value) {
    if (value === undefined || value === null) return null;
    const cleaned = String(value).replace('%', '').trim();
    if (cleaned === '') return null;
    const num = Number(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  function parseDraftSharks(text) {
    const records = parseCSV(text);
    const players = {};
    for (const record of records) {
      const name = (record.Player || '').trim();
      if (!name) continue;
      players[name] = {
        team: record.Team,
        position: record['Fantasy Position'],
        bye: toNumber(record.Bye),
        injuryRisk: toNumber(record.InjuryRisk),
        threeDValue: toNumber(record['3D Value']),
        weeklyProjection: null,
      };
    }
    return players;
  }

  global.parseDraftSharks = parseDraftSharks;
  if (typeof module !== 'undefined') module.exports = { parseDraftSharks };
})(typeof window !== 'undefined' ? window : global);
