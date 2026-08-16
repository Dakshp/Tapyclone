/**
 * Tracky sync backend — Google Apps Script + Google Sheet.
 *
 * Deploy this as a Web App (see server/README.md). It gives Tracky three things:
 *   1. a place expenses live that is not one phone's browser storage
 *   2. sync between devices
 *   3. a URL an iOS Shortcut can POST to WITHOUT opening the app
 *
 * Notes on the shape of this file, which is dictated by Apps Script:
 *
 * - Apps Script web apps cannot answer CORS preflight (OPTIONS) requests. So
 *   every call from the browser must be a "simple request": GET with no custom
 *   headers, or POST with Content-Type text/plain. That is why the token
 *   travels in the query string / body rather than an Authorization header,
 *   and why the client posts text/plain rather than application/json.
 * - Writes take a script lock. Two devices syncing at the same moment would
 *   otherwise interleave reads and writes and lose rows.
 */

// ---------------------------------------------------------------------------
// SET THIS. Any random hard-to-guess string; paste the same one into Tracky.
// This one can read and change everything, so it is only ever sent inside a
// POST body, never in a URL.
var TOKEN = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';

// OPTIONAL but recommended. A second, different random string for the iOS
// Shortcut. It can ONLY add expenses - it cannot read your history and cannot
// change or delete anything. Worth setting because the Shortcut has to put its
// token in a URL, and URLs end up in logs and screenshots in a way POST bodies
// do not. Leave it as-is to just use TOKEN for the Shortcut too.
var ADD_TOKEN = 'OPTIONAL-SECOND-RANDOM-STRING-FOR-THE-SHORTCUT';
// ---------------------------------------------------------------------------

var SHEET_NAME = 'Expenses';
var HEADERS = ['uid', 'date', 'amountMinor', 'category', 'note', 'createdAt', 'updatedAt', 'deleted'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Makes hand-typed rows first-class.
 *
 * Someone adding an expense by typing into the spreadsheet has no reason to
 * know about `uid` or `updatedAt`, and without them the row would be silently
 * ignored by every device. So any row that carries real data but is missing its
 * bookkeeping columns gets them filled in here, which is what lets a row typed
 * straight into Google Sheets show up in the app.
 */
function healRows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return;
  var range = sh.getRange(2, 1, last - 1, HEADERS.length);
  var values = range.getValues();
  var now = nowIso_();
  var changed = false;

  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    // A row with neither a date nor an amount is just an empty row.
    var hasData = String(r[1] || '').length > 0 || String(r[2] || '').length > 0;
    if (!hasData) continue;
    if (!r[0]) { r[0] = uuid_(); changed = true; }
    if (!r[6]) { r[6] = now; changed = true; }
    if (!r[5]) { r[5] = r[6]; changed = true; }
    if (r[3] === '' || r[3] === null) { r[3] = 'other'; changed = true; }
    if (r[7] === '' || r[7] === null) { r[7] = 'FALSE'; changed = true; }
  }
  if (changed) range.setValues(values);
}

function readAll_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    out.push({
      uid: String(r[0]),
      date: formatDate_(r[1]),
      amountMinor: Math.round(Number(r[2]) || 0),
      category: String(r[3] || 'other'),
      note: String(r[4] || ''),
      createdAt: String(r[5] || ''),
      updatedAt: String(r[6] || ''),
      deleted: r[7] === true || String(r[7]).toLowerCase() === 'true',
      _row: i + 2
    });
  }
  return out;
}

// A cell typed as a date comes back as a Date; one typed as text stays a
// string. Both must serialise to plain YYYY-MM-DD.
function formatDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '').slice(0, 10);
}

function rowFor_(e) {
  return [e.uid, e.date, e.amountMinor, e.category, e.note, e.createdAt, e.updatedAt, e.deleted ? 'TRUE' : 'FALSE'];
}

function nowIso_() {
  return new Date().toISOString();
}

function uuid_() {
  return Utilities.getUuid();
}

/**
 * Upserts a batch, newest-write-wins per uid. Returns how many rows changed.
 * Records the sheet is already ahead on are ignored, so an old device pushing
 * stale copies cannot resurrect them.
 */
