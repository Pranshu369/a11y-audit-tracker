# Accessibility notes

Target: the relevant parts of WCAG 2.2 level AA. This file records what I checked, how I checked it, and what is still open.

## What the app does

- **Skip link** is the first focusable element and moves focus to `<main>`.
- **One `<h1>` per page**, then `<h2>` sections in visual order. The `<title>` is different on every page, for example "Your issues (1 issue, status Open and severity Critical) | Audit Tracker", "Error: Report an issue | Audit Tracker", or "Hero image has no text alternative (issue 1) | Audit Tracker".
- **Native controls only:** `<a>`, `<button>`, `<select>`, `<input>`, `<textarea>`, `<table>`. No custom widgets, no `div` buttons, and no ARIA roles beyond the two live regions.
- **Issue list** is a `<table>` with `<th scope="col">` headers and a (visually hidden) `<caption>` that includes the active filters. The result count sits above the table and is linked with `aria-describedby`.
- **Filters** are two labelled `<select>`s plus an "Apply filters" button. Changing a select does nothing on its own (WCAG 3.2.2 On Input), so keyboard users can move through the options without the page reloading.
- **Labels:** every input has a visible `<label>`. Required fields say "(required)" in the label text and optional ones say "(optional)", so nothing relies on an asterisk or on colour. Hints are linked with `aria-describedby`.
- **Errors:** validation happens on the server. When it fails, the form comes back with:
  - an error summary at the top with a heading and a link to each field, which receives focus;
  - an inline message above each invalid field, with a visually hidden "Error:" prefix, `aria-invalid="true"` on the field and `aria-describedby` pointing at the message;
  - a red left border and the message text, so colour is not the only signal;
  - "Error:" at the start of the page title;
  - the values the user typed, kept.

  The form uses `novalidate` so the browser's own error bubbles (which differ by browser and screen reader) do not appear before the server's messages. `required` is still set, so screen readers announce the fields as required.
- **Status messages** ("Issue saved", "Status changed from Open to In progress", "Could not change status. …") are visible at the top of the page *and* copied into a live region that was already in the page at load: `role="status"` for success and `role="alert"` for errors. Focus is not moved.
- **Severity and status** are shown as text ("Critical", "In progress"). The tinted badges are decoration. All badge text is at least 13:1 against its background.
- **Focus:** one `:focus-visible` style everywhere, a 3px solid `#0b57d0` outline with a 2px offset (6.4:1 against white). Nothing removes the outline without replacing it, except on `<main>` and the status heading, which are only focused programmatically.
- **Contrast:** body text 17.2:1, secondary text 8.6:1, links 6.4:1, error red 6.5:1, input borders 5.8:1. These are all against white and stay above 5:1 on the grey panel. I computed them with the WCAG relative luminance formula. The values are in `public/styles.css`.
- **Reflow:** single column, `flex-wrap` everywhere, long URLs and titles wrap with `overflow-wrap: anywhere`. Under 40em the "Last updated" column is hidden and the same date appears under the title in the first cell, so the table fits in 320px without losing information.
- **Target size:** buttons are at least 44px high. Inline text links rely on the WCAG 2.5.8 inline exception.
- `lang="en"` is set, and `forced-colors` mode gets real borders on badges and messages.

## Automated checks

**Tool:** axe-core 4.14.0, run in headless Chrome 156 with Puppeteer, using the script `tools/axe-check.js`. Rule tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`.

The script starts the app on a throwaway database, signs in, and checks ten page states: sign-in, list with success message, filtered list, empty filtered list, new issue form, form after a failed submit, issue detail, detail after a blocked status change, edit form, and the not-found page. For each state it also measures horizontal overflow at 320px wide and at 1280px with 200% zoom (640 CSS px at device scale 2), takes screenshots, and records the Tab order.

To run it yourself: `cd tools && npm install && npm run axe`. It needs Chrome installed. Set `CHROME_PATH` if Chrome is not in the default macOS location.

**Results**

| Page state | axe violations | Sideways scroll at 320px / 200% |
|---|---|---|
| All 10 states | 0 | none / none |

Problems found along the way and fixed:

1. axe flagged `aria-prohibited-attr` as "needs review" on the error summary. It was a `<div>` with `aria-labelledby`, which is not allowed on a generic element. I changed it to a `<section>`, which gives it the region role so the label is valid.
2. At 320px the status and severity badges were breaking in the middle of words ("Critic / al"), and the title column was very narrow. Fixed by letting badges wrap only between words and by moving the date under the title on narrow screens.
3. A CSRF failure page crashed with a 500 instead of a readable "This form has expired" page, because the template data was set up after the check. I found this through a test, not an accessibility tool, but it mattered because the user would otherwise get an unexplained error.

The script also confirmed that:
- after a failed submit, focus is on `#error-summary`;
- after signing in, the polite live region contains "Success: Signed in as Alex Rivera.";
- after a blocked status change, the assertive region contains "Error: Could not change status. An issue cannot move from Open to Verified. It has to be marked Fixed before anyone can verify the fix."

