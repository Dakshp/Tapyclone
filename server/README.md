# Setting up sync (Google Sheet)

About ten minutes, all in the browser — no installs, no command line.

Once this is done:

- your expenses live in a Google Sheet you own and can open like any spreadsheet
- every device running Tracky shows the same data
- an iOS Shortcut can log an expense **without opening the app at all**

## 1. Make the sheet

1. Go to <https://sheets.new> and give it a name, e.g. **Tracky Data**.
2. You do not need to add any columns — the script creates them.

## 2. Add the script

1. In that sheet: **Extensions → Apps Script**.
2. Delete whatever is in the editor.
3. Paste the entire contents of `Code.gs` from this folder.
4. Near the top, replace the placeholder token:

   ```js
   var TOKEN = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';
   ```

   Put a long random string between the quotes — treat it like a password, since
   anyone who has it (and the URL) can read and write your expenses. Twenty or so
   random letters and digits is plenty.

   The script refuses every request while the placeholder is still there, so it
   cannot be left open by accident.

5. Just below it, set a **second, different** random string for `ADD_TOKEN`:

   ```js
   var ADD_TOKEN = 'OPTIONAL-SECOND-RANDOM-STRING-FOR-THE-SHORTCUT';
   ```

   This is the one the iOS Shortcut uses. It can **only add** expenses — it
   cannot read your history, and cannot edit or delete anything. It is worth
   setting because a Shortcut has to carry its token in a URL, and URLs turn up
   in logs and screenshots in a way POST bodies do not. If that token ever
   leaked, the worst anyone could do is add junk expenses you can delete.

   (Leave it on the placeholder and the Shortcut just uses the main token.)

6. Save (the disk icon).

### Why not "sign in with Google" instead of tokens?

It sounds safer, but it breaks both callers. Setting the deployment to *Only
myself* means Google answers with a **sign-in page** rather than your data:

- the **Shortcut** has no Google session, so it would receive that page instead
  of logging the expense — the whole point of it is lost
- the **app** cannot log in from a `fetch()` either; it just sees HTML where it
  expected data

Interactive login and non-interactive callers are incompatible. Real OAuth would
fix the app but still not the Shortcut — you would end up storing a refresh token
in it, which is a shared secret again, and one that unlocks far more than a
single sheet. Two scoped tokens is the safer trade here.

## 3. Deploy it

1. **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** *Me*
   - **Who has access:** *Anyone*  ← this matters; "Anyone with Google account"
     will not work from the app
4. **Deploy**. Google asks you to authorise it — that is it asking permission to
   edit your own sheet. Work through the "Advanced → Go to (unsafe)" prompt;
   the warning is standard for personal scripts that Google has not reviewed.
5. Copy the **Web app URL**. It ends in `/exec`.

> "Who has access: Anyone" means anyone who knows the URL *and* the token can
> use it. The URL is unguessable and the token is the real lock — which is why
> it needs to be long and random.

### The two settings do different jobs — don't confuse them

This trips people up, because both sound like they are about logging in:

| | What it decides | Set it to |
|---|---|---|
| **Execute as** | Whose Google account the script *runs as*, and therefore whose sheet it may touch | **Me** |
| **Who has access** | Who may *call the URL* | **Anyone** |

So yes — the script has to be created under a Google login, and you will be asked
to authorise it **once**, in the browser, at setup. That is normal and required:
it is the script asking for permission to edit *your own* sheet, and it is what
"Execute as: Me" then relies on.

What must never require a login is the **calling** side. The app calls from
`fetch()` and the Shortcut has no Google session, so neither can answer a sign-in
page. Setting *Who has access* to "Anyone with a Google account" is exactly the
mistake that breaks both. The shared token is what stands in for authentication
there.

**Whoever creates a deployment owns it.** If you set up both sheets, both live in
your Drive and you can read either. If the other person should keep theirs
private from you, they need to do steps 1–3 under their own Google account.

## 4. Connect Tracky

1. Open Tracky → **Settings → Sync to a Google Sheet**.
2. Paste the **Web app URL** and the **token**.
3. Tap **Check connection**, then **Sync now**.

Existing expenses on the phone are uploaded on that first sync; nothing is lost.

