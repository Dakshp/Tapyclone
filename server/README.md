# Setting up sync (Google Sheet)

About ten minutes, all in the browser — no installs, no command line.

Once this is done:

- your expenses live in a Google Sheet you own and can open like any spreadsheet
- every device running Tappy shows the same data
- an iOS Shortcut can log an expense **without opening the app at all**

## 1. Make the sheet

1. Go to <https://sheets.new> and give it a name, e.g. **Tappy Data**.
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

5. Save (the disk icon).

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

## 4. Connect Tappy

1. Open Tappy → **Settings → Sync to a Google Sheet**.
2. Paste the **Web app URL** and the **token**.
3. Tap **Check connection**, then **Sync now**.

Existing expenses on the phone are uploaded on that first sync; nothing is lost.

## 5. The shortcut that never opens the app

With sync connected, Settings → **Quick add shortcut** shows an address pointing
at your sheet rather than at Tappy. Build the shortcut as listed there, and for
the last step use **Get Contents of URL** instead of *Open URLs* — that runs in
the background, so nothing appears on screen at all. Tappy picks the expense up
the next time it is opened.

## Re-deploying after an edit

If you ever change `Code.gs`, use **Deploy → Manage deployments → edit (pencil)
→ Version: New version → Deploy**. Creating a brand new deployment instead would
give you a different URL, which you would then have to re-paste into Tappy.

## What the sheet looks like

One row per expense, in a tab called **Expenses**:

| uid | date | amountMinor | category | note | createdAt | updatedAt | deleted |
|-----|------|-------------|----------|------|-----------|-----------|---------|

- `amountMinor` is **paise**, not rupees — ₹250.50 is stored as `25050`. Money is
  kept as whole numbers so repeated addition cannot drift by rounding.
- `deleted` marks an expense removed on some device. The row is kept rather than
  cleared so the deletion reaches your other devices instead of them uploading
  their copy again.
- `uid` is what sync matches on. **Do not edit that column.** Editing amounts,
  categories or notes by hand is fine; bump `updatedAt` to something later if you
  want the change to win over what is on a phone.

## Troubleshooting

**"Could not reach the sync address."** Access is probably not set to *Anyone*.
Deploy → Manage deployments → edit → change it → New version → Deploy.

**"The sync address did not return data."** Same cause: Google is returning a
sign-in page instead of your script.

**"That sync token was rejected."** The token in Tappy does not match `TOKEN` in
the script — check for a stray space, and remember to re-deploy a new version
after changing it.

**Expenses are not appearing on the other phone.** Both need the same URL and
token, and Tappy syncs when opened — reopen it, or tap **Sync now**.
