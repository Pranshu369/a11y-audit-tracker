// Renders every docs/diagrams/*.mmd file to a PNG next to it with mermaid-cli.
// Usage: cd tools && npm install && npm run diagrams
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..', 'docs', 'diagrams');
const config = path.join(__dirname, 'puppeteer.json');
fs.writeFileSync(config, JSON.stringify({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}));
const mmdc = path.join(__dirname, 'node_modules', '.bin', 'mmdc');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mmd'))) {
  const out = path.join(dir, file.replace(/\.mmd$/, '.png'));
  execFileSync(mmdc, ['-i', path.join(dir, file), '-o', out, '-p', config, '-b', 'white', '-s', '2', '-t', 'neutral'], { stdio: 'inherit' });
  console.log('wrote', path.relative(process.cwd(), out));
}
fs.rmSync(config);