## 5. The shortcut that never opens the app

With sync connected, Settings → **Quick add shortcut** shows an address pointing
at your sheet rather than at Tracky. Build the shortcut as listed there, and for
the last step use **Get Contents of URL** instead of *Open URLs* — that runs in
the background, so nothing appears on screen at all. Tracky picks the expense up
the next time it is opened.

## Re-deploying after an edit

If you ever change `Code.gs`, use **Deploy → Manage deployments → edit (pencil)
→ Version: New version → Deploy**. Creating a brand new deployment instead would
give you a different URL, which you would then have to re-paste into Tracky.

## What the sheet looks like

One row per expense, in a tab called **Expenses**:

| uid | date | amountMinor | category | note | createdAt | updatedAt | deleted |
|-----|------|-------------|----------|------|-----------|-----------|---------|

- `amountMinor` is **paise**, not rupees — ₹250.50 is stored as `25050`. Money is
  kept as whole numbers so repeated addition cannot drift by rounding.
- `deleted` marks an expense removed on some device. The row is kept rather than
  cleared so the deletion reaches your other devices instead of them uploading
  their copy again.
- `uid` is what sync matches on. **Do not edit that column.**

### Adding an expense by typing into the sheet

You can. Fill in just **date**, **amountMinor** and **category** on a new row and
leave the rest blank — the script fills in `uid` and the timestamps for you the
next time any device syncs, and the expense then appears in the app. The category
can be a name as you see it in Tracky ("Food & Drink"); it is matched up for you.

Remember `amountMinor` is paise: type `44400` for ₹444.

**Editing** an existing row by hand works too, but clear its `updatedAt` cell
afterwards. That marks the row as freshly changed, so your edit wins over the
copy sitting on a phone; otherwise the phone's older copy may overwrite it.

## Checking it works

A minute, once you are connected:

1. In the sheet, add a row filling in only **date** (today), **amountMinor**
   (`12300` for ₹123) and **category** (`Food & Drink`). Leave every other cell
   empty.
2. In Tracky: **Settings → Sync now**.
3. The line under the buttons should read *"…Last sync brought back 1 expense."*
4. Open **Today** — ₹123 is in the list.

Then the other direction:

5. Add an expense in Tracky, tap **Sync now**, and look at the sheet. A new row
   appears, with `uid` and the timestamps filled in.

If step 3 says *"Everything was already up to date"*, the row was not picked up —
check the date is today's and that `amountMinor` is a plain number with no ₹ sign
or comma.

## Troubleshooting

**"Could not reach the sync address."** Access is probably not set to *Anyone*.
Deploy → Manage deployments → edit → change it → New version → Deploy.

**"The sync address did not return data."** Same cause: Google is returning a
sign-in page instead of your script.

**"That sync token was rejected."** The token in Tracky does not match `TOKEN` in
the script — check for a stray space, and remember to re-deploy a new version
after changing it.

**Check connection passes but Sync now fails.** This one used to be genuinely
confusing, and the script has been changed so it cannot happen quietly again.

The check only proved the token was right; it never touched the spreadsheet.
Everything *else* — push, pull, the shortcut — reads or writes the sheet on every
call. So a script that could not find its sheet reported "Connected" and then
failed at everything, and the app could only say "did not return data", because
Apps Script answers an exception with an HTML error page.

The usual cause is a **standalone script**: one created at `script.google.com`
rather than from **Extensions → Apps Script** inside the sheet. A standalone
script has no active spreadsheet to find. Two ways out:

- Delete it and add the script from inside the sheet, per step 2 — or
- set `SHEET_ID` at the top of `Code.gs` to the long id in your sheet's URL:
  `docs.google.com/spreadsheets/d/`**`THIS-PART`**`/edit`

Either way, re-deploy a **new version** afterwards (see *Re-deploying after an
edit*) — the `/exec` URL keeps serving the old code until you do.

Now: **Check connection** reads the sheet and tells you its name and how many
expenses are in it, so a pass means the whole path works; and any failure comes
back as JSON carrying the real reason instead of an HTML page.

**Expenses are not appearing on the other phone.** Both need the same URL and
token, and Tracky syncs when opened — reopen it, or tap **Sync now**.
