const { AppError, notFound } = require('./errors');
const { validateIssue, isSeverity } = require('./validation');
const { STATUSES, isStatus, canTransition, explainRejection } = require('./workflow');

const PAGE_SIZE = 20;
const NOTE_LIMIT = 500;

// Every query here takes the signed-in user's id and filters on owner_id in
// SQL. There is no code path that loads an issue by id alone, so another
// user's issue simply looks like it does not exist (404).
function createIssueService(db) {
  const now = () => new Date().toISOString();

  const stmts = {
    get: db.prepare('SELECT * FROM issues WHERE id = ? AND owner_id = ?'),
    insert: db.prepare(`
      INSERT INTO issues (owner_id, title, description, page_url, wcag_criterion, severity, status, created_at, updated_at)
      VALUES (@owner_id, @title, @description, @page_url, @wcag_criterion, @severity, 'open', @now, @now)`),
    update: db.prepare(`
      UPDATE issues
         SET title = @title, description = @description, page_url = @page_url,
             wcag_criterion = @wcag_criterion, severity = @severity,
             version = version + 1, updated_at = @now
       WHERE id = @id AND owner_id = @owner_id AND version = @version`),
    setStatus: db.prepare(`
      UPDATE issues SET status = @to, version = version + 1, updated_at = @now
       WHERE id = @id AND owner_id = @owner_id AND status = @from`),
    log: db.prepare(`
      INSERT INTO status_changes (issue_id, changed_by, from_status, to_status, note, changed_at)
      VALUES (@issue_id, @changed_by, @from, @to, @note, @now)`),
    history: db.prepare(`
      SELECT sc.*, u.display_name AS changed_by_name
        FROM status_changes sc JOIN users u ON u.id = sc.changed_by
       WHERE sc.issue_id = ?
       ORDER BY sc.changed_at, sc.id`),
  };

  function parseId(id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw notFound();
    return n;
  }

  function list(userId, { status, severity, page } = {}) {
    const fields = {};
    if (status && !isStatus(status)) fields.status = 'Unknown status filter.';
    if (severity && !isSeverity(severity)) fields.severity = 'Unknown severity filter.';
    if (Object.keys(fields).length) {
      throw new AppError(400, 'validation_failed', 'One or more filters are not valid.', fields);
    }

    const where = ['owner_id = @userId'];
    if (status) where.push('status = @status');
    if (severity) where.push('severity = @severity');
    const params = { userId, status, severity };

    const total = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE ${where.join(' AND ')}`).get(params).n;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const current = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), pages);

    const items = db
      .prepare(`SELECT * FROM issues WHERE ${where.join(' AND ')}
                ORDER BY updated_at DESC, id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: PAGE_SIZE, offset: (current - 1) * PAGE_SIZE });

    return { items, total, page: current, pages, pageSize: PAGE_SIZE };
  }

  function get(userId, id) {
    const issue = stmts.get.get(parseId(id), userId);
    if (!issue) throw notFound();
    return issue;
  }

  function history(userId, id) {
    const issue = get(userId, id); // ownership check first
    return stmts.history.all(issue.id);
  }

  const create = db.transaction((userId, input) => {
    const { values, errors } = validateIssue(input);
    if (Object.keys(errors).length) {
      throw new AppError(400, 'validation_failed', 'The issue could not be saved. Check the highlighted fields.', errors);
    }
    const ts = now();
    const { lastInsertRowid } = stmts.insert.run({ ...values, owner_id: userId, now: ts });
    stmts.log.run({ issue_id: lastInsertRowid, changed_by: userId, from: null, to: 'open', note: '', now: ts });
    return stmts.get.get(lastInsertRowid, userId);
  });

  const update = db.transaction((userId, id, input) => {
    const current = get(userId, id);
    const { values, errors } = validateIssue(input);
    if (Object.keys(errors).length) {
      throw new AppError(400, 'validation_failed', 'The issue could not be saved. Check the highlighted fields.', errors);
    }
    const version = input.version === undefined || input.version === '' ? current.version : Number(input.version);
    if (!Number.isInteger(version) || version < 1) {
      throw new AppError(400, 'validation_failed', 'The version number sent with the edit is not valid.', { version: 'Must be a positive whole number.' });
    }
    const result = stmts.update.run({ ...values, id: current.id, owner_id: userId, version, now: now() });
    if (result.changes === 0) {
      throw new AppError(409, 'conflict',
        'This issue was changed somewhere else after you opened it. Reload the page to see the latest version, then make your change again.');
    }
    return stmts.get.get(current.id, userId);
  });

  // `expected` is the status the user saw when they pressed the button. If it
  // no longer matches, someone else got there first and we refuse rather than
  // silently applying a move they did not intend.
  const changeStatus = db.transaction((userId, id, { to, expected, note } = {}) => {
    const issue = get(userId, id);

    if (!isStatus(to)) {
      throw new AppError(400, 'validation_failed', 'Choose a new status.', { status: 'Choose a new status.' });
    }
    if (expected !== undefined && expected !== issue.status) {
      throw new AppError(409, 'conflict',
        `This issue is now ${STATUSES[issue.status]}, not ${STATUSES[expected] || expected}. Someone else changed it. Review the latest status and try again.`);
    }
    if (note !== undefined && typeof note !== 'string') {
      throw new AppError(400, 'validation_failed', 'The note must be text.', { note: 'The note must be text.' });
    }
    const cleanNote = (note || '').trim();
    if (cleanNote.length > NOTE_LIMIT) {
      const msg = `Note must be ${NOTE_LIMIT} characters or fewer.`;
      throw new AppError(400, 'validation_failed', msg, { note: msg });
    }
    if (!canTransition(issue.status, to)) {
      throw new AppError(422, 'transition_not_allowed', explainRejection(issue.status, to));
    }

    const ts = now();
    const result = stmts.setStatus.run({ id: issue.id, owner_id: userId, from: issue.status, to, now: ts });
    if (result.changes === 0) {
      throw new AppError(409, 'conflict', 'This issue was changed somewhere else. Reload the page and try again.');
    }
    stmts.log.run({ issue_id: issue.id, changed_by: userId, from: issue.status, to, note: cleanNote, now: ts });
    return stmts.get.get(issue.id, userId);
  });

  return { list, get, history, create, update, changeStatus };
}

module.exports = { createIssueService, PAGE_SIZE };
