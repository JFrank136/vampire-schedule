// matchup-tool/src/free-agents.js
//
// Pure logic for the "Free agents" tab: a what-if scratchpad over Jared's
// roster (add/drop free agents, edit the starting lineup) plus the FLEX-only
// table rows. Nothing here reads or writes Supabase, the CSV, or the DOM.
(function (global) {
  const scoring = typeof module !== 'undefined' ? require('./scoring.js') : global;

  const FREE_AGENT_TEAM = 'Free Agents';
  const LINEUP_SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX'];
  const FLEX_POSITIONS = ['RB', 'WR', 'TE'];

  function slotPositions(slot) {
    return slot === 'FLEX' ? FLEX_POSITIONS : [slot.replace(/\d+$/, '')];
  }

  function emptyWhatIf() {
    return { adds: [], drops: [], manualLineup: null };
  }

  // Anything read back from localStorage goes through here: wrong shapes
  // become an empty what-if rather than crashing the page.
  function normalizeWhatIf(value) {
    if (!value || !Array.isArray(value.adds) || !Array.isArray(value.drops)) return emptyWhatIf();
    const manual = value.manualLineup && typeof value.manualLineup === 'object' && !Array.isArray(value.manualLineup)
      ? value.manualLineup : null;
    return { adds: value.adds.slice(), drops: value.drops.slice(), manualLineup: manual };
  }

  function effectiveRoster(baseRoster, faPool, whatIf) {
    const drops = new Set(whatIf.drops);
    const kept = baseRoster.filter((p) => !drops.has(p.player));
    const have = new Set(kept.map((p) => p.player));
    const added = whatIf.adds
      .map((name) => faPool.find((p) => p.player === name))
      .filter((p) => p && !have.has(p.player));
    return [...kept, ...added];
  }

  // `isMine` is whether the player is on the effective roster right now.
  // Toggling a mine player drops him (or un-adds a free agent I added);
  // toggling a non-mine player adds him (or un-drops one I dropped). Any
  // roster move clears a manual lineup so the lineup is re-picked.
  function toggleRosterMove(whatIf, player, isMine) {
    const adds = whatIf.adds.filter((n) => n !== player);
    const drops = whatIf.drops.filter((n) => n !== player);
    if (isMine) {
      if (!whatIf.adds.includes(player)) drops.push(player);
    } else if (!whatIf.drops.includes(player)) {
      adds.push(player);
    }
    return { adds, drops, manualLineup: null };
  }

  function lineupAssignment(effective, playerInfo, week, whatIf) {
    const names = new Set(effective.map((p) => p.player));
    const manual = whatIf.manualLineup;
    let slots;
    if (manual && Object.values(manual).every((n) => n == null || names.has(n))) {
      slots = {};
      for (const slot of LINEUP_SLOTS) slots[slot] = manual[slot] || null;
    } else {
      slots = {};
      for (const slot of LINEUP_SLOTS) slots[slot] = null;
      for (const s of scoring.autoLineup(effective, playerInfo, week).starters) slots[s.slot] = s.player;
    }
    const inLineup = new Set(Object.values(slots).filter(Boolean));
    const bench = effective.map((p) => p.player).filter((n) => !inLineup.has(n));
    return { slots, bench };
  }

  // Returns a new slots map with `player` in `slot`, or null if that's not a
  // legal move: the player's position must fit the slot, and if he's coming
  // from another starting slot, the player he displaces must fit THAT slot.
  function swapIntoSlot(slots, slot, player, positionOf) {
    if (!slotPositions(slot).includes(positionOf(player))) return null;
    const next = { ...slots };
    const displaced = slots[slot] || null;
    const from = LINEUP_SLOTS.find((s) => slots[s] === player);
    if (from === slot) return next;
    if (from) {
      if (displaced && !slotPositions(from).includes(positionOf(displaced))) return null;
      next[from] = displaced;
    }
    next[slot] = player;
    return next;
  }

  // FLEX-position players only (RB/WR/TE): everyone on my base roster plus
  // the Free Agents pool, each listed once. `mine` follows the what-if (a
  // player I dropped shows as not mine so he can be re-added). Sorted by this
  // week's DS proj, best first; players with no projection (bye, missing) last.
  function flexTableRows({ base, pool, effective, starters, playerInfo, projections, ros, week }) {
    const mineNames = new Set(effective.map((p) => p.player));
    const starterNames = new Set(starters);
    const seen = new Set();
    const rows = [];
    for (const { player, position } of [...base, ...pool]) {
      if (!FLEX_POSITIONS.includes(position) || seen.has(player)) continue;
      seen.add(player);
      const wk = projections[player] && projections[player][week];
      const r = ros[player];
      const info = playerInfo[player];
      rows.push({
        player,
        position,
        mine: mineNames.has(player),
        starter: starterNames.has(player),
        onBye: !!(info && info.bye === week),
        floor: wk ? wk.floor : null,
        proj: wk ? wk.proj : null,
        ceiling: wk ? wk.ceiling : null,
        rosDsProj: r ? r.dsProj : null,
        rosCeiling: r ? r.ceiling : null,
        rosValue: r ? r.value : null,
      });
    }
    rows.sort((a, b) => {
      const av = a.proj == null ? -Infinity : a.proj;
      const bv = b.proj == null ? -Infinity : b.proj;
      if (bv !== av) return bv > av ? 1 : -1;
      return a.player < b.player ? -1 : a.player > b.player ? 1 : 0;
    });
    return rows;
  }

  // Stored what-if state is only valid for the roster data it was made
  // against; when rosters.csv changes the signature changes and the stored
  // state is discarded (the CSV is the source of truth).
  function rosterSignature(base, pool) {
    const names = (list) => list.map((p) => p.player).sort().join('|');
    return names(base) + '#' + names(pool);
  }

  function rowsToRos(rows) {
    const out = {};
    for (const row of rows) {
      out[row.player] = { dsProj: row.ros_ds_proj, ceiling: row.ros_ceiling_proj, value: row.ros_3d_value };
    }
    return out;
  }

  const api = {
    FREE_AGENT_TEAM, LINEUP_SLOTS, emptyWhatIf, normalizeWhatIf, effectiveRoster, toggleRosterMove,
    lineupAssignment, swapIntoSlot, flexTableRows, rosterSignature, rowsToRos,
  };
  Object.assign(global, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : global);