function applyBatch_(incoming) {
  var sh = sheet_();
  var existing = readAll_();
  var byUid = {};
  for (var i = 0; i < existing.length; i++) byUid[existing[i].uid] = existing[i];

  var appends = [];
  var changed = 0;

  for (var j = 0; j < incoming.length; j++) {
    var e = normalize_(incoming[j]);
    if (!e) continue;
    var cur = byUid[e.uid];
    if (!cur) {
      appends.push(rowFor_(e));
      byUid[e.uid] = e;
      changed++;
    } else if (String(e.updatedAt) > String(cur.updatedAt)) {
      sh.getRange(cur._row, 1, 1, HEADERS.length).setValues([rowFor_(e)]);
      e._row = cur._row;
      byUid[e.uid] = e;
      changed++;
    }
  }
  if (appends.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appends.length, HEADERS.length).setValues(appends);
  }
  return changed;
}

function normalize_(e) {
  if (!e || !e.uid || !e.date) return null;
  return {
    uid: String(e.uid),
    date: String(e.date).slice(0, 10),
    amountMinor: Math.max(0, Math.round(Number(e.amountMinor) || 0)),
    category: String(e.category || 'other'),
    note: String(e.note || '').slice(0, 200),
    createdAt: String(e.createdAt || nowIso_()),
    updatedAt: String(e.updatedAt || nowIso_()),
    deleted: e.deleted === true || String(e.deleted).toLowerCase() === 'true'
  };
}

// Full access: read, write, delete. Required for everything except `add`.
function authed_(token) {
  return String(token || '') === TOKEN && TOKEN !== 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';
}

// Append-only access, for the Shortcut. Deliberately does NOT grant `pull`, so
// a token exposed in a URL cannot be used to read the expense history back.
function canAdd_(token) {
  var configured = ADD_TOKEN && ADD_TOKEN !== 'OPTIONAL-SECOND-RANDOM-STRING-FOR-THE-SHORTCUT';
  if (configured && String(token || '') === ADD_TOKEN) return true;
  return authed_(token);
}

function pull_(since) {
  var all = readAll_();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (!since || String(e.updatedAt) > String(since)) {
      delete e._row;
      out.push(e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'pull';

  // The Shortcut path: one plain GET, no app involved. Checked against the
  // append-only token first, so this is the ONLY action a leaked URL enables.
  if (action === 'add') {
    if (!canAdd_(p.token)) return json_({ ok: false, error: 'bad token' });
    var amount = Number(String(p.amount || '').replace(/[^0-9.]/g, ''));
    if (!isFinite(amount) || amount <= 0) return json_({ ok: false, error: 'amount must be greater than zero' });
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var now = nowIso_();
      var record = {
        uid: uuid_(),
        date: (p.date && String(p.date).slice(0, 10)) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        amountMinor: Math.round(amount * 100),
        category: String(p.category || 'other'),
        note: String(p.note || ''),
        createdAt: now,
        updatedAt: now,
        deleted: false
      };
      applyBatch_([record]);
      return json_({ ok: true, saved: { amount: amount, category: record.category, date: record.date } });
    } finally {
      lock.releaseLock();
    }
  }

  // Everything below needs the full-access token.
  if (!authed_(p.token)) return json_({ ok: false, error: 'bad token' });

  if (action === 'ping') {
    return json_({ ok: true, service: 'tracky', serverTime: nowIso_() });
  }

  if (action === 'pull') {
    // Healing writes, so it needs the lock like any other write.
    var pullLock = LockService.getScriptLock();
    pullLock.waitLock(20000);
    try {
      healRows_();
      return json_({ ok: true, serverTime: nowIso_(), expenses: pull_(p.since) });
    } finally {
      pullLock.releaseLock();
    }
  }

  return json_({ ok: false, error: 'unknown action' });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'body was not valid JSON' });
  }
  if (!authed_(body.token)) return json_({ ok: false, error: 'bad token' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    healRows_();
    var changed = applyBatch_(body.expenses || []);
    // Reply with everything the caller has not seen, so push and pull are a
    // single round trip.
    return json_({
      ok: true,
      serverTime: nowIso_(),
      applied: changed,
      expenses: pull_(body.since)
    });
  } finally {
    lock.releaseLock();
  }
}
