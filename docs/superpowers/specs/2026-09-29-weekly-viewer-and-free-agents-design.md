# Roster weekly viewer + Free Agent page

Two phases, each its own plan/implementation. Phase 1 ships first.

## Phase 1: Weekly viewer on each roster page

### Goal
On the Rosters tab, under each team's roster table, show a week-by-week view
of what that team's realistic lineup looks like, with best/worst weeks
called out, so Jared can pick opponents and steal targets.

### Weeks covered
Current week through week 15 (playoffs, 16+, can't be chosen as matchups).
Weeks before the current week are not shown.

### Lineup for a week
- Candidates: the team's rostered players not on bye that week.
- Slots per `rules.md`: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX (RB/WR/TE). K is
  not in the player pool and is ignored.
- Players are ranked by **3D value only** (a proxy for who the opponent
  realistically starts), NOT by weekly projection. This differs from the
  existing `autoLineup` (ranks by projection); add a new `valueLineup`
  function in `src/scoring.js` rather than changing `autoLineup`.
- The chosen lineup is then scored with that week's DraftSharks floor,
  DS projection, and ceiling (missing data counts as 0 and is flagged).

### Table
One row per week. Columns: Week, Floor total,
DS Proj total, Ceiling total. Best week (highest DS Proj total) and worst
week (lowest) are marked. Clicking a row expands it inline to show that
week's lineup (slot, player, real-world opponent, floor/proj/ceiling,
3D value), using the same styling as existing `.card-lineup` tables.

### Steal-target picker
Below the table: the team's top 3 players by 3D value as selectable chips.
Selecting one hides the weeks where that player is on bye (you can only
steal a player who starts, so those weeks are unplayable); best/worst are
recomputed over the remaining weeks. Selecting again clears it. Selection is
in-memory per team, reset on team change.

### Data
Today `vampire_player_values` only holds two rolling slots
(`weekly_projection`, `weekly_projection_next`). New table, same no-RLS
pattern as other `vampire_` tables:

```sql
create table public.vampire_weekly_projections (
  player text not null,
  week int not null,
  floor_proj numeric,
  ds_proj numeric,
  ceiling_proj numeric,
  opponent text,
  bye boolean not null default false,
  primary key (player, week)
);
```

Populated for weeks 1-18 from `in-season/data/processed/rankings_long.csv`
(source `draftsharks`, scoring `half-ppr`) by a new script
`scripts/refresh-weekly-projections-all.js`, matching names with the existing
name-matching + position disambiguation (see refresh-weekly-projection.js).
The existing two-slot columns and script are left untouched. Page loads the
table once at startup alongside the other tables.

Byes: derived from the player's `bye` week (already in `vampire_player_values`)
so a player with no row for a bye week is treated as on bye.

### Testing
Unit tests (existing `tests/` runner) for `valueLineup` (3D-only ranking,
bye exclusion, FLEX fill), week totals, best/worst selection, and steal-target
bye filtering.

## Phase 2: Free Agent page

### Goal
A scratchpad to see how free-agent adds/drops would change Jared's lineup.
It is only for getting an idea: the real add/drop is made in the actual
league, then `rosters.csv` is edited and `refresh-data` re-run. The page
never writes to Supabase or the CSV.

### Data source
Add a team named `Free Agents` in `rosters.csv`. Excluded from opponent
lists / schedule logic (like any non-opponent team, handled where
`nonVampireTeams()` is built).

### Page
New tab "Free agents":
1. **Starting lineup** for "Me" at the top (auto lineup for the current
   week, with an "edit lineup" control to swap starters/bench manually).
2. **Table** below (like the screenshot): FLEX-position (RB/WR/TE) players
   from the Free Agents team plus Me's own FLEX players. Columns: Pos,
   Player, this-week Floor / DS Proj / Ceiling, ROS DS Proj, ROS Ceiling,
   ROS 3D Value. Sorted by DS Proj desc. Own players highlighted (bold +
   background, styled per the no-glow border preference).
3. Each row has Add (FA) or Drop (own) buttons. Add/drop only changes a
   local "what-if" roster and re-renders lineup + highlighting; a Reset button
   restores the CSV roster.

### Persistence
localStorage only (option A): what-if adds/drops and manual lineup edits,
wrapped in try/catch, keyed by season. Ignored/cleared when the roster data
in Supabase changes (CSV is the source of truth). Not shared across devices.

### Data
Needs ROS DS Proj and ROS ceiling, not in the database yet. New table
`vampire_ros_projections (player primary key, ros_ds_proj, ros_ceiling_proj)`
populated from `in-season/data/processed/ros_rankings_long.csv` by a script
following the same pattern as Phase 1. (Exact column mapping confirmed against
that CSV's schema at plan time.) Week floor/DS/ceiling reuse
`vampire_weekly_projections` from Phase 1.

## Out of scope
Writing rosters back anywhere; playoff weeks; K; cross-device sync of
what-if state.
