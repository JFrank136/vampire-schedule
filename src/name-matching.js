// matchup-tool/src/name-matching.js
(function (global) {
  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

  // Sourced from Draft/data/aliases.csv (canonical_name column) — nicknames
  // that don't reduce to the same string through suffix/punctuation
  // stripping alone. Keyed and valued by their already-normalized form.
  const ALIASES = {
    'cam skattebo': 'cameron skattebo',
    'cam ward': 'cameron ward',
    'chig okonkwo': 'chigoziem okonkwo',
    'chris brooks': 'christopher brooks',
    'kenny gainwell': 'kenneth gainwell',
    'tank dell': 'nathaniel dell',
    'andy borregales': 'andres borregales',
    'ken walker': 'kenneth walker',
  };

  function normalizeName(rawName) {
    const cleaned = String(rawName == null ? '' : rawName)
      .toLowerCase()
      .trim()
      .replace(/\./g, '')
      .replace(/'/g, '')
      .replace(/-/g, ' ');
    const tokens = cleaned.split(/\s+/).filter((t) => t && !SUFFIXES.has(t));
    const joined = tokens.join(' ');
    return ALIASES[joined] || joined;
  }

  global.normalizeName = normalizeName;
  if (typeof module !== 'undefined') module.exports = { normalizeName };
})(typeof window !== 'undefined' ? window : global);
