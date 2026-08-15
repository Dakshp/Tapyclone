const state = {
  date: todayStr(),
  month: todayStr().slice(0, 7),
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

function shiftMonth(monthStr, months) {
  const [y, m] = monthStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return dt.toISOString().slice(0, 7);
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

// ---------- Stats screen ----------

function renderStats() {
  el('monthTitle').textContent = formatMonthTitle(state.month);
  const data = Store.getMonth(state.month);

  el('statsTotal').textContent = formatMoney(data.totalMinor, { compact: true });
  el('statsAverage').textContent = data.daysWithSpending
    ? `${formatMoney(Math.round(data.totalMinor / data.daysWithSpending), { compact: true })} on an average spending day · ${data.expenses.length} entries`
    : 'No expenses this month';

  renderTrend();
  renderCategories(data);
  renderRecentDays();
}

function renderTrend() {
  const series = Store.getDailyTotals(7, state.date);
  const svg = el('trendSvg');
  const W = 700, H = 220;
  const pad = { top: 14, bottom: 34, side: 14 };
  const chartH = H - pad.top - pad.bottom;
  const chartW = W - pad.side * 2;
  const max = Math.max(...series.map((d) => d.totalMinor), 1);
  const gap = 16;
  const barW = (chartW - gap * (series.length - 1)) / series.length;

  svg.innerHTML = series
    .map((d, i) => {
      const x = pad.side + i * (barW + gap);
      const h = d.totalMinor > 0 ? Math.max((d.totalMinor / max) * chartH, 4) : 0;
      const y = pad.top + (chartH - h);
      const [yy, mm, dd] = d.date.split('-').map(Number);
      const label = new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString(undefined, {
        weekday: 'narrow',
        timeZone: 'UTC',
      });
      const isSelected = d.date === state.date;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="6"
              fill="${isSelected ? 'var(--primary)' : 'var(--line)'}"></rect>
        <text x="${(x + barW / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="15"
              fill="var(--muted)">${label}</text>
      `;
    })
    .join('');
}

function renderCategories(data) {
  const box = el('categoryBreakdown');
  box.innerHTML = '';
  if (!data.byCategory.length) {
    box.innerHTML = '<p class="empty-msg">No spending to break down yet.</p>';
    return;
  }
  const max = data.byCategory[0].totalMinor || 1;
  data.byCategory.forEach((c) => {
    const share = Math.round((c.totalMinor / data.totalMinor) * 100);
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <span class="row-icon">${c.icon}</span>
      <span class="row-body">
        <span class="row-title">${escapeHtml(c.label)}</span>
        <span class="row-sub">${share}% · ${c.count} ${c.count === 1 ? 'entry' : 'entries'}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(c.totalMinor / max) * 100}%"></span></span>
      </span>
      <span class="row-amount">${formatMoney(c.totalMinor, { compact: true })}</span>
    `;
    box.appendChild(row);
  });
}

function renderRecentDays() {
  const days = Store.getRecentDays(10);
  const box = el('recentDays');
  box.innerHTML = '';
  if (!days.length) {
    box.innerHTML = '<p class="empty-msg">No history yet.</p>';
    return;
  }
  days.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <span class="row-body">
        <span class="row-title">${escapeHtml(formatDayTitle(d.date))}</span>
        <span class="row-sub">${d.count} ${d.count === 1 ? 'entry' : 'entries'}</span>
      </span>
      <span class="row-amount">${formatMoney(d.totalMinor, { compact: true })}</span>
    `;
    row.addEventListener('click', () => {
      state.date = d.date;
      state.month = d.date.slice(0, 7);
      showScreen('today');
      renderAll();
    });
    box.appendChild(row);
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
  state.month = state.date.slice(0, 7);
  renderAll();
  renderSettings();
  toast('All data erased');
}

// ---------- Navigation ----------

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  el(`screen-${name}`).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.screen === name));
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
}

function renderAll() {
  renderToday();
  if (!el('screen-stats').classList.contains('hidden')) renderStats();
}

// ---------- Init ----------

function init() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showScreen(tab.dataset.screen));
  });

  el('prevDay').addEventListener('click', () => {
    state.date = shiftDate(state.date, -1);
    state.month = state.date.slice(0, 7);
    renderAll();
  });
  el('nextDay').addEventListener('click', () => {
    state.date = shiftDate(state.date, 1);
    state.month = state.date.slice(0, 7);
    renderAll();
  });
  el('datePicker').addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.date = e.target.value;
    state.month = state.date.slice(0, 7);
    renderAll();
  });

  el('prevMonth').addEventListener('click', () => {
    state.month = shiftMonth(state.month, -1);
    renderStats();
  });
  el('nextMonth').addEventListener('click', () => {
    state.month = shiftMonth(state.month, 1);
    renderStats();
  });

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