## Keyboard check

**Scripted keyboard-only run** (`tools/keyboard-check.js`, headless Chrome 156 on macOS). The script uses only Tab, Shift+Tab, Enter and typing (including type-ahead in selects). It never clicks or calls `focus()`, and it fails if a step cannot be reached. Run it with `cd tools && npm run keyboard`.

| Flow | Result |
|---|---|
| First Tab lands on "Skip to main content"; Enter moves focus to `<main>` | Pass |
| Sign in as Sam Okafor | Pass |
| Filter by status (type-ahead "Open"), Apply filters | Pass |
| Filter by severity, then "Clear filters" | Pass |
| Submit an empty form: focus moves to the error summary, and its "Page URL" link moves focus to that field | Pass |
| Shift+Tab to Title, fill in every field (the WCAG criterion is picked by typing "2.2.2"), save | Pass |
| Change status Open → In progress: success message shown, history has the new row | Pass |
| Edit link → change title → Save changes → "Issue saved" | Pass |
| Open an issue from the list table | Pass |
| Shift+Tab moves backwards through the header | Pass |
| Sign out | Pass |

One thing I noticed: on macOS, pressing an arrow key on a closed `<select>` opens the option menu instead of changing the value (Enter then picks the option). That is the platform's normal behaviour, not something the app controls. Type-ahead works the same everywhere.

**Tab order** recorded by `tools/axe-check.js` on each page:

- **List:** Skip link → Audit Tracker → Your issues → Report an issue → Sign out → Report an issue (button) → Status → Severity → Apply filters → Clear filters (when filtered) → each issue title link → pagination (when there is more than one page).
- **Form:** header links → error summary links (when present) → Title → Page URL → WCAG criterion → Severity → Description → Save → Cancel.
- **Detail:** header links → Back to your issues → page URL link → Edit issue → New status → Note → Change status.

This matches the visual order on every page, and the script confirmed every stop had a 3px solid outline.

**Manual pass by hand (Safari and Chrome, no mouse):** TODO

## Screen reader check

**VoiceOver on macOS with Safari:** TODO

Things to check: the page title is read on load; the headings list (VO+U) shows one h1; the table is announced with its headers; required and invalid fields are announced with their error; the error summary is read when it gets focus; "Issue saved" and "Status changed…" are announced without focus moving; and the blocked status change message is announced.

## Known issues and limits

- **Long WCAG list:** the criterion `<select>` has 55 options in four groups. It is native and works with type-ahead, but finding a criterion means scrolling a long list. A searchable combobox would be nicer, but harder to make accessible. I kept the native control on purpose.
- **Typed criteria are not accepted.** Only WCAG 2.2 A and AA criteria from the list can be chosen. AAA criteria or non-WCAG findings would need an "Other" option.
- **Full page reloads.** Filtering and status changes reload the page. Focus goes back to the top of the page (or to the "Change status" heading after a status change). That is predictable, but it costs a few extra key presses.
- **Live region timing:** the message is copied into the live region 250ms after load. This delay is a common workaround so the announcement is not lost while the screen reader reads the new page. Timing differs between screen readers, and some may read the message twice (once from the live region and once when reading the page normally).
- **Without JavaScript:** everything works, but focus does not move to the error summary and messages are not announced as live updates. They are still the first thing inside `<main>`.
- **Not tested:** NVDA or JAWS on Windows, TalkBack or VoiceOver on mobile, Windows high-contrast mode (only the CSS `forced-colors` rules were added, not tested), and real speech input (Voice Control).
- **Session timeout:** the session lasts 8 hours with no warning before it expires. A form posted after it expires shows a "This form has expired" page, and the typed text is only kept if the browser restores it on Back.
- **Dates** are shown in UTC in en-GB format ("14 Oct 2026, 19:05 UTC"), not in the user's time zone.
