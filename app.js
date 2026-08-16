const state = {
  date: todayStr(),
  category: 'food',
  amount: '0',
  editingId: null,
};

const el = (id) => document.getElementById(id);

// ---------- Dates ----------
// "Today" is read from local calendar fields. Going through toISOString() would
// convert to UTC first and hand back yesterday's date for anyone east of
// Greenwich (IST included) for the first hours of every day.
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Date strings are plain calendar dates with no timezone, so all arithmetic is
// done in UTC where days are always exactly 24h (no DST shifts).
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function formatDayTitle(dateStr) {
  if (dateStr === todayStr()) return 'Today';
  if (dateStr === shiftDate(todayStr(), -1)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const sameYear = y === new Date().getFullYear();
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  });
}

function formatMonthTitle(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------- Money ----------

function formatMoney(minor, { compact = false } = {}) {
  const s = Store.getSettings();
  const value = (Number(minor) || 0) / Store.MINOR_PER_MAJOR;
  const hasPaise = Math.round(value * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat(s.locale, {
      style: 'currency',
      currency: s.currency,
      minimumFractionDigits: compact && !hasPaise ? 0 : 2,
      maximumFractionDigits: compact && !hasPaise ? 0 : 2,
    }).format(value);
  } catch (err) {
    return `${s.currency} ${value.toFixed(2)}`;
  }
}

function currencySymbol() {
  const s = Store.getSettings();
  try {
    const parts = new Intl.NumberFormat(s.locale, { style: 'currency', currency: s.currency }).formatToParts(0);
    return (parts.find((p) => p.type === 'currency') || {}).value || s.currency;
  } catch (err) {
    return s.currency;
  }
}

function parseAmountToMinor(str) {
  const n = Number(String(str).replace(/[^0-9.]/g, ''));
  return isFinite(n) && n > 0 ? Math.round(n * Store.MINOR_PER_MAJOR) : 0;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str == null ? '' : str);
  return div.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function categoryMeta(id) {
  return (
    Store.getCategoriesForDisplay().find((c) => c.id === id) || { id, label: id, icon: '❓' }
  );
}

function toast(message, action) {
  const t = el('toast');
  t.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = message;
  t.appendChild(label);
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      t.classList.add('hidden');
      clearTimeout(toast._timer);
      action.onClick();
    });
    t.appendChild(btn);
  }
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  // An undoable action stays up longer - it is useless if it vanishes before
  // the reader has registered what happened.
  toast._timer = setTimeout(() => t.classList.add('hidden'), action ? 5200 : 1900);
}

/**
 * Horizontal drag on an element, without stealing vertical scrolling.
 *
 * The direction is decided once per gesture from the first few pixels: if the
 * movement is mostly vertical the gesture is released back to the scroller and
 * never reclaimed, so a slightly slanted scroll does not turn into a swipe.
 */
function onHorizontalSwipe(target, { onSwipe, onDrag, threshold = 45 }) {
  let startX = 0;
  let startY = 0;
  let active = false;
  let axis = null; // null until decided, then 'x' or 'y'

  const point = (e) => (e.touches ? e.touches[0] : e);

  const start = (e) => {
    const p = point(e);
    startX = p.clientX;
    startY = p.clientY;
    active = true;
    axis = null;
  };

  const move = (e) => {
    if (!active) return;
    const p = point(e);
    const dx = p.clientX - startX;
    const dy = p.clientY - startY;
    if (axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis !== 'x') return;
    if (e.cancelable) e.preventDefault();
    if (onDrag) onDrag(dx);
  };

  const end = (e) => {
    if (!active) return;
    active = false;
    const p = e.changedTouches ? e.changedTouches[0] : e;
    const dx = p.clientX - startX;
    const wasHorizontal = axis === 'x';
    axis = null;
    if (onDrag) onDrag(0, true);
    if (wasHorizontal && Math.abs(dx) >= threshold) onSwipe(dx < 0 ? 1 : -1, dx);
    return wasHorizontal;
  };

  target.addEventListener('touchstart', start, { passive: true });
  target.addEventListener('touchmove', move, { passive: false });
  target.addEventListener('touchend', end);
  target.addEventListener('touchcancel', end);
  // Mouse equivalents, so the same gesture is reachable with a trackpad.
  target.addEventListener('pointerdown', (e) => e.pointerType === 'mouse' && start(e));
  target.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && move(e));
  target.addEventListener('pointerup', (e) => e.pointerType === 'mouse' && end(e));
  target.addEventListener('pointercancel', (e) => e.pointerType === 'mouse' && end(e));
}

// ---------- Today screen ----------

function renderToday() {
  el('dateTitle').textContent = formatDayTitle(state.date);
  el('datePicker').value = state.date;

  const day = Store.getDay(state.date);
  el('dayTotal').textContent = formatMoney(day.totalMinor, { compact: true });
  el('dayCount').textContent = day.expenses.length
    ? `${day.expenses.length} ${day.expenses.length === 1 ? 'entry' : 'entries'}`
    : '';

  renderBudget();

  const list = el('dayList');
  list.innerHTML = '';
  if (!day.expenses.length) {
    list.innerHTML = '<p class="empty-msg">Nothing logged yet.<br>Tap + to add your first expense.</p>';
    return;
  }
  day.expenses.forEach((e) => list.appendChild(buildExpenseRow(e)));
}

// Only one row may sit open at a time, matching how iOS lists behave.
let openSwipeRow = null;
function closeSwipedRow() {
  if (!openSwipeRow) return;
  openSwipeRow.classList.remove('revealed');
  openSwipeRow = null;
}

const SWIPE_REVEAL = 176; // two action pills plus the gaps between them

/**
 * An expense row with iOS-style trailing actions: swipe left to reveal Edit and
 * Delete in place. No intermediate menu - that is the convention people already
 * have from Mail, and an extra step buys nothing.
 */
