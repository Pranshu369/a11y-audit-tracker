// Small progressive enhancements. Everything works without this file; it only
// improves what screen reader users hear after a page load.
document.addEventListener('DOMContentLoaded', () => {
  // After a failed submit, move focus to the error summary so it is read out
  // and the links to each field are right there.
  const summary = document.getElementById('error-summary');
  if (summary) {
    summary.focus();
    return;
  }

  // Flash messages ("Issue saved", "Could not change status") are already
  // visible on the page. Copying the text into a live region that existed at
  // load time gets it announced without taking focus away from where it is.
  const flash = document.querySelector('[data-flash]');
  if (!flash) return;
  const text = flash.textContent.replace(/\s+/g, ' ').trim();
  const region = document.getElementById(flash.dataset.tone === 'error' ? 'live-assertive' : 'live-polite');
  if (region) {
    setTimeout(() => {
      region.textContent = text;
    }, 250);
  }
});
