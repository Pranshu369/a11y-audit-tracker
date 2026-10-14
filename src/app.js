const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const { openDatabase } = require('./db');
const { createIssueService } = require('./issues');
const { loadUser } = require('./auth');
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');
const { STATUSES } = require('./workflow');
const { SEVERITIES } = require('./validation');

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function createApp({ db = openDatabase(), sessionSecret = process.env.SESSION_SECRET } = {}) {
  const app = express();
  const issues = createIssueService(db);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'");
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(
    cookieSession({
      name: 'tracker_session',
      keys: [sessionSecret || 'local-dev-only-secret-change-me'],
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    })
  );
  app.use(loadUser(db));

  app.locals.STATUSES = STATUSES;
  app.locals.SEVERITIES = SEVERITIES;
  app.locals.formatDate = (iso) => `${dateFormat.format(new Date(iso))} UTC`;

  app.use('/api', apiRoutes({ db, issues }));
  app.use('/', webRoutes({ db, issues }));

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Page not found',
      heading: 'Page not found',
      message: 'There is nothing at this address. Check the link or go back to your issues.',
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', {
      title: 'Something went wrong',
      heading: 'Something went wrong',
      message: 'The server could not finish your request. Nothing was saved. Please try again in a moment.',
    });
  });

  return app;
}

module.exports = { createApp };