function buildExpenseRow(e) {
  const meta = categoryMeta(e.category);

  const wrap = document.createElement('div');
  wrap.className = 'row-wrap';

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const makeAction = (cls, label, iconPath, onClick) => {
    const b = document.createElement('button');
    b.className = `row-action ${cls}`;
    b.type = 'button';
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${iconPath}</svg>`;
    const text = document.createElement('span');
    text.textContent = label;
    b.appendChild(text);
    b.addEventListener('click', onClick);
    return b;
  };

  const edit = makeAction(
    'action-edit',
    'Edit',
    '<path d="M4 20h4L19 9a2.4 2.4 0 10-3.4-3.4L4.6 16.6 4 20z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
    () => { closeSwipedRow(); openSheet(e.id); }
  );

  const del = makeAction(
    'action-delete',
    'Delete',
    '<path d="M5 7h14M10 7V5.4A1.4 1.4 0 0111.4 4h1.2A1.4 1.4 0 0114 5.4V7M6.5 7l.8 11.2A1.9 1.9 0 009.2 20h5.6a1.9 1.9 0 001.9-1.8L17.5 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    () => { closeSwipedRow(); deleteWithUndo(e); }
  );

  actions.append(edit, del);

  const row = document.createElement('button');
  row.className = 'expense-row';
  row.type = 'button';
  row.innerHTML = `
    <span class="row-icon">${meta.icon}</span>
    <span class="row-body">
      <span class="row-title">${escapeHtml(e.note || meta.label)}</span>
      <span class="row-sub">${escapeHtml([e.note ? meta.label : '', formatTime(e.createdAt)].filter(Boolean).join(' · '))}</span>
    </span>
    <span class="row-amount">${formatMoney(e.amountMinor)}</span>
  `;

  let dragged = false;
  onHorizontalSwipe(row, {
    threshold: 50,
    onDrag: (dx, done) => {
      if (done) {
        row.style.transform = '';
        return;
      }
      dragged = Math.abs(dx) > 6;
      const base = wrap.classList.contains('revealed') ? -SWIPE_REVEAL : 0;
      // Rubber-band past the ends so the row cannot be dragged off into space.
      const next = Math.max(Math.min(base + dx, 0), -SWIPE_REVEAL - 24);
      row.style.transform = `translateX(${next}px)`;
    },
    onSwipe: (dir) => {
      if (dir === 1) {
        if (openSwipeRow && openSwipeRow !== wrap) closeSwipedRow();
        wrap.classList.add('revealed');
        openSwipeRow = wrap;
      } else {
        closeSwipedRow();
      }
    },
  });

  // A tap that followed a drag should not also open the editor.
  row.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (wrap.classList.contains('revealed')) {
      closeSwipedRow();
      return;
    }
    openSheet(e.id);
  });

  wrap.append(actions, row);
  return wrap;
}

// Deleting from a gesture needs to be recoverable: a swipe is easy to make by
// accident, so this offers Undo rather than blocking on a confirm dialog.
function deleteWithUndo(expense) {
  Store.deleteExpense(expense.id);
  renderAll();
  scheduleSync();
  toast(`Deleted ${formatMoney(expense.amountMinor, { compact: true })}`, {
    label: 'Undo',
    onClick: () => {
      Store.restoreExpense(expense.id);
      renderAll();
      scheduleSync();
      toast('Restored');
    },
  });
}

function renderBudget() {
  const s = Store.getSettings();
  const month = state.date.slice(0, 7);
  const spent = Store.getMonth(month).totalMinor;
  const budget = s.monthlyBudgetMinor;

  el('monthLabel').textContent = formatMonthTitle(month);

  if (budget <= 0) {
    el('monthSummary').textContent = formatMoney(spent, { compact: true });
    el('monthProgress').style.width = '0%';
    el('budgetNote').textContent = 'No monthly budget set.';
    return;
  }

  const pct = Math.min((spent / budget) * 100, 100);
  const bar = el('monthProgress');
  bar.style.width = `${pct}%`;
  bar.classList.toggle('over', spent > budget);

  el('monthSummary').textContent = `${formatMoney(spent, { compact: true })} of ${formatMoney(budget, { compact: true })}`;

  const left = budget - spent;
  if (left < 0) {
    el('budgetNote').textContent = `${formatMoney(-left, { compact: true })} over budget`;
    return;
  }
  // Pace the remainder over the days still to come, so the number answers
  // "what can I spend per day from here" rather than just "what is left".
  const total = daysInMonth(month);
  const isCurrentMonth = month === todayStr().slice(0, 7);
  const dayOfMonth = isCurrentMonth ? Number(todayStr().slice(8, 10)) : total;
  const daysLeft = Math.max(total - dayOfMonth + 1, 1);
  el('budgetNote').textContent =
    `${formatMoney(left, { compact: true })} left` +
    (isCurrentMonth ? ` · ${formatMoney(Math.floor(left / daysLeft), { compact: true })}/day for ${daysLeft} more ${daysLeft === 1 ? 'day' : 'days'}` : '');
}

// ---------- Compare dashboard ----------

const compare = {
  granularity: 'day', // it is a daily tracker, so start on days
  period: todayStr(), // the highlighted bar
  anchor: todayStr(), // the period the visible window ends at
  categoryId: null,
  showTable: false,
};

// Few, wide, clearly-labelled bars beat a dense year of slivers.
const SPAN = { day: 7, week: 6, month: 6, year: 4 };

const UNIT_NAME = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };

function parseUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtUTC(date, opts) {
  return date.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

/**
 * "Today", "This week", "Last month" and friends - only when the period really
 * is the current or immediately preceding one, so the wording is never a lie.
 */
function relativePeriodName(period, granularity) {
  const current = Store.periodOf(todayStr(), granularity);
  if (period === current) return { day: 'Today', week: 'This week', month: 'This month', year: 'This year' }[granularity];
  if (period === Store.shiftPeriod(current, granularity, -1)) {
    return { day: 'Yesterday', week: 'Last week', month: 'Last month', year: 'Last year' }[granularity];
  }
  return null;
}

function periodLabel(period, granularity, style = 'long') {
  const relative = relativePeriodName(period, granularity);
  if (relative && style !== 'plain') return relative;

  if (granularity === 'year') return period;

  if (granularity === 'month') {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return style === 'short'
      ? fmtUTC(d, { month: 'short' })
      : fmtUTC(d, { month: 'long', year: 'numeric' });
  }

  if (granularity === 'week') {
    const start = parseUTC(period);
    const end = parseUTC(Store.shiftPeriod(period, 'day', 6));
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    return sameMonth
      ? `${start.getUTCDate()}–${end.getUTCDate()} ${fmtUTC(end, { month: 'short' })}`
      : `${start.getUTCDate()} ${fmtUTC(start, { month: 'short' })} – ${end.getUTCDate()} ${fmtUTC(end, { month: 'short' })}`;
  }

  const d = parseUTC(period);
  return style === 'short'
    ? fmtUTC(d, { day: 'numeric', month: 'short' })
    : fmtUTC(d, { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Axis labels are two short stacked lines rather than one cramped string, so a
 * day reads "Mon / 11" and a month reads "Aug" instead of a bare initial.
 */
function axisLabel(period, granularity) {
  if (granularity === 'year') return [period, ''];
  if (granularity === 'month') {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return [fmtUTC(d, { month: 'short' }), m === 1 ? String(y) : ''];
  }
  if (granularity === 'week') {
    const start = parseUTC(period);
    const end = parseUTC(Store.shiftPeriod(period, 'day', 6));
    return [`${start.getUTCDate()}–${end.getUTCDate()}`, fmtUTC(end, { month: 'short' })];
  }
  const d = parseUTC(period);
  return [fmtUTC(d, { weekday: 'short' }), String(d.getUTCDate())];
}

// Reads inside a sentence ("compared with yesterday"), so relative names are
// lowercased and concrete dates are left as they are.
function vsLabel(period, granularity) {
  const relative = relativePeriodName(period, granularity);
  return relative ? relative.toLowerCase() : periodLabel(period, granularity, 'plain');
}

// A date that sits inside the period, used to carry the selection across a
// granularity switch (today wins when the period contains it).
function representativeDate(period, granularity) {
  const today = todayStr();
  if (Store.periodOf(today, granularity) === period) return today;
  if (granularity === 'year') return `${period}-01-01`;
  if (granularity === 'month') return `${period}-01`;
  return period;
}

// Direction is carried by a glyph AND a word, never by colour alone - for an
// expense log "more" is the bad direction, so the tones are inverted from the
// usual up-is-good reading.
function deltaInfo(deltaMinor, hasPrevious) {
  if (!hasPrevious) return { text: 'No earlier period', tone: 'flat' };
  if (deltaMinor === 0) return { text: 'No change', tone: 'flat' };
  const up = deltaMinor > 0;
  return {
    text: `${up ? '▲' : '▼'} ${formatMoney(Math.abs(deltaMinor), { compact: true })} ${up ? 'more' : 'less'}`,
    tone: up ? 'up' : 'down',
  };
}

function syncComparePeriod() {
  compare.period = Store.periodOf(state.date, compare.granularity);
  compare.anchor = compare.period;
}

// Period keys are fixed-width and zero-padded, so plain string ordering is
// chronological ordering for both 'YYYY-MM' and 'YYYY'.
function movePeriod(delta) {
  const span = SPAN[compare.granularity];
  compare.period = Store.shiftPeriod(compare.period, compare.granularity, delta);
  const windowStart = Store.shiftPeriod(compare.anchor, compare.granularity, -(span - 1));
  if (compare.period > compare.anchor) compare.anchor = compare.period;
  else if (compare.period < windowStart) {
    compare.anchor = Store.shiftPeriod(compare.period, compare.granularity, span - 1);
  }
  renderCompare();
}

function renderCompare() {
  populateFocusSelect();
  const data = Store.getComparison({
    granularity: compare.granularity,
    period: compare.period,
    endPeriod: compare.anchor,
    categoryId: compare.categoryId,
    span: SPAN[compare.granularity],
  });

  el('periodTitle').textContent = periodLabel(data.period, data.granularity);
  el('seriesHead').textContent = `${UNIT_NAME[data.granularity]} by ${UNIT_NAME[data.granularity].toLowerCase()}`;

  const focus = data.categoryId ? categoryMeta(data.categoryId) : null;
  el('cmpLabel').textContent = focus ? `${focus.icon} ${focus.label}` : 'Total spent';
  el('cmpTotal').textContent = formatMoney(data.currentTotal, { compact: true });

  const d = deltaInfo(data.deltaMinor, data.hasPrevious);
  const pill = el('cmpDelta');
  pill.textContent = d.text;
  pill.className = `delta-pill tone-${d.tone}`;

  const entries = `${data.entryCount} ${data.entryCount === 1 ? 'entry' : 'entries'}`;
  el('cmpSub').textContent = data.hasPrevious
    ? `compared with ${vsLabel(data.previousPeriod, data.granularity)} · ${entries}`
    : entries;

  renderTiles(data);
  renderPeriodChart(data);
  renderCategoryCompare(data);
  renderTableView(data);
}

// Two plain-language figures beside the headline. "Average a day" is the one
// number that makes week/month/year totals comparable to each other; on a
// single day it would just restate the headline, so it is left out there.
function renderTiles(data) {
  const box = el('cmpTiles');
  box.innerHTML = '';
  const tiles = [];

  if (data.granularity !== 'day' && data.dayCount > 0 && data.currentTotal > 0) {
    tiles.push({
      label: 'Average a day',
      value: formatMoney(Math.round(data.currentTotal / data.dayCount), { compact: true }),
      note: `over ${data.dayCount} ${data.dayCount === 1 ? 'day' : 'days'}`,
    });
  }
  if (data.biggest) {
    const meta = categoryMeta(data.biggest.category);
    tiles.push({
      label: 'Biggest single spend',
      value: formatMoney(data.biggest.amountMinor, { compact: true }),
      note: data.biggest.note || `${meta.icon} ${meta.label}`,
    });
  }

  tiles.forEach((t) => {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = t.label;
    const value = document.createElement('span');
    value.className = 'tile-value';
    value.textContent = t.value;
    const note = document.createElement('span');
    note.className = 'tile-note';
    note.textContent = t.note;
    tile.append(label, value, note);
    box.appendChild(tile);
  });
}

// Top corners rounded, base square - the data-end is rounded, the baseline is not.
function barPath(x, y, w, h, r) {
  const rr = Math.max(Math.min(r, w / 2, h), 0);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

let lastChartSwipeAt = 0;

function renderPeriodChart(data) {
  const svg = el('periodSvg');
  // The viewBox is kept close to the real rendered width so text scales to a
  // sensible size rather than shrinking to a fraction of what it says.
  const W = 360;
  const H = 190;
  // Top band holds the selected bar's value; the bottom band holds two lines of
  // axis label, so neither is ever clipped by the container.
  const pad = { top: 28, bottom: 46, side: 6 };
  const plotH = H - pad.top - pad.bottom;
  const plotW = W - pad.side * 2;
  const n = data.series.length;
  const max = Math.max(...data.series.map((s) => s.totalMinor), 1);
  const gap = 10;
  const barW = (plotW - gap * (n - 1)) / n;
  const baseY = pad.top + plotH;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const marks = data.series
    .map((s, i) => {
      const x = pad.side + i * (barW + gap);
      const h = s.totalMinor > 0 ? Math.max((s.totalMinor / max) * plotH, 3) : 0;
      const y = baseY - h;
      const selected = s.period === data.period;
      const cx = x + barW / 2;
      const [line1, line2] = axisLabel(s.period, data.granularity);
      // The value sits in the reserved top band rather than riding the bar top,
      // so it can never collide with a taller neighbour; x is clamped to stay
      // inside the plot at either end.
      const labelX = Math.min(Math.max(cx, 34), W - 34);
      const value = selected
        ? `<text x="${labelX.toFixed(1)}" y="17" text-anchor="middle" font-size="15"
                 font-weight="700" fill="var(--viz-ink)">${formatMoney(s.totalMinor, { compact: true })}</text>`
        : '';
      return `
        <path d="${barPath(x, y, barW, h, 4)}" fill="${selected ? 'var(--viz-current)' : 'var(--viz-context)'}"></path>
        ${value}
        <text x="${cx.toFixed(1)}" y="${H - 26}" text-anchor="middle" font-size="12.5"
              fill="${selected ? 'var(--viz-ink)' : 'var(--viz-muted)'}"
              font-weight="${selected ? '700' : '500'}">${line1}</text>
        <text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="12.5"
              fill="${selected ? 'var(--viz-ink)' : 'var(--viz-muted)'}"
              font-weight="${selected ? '700' : '400'}">${line2}</text>
        <rect class="hit" data-period="${s.period}" x="${x - gap / 2}" y="${pad.top}"
              width="${barW + gap}" height="${plotH + pad.bottom}" fill="transparent"
              tabindex="0" role="button"></rect>
      `;
    })
    .join('');

  svg.innerHTML =
    `<line x1="${pad.side}" y1="${baseY}" x2="${W - pad.side}" y2="${baseY}" stroke="var(--viz-axis)" stroke-width="1"/>` +
    marks;

  const byPeriod = {};
  data.series.forEach((s) => (byPeriod[s.period] = s));

  svg.querySelectorAll('.hit').forEach((hit) => {
    const s = byPeriod[hit.dataset.period];
    const cx = Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2;
    const show = () => showPeriodTip(s, data, cx / W);
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', hidePeriodTip);
    hit.addEventListener('blur', hidePeriodTip);
    const select = () => {
      compare.period = s.period;
      hidePeriodTip();
      renderCompare();
    };
    hit.addEventListener('click', () => {
      // Suppress the tap that a horizontal swipe would otherwise synthesise.
      if (Date.now() - lastChartSwipeAt < 400) return;
      select();
    });
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
  });
}

function showPeriodTip(s, data, fraction) {
  const tip = el('periodTip');
  tip.innerHTML = '';
  // Value leads, label follows - the reader already knows which bar they are on.
  const value = document.createElement('strong');
  value.className = 'tip-value';
  // An empty period says so, rather than presenting a hollow "0.00" as data.
  value.textContent = s.totalMinor > 0 ? formatMoney(s.totalMinor) : 'Nothing spent';
  const label = document.createElement('span');
  label.className = 'tip-label';
  label.textContent = periodLabel(s.period, data.granularity);
  tip.append(value, label);
  tip.style.left = `${Math.min(Math.max(fraction * 100, 16), 84)}%`;
  tip.classList.remove('hidden');
}

function hidePeriodTip() {
  el('periodTip').classList.add('hidden');
}

function renderCategoryCompare(data) {
  const legend = el('cmpLegend');
  legend.innerHTML = '';
  const box = el('categoryCompare');
  box.innerHTML = '';

  if (!data.categories.length) {
    box.innerHTML = '<p class="empty-msg">Nothing logged in this period.</p>';
    return;
  }

  // Two series on the plot, so a legend is always present.
  [
    ['db-prev', periodLabel(data.previousPeriod, data.granularity, 'short')],
    ['db-cur', periodLabel(data.period, data.granularity, 'short')],
  ].forEach(([cls, text]) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = `legend-dot ${cls}`;
    const name = document.createElement('span');
    name.textContent = text;
    item.append(dot, name);
    legend.appendChild(item);
  });

  const max = Math.max(...data.categories.flatMap((c) => [c.currentMinor, c.previousMinor]), 1);

  data.categories.forEach((c) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cmp-row';
    if (data.categoryId === c.id) row.classList.add('focused');
    else if (data.categoryId) row.classList.add('dimmed');
    row.setAttribute('aria-pressed', String(data.categoryId === c.id));

    const head = document.createElement('span');
    head.className = 'cmp-head';
    const icon = document.createElement('span');
    icon.className = 'row-icon';
    icon.textContent = c.icon;
    const name = document.createElement('span');
    name.className = 'cmp-name';
    name.textContent = c.label;
    const amount = document.createElement('span');
    amount.className = 'row-amount';
    amount.textContent = formatMoney(c.currentMinor, { compact: true });
    head.append(icon, name, amount);

    const pPct = (c.previousMinor / max) * 100;
    const cPct = (c.currentMinor / max) * 100;
    const track = document.createElement('span');
    track.className = 'dumbbell';
    const line = document.createElement('span');
    line.className = 'db-line';
    line.style.left = `${Math.min(pPct, cPct)}%`;
    line.style.width = `${Math.abs(cPct - pPct)}%`;
    const prevDot = document.createElement('span');
    prevDot.className = 'db-dot db-prev';
    prevDot.style.left = `${pPct}%`;
    const curDot = document.createElement('span');
    curDot.className = 'db-dot db-cur';
    curDot.style.left = `${cPct}%`;
    track.append(line, prevDot, curDot);

    const foot = document.createElement('span');
    foot.className = 'cmp-foot';
    const di = deltaInfo(c.deltaMinor, data.hasPrevious);
    const delta = document.createElement('span');
    delta.className = `delta-text tone-${di.tone}`;
    delta.textContent = di.text;
    const was = document.createElement('span');
    was.className = 'cmp-was';
    was.textContent = `was ${formatMoney(c.previousMinor, { compact: true })}`;
    foot.append(delta, was);

    row.append(head, track, foot);
    row.addEventListener('click', () => {
      compare.categoryId = compare.categoryId === c.id ? null : c.id;
      el('focusCategory').value = compare.categoryId || '';
      renderCompare();
    });
    box.appendChild(row);
  });
}

function buildTable(headers, rows) {
  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  headers.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i > 0) th.className = 'num';
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  rows.forEach((cells) => {
    const tr = document.createElement('tr');
    cells.forEach((cell, i) => {
      const td = document.createElement('td');
      td.textContent = cell;
      if (i > 0) td.className = 'num';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  return table;
}

// The WCAG-clean twin of both charts: every plotted value readable as text.
function renderTableView(data) {
  el('tableHead').classList.toggle('hidden', !compare.showTable);
  const box = el('tableView');
  box.classList.toggle('hidden', !compare.showTable);
  el('tableToggle').textContent = compare.showTable ? 'Hide table' : 'Show table';
  el('tableToggle').setAttribute('aria-expanded', String(compare.showTable));
  if (!compare.showTable) return;

  box.innerHTML = '';
  const unit = UNIT_NAME[data.granularity];
  const periodCaption = document.createElement('p');
  periodCaption.className = 'table-caption';
  periodCaption.textContent = `${unit} by ${unit.toLowerCase()}`;
  box.append(
    periodCaption,
    buildTable(
      [unit, 'Spent'],
      data.series.map((s) => [periodLabel(s.period, data.granularity), formatMoney(s.totalMinor)])
    )
  );

  const catCaption = document.createElement('p');
  catCaption.className = 'table-caption';
  catCaption.textContent = `Categories · ${periodLabel(data.previousPeriod, data.granularity, 'short')} vs ${periodLabel(data.period, data.granularity, 'short')}`;
  box.append(
    catCaption,
    buildTable(
      ['Category', 'Before', 'Now', 'Change'],
      data.categories.map((c) => [
        c.label,
        formatMoney(c.previousMinor),
        formatMoney(c.currentMinor),
        deltaInfo(c.deltaMinor, data.hasPrevious).text,
      ])
    )
  );
}

// Rebuilt on every render so categories added or retired in Settings show up
// here without a reload; the current focus survives unless it no longer exists.
function populateFocusSelect() {
  const select = el('focusCategory');
  const wanted = compare.categoryId || '';
  select.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All categories';
  select.appendChild(all);
  Store.getCategoriesForDisplay().forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon} ${c.label}`;
    select.appendChild(opt);
  });
  select.value = wanted;
  if (select.value !== wanted) {
    compare.categoryId = null;
    select.value = '';
  }
}

