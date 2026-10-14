const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, apiAgent, webAgent, validIssue } = require('./helpers');

test('an invalid status change is rejected and nothing is written', async () => {
  const { app, db } = setup();
  const alex = await apiAgent(app, 1);
  const { body: created } = await alex.post('/api/issues').send(validIssue).expect(201);
  const id = created.issue.id;

  const res = await alex.post(`/api/issues/${id}/status`).send({ to: 'verified' }).expect(422);

  assert.equal(res.body.error.code, 'transition_not_allowed');
  assert.match(res.body.error.message, /cannot move from Open to Verified/);
  assert.match(res.body.error.message, /marked Fixed/);

  const row = db.prepare('SELECT status, version FROM issues WHERE id = ?').get(id);
  assert.deepEqual({ ...row }, { status: 'open', version: 1 });
  const logRows = db.prepare('SELECT COUNT(*) AS n FROM status_changes WHERE issue_id = ?').get(id).n;
  assert.equal(logRows, 1, 'only the "created" entry exists');
});

test('a valid status change is applied and logged with who, when, from and to', async () => {
  const { app } = setup();
  const alex = await apiAgent(app, 1);
  const { body: created } = await alex.post('/api/issues').send(validIssue).expect(201);
  const id = created.issue.id;

  await alex.post(`/api/issues/${id}/status`).send({ to: 'in_progress', expected: 'open' }).expect(200);
  const res = await alex.post(`/api/issues/${id}/status`).send({ to: 'fixed', note: 'Added aria-label' }).expect(200);

  assert.equal(res.body.issue.status, 'fixed');
  const log = res.body.history.map((h) => [h.from_status, h.to_status, h.changed_by_name]);
  assert.deepEqual(log, [
    [null, 'open', 'Alex Rivera'],
    ['open', 'in_progress', 'Alex Rivera'],
    ['in_progress', 'fixed', 'Alex Rivera'],
  ]);
  assert.equal(res.body.history[2].note, 'Added aria-label');
  assert.ok(!Number.isNaN(Date.parse(res.body.history[2].changed_at)));
});

test('a stale status change (someone else moved it first) gets 409', async () => {
  const { app } = setup();
  const alex = await apiAgent(app, 1);
  const { body: created } = await alex.post('/api/issues').send(validIssue).expect(201);
  const id = created.issue.id;

  // Two tabs both showing "Open". The first one wins.
  await alex.post(`/api/issues/${id}/status`).send({ to: 'in_progress', expected: 'open' }).expect(200);
  const res = await alex.post(`/api/issues/${id}/status`).send({ to: 'wont_fix', expected: 'open' }).expect(409);

  assert.equal(res.body.error.code, 'conflict');
  assert.match(res.body.error.message, /now In progress/);
});

test('the HTML form also rejects a disallowed move with a readable message', async () => {
  const { app } = setup();
  const { agent, csrf } = await webAgent(app, 1);

  await agent.post('/issues/1/status').type('form').send({ _csrf: csrf, status: 'verified', expected: 'open' }).expect(302);
  const page = await agent.get('/issues/1').expect(200);

  assert.match(page.text, /Could not change status\. An issue cannot move from Open to Verified/);
  assert.match(page.text, /badge--status-open">Open</);
});
