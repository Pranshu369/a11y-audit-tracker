const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, apiAgent, webAgent, validIssue } = require('./helpers');

// Seed data: issues 1 and 2 belong to Alex (user 1), issue 3 to Sam (user 2).

test('a user cannot read, edit or change the status of another user\'s issue through the API', async () => {
  const { app, db } = setup();
  const sam = await apiAgent(app, 2);
  const before = db.prepare('SELECT * FROM issues WHERE id = 1').get();

  const read = await sam.get('/api/issues/1').expect(404);
  const edit = await sam.patch('/api/issues/1').send({ title: 'Hijacked' }).expect(404);
  const move = await sam.post('/api/issues/1/status').send({ to: 'in_progress' }).expect(404);

  for (const res of [read, edit, move]) {
    assert.equal(res.body.error.code, 'not_found');
    assert.doesNotMatch(JSON.stringify(res.body), /Hero image/, 'no data from the other user leaks out');
  }
  assert.deepEqual(db.prepare('SELECT * FROM issues WHERE id = 1').get(), before);
});

test('the list only contains the signed-in user\'s issues', async () => {
  const { app } = setup();
  const sam = await apiAgent(app, 2);
  await sam.post('/api/issues').send(validIssue).expect(201);

  const { body } = await sam.get('/api/issues').expect(200);
  assert.equal(body.total, 2);
  assert.ok(body.items.every((i) => i.owner_id === 2));
});

test('typing another user\'s issue URL in the browser shows "not found"', async () => {
  const { app } = setup();
  const { agent, csrf } = await webAgent(app, 2);

  const show = await agent.get('/issues/1').expect(404);
  assert.match(show.text, /<h1>Issue not found<\/h1>/);
  assert.doesNotMatch(show.text, /Hero image/);

  await agent.get('/issues/1/edit').expect(404);
  await agent.post('/issues/1').type('form').send({ _csrf: csrf, ...validIssue, title: 'Hijacked' }).expect(404);
  await agent.post('/issues/1/status').type('form').send({ _csrf: csrf, status: 'in_progress' }).expect(404);
});

test('anonymous requests are refused', async () => {
  const { app } = setup();
  const res = await request(app).get('/api/issues/1').expect(401);
  assert.equal(res.body.error.code, 'unauthenticated');
  await request(app).get('/issues/1').expect(302).expect('Location', '/login?next=%2Fissues%2F1');
});
