const request = require('supertest');
const { createApp } = require('../src/app');
const { openDatabase } = require('../src/db');

// Each test file gets a fresh in-memory database with the two demo users and
// the seeded sample issues (issues 1-2 belong to Alex, issue 3 to Sam).
function setup() {
  const db = openDatabase(':memory:');
  const app = createApp({ db, sessionSecret: 'test-secret' });
  return { app, db };
}

async function apiAgent(app, userId) {
  const agent = request.agent(app);
  await agent.post('/api/session').send({ userId }).expect(200);
  return agent;
}

async function webAgent(app, userId) {
  const agent = request.agent(app);
  const page = await agent.get('/login').expect(200);
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await agent.post('/login').type('form').send({ _csrf: csrf, userId }).expect(302);
  return { agent, csrf };
}

const validIssue = {
  title: 'Search button has no accessible name',
  description: 'Icon-only button, announced as "button".',
  page_url: 'https://example.test/search',
  wcag_criterion: '4.1.2 Name, Role, Value',
  severity: 'serious',
};

module.exports = { setup, apiAgent, webAgent, validIssue };
