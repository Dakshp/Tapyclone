/**
 * Talks to the Google Apps Script backend (see server/Code.gs).
 *
 * Two constraints shape every request here, both from Apps Script:
 *
 * 1. It cannot answer a CORS preflight. So requests must qualify as "simple":
 *    a GET with no custom headers, or a POST whose Content-Type is text/plain.
 *    That is why the body below is JSON sent as text/plain, and why the token
 *    travels inside the payload rather than an Authorization header.
 * 2. /exec answers with a redirect to googleusercontent.com. fetch follows it
 *    by default; the request must therefore stay simple across the redirect too.
 *
 * Sync itself is one round trip: push everything changed since the last sync,
 * and the same response carries back everything this device has not seen.
 * Conflicts resolve newest-write-wins per expense, matching the server.
 */
const Sync = (() => {
  let inFlight = null;

  function isConfigured() {
    const s = Store.getSettings();
    return Boolean(s.syncUrl && s.syncToken);
  }

  function describeError(err) {
    const message = String((err && err.message) || err);
    // A browser reports a blocked cross-origin call as an opaque "Failed to
    // fetch", which is by far the most likely first-run problem.
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Could not reach the sync address. Check you are online, and that the Apps Script is deployed with access set to "Anyone".';
    }
    return message;
  }

  async function call(payload) {
    const s = Store.getSettings();
    const response = await fetch(s.syncUrl, {
      method: 'POST',
      // text/plain keeps this a simple request - see the note above.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, token: s.syncToken }),
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`Server replied ${response.status}`);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      // Apps Script serves an HTML sign-in page when the deployment is not
      // public, which is the other common misconfiguration.
      throw new Error('The sync address did not return data. Re-deploy the Apps Script with access set to "Anyone".');
    }
    if (!data.ok) throw new Error(data.error === 'bad token' ? 'That sync token was rejected.' : data.error || 'Sync failed.');
    return data;
  }

  /**
   * Runs one sync. Concurrent calls share the in-flight promise, so opening the
   * app while a background sync is running cannot double-push.
   */
  function run() {
    if (!isConfigured()) return Promise.resolve({ ok: false, error: 'Sync is not set up yet.' });
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const settings = Store.getSettings();
      const pending = Store.getPendingExpenses();
      const payload = {
        action: 'push',
        since: settings.lastSyncAt || '',
        expenses: pending.map((e) => ({
          uid: e.uid,
          date: e.date,
          amountMinor: e.amountMinor,
          category: e.category,
          note: e.note,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          deleted: Boolean(e.deleted),
        })),
      };

      const data = await call(payload);
      const applied = Store.mergeRemote(data.expenses || []);
      // Only advance the watermark once the merge has been stored, so a crash
      // mid-merge means re-syncing rather than silently skipping records.
      Store.setLastSyncAt(data.serverTime || '');
      return { ok: true, pushed: payload.expenses.length, pulled: applied };
    })()
      .catch((err) => ({ ok: false, error: describeError(err) }))
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  // Used by Settings to check a URL/token pair before saving it.
  async function test(url, token) {
    const probe = `${url}${url.includes('?') ? '&' : '?'}action=ping&token=${encodeURIComponent(token)}`;
    const response = await fetch(probe, { redirect: 'follow' });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('That address did not return data. Check the URL ends in /exec and access is set to "Anyone".');
    }
    // Pass the server's own reason through. This used to report every failure
    // as a rejected token, which is how a script that could not reach its sheet
    // spent an afternoon looking like a typo in the token.
    if (!data.ok) {
      throw new Error(data.error === 'bad token'
        ? 'The address works, but that token was rejected.'
        : data.error || 'The address answered, but not with an OK.');
    }
    return data;
  }

  return { isConfigured, run, test };
})();
