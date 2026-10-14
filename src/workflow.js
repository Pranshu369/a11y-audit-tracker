// Status workflow for an accessibility issue. The map below is the single
// source of truth: the API rejects any move that is not listed here, and the
// detail page only offers the moves listed here.
//
// open        -> in_progress, wont_fix
// in_progress -> fixed, open           (back to open if work is dropped)
// fixed       -> verified, in_progress (back to in_progress if the retest fails)
// verified    -> open                  (regression found later)
// wont_fix    -> open

const STATUSES = {
  open: 'Open',
  in_progress: 'In progress',
  fixed: 'Fixed',
  verified: 'Verified',
  wont_fix: "Won't fix",
};

const TRANSITIONS = {
  open: ['in_progress', 'wont_fix'],
  in_progress: ['fixed', 'open'],
  fixed: ['verified', 'in_progress'],
  verified: ['open'],
  wont_fix: ['open'],
};

function isStatus(value) {
  return typeof value === 'string' && Object.hasOwn(STATUSES, value);
}

function allowedNext(from) {
  return TRANSITIONS[from] || [];
}

function canTransition(from, to) {
  return allowedNext(from).includes(to);
}

function explainRejection(from, to) {
  const options = allowedNext(from).map((s) => STATUSES[s]);
  const base = `An issue cannot move from ${STATUSES[from]} to ${STATUSES[to]}.`;
  if (from === 'open' && to === 'verified') {
    return `${base} It has to be marked Fixed before anyone can verify the fix.`;
  }
  return options.length
    ? `${base} From ${STATUSES[from]} it can move to: ${options.join(', ')}.`
    : base;
}

module.exports = { STATUSES, TRANSITIONS, isStatus, allowedNext, canTransition, explainRejection };
