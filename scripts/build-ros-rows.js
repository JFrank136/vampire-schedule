// scripts/build-ros-rows.js
//
// Pure: turns in-season ros_rankings_long.csv rows (already parsed) into
// vampire_ros_projections rows. Draft Sharks only, one scoring format, and
// only the newest pull counts (the CSV is append-only, so older pulls are
// stale). Same-name players are disambiguated by position; an unresolved
// collision writes no row.
const { normalizeName } = require('../src/name-matching.js');

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function buildRosProjectionRows(csvRows, playerValues, scoring) {
  const format = scoring || 'half-ppr';
  const wanted = csvRows.filter((r) => r.source === 'draftsharks' && r.scoring === format);
  const latest = wanted.reduce((max, r) => (r.pulled_at > max ? r.pulled_at : max), '');
  const byName = new Map();
  for (const row of wanted.filter((r) => r.pulled_at === latest)) {
    const key = normalizeName(row.player_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  const rows = [];
  const ambiguous = [];
  for (const { player, position } of playerValues) {
    const candidates = byName.get(normalizeName(player)) || [];
    let row = null;
    if (candidates.length === 1) row = candidates[0];
    else if (candidates.length > 1) {
      row = candidates.find((c) => c.position === position) || null;
      if (!row) ambiguous.push(player);
    }
    if (!row) continue;
    rows.push({
      player,
      ros_ds_proj: numberOrNull(row.projection),
      ros_ceiling_proj: numberOrNull(row.ceiling_proj),
      ros_3d_value: numberOrNull(row.ds_value),
      as_of_week: numberOrNull(row.as_of_week),
    });
  }
  return { rows, ambiguous };
}

module.exports = { buildRosProjectionRows };
