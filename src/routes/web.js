const express = require('express');
const { AppError } = require('../errors');
const { requireUserPage, csrf } = require('../auth');
const { WCAG_GROUPS } = require('../wcag');
const { STATUSES, allowedNext, isStatus } = require('../workflow');
const { SEVERITIES, isSeverity } = require('../validation');

const APP_NAME = 'Audit Tracker';

module.exports = function webRoutes({ db, issues }) {
  const router = express.Router();
  const users = db.prepare('SELECT id, display_name, role FROM users ORDER BY id').all();

  router.use(express.urlencoded({ extended: false, limit: '50kb' }));
  // Flash messages survive one redirect, then are shown and announced.
  router.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.appName = APP_NAME;
    res.locals.path = req.path;
    next();
  });
  router.use(csrf);

  const flash = (req, type, text) => {
    req.session.flash = { type, text };
  };

  router.get('/', (req, res) => res.redirect(req.user ? '/issues' : '/login'));

  // --- Sign in -------------------------------------------------------------

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/issues');
    res.render('login', { title: 'Sign in', users, next: safeNext(req.query.next) });
  });

  router.post('/login', (req, res) => {
    const user = users.find((u) => u.id === Number(req.body.userId));
    if (!user) {
      res.status(400);
      return res.render('login', {
        title: 'Error: Sign in',
        users,
        next: safeNext(req.body.next),
        loginError: 'Choose one of the demo accounts to sign in.',
      });
    }
    req.session.userId = user.id;
    flash(req, 'success', `Signed in as ${user.display_name}.`);
    res.redirect(safeNext(req.body.next) || '/issues');
  });

  router.post('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
  });

  router.use(requireUserPage);

  // --- List ----------------------------------------------------------------

  router.get('/issues', (req, res) => {
    // Unknown filter values from a hand-edited URL fall back to "all".
    const status = isStatus(req.query.status) ? req.query.status : '';
    const severity = isSeverity(req.query.severity) ? req.query.severity : '';
    const result = issues.list(req.user.id, { status, severity, page: req.query.page });

    const filterText = [status && `status ${STATUSES[status]}`, severity && `severity ${SEVERITIES[severity]}`]
      .filter(Boolean)
      .join(' and ');
    const countText = `${result.total} ${result.total === 1 ? 'issue' : 'issues'}`;
    const pageText = result.pages > 1 ? `, page ${result.page} of ${result.pages}` : '';

    res.render('issues/list', {
      title: `Your issues (${countText}${filterText ? `, ${filterText}` : ''}${pageText})`,
      result,
      filters: { status, severity },
      filterText,
      countText,
      pageLink: (page) => `/issues?${new URLSearchParams({ ...(status && { status }), ...(severity && { severity }), page })}`,
    });
  });

  // --- Create --------------------------------------------------------------

  router.get('/issues/new', (req, res) => {
    res.render('issues/form', formLocals({ mode: 'create', values: {} }));
  });

  router.post('/issues', (req, res) => {
    try {
      const issue = issues.create(req.user.id, req.body);
      flash(req, 'success', `Issue saved: ${issue.title}.`);
      res.redirect(`/issues/${issue.id}`);
    } catch (err) {
      if (!isFieldError(err)) throw err;
      res.status(400).render('issues/form', formLocals({ mode: 'create', values: req.body, errors: err.fields }));
    }
  });

  // --- Detail --------------------------------------------------------------

  router.get('/issues/:id', (req, res) => {
    const issue = issues.get(req.user.id, req.params.id);
    res.render('issues/show', {
      title: `${issue.title} (issue ${issue.id})`,
      issue,
      history: issues.history(req.user.id, issue.id),
      nextStatuses: allowedNext(issue.status),
    });
  });

  // --- Edit ----------------------------------------------------------------

  router.get('/issues/:id/edit', (req, res) => {
    const issue = issues.get(req.user.id, req.params.id);
    res.render('issues/form', formLocals({ mode: 'edit', issue, values: issue }));
  });

  router.post('/issues/:id', (req, res) => {
    const issue = issues.get(req.user.id, req.params.id);
    try {
      issues.update(req.user.id, issue.id, req.body);
      flash(req, 'success', 'Issue saved.');
      res.redirect(`/issues/${issue.id}`);
    } catch (err) {
      if (err instanceof AppError && err.status === 409) {
        // Keep what the user typed. The form now carries the latest version,
        // so saving again is a deliberate choice to replace the other change.
        const latest = issues.get(req.user.id, issue.id);
        return res.status(409).render('issues/form', formLocals({
          mode: 'edit',
          issue: latest,
          values: { ...req.body, version: latest.version },
          conflict: 'Someone else saved changes to this issue after you opened it. Your changes are still in the form below and have not been saved. Check them against the current issue, then save again to replace the other changes.',
        }));
      }
      if (!isFieldError(err)) throw err;
      // req.body still holds the version the user started from, so a later
      // save is still checked against it.
      res.status(400).render('issues/form', formLocals({ mode: 'edit', issue, values: req.body, errors: err.fields }));
    }
  });

  // --- Status change -------------------------------------------------------

  router.post('/issues/:id/status', (req, res) => {
    const issue = issues.get(req.user.id, req.params.id);
    try {
      const updated = issues.changeStatus(req.user.id, issue.id, {
        to: req.body.status,
        expected: req.body.expected,
        note: req.body.note,
      });
      flash(req, 'success', `Status changed from ${STATUSES[issue.status]} to ${STATUSES[updated.status]}.`);
    } catch (err) {
      if (!(err instanceof AppError) || err.status === 404) throw err;
      flash(req, 'error', `Could not change status. ${err.message}`);
    }
    res.redirect(`/issues/${issue.id}#status-heading`);
  });

  // Ownership failures surface as 404 pages, never as someone else's data.
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (!(err instanceof AppError)) return next(err);
    res.status(err.status).render('error', {
      title: err.status === 404 ? 'Issue not found' : 'Request failed',
      heading: err.status === 404 ? 'Issue not found' : 'Request failed',
      message: err.message,
    });
  });

  return router;
};

function formLocals({ mode, issue, values, errors = {}, conflict = null }) {
  const hasErrors = Object.keys(errors).length > 0 || Boolean(conflict);
  const base = mode === 'create' ? 'Report an issue' : `Edit issue: ${issue.title}`;
  return {
    title: hasErrors ? `Error: ${base}` : base,
    heading: mode === 'create' ? 'Report an issue' : 'Edit issue',
    mode,
    issue,
    values,
    errors,
    conflict,
    wcagGroups: WCAG_GROUPS,
    action: mode === 'create' ? '/issues' : `/issues/${issue.id}`,
  };
}

function isFieldError(err) {
  return err instanceof AppError && err.fields;
}

// Only allow redirects back into this site after sign-in.
function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '';
}
