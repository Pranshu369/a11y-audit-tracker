const crypto = require('crypto');
const { AppError } = require('./errors');

// Demo sign-in only: the session cookie holds a user id that was picked from
// the seeded accounts. Real authentication is out of scope for the local build
// (see ARCHITECTURE.md for the production approach).
function loadUser(db) {
  const findUser = db.prepare('SELECT id, email, display_name, role FROM users WHERE id = ?');
  return (req, res, next) => {
    const id = req.session && req.session.userId;
    req.user = id ? findUser.get(id) || null : null;
    if (id && !req.user) req.session = null;
    res.locals.currentUser = req.user;
    next();
  };
}

function requireUserPage(req, res, next) {
  if (req.user) return next();
  const target = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
  return res.redirect(`/login${target}`);
}

function requireUserApi(req, res, next) {
  if (req.user) return next();
  return next(new AppError(401, 'unauthenticated', 'Sign in to use this API.'));
}

// Synchroniser-token CSRF check for the HTML forms. The JSON API does not use
// this; it only accepts application/json bodies, which a plain cross-site form
// cannot send.
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;

  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const sent = Buffer.from(typeof (req.body && req.body._csrf) === 'string' ? req.body._csrf : '');
  const expected = Buffer.from(req.session.csrf);
  const ok = sent.length === expected.length && crypto.timingSafeEqual(sent, expected);
  if (ok) return next();

  res.status(403);
  return res.render('error', {
    title: 'Form expired',
    heading: 'This form has expired',
    message: 'For your security the form could not be sent. Go back, reload the page and try again.',
  });
}

module.exports = { loadUser, requireUserPage, requireUserApi, csrf };
