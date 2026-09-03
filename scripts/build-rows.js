function buildRosterRows(rosters) {
  const rows = [];
  for (const team of Object.keys(rosters)) {
    for (const player of rosters[team]) {
      rows.push({
        team,
        player: player.player,
        position: player.position,
        lineup_slot: player.lineupSlot,
        starter: player.starter,
      });
    }
  }
  return rows;
}

function buildPlayerValueRows(players) {
  return Object.keys(players).map((name) => {
    const info = players[name];
    return {
      player: name,
      team: info.team,
      position: info.position,
      bye: info.bye,
      injury_risk: info.injuryRisk,
      three_d_value: info.threeDValue,
      weekly_projection: info.weeklyProjection,
    };
  });
}

module.exports = { buildRosterRows, buildPlayerValueRows };
