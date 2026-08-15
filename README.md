# Tappy

A fast daily expense tracker. Log a spend in about three taps, see where the
money went, and stay inside a monthly budget.

It is a Progressive Web App: plain HTML, CSS and JavaScript with no build step,
no framework and no backend. Everything you log stays in your browser's
localStorage on your own device.

## Publishing it

One-time setup, in this repo's **Settings → Pages**: set Source to
**Deploy from a branch**, pick branch `main` and folder `/ (root)`, then Save.
GitHub serves the site a minute or so later and republishes it on every push.

(The Actions token is not permitted to create a Pages site programmatically,
so this one switch has to be flipped by hand.)

## Install on your phone

**iPhone** — open the site in Safari, tap Share, then **Add to Home Screen**.
It then launches full-screen with its own icon, exactly like an App Store app.

**Android** — open in Chrome and accept the "Install app" prompt.

Once installed it works with no connection at all.

## What it does

- **Three-tap logging** — a big on-screen keypad, category chips, and an
  optional note. No system keyboard needed for the amount.
- **Editable categories** — rename, re-icon, reorder and add your own in
  Settings. See "Retiring a category" below for why deletion is deliberately
  restricted.
- **Quick add from a Shortcut** — opening `?amount=250&category=food&note=Chai`
  launches straight into the keypad with the entry prefilled, so an iOS
  Shortcut on Back Tap, the Lock Screen or Siri behaves like a native widget.
  The entry is never saved automatically; it sits one tap from confirmation.
- **CSV export** alongside the JSON backup, for spreadsheets.
- **Daily view** with per-day totals and full history; swipe back through
  earlier days with the arrows or jump to a date.
- **Monthly budget** that tells you what is left *and* what that works out to
  per day for the rest of the month, so overspending shows up early.
- **Compare** — an interactive dashboard that zooms out in four steps:
  **Day → Week → Month → Year**, starting on Day. Tap any bar to compare that
  period, or focus a single category to rescope the whole screen. Each category
  gets a dumbbell showing where it sat last period and where it sits now, so
  the direction of change is visible without reading a number. Below the chart,
  **average a day** and **biggest single spend** put the headline in context.
  Every plotted value is also available as a plain table.
- **Eight currencies** with correctly localised formatting.
- **Backup and restore** to a JSON file, plus a full erase.

## Retiring a category

Every expense stores a category **id**, and that id is permanent. Renaming a
category therefore changes only its label — all past expenses follow the new
name automatically, and nothing in the history moves.

Deleting is the dangerous direction. If a category with expenses simply
disappeared, those expenses would point at something that no longer exists:
they would drop out of the category breakdown while still counting toward the
total, so the rows would stop adding up to the headline — a quietly wrong
chart. The app closes that path:

- A category **no expense has ever used** can be deleted outright.
- A category **with expenses** cannot. Instead you can **hide** it (it leaves
  the logging picker but keeps every past expense exactly where it is) or
  **merge** it into another category (its expenses are reassigned first, then
  it is removed).

Either way no expense is ever orphaned, and the per-category figures always
reconcile with the total. As a backstop, if a backup from another device
references a category this one has never heard of, that id is still shown in
the breakdown rather than silently dropped.

## Editing an expense

Tap any row on the Today screen. The sheet reopens prefilled, so you can fix
the amount, move it to another category, change the note, or delete it.

## Legibility

The app is built for someone tracking daily spending, not for a chart reader,
so the interface leans plain:

- Axis labels are words and numbers on two short lines — `Mon` over `11`,
  `Aug` rather than a bare `A`. Six or seven wide bars, never twelve slivers.
- Changes are written out — "▲ ₹1,100 more compared with last month" — instead
  of leaving the reader to subtract.
- A period with nothing in it says "Nothing spent" rather than showing ₹0.00 as
  though it were a measurement.
- The add button is centred and oversized: it is the one action the app exists
  for, and the middle of the bottom edge is the easiest place to hit.
- The layout is capped at phone width, so on a tablet or desktop it stays a
  phone-shaped app instead of stretching the chart into a huge empty box.

## Notes on the code

- `storage.js` — all persistence. Money is stored as an **integer count of
  paise/cents**, never a float, so long lists of expenses cannot drift by a
  rounding error. Every read normalises records, so a malformed or legacy entry
  can never reach the arithmetic as a string.
- `app.js` — rendering and interaction. Calendar dates are read from local
  fields and stepped in UTC, which avoids the off-by-one-day bug that hits any
  timezone ahead of UTC.
- **Chart colours** are a single-hue ordinal pair (previous → current), stepped
  separately for the light and dark surfaces and checked against contrast and
  colour-vision thresholds rather than picked by eye. Direction of change is
  always carried by an arrow **and** a word, so it never depends on colour;
  the selected period is shown by emphasis (one bar coloured, the rest grey)
  instead of giving every bar its own hue.
- `sw.js` — caches the app shell for offline use. **Bump `CACHE` whenever an
  app file changes**, otherwise installed copies keep serving the old version.
- `icons/` — generated, not hand-drawn; see the icon script in the project
  history if they need regenerating.

## Backing up

Your data lives only on the device. Before switching phones, clearing browser
data, or reinstalling, go to **Settings → Download backup** and keep the JSON
file somewhere safe. **Settings → Restore backup** reads it back.