function initCompareControls() {
  const select = el('focusCategory');
  select.addEventListener('change', () => {
    compare.categoryId = select.value || null;
    renderCompare();
  });

  el('granularityToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-gran]');
    if (!btn || btn.dataset.gran === compare.granularity) return;
    // Carry the selection across the switch via a date inside it, rather than
    // resetting to today - zooming out from 3 March should land on March.
    const date = representativeDate(compare.period, compare.granularity);
    compare.granularity = btn.dataset.gran;
    compare.period = Store.periodOf(date, compare.granularity);
    compare.anchor = compare.period;
    el('granularityToggle')
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('active', b === btn));
    renderCompare();
  });

  el('prevPeriod').addEventListener('click', () => movePeriod(-1));
  el('nextPeriod').addEventListener('click', () => movePeriod(1));

  const chart = document.querySelector('#screen-stats .chart-card');
  onHorizontalSwipe(chart, {
    // Lower than the default: the chart is a wide target with nothing else
    // competing for a horizontal drag, so a short flick should already count.
    threshold: 32,
    // Dragging left moves forward in time, matching the direction the timeline
    // runs and how paged iOS views behave.
    onSwipe: (dir) => {
      lastChartSwipeAt = Date.now();
      movePeriod(dir);
    },
    onDrag: (dx, done) => {
      if (done) {
        // Restore the snap-back transition only once the finger is gone.
        chart.classList.remove('dragging');
        chart.style.transform = '';
        return;
      }
      // While dragging, the transition would lag a frame behind the finger and
      // make the gesture feel unresponsive.
      chart.classList.add('dragging');
      chart.style.transform = `translateX(${Math.max(Math.min(dx * 0.5, 56), -56)}px)`;
      // A touch fires pointerenter on a bar but never pointerleave, so without
      // this the tooltip sticks open for the whole gesture.
      hidePeriodTip();
    },
  });
  // Same reason: end the gesture with no tooltip left hanging.
  chart.addEventListener('touchend', () => setTimeout(hidePeriodTip, 900), { passive: true });

  el('tableToggle').addEventListener('click', () => {
    compare.showTable = !compare.showTable;
    renderCompare();
  });
}

