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
- **Ten categories** with icons, from food and transport to rent and health.
- **Daily view** with per-day totals and full history; swipe back through
  earlier days with the arrows or jump to a date.
- **Monthly budget** that tells you what is left *and* what that works out to
  per day for the rest of the month, so overspending shows up early.
- **Compare** — an interactive dashboard for reading one period against
  another. Switch between **Monthly** and **Yearly**, tap any bar to compare
  that period, and focus a single category to rescope the whole screen. Each
  category gets a dumbbell showing where it sat last period and where it sits
  now, so the direction of change is visible without reading a number.
  Every plotted value is also available as a plain table.
- **Eight currencies** with correctly localised formatting.
- **Backup and restore** to a JSON file, plus a full erase.

## Editing an expense

Tap any row on the Today screen. The sheet reopens prefilled, so you can fix
the amount, move it to another category, change the note, or delete it.

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
