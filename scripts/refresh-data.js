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

  if (rosterRows.length === 0) {
    console.error(`Refusing to wipe vampire_rosters: parsed 0 rows from ${rostersPath}. Check the file and try again.`);
    process.exit(1);
  }
  if (playerValueRows.length === 0) {
    console.error(`Refusing to wipe vampire_player_values: parsed 0 rows from ${draftsharksPath}. Check the file and try again.`);
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  console.log(`Replacing ${rosterRows.length} roster rows...`);
  const { error: deleteRostersError } = await supabase.from('vampire_rosters').delete().neq('team', '');
  if (deleteRostersError) throw deleteRostersError;
  const { error: insertRostersError } = await supabase.from('vampire_rosters').insert(rosterRows);
  if (insertRostersError) throw insertRostersError;

  // Upsert instead of wipe-and-reload: weekly_projection*/weekly_opponent*
  // columns are owned by refresh-weekly-projection.js and must survive a
  // roster refresh. build-rows' weekly_projection: null is dropped so an
  // upsert never overwrites the stored value.
  console.log(`Upserting ${playerValueRows.length} player value rows...`);
  const upsertRows = playerValueRows.map(({ weekly_projection, ...rest }) => rest);
  const { error: upsertValuesError } = await supabase
    .from('vampire_player_values')
    .upsert(upsertRows, { onConflict: 'player' });
  if (upsertValuesError) throw upsertValuesError;

  const keep = new Set(playerValueRows.map((r) => r.player));
  const { data: existing, error: existingError } = await supabase.from('vampire_player_values').select('player');
  if (existingError) throw existingError;
  const stale = existing.map((r) => r.player).filter((p) => !keep.has(p));
  if (stale.length > 0) {
    console.log(`Removing ${stale.length} players no longer in the DraftSharks file...`);
    const { error: staleError } = await supabase.from('vampire_player_values').delete().in('player', stale);
    if (staleError) throw staleError;
  }

  const { error: timestampError } = await supabase
    .from('vampire_settings')
    .update({ data_updated_at: new Date().toISOString() })
    .eq('id', true);
  if (timestampError) throw timestampError;

  console.log('Done.');
}

main().catch((err) => {
  console.error('Refresh failed:', err.message || err);
  process.exit(1);
});
