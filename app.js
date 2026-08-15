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
  return Store.CATEGORIES.find((c) => c.id === id) || Store.CATEGORIES[Store.CATEGORIES.length - 1];
}

function toast(message) {
  const t = el('toast');
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add('hidden'), 1900);
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
  day.expenses.forEach((e) => {
    const meta = categoryMeta(e.category);
    const row = document.createElement('button');
    row.className = 'expense-row';
    row.innerHTML = `
      <span class="row-icon">${meta.icon}</span>
      <span class="row-body">
        <span class="row-title">${escapeHtml(e.note || meta.label)}</span>
        <span class="row-sub">${escapeHtml([e.note ? meta.label : '', formatTime(e.createdAt)].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="row-amount">${formatMoney(e.amountMinor)}</span>
    `;
    row.addEventListener('click', () => openSheet(e.id));
    list.appendChild(row);
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
  granularity: 'month',
  period: todayStr().slice(0, 7), // the highlighted bar
  anchor: todayStr().slice(0, 7), // the period the visible window ends at
  categoryId: null,
  showTable: false,
};

// How many periods of context sit behind the selected one.
const SPAN = { month: 12, year: 6 };

function periodLabel(period, granularity, style = 'long') {
  if (granularity === 'year') return period;
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  if (style === 'initial') return d.toLocaleDateString(undefined, { month: 'narrow', timeZone: 'UTC' });
  if (style === 'short') return d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
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
  compare.period = compare.granularity === 'year' ? state.date.slice(0, 4) : state.date.slice(0, 7);
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
  const data = Store.getComparison({
    granularity: compare.granularity,
    period: compare.period,
    endPeriod: compare.anchor,
    categoryId: compare.categoryId,
    span: SPAN[compare.granularity],
  });

  el('periodTitle').textContent = periodLabel(data.period, data.granularity);
  el('seriesHead').textContent = data.granularity === 'year' ? 'Year by year' : 'Month by month';

  const focus = data.categoryId ? categoryMeta(data.categoryId) : null;
  el('cmpLabel').textContent = focus ? `${focus.icon} ${focus.label}` : 'Total spent';
  el('cmpTotal').textContent = formatMoney(data.currentTotal, { compact: true });

  const d = deltaInfo(data.deltaMinor, data.hasPrevious);
  const pill = el('cmpDelta');
  pill.textContent = d.text;
  pill.className = `delta-pill tone-${d.tone}`;

  const entries = `${data.entryCount} ${data.entryCount === 1 ? 'entry' : 'entries'}`;
  el('cmpSub').textContent = data.hasPrevious
    ? `vs ${periodLabel(data.previousPeriod, data.granularity)} · ${entries}`
    : entries;

  renderPeriodChart(data);
  renderCategoryCompare(data);
  renderTableView(data);
}

// Top corners rounded, base square - the data-end is rounded, the baseline is not.
function barPath(x, y, w, h, r) {
  const rr = Math.max(Math.min(r, w / 2, h), 0);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function renderPeriodChart(data) {
  const svg = el('periodSvg');
  const W = 700;
  const H = 250;
  // Top band leaves room for the selected bar's direct label; the bottom band
  // holds the axis labels, so nothing is clipped by the container.
  const pad = { top: 42, bottom: 38, side: 10 };
  const plotH = H - pad.top - pad.bottom;
  const plotW = W - pad.side * 2;
  const n = data.series.length;
  const max = Math.max(...data.series.map((s) => s.totalMinor), 1);
  const gap = n > 8 ? 8 : 16;
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
      const label =
        data.granularity === 'year'
          ? s.period
          : periodLabel(s.period, 'month', n > 8 ? 'initial' : 'short');
      // The label lives in the reserved top band rather than riding the bar top,
      // so it can never collide with a taller neighbour; x is clamped so it
      // stays inside the plot at either end.
      const labelX = Math.min(Math.max(cx, 52), W - 52);
      const value = selected
        ? `<text x="${labelX.toFixed(1)}" y="24" text-anchor="middle" font-size="18"
                 font-weight="700" fill="var(--viz-ink)">${formatMoney(s.totalMinor, { compact: true })}</text>`
        : '';
      return `
        <path d="${barPath(x, y, barW, h, 4)}" fill="${selected ? 'var(--viz-current)' : 'var(--viz-context)'}"></path>
        ${value}
        <text x="${cx.toFixed(1)}" y="${H - 14}" text-anchor="middle" font-size="17"
              fill="${selected ? 'var(--viz-ink)' : 'var(--viz-muted)'}"
              font-weight="${selected ? '650' : '400'}">${label}</text>
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
    hit.addEventListener('click', select);
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
  value.textContent = formatMoney(s.totalMinor);
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
  const periodCaption = document.createElement('p');
  periodCaption.className = 'table-caption';
  periodCaption.textContent = data.granularity === 'year' ? 'Year by year' : 'Month by month';
  box.append(
    periodCaption,
    buildTable(
      [data.granularity === 'year' ? 'Year' : 'Month', 'Spent'],
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

function initCompareControls() {
  const select = el('focusCategory');
  Store.CATEGORIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon} ${c.label}`;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    compare.categoryId = select.value || null;
    renderCompare();
  });

  el('granularityToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-gran]');
    if (!btn || btn.dataset.gran === compare.granularity) return;
    // Carry the selection across the switch instead of resetting to today.
    compare.period =
      btn.dataset.gran === 'year'
        ? compare.period.slice(0, 4)
        : compare.period === todayStr().slice(0, 4)
          ? todayStr().slice(0, 7)
          : `${compare.period}-12`;
    compare.granularity = btn.dataset.gran;
    compare.anchor = compare.period;
    el('granularityToggle')
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('active', b === btn));
    renderCompare();
  });

  el('prevPeriod').addEventListener('click', () => movePeriod(-1));
  el('nextPeriod').addEventListener('click', () => movePeriod(1));

  el('tableToggle').addEventListener('click', () => {
    compare.showTable = !compare.showTable;
    renderCompare();
  });
}

// ---------- Add / edit sheet ----------

function renderChips() {
  const row = el('categoryChips');
  row.innerHTML = '';
  Store.CATEGORIES.forEach((c) => {
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
  toast('Expense deleted');
}

// ---------- Settings ----------

function renderSettings() {
  const s = Store.getSettings();
  el('setCurrency').value = `${s.currency}|${s.locale}`;
  el('setBudget').value = s.monthlyBudgetMinor
    ? String(s.monthlyBudgetMinor / Store.MINOR_PER_MAJOR)
    : '';
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

function downloadBackup() {
  const json = JSON.stringify(Store.exportData(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tappy-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const count = Array.isArray(parsed.expenses) ? parsed.expenses.length : 0;
      if (!window.confirm(`Restore ${count} expenses?\n\nThis REPLACES everything currently in Tappy.`)) return;
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
  el('importBtn').addEventListener('click', () => el('importFile').click());
  el('importFile').addEventListener('change', (e) => handleImport(e.target.files[0]));
  el('clearBtn').addEventListener('click', clearEverything);

  document.addEventListener('keydown', (e) => {
    if (el('sheetBackdrop').classList.contains('hidden')) return;
    if (e.key === 'Escape') closeSheet();
    else if (e.key === 'Enter') saveSheet();
    else if (e.key === 'Backspace') pressKey('back');
    else if (/^[0-9.]$/.test(e.key)) pressKey(e.key);
  });

  renderToday();
}

document.addEventListener('DOMContentLoaded', init);
