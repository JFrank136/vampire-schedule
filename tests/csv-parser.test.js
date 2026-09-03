// matchup-tool/tests/csv-parser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCSV } = require('../src/csv-parser.js');

test('parses simple rows into objects keyed by header', () => {
  const text = 'a,b\n1,2\n3,4';
  const result = parseCSV(text);
  assert.deepEqual(result, [
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);
});

test('handles quoted fields containing commas', () => {
  const text = 'name,team\n"Smith, Jr.",NYJ';
  const result = parseCSV(text);
  assert.deepEqual(result, [{ name: 'Smith, Jr.', team: 'NYJ' }]);
});

test('handles escaped quotes inside quoted fields', () => {
  const text = 'nickname\n"Big ""Papi"" Ortiz"';
  const result = parseCSV(text);
  assert.deepEqual(result, [{ nickname: 'Big "Papi" Ortiz' }]);
});

test('handles quoted headers with spaces', () => {
  const text = '"Fantasy Position","3D Value"\nWR,100';
  const result = parseCSV(text);
  assert.deepEqual(result, [{ 'Fantasy Position': 'WR', '3D Value': '100' }]);
});

test('skips fully blank lines', () => {
  const text = 'a,b\n1,2\n\n3,4';
  const result = parseCSV(text);
  assert.deepEqual(result, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('returns empty array for empty input', () => {
  assert.deepEqual(parseCSV(''), []);
});
