// scripts/refresh-weekly-projection.js
//
// Updates ONLY vampire_player_values' weekly-projection columns from the
// ../../in-season/data/processed/rankings_long.csv pipeline's Draft Sharks
// pull -- unlike refresh-data.js, this never wipes the table. It's a
// targeted UPDATE per matched player, so team/position/bye/injury_risk/
// three_d_value (all set at draft time) are left untouched.
//
// Two rolling slots are kept populated at once -- "current" (weekly_projection
// / weekly_projection_week) and "next" (weekly_projection_next /
// weekly_projection_next_week) -- per Jared: every available week's
// projection should stay visible until that week has actually passed, not
// just the single nearest one. scheduled_pull.ps1 calls this script twice
// per run, once per slot.
//
// Draft Sharks only, not blended with Boone/Smyth: those two only carry a
// rank in this pipeline (in-season/src/sources/yahoo_weekly_consensus.py
// pulls Yahoo's fanPro endpoint, which returns rank but no point value), so
// there's nothing numeric to average in. Boone/Smyth ranks feed other
// in-season tools instead.
//
// Usage: node scripts/refresh-weekly-projection.js <rankings_long.csv> <week> [scoring] [slot]
//   scoring defaults to "half-ppr" -- this league is 0.5 PPR (see docs/DATA.md).
//   slot defaults to "current"; the only other value is "next".
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCSV } = require('../src/csv-parser.js');
const { normalizeName } = require('../src/name-matching.js');

const SLOT_COLUMNS = {
  current: { projection: 'weekly_projection', week: 'weekly_projection_week' },
  next: { projection: 'weekly_projection_next', week: 'weekly_projection_next_week' },
};

async function main() {
  const [, , csvPath, weekArg, scoringArg, slotArg] = process.argv;
  const week = Number(weekArg);
  const scoring = scoringArg || 'half-ppr';
  const slot = slotArg || 'current';
  if (!csvPath || !weekArg || Number.isNaN(week)) {
    console.error('Usage: node scripts/refresh-weekly-projection.js <rankings_long.csv> <week> [scoring] [slot]');
    process.exit(1);
  }
  const columns = SLOT_COLUMNS[slot];
  if (!columns) {
    console.error(`Unknown slot "${slot}" -- must be "current" or "next".`);
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const csvText = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const allRows = parseCSV(csvText);

  const weekRows = allRows.filter(
    (r) => r.source === 'draftsharks' && r.scoring === scoring && Number(r.week) === week
  );
  if (weekRows.length === 0) {
    console.error(
      `Refusing to update weekly_projection: no draftsharks/${scoring} rows found for ` +
      `week ${week} in ${csvPath}. Check the file and week/scoring args.`
    );
    process.exit(1);
  }

  // A week can appear multiple times (Draft Sharks rankings get re-pulled
  // until it's played) -- the CSV is append-only, so keep only the latest
  // pulled_at per player.
  const latestByName = new Map();
  for (const row of weekRows) {
    const existing = latestByName.get(row.player_name);
    if (!existing || row.pulled_at > existing.pulled_at) {
      latestByName.set(row.player_name, row);
    }
  }

  const supabase = createClient(url, serviceKey);
  const { data: playerValues, error: fetchError } = await supabase
    .from('vampire_player_values')
    .select('player');
  if (fetchError) throw fetchError;
  if (!playerValues || playerValues.length === 0) {
    console.error('Refusing to update weekly_projection: vampire_player_values is empty. Run refresh-data.js first.');
    process.exit(1);
  }

  const normalizedIndex = new Map();
  for (const row of latestByName.values()) {
    normalizedIndex.set(normalizeName(row.player_name), row);
  }

  const matched = [];
  const unmatchedPlayers = [];
  for (const { player } of playerValues) {
    const row = normalizedIndex.get(normalizeName(player));
    if (row) {
      matched.push({ player, [columns.projection]: Number(row.projection), [columns.week]: week });
    } else {
      unmatchedPlayers.push(player);
    }
  }

  const matchRate = matched.length / playerValues.length;
  console.log(
    `Matched ${matched.length}/${playerValues.length} vampire_player_values rows ` +
    `(${(matchRate * 100).toFixed(0)}%) to week ${week} ${scoring} projections (slot: ${slot}).`
  );
  if (matchRate < 0.5) {
    console.error(
      'Refusing to proceed: match rate below 50% -- likely a name-matching or ' +
      'CSV-shape problem, not genuinely that many unranked players. Not updating anything.'
    );
    process.exit(1);
  }
  if (unmatchedPlayers.length > 0) {
    console.log(`  Unmatched (${unmatchedPlayers.length}, likely bench/inactive players not in this week's rankings):`);
    console.log(`    ${unmatchedPlayers.slice(0, 15).join(', ')}${unmatchedPlayers.length > 15 ? ', ...' : ''}`);
  }

  for (const row of matched) {
    const { error } = await supabase
      .from('vampire_player_values')
      .update({ [columns.projection]: row[columns.projection], [columns.week]: row[columns.week] })
      .eq('player', row.player);
    if (error) throw error;
  }

  console.log(`Done. Updated ${columns.projection} for ${matched.length} players (week ${week}, ${scoring}, slot: ${slot}).`);
}

main().catch((err) => {
  console.error('Weekly projection refresh failed:', err.message || err);
  process.exit(1);
});
