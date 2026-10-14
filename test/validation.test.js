const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, apiAgent, webAgent, validIssue } = require('./helpers');

test('the API returns a message per invalid field', async () => {
  const { app } = setup();
  const alex = await apiAgent(app, 1);

  const res = await alex
    .post('/api/issues')
    .send({ title: '   ', page_url: 'javascript:alert(1)', wcag_criterion: '9.9.9 Made up', severity: 'blocker' })
    .expect(400);

  assert.equal(res.body.error.code, 'validation_failed');
  assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['page_url', 'severity', 'title', 'wcag_criterion']);
  assert.match(res.body.error.fields.page_url, /http:\/\/ or https:\/\//);
});

test('the form re-renders with an error summary and inline errors', async () => {
  const { app } = setup();
  const { agent, csrf } = await webAgent(app, 1);

  const res = await agent
    .post('/issues')
    .type('form')
    .send({ _csrf: csrf, ...validIssue, title: '', page_url: 'example.com' })
    .expect(400);

  assert.match(res.text, /<title>Error: Report an issue \| Audit Tracker<\/title>/);
  assert.match(res.text, /id="error-summary"/);
  assert.match(res.text, /<a href="#title">Enter a title\.<\/a>/);
  assert.match(res.text, /id="title-error"/);
  assert.match(res.text, /id="title"[^>]*aria-invalid="true"[^>]*aria-describedby="title-error"/s);
  // What the user typed is kept.
  assert.match(res.text, /value="example.com"/);
});

test('form posts without the CSRF token are refused', async () => {
  const { app } = setup();
  const { agent } = await webAgent(app, 1);
  await agent.post('/issues').type('form').send(validIssue).expect(403);
});

test('saved issues survive reopening the database file', async (t) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { openDatabase } = require('../src/db');
  const { createIssueService } = require('../src/issues');

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-')), 'test.db');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  const first = openDatabase(file);
  const created = createIssueService(first).create(1, validIssue);
  first.close();

  const second = openDatabase(file);
  const again = createIssueService(second).get(1, created.id);
  assert.equal(again.title, validIssue.title);
  second.close();
});

test('values that only exist on Object.prototype are rejected, not passed to the database', async () => {
  const { app } = setup();
  const alex = await apiAgent(app, 1);

  const res = await alex.post('/api/issues').send({ ...validIssue, severity: 'constructor' }).expect(400);
  assert.ok(res.body.error.fields.severity);

  await alex.get('/api/issues?severity=toString').expect(400);
  await alex.get('/api/issues?status[]=open').expect(400);
  await alex.get('/api/issues?status=open&status=fixed').expect(400);
});

test('hand-edited filter URLs on the list page fall back to "all"', async () => {
  const { app } = setup();
  const { agent } = await webAgent(app, 1);
  const page = await agent.get('/issues?status=constructor&severity[]=minor').expect(200);
  assert.match(page.text, /<title>Your issues \(2 issues\) \| Audit Tracker<\/title>/);
});

test('an edit that fails validation keeps the original version, so a later save still detects a conflict', async () => {
  const { app } = setup();
  const tabA = await webAgent(app, 1);
  const tabB = await webAgent(app, 1);

  // Tab B saves first, moving the issue to version 2.
  await tabB.agent.post('/issues/1').type('form').send({ _csrf: tabB.csrf, ...validIssue, version: 1 }).expect(302);

  // Tab A (opened at version 1) submits with an error, then fixes it.
  const bad = await tabA.agent.post('/issues/1').type('form').send({ _csrf: tabA.csrf, ...validIssue, title: '', version: 1 }).expect(400);
  assert.match(bad.text, /name="version" value="1"/);
  const conflict = await tabA.agent
    .post('/issues/1').type('form')
    .send({ _csrf: tabA.csrf, ...validIssue, title: 'Tab A title', version: 1 })
    .expect(409);
  assert.match(conflict.text, /Your changes were not saved/);
  assert.match(conflict.text, /value="Tab A title"/, 'typed changes are kept');
  assert.match(conflict.text, /name="version" value="2"/);
});

test('notes over 500 characters are rejected rather than cut off', async () => {
  const { app } = setup();
  const alex = await apiAgent(app, 1);
  const res = await alex.post('/api/issues/1/status').send({ to: 'in_progress', note: 'x'.repeat(501) }).expect(400);
  assert.ok(res.body.error.fields.note);
});

test('a non-numeric version is a 400, not a conflict', async () => {
  const { app } = setup();
  const alex = await apiAgent(app, 1);
  await alex.patch('/api/issues/1').send({ version: 'abc' }).expect(400);
});

test('signing out through the API does not need a request body', async () => {
  const { app } = setup();
  const alex = await apiAgent(app, 1);
  await alex.delete('/api/session').expect(204);
  await alex.get('/api/me').expect(401);
});
