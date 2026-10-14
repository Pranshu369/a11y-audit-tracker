const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,
  email        TEXT    NOT NULL UNIQUE,
  display_name TEXT    NOT NULL,
  role         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id             INTEGER PRIMARY KEY,
  owner_id       INTEGER NOT NULL REFERENCES users(id),
  title          TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description    TEXT    NOT NULL DEFAULT '',
  page_url       TEXT    NOT NULL,
  wcag_criterion TEXT    NOT NULL,
  severity       TEXT    NOT NULL CHECK (severity IN ('minor','moderate','serious','critical')),
  status         TEXT    NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in_progress','fixed','verified','wont_fix')),
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS status_changes (
  id          INTEGER PRIMARY KEY,
  issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  changed_by  INTEGER NOT NULL REFERENCES users(id),
  from_status TEXT,
  to_status   TEXT    NOT NULL,
  note        TEXT    NOT NULL DEFAULT '',
  changed_at  TEXT    NOT NULL
);

-- List page: "my issues, optionally filtered, newest first".
CREATE INDEX IF NOT EXISTS idx_issues_owner_status_updated
  ON issues (owner_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_owner_severity_updated
  ON issues (owner_id, severity, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_owner_updated
  ON issues (owner_id, updated_at DESC);
-- Detail page: history for one issue in time order.
CREATE INDEX IF NOT EXISTS idx_status_changes_issue
  ON status_changes (issue_id, changed_at);
`;

const DEMO_USERS = [
  { id: 1, email: 'alex.rivera@example.test', display_name: 'Alex Rivera', role: 'Accessibility auditor' },
  { id: 2, email: 'sam.okafor@example.test', display_name: 'Sam Okafor', role: 'Front-end developer' },
];

const DEMO_ISSUES = [
  {
    owner_id: 1,
    title: 'Hero image has no text alternative',
    description: 'The banner image on the home page has an empty alt attribute but contains the campaign headline as text.',
    page_url: 'https://shop.example.test/',
    wcag_criterion: '1.1.1 Non-text Content',
    severity: 'serious',
  },
  {
    owner_id: 1,
    title: 'Focus outline removed on main navigation',
    description: 'outline: none is set on nav links, so keyboard users cannot tell where they are.',
    page_url: 'https://shop.example.test/products',
    wcag_criterion: '2.4.7 Focus Visible',
    severity: 'critical',
  },
  {
    owner_id: 2,
    title: 'Error text on checkout is only shown in red',
    description: 'Invalid card number is indicated by a red border with no message.',
    page_url: 'https://shop.example.test/checkout',
    wcag_criterion: '1.4.1 Use of Color',
    severity: 'moderate',
  },
];

function openDatabase(file) {
  const target = file || process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tracker.db');
  if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });

  const db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, email, display_name, role) VALUES (@id, @email, @display_name, @role)'
  );
  const hadUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;

  db.transaction(() => {
    for (const u of DEMO_USERS) insertUser.run(u);
    if (hadUsers) return;

    // Only add sample issues on a brand new database so a reviewer has something to look at.
    const now = new Date().toISOString();
    const insertIssue = db.prepare(`
      INSERT INTO issues (owner_id, title, description, page_url, wcag_criterion, severity, status, created_at, updated_at)
      VALUES (@owner_id, @title, @description, @page_url, @wcag_criterion, @severity, 'open', @now, @now)`);
    const insertLog = db.prepare(`
      INSERT INTO status_changes (issue_id, changed_by, from_status, to_status, changed_at)
      VALUES (?, ?, NULL, 'open', ?)`);
    for (const issue of DEMO_ISSUES) {
      const { lastInsertRowid } = insertIssue.run({ ...issue, now });
      insertLog.run(lastInsertRowid, issue.owner_id, now);
    }
  })();
}

module.exports = { openDatabase, DEMO_USERS };
