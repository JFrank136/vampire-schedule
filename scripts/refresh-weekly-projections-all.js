// scripts/refresh-weekly-projections-all.js
//
// Loads EVERY Draft Sharks week (floor / DS proj / ceiling / opponent) from
// the in-season rankings_long.csv into vampire_weekly_projections, for the
// Rosters tab weekly viewer. Independent of the two-slot columns on
// vampire_player_values that refresh-weekly-projection.js maintains -- this
// only upserts into its own table and never deletes.
//
// Usage: node scripts/refresh-weekly-projections-all.js <rankings_long.csv> [scoring]
//   scoring defaults to "half-ppr" (this league is 0.5 PPR).
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCSV } = require('../src/csv-parser.js');
const { buildWeeklyProjectionRows } = require('./build-weekly-rows.js');

const CHUNK = 500;

async function main() {
  const [, , csvPath, scoringArg] = process.argv;
  const scoring = scoringArg || 'half-ppr';
  if (!csvPath) {
    console.error('Usage: node scripts/refresh-weekly-projections-all.js <rankings_long.csv> [scoring]');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const csvRows = parseCSV(fs.readFileSync(path.resolve(csvPath), 'utf8'));
  const supabase = createClient(url, serviceKey);
  const { data: playerValues, error: fetchError } = await supabase
    .from('vampire_player_values')
    .select('player, position');
  if (fetchError) throw fetchError;
  if (!playerValues || playerValues.length === 0) {
    console.error('Refusing to continue: vampire_player_values is empty. Run refresh-data.js first.');
    process.exit(1);
  }

  const { rows, ambiguous } = buildWeeklyProjectionRows(csvRows, playerValues, scoring);
  const matchedPlayers = new Set(rows.map((r) => r.player)).size;
  const weeks = new Set(rows.map((r) => r.week)).size;
  console.log(`Built ${rows.length} rows: ${matchedPlayers}/${playerValues.length} players across ${weeks} weeks (${scoring}).`);
  if (matchedPlayers / playerValues.length < 0.5) {
    console.error('Refusing to proceed: under 50% of players matched -- likely a name-matching or CSV-shape problem.');
    process.exit(1);
  }
  if (ambiguous.length > 0) {
    console.log(`  Same-name collisions with no position match (no rows written): ${ambiguous.join(', ')}`);
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('vampire_weekly_projections')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'player,week' });
    if (error) throw error;
  }
  console.log(`Done. Upserted ${rows.length} rows into vampire_weekly_projections.`);
}

main().catch((err) => {
  console.error('Weekly projections (all weeks) refresh failed:', err.message || err);
  process.exit(1);
});