// ---------- Add / edit sheet ----------

function renderChips() {
  const row = el('categoryChips');
  row.innerHTML = '';
  const visible = Store.getCategories();
  // The remembered category may have been hidden or merged away since last use.
  if (!visible.some((c) => c.id === state.category)) {
    state.category = visible.length ? visible[0].id : 'other';
  }
  visible.forEach((c) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (c.id === state.category ? ' active' : '');
    chip.innerHTML = `<span>${c.icon}</span><span>${escapeHtml(c.label)}</span>`;
    chip.addEventListener('click', () => {
      state.category = c.id;
      renderChips();
    });
    row.appendChild(chip);
  });
  const active = row.querySelector('.chip.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function renderAmount() {
  el('amountValue').textContent = state.amount;
  el('amountCurrency').textContent = currencySymbol();
  el('sheetSave').disabled = parseAmountToMinor(state.amount) <= 0;
}

function pressKey(key) {
  if (key === 'back') {
    state.amount = state.amount.length > 1 ? state.amount.slice(0, -1) : '0';
  } else if (key === '.') {
    if (!state.amount.includes('.')) state.amount += '.';
  } else {
    const [, decimals] = state.amount.split('.');
    if (decimals && decimals.length >= 2) return; // currencies stop at 2 places
    if (state.amount.replace('.', '').length >= 9) return;
    state.amount = state.amount === '0' ? key : state.amount + key;
  }
  renderAmount();
}

