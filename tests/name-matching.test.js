// matchup-tool/tests/name-matching.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName } = require('../src/name-matching.js');

test('lowercases and trims', () => {
  assert.equal(normalizeName('  Josh Allen  '), 'josh allen');
});

test('strips periods, apostrophes, and hyphens', () => {
  assert.equal(normalizeName("D.K. Metcalf"), 'dk metcalf');
  assert.equal(normalizeName("D'Andre Swift"), 'dandre swift');
  assert.equal(normalizeName('Ray-Ray McCloud'), 'ray ray mccloud');
});

test('drops generational suffixes', () => {
  assert.equal(normalizeName('Michael Pittman Jr.'), 'michael pittman');
  assert.equal(normalizeName('Kenneth Walker III'), 'kenneth walker');
  assert.equal(normalizeName('Marvin Harrison Jr.'), 'marvin harrison');
});

test('resolves known nickname aliases', () => {
  assert.equal(normalizeName('Cam Skattebo'), 'cameron skattebo');
  assert.equal(normalizeName('Ken Walker III'), 'kenneth walker');
});

test('two spellings of the same player normalize to the same key', () => {
  assert.equal(normalizeName('AJ Brown'), normalizeName('A.J. Brown'));
  assert.equal(normalizeName('DJ Moore'), normalizeName('D.J. Moore'));
  assert.equal(normalizeName('DK Metcalf'), normalizeName('D.K. Metcalf'));
});

test('returns an empty string for empty input', () => {
  assert.equal(normalizeName(''), '');
  assert.equal(normalizeName(null), '');
});
