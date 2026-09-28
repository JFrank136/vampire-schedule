# Lineup flag highlighting (Weekly picker)

## Goal

In the Weekly picker tab, clicking a player's row in a lineup table cycles
that row through a highlight state so Jared (and whoever else views the
page) can flag a quick read on a player without leaving the picker:

default → green ("good matchup") → yellow ("injury concern") → red ("bad
option") → back to default.

## Scope

Applies to every lineup table inside the Weekly picker panel: the "Me" card
(`#own-score`) and every opponent card in `#opponent-list`. Does **not**
apply to the Rosters tab table, and does not apply to the bench/"top bench"
info row within a lineup table (that row isn't a real slot decision).

## Data model

New Supabase table, same no-RLS pattern as the existing `vampire_` tables:

```sql
create table public.vampire_lineup_flags (
  week int not null,
  team text not null,
  player text not null,
  flag text not null check (flag in ('good', 'injury', 'bad')),
  updated_at timestamptz not null default now(),
  primary key (week, team, player)
);
```

Keyed by `week + team + player` — a flag is specific to that week's matchup
call for that player on that team's card. A different week (or the same
player traded onto a different `team` value, which doesn't happen in this
league) starts unflagged. Cycling back to "default" **deletes** the row
rather than storing a fourth "none" value, so the table only ever holds
active flags.

## Client behavior (`template.html`)

- `state.lineupFlags`: a map of `"week:team:player"` → `'good' | 'injury' |
  'bad'`, loaded from `vampire_lineup_flags` alongside the other tables in
  `init()`.
- `lineupTableHTML(breakdown, benchTop, team)` gains a `team` parameter. Each
  non-bench row gets `data-flag-key="<week>:<team>:<player>"` and a
  `flag-good` / `flag-injury` / `flag-bad` class when `state.lineupFlags` has
  an entry for that key. The bench row gets no `data-flag-key`, so it's
  excluded from the click delegation below.
- One click-delegated listener on `#panel-picker` (covers both the "Me" card
  and every opponent card, including ones re-rendered on week change):
  finds the closest `tr[data-flag-key]`, computes the next flag in the
  cycle, updates `state.lineupFlags`, re-renders the picker, and:
  - upserts `{ week, team, player, flag }` into `vampire_lineup_flags` when
    the new state is a real flag,
  - deletes the `(week, team, player)` row when cycling back to default.
- Realtime: a `vampire_lineup_flags_changes` channel (same
  `postgres_changes` pattern as `vampire_schedule_changes`) reloads the flag
  map and re-renders the picker on any insert/update/delete, so two people
  looking at the page at once see each other's flags without reloading.

## Styling

New CSS rules alongside the existing `.card-strip.bye` /
`.card-strip.injury` / `.card-strip.locked-in` rules, reusing the same
`--good` / `--warn` / `--bad` (and their `-bg` variants) tokens as a flat
row background tint — no box-shadow/glow, consistent with how the rest of
the page marks state:

```css
.card-lineup tbody tr[data-flag-key] { cursor: pointer; }
.card-lineup tbody tr.flag-good { background: var(--good-bg); }
.card-lineup tbody tr.flag-injury { background: var(--warn-bg); }
.card-lineup tbody tr.flag-bad { background: var(--bad-bg); }
```

## Out of scope (this feature)

- Rosters tab table — not part of this request.
- ESPN league integration (live roster/score pull) — raised as a side
  question during design; sizeable, separate feature, not folded in here.