function openSheet(id = null) {
  state.editingId = id;
  if (id) {
    const e = Store.getExpense(id);
    if (!e) return;
    state.amount = String(e.amountMinor / Store.MINOR_PER_MAJOR);
    state.category = e.category;
    el('noteInput').value = e.note;
    el('sheetSave').textContent = 'Save changes';
    el('sheetDelete').classList.remove('hidden');
  } else {
    state.amount = '0';
    el('noteInput').value = '';
    el('sheetSave').textContent = 'Add expense';
    el('sheetDelete').classList.add('hidden');
  }
  renderChips();
  renderAmount();
  el('sheetBackdrop').classList.remove('hidden');
}

function closeSheet() {
  state.editingId = null;
  el('sheetBackdrop').classList.add('hidden');
}

function saveSheet() {
  const amountMinor = parseAmountToMinor(state.amount);
  if (amountMinor <= 0) return;
  const payload = {
    date: state.date,
    amountMinor,
    category: state.category,
    note: el('noteInput').value.trim(),
  };
  try {
    if (state.editingId) {
      Store.updateExpense(state.editingId, payload);
      toast('Expense updated');
    } else {
      Store.addExpense(payload);
      toast(`Added ${formatMoney(amountMinor)}`);
    }
    closeSheet();
    renderAll();
    scheduleSync();
  } catch (err) {
    toast(err.message);
  }
}

