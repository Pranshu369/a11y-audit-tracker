// Drives every main flow with the keyboard only (Tab, Shift+Tab, Enter, Space,
// arrow keys, typing). No clicks. Fails loudly if a step cannot be reached.
//
// Usage: cd tools && npm run keyboard

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kbd-')), 'kbd.db');
  const { createApp } = require('../src/app');
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const results = [];

  const active = () => page.evaluate(() => {
    const el = document.activeElement;
    const label = (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent || '';
    return { tag: el.tagName.toLowerCase(), id: el.id, text: label.replace(/\s+/g, ' ').trim() };
  });

  // Press Tab until the focused element matches, up to 40 presses.
  async function tabTo(match, desc) {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const a = await active();
      if (match(a)) return a;
    }
    throw new Error(`Could not reach ${desc} with Tab`);
  }
  const byText = (t) => (a) => a.text.startsWith(t);
  const byId = (id) => (a) => a.id === id;
  const enterAndWait = async () => Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')]);

  async function step(name, fn) {
    try {
      await fn();
      results.push(['PASS', name]);
    } catch (err) {
      results.push(['FAIL', `${name}: ${err.message}`]);
    }
  }

  await page.goto(`${base}/login`);

  await step('first Tab lands on the skip link, Enter moves focus to main', async () => {
    await page.keyboard.press('Tab');
    const a = await active();
    if (a.text !== 'Skip to main content') throw new Error(`first stop was ${a.text}`);
    await page.keyboard.press('Enter');
    if ((await active()).id !== 'main') throw new Error('focus did not move to main');
  });

  await step('sign in as Sam Okafor with Tab + Enter', async () => {
    await tabTo(byText('Sign in as Sam Okafor'), 'Sam sign-in button');
    await enterAndWait();
    if (!page.url().endsWith('/issues')) throw new Error(`landed on ${page.url()}`);
  });

  // On macOS an arrow key opens a closed <select> instead of changing it, so
  // pick options with type-ahead, which works the same on every platform.
  await step('filter by status with type-ahead + Apply filters', async () => {
    await tabTo(byId('filter-status'), 'status filter');
    await page.keyboard.type('Open');
    await tabTo(byText('Apply filters'), 'Apply button');
    await enterAndWait();
    if (!page.url().includes('status=open')) throw new Error(page.url());
  });

  await step('filter by severity and clear filters', async () => {
    await tabTo(byId('filter-severity'), 'severity filter');
    await page.keyboard.type('Moderate');
    await tabTo(byText('Apply filters'), 'Apply button');
    await enterAndWait();
    if (!page.url().includes('severity=moderate')) throw new Error(page.url());
    await tabTo(byText('Clear filters'), 'Clear filters');
    await enterAndWait();
  });

  await step('submit an empty form, error summary gets focus, summary link reaches the field', async () => {
    await page.goto(`${base}/issues/new`);
    await tabTo(byText('Save issue'), 'Save button');
    await enterAndWait();
    if ((await active()).id !== 'error-summary') throw new Error('focus not on summary');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // second summary link: page URL
    await page.keyboard.press('Enter');
    const a = await active();
    if (a.id !== 'page_url') throw new Error(`summary link focused ${a.id}`);
  });

  await step('fill in and save a new issue with the keyboard', async () => {
    // Focus is on Page URL after the summary link; Shift+Tab back to Title.
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    if ((await active()).id !== 'title') throw new Error('Shift+Tab did not reach Title');
    await page.keyboard.type('Carousel autoplays with no pause button');
    await page.keyboard.press('Tab');
    await page.keyboard.type('https://shop.example.test/');
    await page.keyboard.press('Tab');
    await page.keyboard.type('2.2.2'); // type-ahead in the native select
    await page.keyboard.press('Tab');
    await page.keyboard.type('Serious');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Moves every 3 seconds.');
    await page.keyboard.press('Tab');
    await enterAndWait();
    const h1 = await page.$eval('h1', (e) => e.textContent);
    if (h1 !== 'Carousel autoplays with no pause button') throw new Error(`h1 is ${h1}`);
    const crit = await page.$eval('.summary-list', (e) => e.textContent);
    if (!crit.includes('2.2.2 Pause, Stop, Hide')) throw new Error('criterion not chosen by type-ahead');
  });

  await step('change status with the keyboard and see it in the history', async () => {
    await tabTo(byId('status'), 'New status select');
    await tabTo(byText('Change status'), 'Change status button');
    await enterAndWait();
    const flash = await page.$eval('[data-flash]', (e) => e.textContent);
    if (!flash.includes('Status changed from Open to In progress')) throw new Error(flash);
    const rows = await page.$$eval('.history-table tbody tr', (r) => r.length);
    if (rows !== 2) throw new Error(`history has ${rows} rows`);
  });

  await step('open edit, change the title, save', async () => {
    await page.goto(page.url().split('#')[0]);
    await tabTo(byText('Edit issue'), 'Edit link');
    await enterAndWait();
    await tabTo(byId('title'), 'Title field');
    await page.keyboard.type(' (home page)');
    await tabTo(byText('Save changes'), 'Save changes');
    await enterAndWait();
    const flash = await page.$eval('[data-flash]', (e) => e.textContent);
    if (!flash.includes('Issue saved')) throw new Error(flash);
  });

  await step('open an issue from the list table', async () => {
    await page.goto(`${base}/issues`);
    await tabTo(byText('Error text on checkout'), 'issue link in table');
    await enterAndWait();
    if (!/\/issues\/\d+$/.test(page.url())) throw new Error(page.url());
  });

  await step('Shift+Tab walks backwards through the header', async () => {
    await page.goto(`${base}/issues`);
    await tabTo(byText('Sign out'), 'Sign out');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    const a = await active();
    if (a.text !== 'Report an issue') throw new Error(a.text);
  });

  await step('sign out with the keyboard', async () => {
    await tabTo(byText('Sign out'), 'Sign out');
    await enterAndWait();
    if (!page.url().endsWith('/login')) throw new Error(page.url());
  });

  await browser.close();
  server.close();
  for (const [r, n] of results) console.log(`${r}  ${n}`);
  if (results.some(([r]) => r === 'FAIL')) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
