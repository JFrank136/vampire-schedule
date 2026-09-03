// matchup-tool/src/csv-parser.js
(function (global) {
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const len = text.length;

    function pushField() {
      row.push(field);
      field = '';
    }
    function pushRow() {
      pushField();
      rows.push(row);
      row = [];
    }

    while (i < len) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += char;
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (char === ',') {
        pushField();
        i += 1;
        continue;
      }
      if (char === '\r') {
        i += 1;
        continue;
      }
      if (char === '\n') {
        pushRow();
        i += 1;
        continue;
      }
      field += char;
      i += 1;
    }
    if (field.length > 0 || row.length > 0) {
      pushRow();
    }

    if (rows.length === 0) return [];
    const headers = rows[0];
    const records = [];
    for (let r = 1; r < rows.length; r += 1) {
      const values = rows[r];
      if (values.length === 1 && values[0].trim() === '') continue;
      const record = {};
      for (let c = 0; c < headers.length; c += 1) {
        record[headers[c]] = values[c] !== undefined ? values[c] : '';
      }
      records.push(record);
    }
    return records;
  }

  global.parseCSV = parseCSV;
  if (typeof module !== 'undefined') module.exports = { parseCSV };
})(typeof window !== 'undefined' ? window : global);
