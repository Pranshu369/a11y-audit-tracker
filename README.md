# Audit Tracker

A small web app for an accessibility audit team to log issues found on web pages, move them through a fix-and-verify workflow, and see who changed what and when.

- **Stack:** Node.js + Express, server-rendered EJS templates, SQLite (`better-sqlite3`)
- **Design:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Accessibility checks:** [ACCESSIBILITY.md](ACCESSIBILITY.md)

## Setup

Requires **Node.js 22 or newer**. Nothing else needs to be installed; SQLite is bundled.

```sh
npm install
npm start
```

Open <http://localhost:3000>. Use `PORT=4000 npm start` to choose another port.

The database is created in `data/tracker.db` on first start and kept between restarts. To start over, stop the app and run `npm run reset-db`.

## Demo accounts

There are no passwords. The sign-in page has one button for each account.

| Account | Role | Seeded issues |
|---|---|---|
| Alex Rivera (`alex.rivera@example.test`) | Accessibility auditor | 2 |
| Sam Okafor (`sam.okafor@example.test`) | Front-end developer | 1 |

To check ownership, sign in as Sam and open `/issues/1`, which belongs to Alex. You get "Issue not found".

## Tests

```sh
npm test
```

This uses Node's built-in test runner with `supertest`. Each test builds its own in-memory database, except the persistence test, which uses a temporary file.

| File | What it covers |
|---|---|
| `test/status.test.js` | An invalid status change (Open → Verified) is rejected with 422 and a readable message, and nothing is written. A valid change is logged with who, when, from and to. A stale change gets 409. The HTML form shows the rejection message. |
| `test/ownership.test.js` | Sam cannot read, edit or change the status of Alex's issue through the API (404, no data leaked, row unchanged) or by typing URLs in the browser. Lists only show your own issues. Anonymous requests get 401 or a redirect to sign in. |
| `test/validation.test.js` | Server-side validation returns a message for each field, including odd input such as `severity=constructor` or repeated query parameters. The form re-renders with an error summary and inline errors. Two tabs editing the same issue get a 409 and the typed changes are kept. Forms without a CSRF token are refused. Data survives reopening the database file. |
| `test/workflow.test.js` | The transition table is consistent. |

### Optional accessibility scripts

These live in `tools/` with their own `package.json`, so the main install stays small. They need Google Chrome installed (set `CHROME_PATH` if it is not in the default macOS location).

```sh
cd tools
npm install
npm run axe        # axe-core scan of 10 page states + reflow check at 320px and 200% zoom
npm run keyboard   # drives every flow with the keyboard only
npm run diagrams   # re-exports docs/diagrams/*.mmd to PNG
```

## How it is organised

```
src/
  app.js          Express setup, security headers, session cookie
  db.js           schema, indexes, demo seed data
  issues.js       all issue reads/writes; every query is scoped by owner_id
  workflow.js     statuses and allowed transitions
  validation.js   field rules and error messages
  wcag.js         WCAG 2.2 A/AA criteria list
  errors.js       AppError -> { error: { code, message, fields } }
  auth.js         demo sign-in, CSRF check
  routes/web.js   HTML pages
  routes/api.js   JSON API (same service layer)
views/            EJS templates
public/           CSS and the small script for focus + live regions
test/             node:test suites
docs/diagrams/    Mermaid sources and exported PNGs
tools/            optional axe, keyboard and diagram scripts
```

## Workflow

| From | Allowed to |
|---|---|
| Open | In progress, Won't fix |
| In progress | Fixed, Open |
| Fixed | Verified, In progress |
| Verified | Open |
| Won't fix | Open |

Anything else is rejected by the backend, for example Open → Verified: *"An issue cannot move from Open to Verified. It has to be marked Fixed before anyone can verify the fix."*

## Assumptions

- **Ownership means the creator.** The brief says users only see their own issues, so there is no sharing between the two demo users. Production would scope by team instead (see ARCHITECTURE.md §4).
- **WCAG criterion comes from a list.** It is a native select of the 55 WCAG 2.2 level A and AA criteria. Typed or AAA values are not accepted.
- **Status is not part of the edit form.** It only changes through the workflow, so every change is logged.
- **Creating an issue is logged** as the first history entry ("Created as Open").
- **Status changes can carry an optional note** (for example, why something will not be fixed). This was not required, but it makes the log more useful.
- **There is no delete.** Audit history should not disappear. "Won't fix" covers issues that are not going to be fixed.
- **Times are stored and shown in UTC.**

## Known limitations

- Demo sign-in only. There is no real authentication, and the session is a signed cookie (8 hours) with a development default secret. Set `SESSION_SECRET` to change it.
- Status changes and filters do a full page reload instead of updating in place.
- Lists use `OFFSET` pagination (20 per page). The production design uses keyset pagination.
- When the database fails, the user gets a generic "Nothing was saved" error page (500). There is no retry or 503 handling as described for production.
- No attachments or email notifications. Those are only designed in ARCHITECTURE.md §7.
- No sorting controls on the list; it is always newest-updated first.
- Accessibility items still open are listed at the end of ACCESSIBILITY.md.

## AI use

I used an AI coding assistant (Claude) during this assignment. I first used it to explore possible approaches: stack options, workflow designs, and how to handle concurrent status changes. I then chose the approach myself (server-rendered Express + SQLite, owner-scoped queries, compare-and-set for status changes). After that, the assistant produced the initial skeleton and first drafts of the code, tests and documents. I went through all of it, changed what I disagreed with, ran the tests and the accessibility scripts, and I am responsible for what is submitted.