function deleteFromSheet() {
  if (!state.editingId) return;
  if (!window.confirm('Delete this expense?')) return;
  Store.deleteExpense(state.editingId);
  closeSheet();
  renderAll();
  scheduleSync();
  toast('Expense deleted');
}

// ---------- Category management ----------

let editingCategory = null; // null while adding

function renderCategoryManager() {
  const box = el('categoryManager');
  box.innerHTML = '';
  const cats = Store.getCategories({ includeHidden: true });

  cats.forEach((c, i) => {
    const used = Store.categoryUsage(c.id);
    const row = document.createElement('div');
    row.className = 'cat-row';

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'cat-main';
    const icon = document.createElement('span');
    icon.className = 'row-icon';
    icon.textContent = c.icon;
    const text = document.createElement('span');
    text.className = 'row-body';
    const name = document.createElement('span');
    name.className = 'row-title';
    name.textContent = c.label;
    const meta = document.createElement('span');
    meta.className = 'row-sub';
    meta.textContent =
      [used ? `${used} ${used === 1 ? 'expense' : 'expenses'}` : 'Unused', c.hidden ? 'Hidden' : '']
        .filter(Boolean)
        .join(' · ');
    text.append(name, meta);
    main.append(icon, text);
    main.addEventListener('click', () => openCategoryEditor(c));

    const moves = document.createElement('span');
    moves.className = 'cat-moves';
    [['▲', -1, i === 0], ['▼', 1, i === cats.length - 1]].forEach(([glyph, delta, disabled]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-move';
      btn.textContent = glyph;
      btn.disabled = disabled;
      btn.setAttribute('aria-label', delta < 0 ? `Move ${c.label} up` : `Move ${c.label} down`);
      btn.addEventListener('click', () => {
        Store.moveCategory(c.id, delta);
        renderCategoryManager();
        renderChips();
      });
      moves.appendChild(btn);
    });

    row.append(main, moves);
    box.appendChild(row);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'cat-add';
  add.textContent = '+ Add category';
  add.addEventListener('click', () => openCategoryEditor(null));
  box.appendChild(add);
}

function openCategoryEditor(category) {
  editingCategory = category;
  const adding = !category;
  el('catTitle').textContent = adding ? 'New category' : 'Edit category';
  el('catIcon').value = adding ? '🏷️' : category.icon;
  el('catName').value = adding ? '' : category.label;
  el('catSave').textContent = adding ? 'Add category' : 'Save';

  const used = adding ? 0 : Store.categoryUsage(category.id);
  el('catHiddenField').classList.toggle('hidden', adding);
  el('catHidden').checked = adding ? false : Boolean(category.hidden);
  el('catUsage').textContent = adding
    ? 'The name and icon can be changed later at any time.'
    : used
      ? `Used by ${used} ${used === 1 ? 'expense' : 'expenses'}. Renaming is safe — past expenses follow the new name.`
      : 'Not used by any expense yet.';

  renderCategoryDanger(category, used);
  el('catBackdrop').classList.remove('hidden');
  if (adding) el('catName').focus();
}

// Deleting a category that has expenses would orphan them, so that path is
// closed: an unused category can be deleted outright, a used one can only be
// merged into another (which moves its expenses first).
function renderCategoryDanger(category, used) {
  const box = el('catDanger');
  box.innerHTML = '';
  if (!category) return;

  if (!used) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-danger';
    del.textContent = 'Delete category';
    del.addEventListener('click', () => {
      if (!window.confirm(`Delete "${category.label}"?`)) return;
      try {
        Store.removeCategory(category.id);
        closeCategoryEditor();
        afterCategoryChange('Category deleted');
      } catch (err) {
        toast(err.message);
      }
    });
    box.appendChild(del);
    return;
  }

  const others = Store.getCategories({ includeHidden: true }).filter((c) => c.id !== category.id);
  if (!others.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'merge-box';
  const label = document.createElement('p');
  label.className = 'hint';
  label.textContent = `To retire this category, merge its ${used} ${used === 1 ? 'expense' : 'expenses'} into another one. Hiding it instead keeps the history exactly as it is.`;
  const select = document.createElement('select');
  select.className = 'merge-select';
  others.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon} ${c.label}`;
    select.appendChild(opt);
  });
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn-danger';
  go.textContent = 'Merge and delete';
  go.addEventListener('click', () => {
    const target = others.find((c) => c.id === select.value);
    if (!target) return;
    if (!window.confirm(`Move ${used} ${used === 1 ? 'expense' : 'expenses'} from "${category.label}" into "${target.label}", then delete "${category.label}"?`)) return;
    try {
      const { moved } = Store.mergeCategory(category.id, target.id);
      closeCategoryEditor();
      afterCategoryChange(`Moved ${moved} into ${target.label}`);
    } catch (err) {
      toast(err.message);
    }
  });
  wrap.append(label, select, go);
  box.appendChild(wrap);
}

function closeCategoryEditor() {
  editingCategory = null;
  el('catBackdrop').classList.add('hidden');
}

function saveCategoryEditor() {
  const label = el('catName').value.trim();
  const icon = el('catIcon').value.trim();
  if (!label) {
    toast('Give the category a name.');
    return;
  }
  try {
    if (editingCategory) {
      Store.updateCategory(editingCategory.id, { label, icon, hidden: el('catHidden').checked });
      closeCategoryEditor();
      afterCategoryChange('Category saved');
    } else {
      Store.addCategory({ label, icon });
      closeCategoryEditor();
      afterCategoryChange('Category added');
    }
  } catch (err) {
    toast(err.message);
  }
}

// Categories feed the picker, the compare screen and every breakdown, so a
// change has to refresh all of them.
function afterCategoryChange(message) {
  renderCategoryManager();
  renderChips();
  renderAll();
  toast(message);
}

// ---------- Settings ----------

function renderSettings() {
  const s = Store.getSettings();
  el('setCurrency').value = `${s.currency}|${s.locale}`;
  el('setBudget').value = s.monthlyBudgetMinor
    ? String(s.monthlyBudgetMinor / Store.MINOR_PER_MAJOR)
    : '';
  el('setSyncUrl').value = s.syncUrl;
  el('setSyncToken').value = s.syncToken;
  el('setSyncAddToken').value = s.syncAddToken;
  renderSyncStatus();
  renderShortcutHelp();
  renderCategoryManager();
}

// The outcome of the last sync, kept on screen rather than only in a toast that
// disappears - checking whether sync worked is the whole reason to look here.
let lastSyncResult = null;

function renderSyncStatus(message) {
  const s = Store.getSettings();
  const box = el('syncStatus');
  if (message) {
    box.textContent = message;
    return;
  }
  if (!Sync.isConfigured()) {
    box.textContent = 'Not connected — expenses stay on this device only.';
    return;
  }
  if (!s.lastSyncAt) {
    box.textContent = 'Connected. Not synced yet — tap “Sync now”.';
    return;
  }
  const when = `Last synced ${new Date(s.lastSyncAt).toLocaleString()}.`;
  if (!lastSyncResult) {
    box.textContent = `Connected. ${when}`;
    return;
  }
  const { pushed, pulled } = lastSyncResult;
  const parts = [];
  if (pushed) parts.push(`sent ${pushed}`);
  if (pulled) parts.push(`brought back ${pulled}`);
  box.textContent = parts.length
    ? `${when} Last sync ${parts.join(' and ')} ${pushed + pulled === 1 ? 'expense' : 'expenses'}.`
    : `${when} Everything was already up to date.`;
}

// Once a sheet is connected the shortcut can post straight to it, which is the
// only way to log without the app opening at all.
function renderShortcutHelp() {
  const s = Store.getSettings();
  const connected = Sync.isConfigured();
  el('shortcutIntro').textContent = connected
    ? 'Your shortcut can write straight to the sheet — nothing opens, nothing flashes up. Tracky picks the expense up next time it syncs.'
    : 'Right now a shortcut has to open Tracky for a moment to save. Connect a Google Sheet above and it can save silently in the background instead.';
  // Prefer the append-only token here: this address goes into a shortcut, and
  // shortcut URLs are the one place the secret is visible.
  el('quickUrl').textContent = connected
    ? `${s.syncUrl}?action=add&token=${s.syncAddToken || s.syncToken}&amount=AMOUNT&category=CATEGORY&note=NOTE`
    : `${location.origin}${location.pathname}?amount=AMOUNT&category=CATEGORY&note=NOTE&save=1`;
  el('shortcutFinalStep').innerHTML = connected
    ? '<strong>Get Contents of URL</strong> — pass it that Text. This runs in the background; nothing appears on screen.'
    : '<strong>Open URLs</strong> — pass it that Text.';
}

async function saveSyncSettings() {
  Store.setSettings({
    syncUrl: el('setSyncUrl').value.trim(),
    syncToken: el('setSyncToken').value.trim(),
    syncAddToken: el('setSyncAddToken').value.trim(),
  });
  renderSyncStatus();
  renderShortcutHelp();
}

async function checkSyncConnection() {
  const url = el('setSyncUrl').value.trim();
  const token = el('setSyncToken').value.trim();
  if (!url || !token) {
    renderSyncStatus('Enter both the web app URL and the token first.');
    return;
  }
  renderSyncStatus('Checking…');
  try {
    await Sync.test(url, token);
    await saveSyncSettings();
    renderSyncStatus('Connected. Tap “Sync now” to send your expenses across.');
  } catch (err) {
    renderSyncStatus(err.message);
  }
}

// Local edits are pushed shortly after they settle, rather than on every
// keystroke of an amount being typed.
let syncTimer = null;
function scheduleSync() {
  if (!Sync.isConfigured()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow({ silent: true }), 1500);
}

async function syncNow({ silent = false } = {}) {
  if (!Sync.isConfigured()) return;
  if (!silent) renderSyncStatus('Syncing…');
  const result = await Sync.run();
  renderAll();
  if (result.ok) {
    lastSyncResult = result;
    renderSyncStatus();
    if (!silent) toast(`Synced · sent ${result.pushed}, received ${result.pulled}`);
  } else if (!silent) {
    renderSyncStatus(result.error);
    toast('Sync failed');
  }
}

function saveCurrency() {
  const [currency, locale] = el('setCurrency').value.split('|');
  Store.setSettings({ currency, locale });
  renderAll();
  toast('Currency updated');
}

function saveBudget() {
  Store.setSettings({ monthlyBudgetMinor: parseAmountToMinor(el('setBudget').value) });
  renderAll();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadBackup() {
  downloadFile(
    `tracky-backup-${todayStr()}.json`,
    JSON.stringify(Store.exportData(), null, 2),
    'application/json'
  );
}

function downloadCsv() {
  // The BOM makes Excel read it as UTF-8 rather than mangling the currency sign.
  downloadFile(`tracky-${todayStr()}.csv`, `﻿${Store.exportCsv()}`, 'text/csv;charset=utf-8');
  toast('CSV exported');
}

/**
 * Quick add from a URL such as
 * `?amount=250&category=Food&note=Chai&save=1`, which is what lets an iOS
 * Shortcut (Back Tap, Lock Screen, Siri) log without touching the app.
 *
 * With `save=1` the expense is written straight away and confirmed by name.
 * Without it - or if anything about the request is ambiguous - the keypad
 * opens prefilled instead, so nothing is ever guessed on the user's behalf.
 */
function applyQuickAdd() {
  const params = new URLSearchParams(location.search);
  if (!params.has('amount') && !params.has('add')) return;

  const rawAmount = params.get('amount') || '';
  const rawCategory = (params.get('category') || '').trim().toLowerCase();
  const note = (params.get('note') || '').slice(0, 60);
  const autoSave = params.get('save') === '1';

  // Drop the query immediately so reloading the app cannot replay the entry.
  history.replaceState(null, '', location.pathname);

  const minor = parseAmountToMinor(rawAmount);
  const match = rawCategory
    ? Store.getCategories().find((c) => c.id === rawCategory || c.label.toLowerCase() === rawCategory)
    : null;
  // A category that was asked for but not recognised must not fall back to
  // some default - silently filing it under the wrong heading is worse than
  // asking. That case drops through to the keypad.
  const categoryIsClear = !rawCategory || Boolean(match);

  if (autoSave && minor > 0 && categoryIsClear) {
    const category = match ? match.id : state.category;
    try {
      Store.addExpense({ date: todayStr(), amountMinor: minor, category, note });
      renderAll();
      scheduleSync();
      toast(`Saved ${formatMoney(minor, { compact: true })} · ${categoryMeta(category).label}`);
      return;
    } catch (err) {
      toast(err.message);
    }
  }

  openSheet(null);
  if (minor > 0) {
    state.amount = String(minor / Store.MINOR_PER_MAJOR);
    renderAmount();
  }
  if (match) {
    state.category = match.id;
    renderChips();
  }
  if (note) el('noteInput').value = note;
}

function handleImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const count = Array.isArray(parsed.expenses) ? parsed.expenses.length : 0;
      if (!window.confirm(`Restore ${count} expenses?\n\nThis REPLACES everything currently in Tracky.`)) return;
      Store.importData(parsed);
      renderAll();
      renderSettings();
      toast('Backup restored');
    } catch (err) {
      toast(err.message);
    } finally {
      el('importFile').value = '';
    }
  };
  reader.readAsText(file);
}

function clearEverything() {
  if (!window.confirm('Erase every expense and reset settings?\n\nThis cannot be undone.')) return;
  if (!window.confirm('Really erase everything? Download a backup first if you are unsure.')) return;
  Store.clearAll();
  state.date = todayStr();
  syncComparePeriod();
  renderAll();
  renderSettings();
  toast('All data erased');
}

// ---------- Navigation ----------

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  el(`screen-${name}`).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.screen === name));
  if (name === 'stats') renderCompare();
  if (name === 'settings') renderSettings();
}

function renderAll() {
  closeSwipedRow();
  renderToday();
  if (!el('screen-stats').classList.contains('hidden')) renderCompare();
}

// ---------- Init ----------

function init() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showScreen(tab.dataset.screen));
  });

  el('prevDay').addEventListener('click', () => {
    state.date = shiftDate(state.date, -1);
    syncComparePeriod();
    renderAll();
  });
  el('nextDay').addEventListener('click', () => {
    state.date = shiftDate(state.date, 1);
    syncComparePeriod();
    renderAll();
  });
  el('datePicker').addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.date = e.target.value;
    syncComparePeriod();
    renderAll();
  });

  // Swipe the day card to move between days, and the chart to move between
  // periods. Scoped to those cards rather than the whole screen so they cannot
  // fight with the swipe-to-delete on the expense rows.
  onHorizontalSwipe(document.querySelector('#screen-today .hero-card'), {
    onSwipe: (dir) => {
      state.date = shiftDate(state.date, dir);
      syncComparePeriod();
      renderAll();
    },
  });

  initCompareControls();

  el('openAdd').addEventListener('click', () => openSheet(null));
  el('sheetCancel').addEventListener('click', closeSheet);
  el('sheetSave').addEventListener('click', saveSheet);
  el('sheetDelete').addEventListener('click', deleteFromSheet);
  el('sheetBackdrop').addEventListener('click', (e) => {
    if (e.target === el('sheetBackdrop')) closeSheet();
  });
  el('keypad').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (btn) pressKey(btn.dataset.key);
  });

  el('setCurrency').addEventListener('change', saveCurrency);
  el('setBudget').addEventListener('change', saveBudget);
  el('setBudget').addEventListener('blur', saveBudget);
  el('exportBtn').addEventListener('click', downloadBackup);
  el('exportCsvBtn').addEventListener('click', downloadCsv);
  el('importBtn').addEventListener('click', () => el('importFile').click());
  el('importFile').addEventListener('change', (e) => handleImport(e.target.files[0]));
  el('clearBtn').addEventListener('click', clearEverything);

  el('catCancel').addEventListener('click', closeCategoryEditor);
  el('catSave').addEventListener('click', saveCategoryEditor);
  el('catBackdrop').addEventListener('click', (e) => {
    if (e.target === el('catBackdrop')) closeCategoryEditor();
  });
  el('setSyncUrl').addEventListener('change', saveSyncSettings);
  el('setSyncToken').addEventListener('change', saveSyncSettings);
  el('setSyncAddToken').addEventListener('change', saveSyncSettings);
  el('syncTestBtn').addEventListener('click', checkSyncConnection);
  el('syncNowBtn').addEventListener('click', () => syncNow());

  el('copyQuickUrl').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el('quickUrl').textContent);
      toast('Address copied');
    } catch (err) {
      toast('Copy failed — select the address by hand');
    }
  });

  el('dayList').addEventListener('scroll', closeSwipedRow, { passive: true });
  document.querySelector('#screen-today .scroll-area').addEventListener('scroll', closeSwipedRow, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (!el('catBackdrop').classList.contains('hidden')) {
      if (e.key === 'Escape') closeCategoryEditor();
      return;
    }
    if (el('sheetBackdrop').classList.contains('hidden')) return;
    // While a text field has focus it owns its keystrokes - otherwise typing a
    // note would also drive the keypad and Backspace would eat the amount.
    if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') {
      if (e.key === 'Escape') closeSheet();
      return;
    }
    if (e.key === 'Escape') closeSheet();
    else if (e.key === 'Enter') saveSheet();
    else if (e.key === 'Backspace') pressKey('back');
    else if (/^[0-9.]$/.test(e.key)) pressKey(e.key);
  });

  renderToday();
  applyQuickAdd();

  // Pull anything logged elsewhere (another device, or a shortcut writing
  // straight to the sheet) whenever the app is opened or returned to.
  syncNow({ silent: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNow({ silent: true });
  });
}

document.addEventListener('DOMContentLoaded', init);
