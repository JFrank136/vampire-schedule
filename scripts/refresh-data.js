// scripts/refresh-data.js
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseRosters } = require('../src/rosters-parser.js');
const { parseDraftSharks } = require('../src/draftsharks-parser.js');
const { buildRosterRows, buildPlayerValueRows } = require('./build-rows.js');

async function main() {
  const [, , rostersPath, draftsharksPath] = process.argv;
  if (!rostersPath || !draftsharksPath) {
    console.error('Usage: node scripts/refresh-data.js <rosters.csv> <draftsharks.csv>');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const rostersText = fs.readFileSync(path.resolve(rostersPath), 'utf8');
  const draftsharksText = fs.readFileSync(path.resolve(draftsharksPath), 'utf8');

  const rosterRows = buildRosterRows(parseRosters(rostersText));
  const playerValueRows = buildPlayerValueRows(parseDraftSharks(draftsharksText));

  const supabase = createClient(url, serviceKey);

  console.log(`Replacing ${rosterRows.length} roster rows...`);
  const { error: deleteRostersError } = await supabase.from('vampire_rosters').delete().neq('team', '');
  if (deleteRostersError) throw deleteRostersError;
  const { error: insertRostersError } = await supabase.from('vampire_rosters').insert(rosterRows);
  if (insertRostersError) throw insertRostersError;

  console.log(`Replacing ${playerValueRows.length} player value rows...`);
  const { error: deleteValuesError } = await supabase.from('vampire_player_values').delete().neq('player', '');
  if (deleteValuesError) throw deleteValuesError;
  const { error: insertValuesError } = await supabase.from('vampire_player_values').insert(playerValueRows);
  if (insertValuesError) throw insertValuesError;

  console.log('Done.');
}

main().catch((err) => {
  console.error('Refresh failed:', err.message || err);
  process.exit(1);
});
