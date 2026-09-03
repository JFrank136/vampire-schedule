# Vampire Matchup Picker — Instructions

## Commands

Refresh roster/DraftSharks data (run any time, no Claude needed):
```bash
cd matchup-tool
npm run refresh-data -- <path-to-rosters.csv> <path-to-draftsharks-export.csv>
```
Requires a `.env` file (copy `.env.example`) with `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` filled in. Get the service-role key from the
Supabase dashboard: project "Fantasy Football" > Project Settings > API.

Rebuild the page after editing `template.html` or anything in `src/`:
```bash
cd matchup-tool
node build.js
```
This writes `dist/index.html`. Publish that file's contents as the Claude
Artifact to push a UI change live.

Run the test suite:
```bash
cd matchup-tool
npm test
```

## FAQ

**What if I'm out of Claude tokens?**
Picking an opponent, locking in a week, recording a result/note, and
browsing rosters all talk directly to Supabase from the browser — none of
that needs Claude. Only a full data refresh needs the `refresh-data`
script, and that script doesn't need Claude either — just Node and your
`.env` file.

**Where does the data live?**
Supabase project "Fantasy Football" (`tdtchffawcmkvgrccjza`), tables
`vampire_settings`, `vampire_rosters`, `vampire_player_values`,
`vampire_schedule`. The published page reads/writes these directly using a
public anon key embedded in the page.

**Is that anon key a security problem?**
It gives read/write access to those tables to anyone with the link — same
trust model as the previous version's shared Claude Artifact link. Row
Level Security is off project-wide (true before this tool existed too).
Fine for a private league tool with no sensitive data; revisit if that
changes.

**How do I change a league setting (e.g. restricted window)?**
Settings aren't editable in the UI. Ask Claude to run a SQL update against
`vampire_settings`, or run it yourself via the Supabase dashboard's SQL
editor:
```sql
update vampire_settings set restricted_window_start = 5, restricted_window_end = 13;
```

**How do I regenerate the season schedule?**
Season overview tab > "Generate / refresh season schedule". This respects
any weeks you've already locked.
