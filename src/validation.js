const { isKnownCriterion } = require('./wcag');

const SEVERITIES = {
  minor: 'Minor',
  moderate: 'Moderate',
  serious: 'Serious',
  critical: 'Critical',
};

const LIMITS = { title: 200, description: 5000, page_url: 2000 };

const isSeverity = (value) => typeof value === 'string' && Object.hasOwn(SEVERITIES, value);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
  } catch {
    return false;
  }
}

// Returns { values, errors }. `errors` maps field name -> message written for
// a person, because the same messages end up next to the form fields.
function validateIssue(input = {}) {
  const values = {
    title: text(input.title),
    description: text(input.description),
    page_url: text(input.page_url),
    wcag_criterion: text(input.wcag_criterion),
    severity: text(input.severity),
  };
  const errors = {};

  if (!values.title) errors.title = 'Enter a title.';
  else if (values.title.length > LIMITS.title) errors.title = `Title must be ${LIMITS.title} characters or fewer.`;

  if (!values.page_url) errors.page_url = 'Enter the page URL where you found the issue.';
  else if (values.page_url.length > LIMITS.page_url) errors.page_url = 'Page URL is too long.';
  else if (!isHttpUrl(values.page_url)) {
    errors.page_url = 'Enter a full web address starting with http:// or https://, for example https://example.com/page.';
  }

  if (!values.wcag_criterion) errors.wcag_criterion = 'Choose the WCAG criterion the issue fails.';
  else if (!isKnownCriterion(values.wcag_criterion)) errors.wcag_criterion = 'Choose a WCAG criterion from the list.';

  if (!values.severity) errors.severity = 'Choose a severity.';
  else if (!isSeverity(values.severity)) errors.severity = 'Choose Minor, Moderate, Serious or Critical.';

  // Checked last so the errors come out in the same order as the form fields.
  if (values.description.length > LIMITS.description) {
    errors.description = `Description must be ${LIMITS.description} characters or fewer.`;
  }

  return { values, errors };
}

module.exports = { validateIssue, SEVERITIES, isSeverity, isHttpUrl };
