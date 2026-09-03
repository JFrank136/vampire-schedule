// matchup-tool/tests/draftsharks-parser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDraftSharks } = require('../src/draftsharks-parser.js');

const SAMPLE = `Rank,Team,Player,"Fantasy Position",Games,ADP,Bye,SOS,InjuryRisk,"Floor Proj","Consensus Proj","DS Proj",CeilingProj,"3D Value"
1,LAR,"Puka Nacua",WR,17,1.04,11,-3.1%,51%,293.6,310,358,393.8,100
2,CIN,"Ja'Marr Chase",WR,17,1.03,6,4%,37%,298.2,314,339,399.8,96
`;

test('keys players by name', () => {
  const result = parseDraftSharks(SAMPLE);
  assert.deepEqual(Object.keys(result), ['Puka Nacua', "Ja'Marr Chase"]);
});

test('parses numeric fields and strips percent signs', () => {
  const result = parseDraftSharks(SAMPLE);
  assert.deepEqual(result['Puka Nacua'], {
    team: 'LAR',
    position: 'WR',
    bye: 11,
    injuryRisk: 51,
    threeDValue: 100,
    weeklyProjection: null,
  });
});

test('returns an empty object for empty input', () => {
  assert.deepEqual(parseDraftSharks(''), {});
});
