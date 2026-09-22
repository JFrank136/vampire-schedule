// Advances the `currentWeek` default baked into template.html by one, capped
// at `lastRegularSeasonWeek`. Run weekly (see .github/workflows/bump-week.yml)
// so the tool opens on the right week without a manual edit every Tuesday.
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'template.html');
const html = fs.readFileSync(templatePath, 'utf8');

const lastWeekMatch = html.match(/lastRegularSeasonWeek:\s*(\d+)/);
const currentWeekMatch = html.match(/currentWeek:\s*(\d+),/);

if (!lastWeekMatch || !currentWeekMatch) {
  console.error('Could not find lastRegularSeasonWeek/currentWeek in template.html');
  process.exit(1);
}

const lastRegularSeasonWeek = Number(lastWeekMatch[1]);
const currentWeek = Number(currentWeekMatch[1]);
const nextWeek = Math.min(lastRegularSeasonWeek, currentWeek + 1);

if (nextWeek === currentWeek) {
  console.log(`currentWeek already at ${currentWeek} (season max ${lastRegularSeasonWeek}); nothing to do.`);
  process.exit(0);
}

const updated = html.replace(/currentWeek:\s*\d+,/, `currentWeek: ${nextWeek},`);
fs.writeFileSync(templatePath, updated);
console.log(`Bumped currentWeek: ${currentWeek} -> ${nextWeek}`);
