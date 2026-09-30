// scripts/refresh-ros-projections.js
//
// Loads the latest Draft Sharks rest-of-season numbers (ROS DS proj, ROS
// ceiling, ROS 3D value) from the in-season ros_rankings_long.csv into
// vampire_ros_projections, for the Free agents tab. Upsert only, never deletes.
//
// Usage: node scripts/refresh-ros-projections.js <ros_rankings_long.csv> [scoring]
//   scoring defaults to "half-ppr".
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCSV } = require('../src/csv-parser.js');
const { buildRosProjectionRows } = require('./build-ros-rows.js');

const CHUNK = 500;

async function main() {
  const [, , csvPath, scoringArg] = process.argv;
  const scoring = scoringArg || 'half-ppr';
  if (!csvPath) {
    console.error('Usage: node scripts/refresh-ros-projections.js <ros_rankings_long.csv> [scoring]');
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

  const { rows, ambiguous } = buildRosProjectionRows(csvRows, playerValues, scoring);
  console.log(`Built ${rows.length}/${playerValues.length} ROS rows (${scoring}).`);
  if (rows.length / playerValues.length < 0.5) {
    console.error('Refusing to proceed: under 50% of players matched -- likely a name-matching or CSV-shape problem.');
    process.exit(1);
  }
  if (ambiguous.length > 0) {
    console.log(`  Same-name collisions with no position match (no rows written): ${ambiguous.join(', ')}`);
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('vampire_ros_projections')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'player' });
    if (error) throw error;
  }
  console.log(`Done. Upserted ${rows.length} rows into vampire_ros_projections.`);
}

main().catch((err) => {
  console.error('ROS projections refresh failed:', err.message || err);
  process.exit(1);
});
