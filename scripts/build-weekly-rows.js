// scripts/build-weekly-rows.js
//
// Pure: turns the in-season rankings_long.csv rows (already parsed) into
// vampire_weekly_projections rows for every week in the file. Same rules as
// refresh-weekly-projection.js: Draft Sharks only, one scoring format, only
// the newest pull of each week counts, and same-name players are
// disambiguated by position (an unresolved collision writes no row).
const { normalizeName } = require('../src/name-matching.js');

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function buildWeeklyProjectionRows(csvRows, playerValues, scoring) {
  const format = scoring || 'half-ppr';
  const wanted = csvRows.filter((r) => r.source === 'draftsharks' && r.scoring === format);

  const byWeek = new Map();
  for (const row of wanted) {
    const week = Number(row.week);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(row);
  }

  const rows = [];
  const ambiguous = new Set();
  for (const [week, weekRows] of byWeek) {
    const latest = weekRows.reduce((max, r) => (r.pulled_at > max ? r.pulled_at : max), '');
    const byName = new Map();
    for (const row of weekRows.filter((r) => r.pulled_at === latest)) {
      const key = normalizeName(row.player_name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(row);
    }
    for (const { player, position } of playerValues) {
      const candidates = byName.get(normalizeName(player)) || [];
      let row = null;
      if (candidates.length === 1) row = candidates[0];
      else if (candidates.length > 1) {
        row = candidates.find((c) => c.position === position) || null;
        if (!row) ambiguous.add(player);
      }
      if (!row) continue;
      rows.push({
        player,
        week,
        floor_proj: numberOrNull(row.floor_proj),
        ds_proj: numberOrNull(row.projection),
        ceiling_proj: numberOrNull(row.ceiling_proj),
        opponent: row.opponent || null,
      });
    }
  }
  rows.sort((a, b) => a.week - b.week || (a.player < b.player ? -1 : 1));
  return { rows, ambiguous: [...ambiguous] };
}

module.exports = { buildWeeklyProjectionRows };
