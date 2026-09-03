// matchup-tool/build.js
const fs = require('fs');
const path = require('path');

const SRC_ORDER = [
  'csv-parser.js',
  'rosters-parser.js',
  'draftsharks-parser.js',
  'scoring.js',
  'rules.js',
  'schedule-generator.js',
];

function build() {
  const srcDir = path.join(__dirname, 'src');
  const logic = SRC_ORDER
    .map((file) => fs.readFileSync(path.join(srcDir, file), 'utf8'))
    .join('\n');

  const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const marker = '/* LOGIC_INJECTION_POINT */';
  if (!template.includes(marker)) {
    throw new Error(`template.html is missing the marker: ${marker}`);
  }
  const output = template.replace(marker, logic);

  const distDir = path.join(__dirname, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), output);
  console.log('Built dist/index.html');
}

build();
