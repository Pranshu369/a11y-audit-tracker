// Starts the app on a throwaway database, signs in, and runs axe-core on every
// page plus a few states (form errors, error flash). Also checks for sideways
// scrolling at 320px and records the Tab order of each page.
//
// Usage: cd tools && npm install && npm run axe
// Needs a local Chrome; set CHROME_PATH if it is not in the default place.

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = path.join(__dirname, 'screenshots');

async function main() {
  process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'axe-')), 'axe.db');
  const { createApp } = require('../src/app');
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}`;
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const report = [];
  const check = async (name, url, prepare) => {
    if (url) await page.goto(base + url, { waitUntil: 'networkidle0' });
    if (prepare) await prepare();
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(axeSource);
    const result = await page.evaluate(() =>
      axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })
    );
    const title = await page.title();
    const focused = await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    const live = await page.evaluate(() => ({
      polite: document.getElementById('live-polite')?.textContent || '',
      assertive: document.getElementById('live-assertive')?.textContent || '',
    }));
    const tabOrder = await tabThrough();
    const reflow = await reflowCheck(name);
    report.push({
      name, title, focusedOnLoad: focused, live,
      violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) })),
      incomplete: result.incomplete.map((v) => v.id),
      passes: result.passes.length,
      reflow, tabOrder,
    });
  };

  async function tabThrough() {
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.mouse.click(1, 1);
    const seen = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const label = (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent || el.value || '';
        return {
          tag: el.tagName.toLowerCase(),
          label: label.replace(/\s+/g, ' ').trim().slice(0, 60),
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
        };
      });
      if (!info) break;
      const key = `${info.tag}:${info.label}`;
      if (seen.length && seen[0].key === key) break;
      seen.push({ key, ...info });
    }
    return seen.map((s) => `${s.tag} "${s.label}" [outline ${s.outline}]`);
  }

  async function reflowCheck(name) {
    const out = {};
    for (const [label, vp] of [['320px', { width: 320, height: 800 }], ['1280px at 200%', { width: 640, height: 450, deviceScaleFactor: 2 }]]) {
      await page.setViewport(vp);
      out[label] = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      await page.screenshot({ path: path.join(SHOTS, `${name.replace(/\W+/g, '-')}-${vp.width}.png`), fullPage: true });
    }
    await page.setViewport({ width: 1280, height: 900 });
    return out;
  }

  await check('login', '/login');
  await page.click('button[name="userId"][value="1"]');
  await page.waitForNavigation();
  await check('list after sign-in (success flash)', null);
  await check('list filtered', '/issues?status=open&severity=critical');
  await check('list empty filter', '/issues?status=verified');
  await check('new issue form', '/issues/new');
  await check('new issue form with errors', '/issues/new', async () => {
    await page.type('#page_url', 'not a url');
    await Promise.all([page.waitForNavigation(), page.click('.issue-form button[type="submit"]')]);
  });
  await check('detail', '/issues/1');
  await check('detail after blocked change (error flash)', '/issues/1', async () => {
    // Forge a disallowed move the UI does not offer, as a script would.
    await page.evaluate(() => {
      const sel = document.getElementById('status');
      sel.add(new Option('Verified', 'verified'));
      sel.value = 'verified';
    });
    await Promise.all([page.waitForNavigation(), page.click('form[action$="/status"] button')]);
  });
  await check('edit form', '/issues/1/edit');
  await check('not found', '/issues/3');

  await browser.close();
  server.close();

  fs.writeFileSync(path.join(__dirname, 'axe-report.json'), JSON.stringify(report, null, 2));
  for (const r of report) {
    console.log(`\n== ${r.name}\n   title: ${r.title}\n   focus on load: ${r.focusedOnLoad}`);
    if (r.live.polite || r.live.assertive) console.log(`   announced: ${JSON.stringify(r.live)}`);
    console.log(`   axe: ${r.violations.length} violations, ${r.passes} rules passed, needs review: ${r.incomplete.join(', ') || 'none'}`);
    for (const v of r.violations) console.log(`     - [${v.impact}] ${v.id}: ${v.help} -> ${v.nodes.join(' | ')}`);
    console.log(`   no sideways scroll: ${JSON.stringify(r.reflow)}`);
    console.log(`   tab order:\n     ${r.tabOrder.join('\n     ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
