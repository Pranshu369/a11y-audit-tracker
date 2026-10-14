const express = require('express');
const { AppError } = require('../errors');
const { requireUserApi } = require('../auth');

// JSON API. Same service layer as the HTML pages, so the rules are identical.
module.exports = function apiRoutes({ db, issues }) {
  const router = express.Router();
  const findUser = db.prepare('SELECT id, email, display_name, role FROM users WHERE id = ?');

  router.use(express.json({ limit: '50kb' }));

  // Writes must be JSON. This is also what keeps the cookie-authenticated API
  // safe from cross-site form posts.
  router.use((req, res, next) => {
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json')) {
      return next(new AppError(415, 'unsupported_media_type', 'Send the request body as application/json.'));
    }
    next();
  });

  router.post('/session', (req, res, next) => {
    const user = findUser.get(Number(req.body.userId));
    if (!user) return next(new AppError(400, 'validation_failed', 'Choose one of the demo accounts.', { userId: 'Unknown demo user.' }));
    req.session.userId = user.id;
    res.json({ user });
  });

  router.delete('/session', (req, res) => {
    req.session = null;
    res.status(204).end();
  });

  router.use(requireUserApi);

  router.get('/me', (req, res) => res.json({ user: req.user }));

  router.get('/issues', (req, res) => {
    const { status, severity, page } = req.query;
    res.json(issues.list(req.user.id, { status, severity, page }));
  });

  router.post('/issues', (req, res) => {
    const issue = issues.create(req.user.id, req.body);
    res.status(201).location(`/api/issues/${issue.id}`).json({ issue });
  });

  router.get('/issues/:id', (req, res) => {
    const issue = issues.get(req.user.id, req.params.id);
    res.json({ issue, history: issues.history(req.user.id, issue.id) });
  });

  router.patch('/issues/:id', (req, res) => {
    const current = issues.get(req.user.id, req.params.id);
    const issue = issues.update(req.user.id, current.id, { ...current, ...req.body });
    res.json({ issue });
  });

  router.post('/issues/:id/status', (req, res) => {
    const { to, expected, note } = req.body;
    const issue = issues.changeStatus(req.user.id, req.params.id, { to, expected, note });
    res.json({ issue, history: issues.history(req.user.id, issue.id) });
  });

  router.use((req, res, next) => next(new AppError(404, 'not_found', 'No such API endpoint.')));

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err instanceof AppError) return res.status(err.status).json(err);
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json(new AppError(400, 'bad_json', 'The request body is not valid JSON.'));
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json(new AppError(413, 'too_large', 'The request body is too large.'));
    }
    console.error(err);
    res.status(500).json(new AppError(500, 'server_error', 'Something went wrong on our side. Nothing was saved.'));
  });

  return router;
};
