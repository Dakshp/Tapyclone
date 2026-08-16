# Tracky

A fast daily expense tracker. Log a spend in about three taps, see where the
money went, and stay inside a monthly budget.

It is a Progressive Web App: plain HTML, CSS and JavaScript with no build step
and no framework. Out of the box everything you log stays in your browser's
storage on your own device.

Optionally it syncs to **a Google Sheet you own** (see `server/`), which gets
you three things: the data lives somewhere other than one phone, every device
shows the same expenses, and an iOS Shortcut can log one **without opening the
app at all**.

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
- **Quick add from a Shortcut** — `?amount=250&category=Food&note=Chai&save=1`
  logs the expense on arrival and confirms it by name, so an iOS Shortcut on
  Back Tap, the Lock Screen or Siri can capture all three fields with nothing
  to tap in the app. Drop `&save=1` to land on a prefilled keypad instead.
  Auto-save refuses when anything is ambiguous — a zero amount, or a category
  name it does not recognise — and falls back to the keypad rather than filing
  the expense under a guess. The query string is stripped on arrival, so a
  reload can never write the same expense twice.
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

## Sync

Off by default. `server/README.md` walks through connecting a Google Sheet —
about ten minutes, entirely in the browser.

How it works, briefly:

- Each expense carries a globally unique `uid` and an `updatedAt`. Sync matches
  on the uid, and the newer `updatedAt` wins, on both the phone and the server.
- **Deleting keeps a tombstone** rather than dropping the row. Without one, a
  second device that had not yet heard about the deletion would simply upload
  its copy again and the expense would reappear.
- One request does both directions: a push carries everything changed since the
  last sync, and the reply carries everything this device has not seen.
- The watermark only advances after the incoming batch has been stored, so an
  interruption means re-syncing rather than silently skipping records.
- A failed sync never touches local data — the app keeps working offline and
  catches up later.

Security is a shared token, not real accounts: anyone with both the URL and the
token can read and write. That is proportionate for a personal sheet, but it is
not multi-user auth, so the token should be long and random.

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

## Gestures

- **Swipe the day card** left or right to move between days; **swipe the chart**
  on the Compare screen to move between periods, at whichever zoom level is
  selected. Dragging left moves forward in time, the direction the timeline
  runs. The arrows stay, because a gesture is invisible and a first-time user
  needs something to see.
- **Swipe an expense left** to reveal **Edit** and **Delete** in place — the
  same pattern as Mail, with no intermediate menu to step through.

Direction is decided from the first few pixels of a drag: a mostly-vertical
movement stays with the scroller and is never reclaimed, so a slightly slanted
scroll cannot turn into a page change.

Three details are what make the chart gesture feel like it is working rather
than like nothing happened:

- The card's snap-back transition is **switched off while the finger is down**.
  Left on, it animates *towards* each new position instead of sitting at it, so
  the card trails the finger and the drag feels dead.
- A touch fires `pointerenter` on a bar but **never** `pointerleave`, so the
  tooltip would pin itself open for the whole gesture and stay there afterwards,
  naming a period that is no longer selected.
- A swipe ends in a synthesised click. Without a short guard after the gesture,
  that click selects whichever bar the finger lifted over and immediately undoes
  the period change.

## Editing an expense

Tap any row on the Today screen, or use **Edit** from its swipe actions. The
sheet reopens prefilled, so you can fix the amount, move it to another category,
change the note, or delete it.

Deleting from a swipe offers **Undo** rather than a confirmation dialog: a swipe
is easy to make by accident, so the recovery belongs after the action rather
than as a question before it. Undo works because deletion is a tombstone — the
restore simply clears the flag, and its fresh timestamp means the un-delete wins
on every other device too.

## Look and feel

The chrome follows Apple's Liquid Glass material: the header and the tab bar are
translucent, blurred panels that content scrolls beneath, the tab bar is a
detached capsule rather than a bar welded to the screen edge, and the add button
is tinted glass with a specular top edge.

The add button is the same material, tinted rather than solid, so content blurs
and colours through it instead of being hidden behind it. Its tint is kept
deliberately flat: a strong centre-to-edge gradient turns a circle into a shiny
plastic ball, which is the opposite of what the material is going for. The depth
comes from the rim, not from shading the face.

Apple's guidance for native apps is *"don't fake borders or bevels; the system
adds highlights for you"*. On the web nothing does, so the specular edge is drawn
here — but kept to a thin bright rim that fades underneath, rather than a bevel.

The swipe actions follow the same logic. **Edit** and **Delete** are inset,
rounded pills echoing the row's own shape, not full-bleed colour blocks — a block
reads as raw background showing through a hole, a pill reads as a control. Each
carries an icon *and* its word: Delete is destructive enough that it should never
rest on a glyph alone.

The important constraint is that **the blur is an enhancement, never what keeps
text readable**. iOS's *Reduce Transparency* setting switches it off, and some
engines parse `backdrop-filter` without compositing it. So the fills are opaque
enough to stand alone, and `prefers-reduced-transparency` drops to fully solid
surfaces.

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
