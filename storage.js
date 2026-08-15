// On-device storage for Tappy. Everything lives under one localStorage key so
// the app needs no backend and works fully offline.
const Store = (() => {
  const STORAGE_KEY = 'tappy.v1';

  // Money is stored as an integer count of minor units (paise / cents).
  // Repeated float addition loses precision (0.1 + 0.2 !== 0.3), which shows up
  // as month totals that drift by a paisa or two once there are enough entries.
  const MINOR_PER_MAJOR = 100;

  const CATEGORIES = [
    { id: 'food', label: 'Food & Drink', icon: '\u{1F354}' },
    { id: 'groceries', label: 'Groceries', icon: '\u{1F6D2}' },
    { id: 'transport', label: 'Transport', icon: '\u{1F695}' },
    { id: 'shopping', label: 'Shopping', icon: '\u{1F6CD}' },
    { id: 'bills', label: 'Bills', icon: '\u{1F4A1}' },
    { id: 'health', label: 'Health', icon: '\u{1F48A}' },
    { id: 'fun', label: 'Fun', icon: '\u{1F3AC}' },
    { id: 'home', label: 'Rent & Home', icon: '\u{1F3E0}' },
    { id: 'education', label: 'Education', icon: '\u{1F4DA}' },
    { id: 'other', label: 'Other', icon: '\u{2728}' },
  ];

  const DEFAULT_SETTINGS = {
    currency: 'INR',
    locale: 'en-IN',
    monthlyBudgetMinor: 3000000, // 30,000.00
  };

  function freshData() {
    return { expenses: [], nextId: 1, settings: { ...DEFAULT_SETTINGS } };
  }

  function toMinor(value) {
    const n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.round(n * MINOR_PER_MAJOR);
  }

  // Every read path funnels through here, so a bad or legacy record can never
  // reach the arithmetic below as a string (string "+" concatenates digits).
  function normalizeExpense(e) {
    const amountMinor = Number.isInteger(e.amountMinor)
      ? e.amountMinor
      : e.amountMinor != null
        ? Math.round(Number(e.amountMinor) || 0)
        : toMinor(e.amount);
    return {
      id: Number(e.id) || 0,
      date: typeof e.date === 'string' ? e.date : '',
      amountMinor: Math.max(0, amountMinor),
      category: CATEGORIES.some((c) => c.id === e.category) ? e.category : 'other',
      note: typeof e.note === 'string' ? e.note : '',
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : '',
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshData();
      const data = JSON.parse(raw);
      const list = Array.isArray(data.expenses) ? data.expenses : [];
      return {
        expenses: list.map(normalizeExpense).filter((e) => e.id && e.date),
        nextId: Number(data.nextId) || list.length + 1,
        settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) }),
      };
    } catch (err) {
      return freshData();
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ---------- Expenses ----------

  function addExpense({ date, amountMinor, category, note }) {
    const data = load();
    const record = normalizeExpense({
      id: data.nextId++,
      date,
      amountMinor,
      category,
      note,
      createdAt: new Date().toISOString(),
    });
    if (record.amountMinor <= 0) throw new Error('Enter an amount greater than zero.');
    data.expenses.push(record);
    save(data);
    return record;
  }

  function updateExpense(id, patch) {
    const data = load();
    const idx = data.expenses.findIndex((e) => e.id === Number(id));
    if (idx === -1) return null;
    const merged = normalizeExpense({ ...data.expenses[idx], ...patch, id: data.expenses[idx].id });
    if (merged.amountMinor <= 0) throw new Error('Enter an amount greater than zero.');
    data.expenses[idx] = merged;
    save(data);
    return merged;
  }

  function deleteExpense(id) {
    const data = load();
    data.expenses = data.expenses.filter((e) => e.id !== Number(id));
    save(data);
  }

  function getExpense(id) {
    return load().expenses.find((e) => e.id === Number(id)) || null;
  }

  function sumMinor(list) {
    return list.reduce((total, e) => total + (Number(e.amountMinor) || 0), 0);
  }

  function getDay(date) {
    const expenses = load()
      .expenses.filter((e) => e.date === date)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { date, expenses, totalMinor: sumMinor(expenses) };
  }

  // month is a 'YYYY-MM' prefix.
  function getMonth(month) {
    const expenses = load().expenses.filter((e) => e.date.slice(0, 7) === month);
    const byCategory = CATEGORIES.map((c) => {
      const items = expenses.filter((e) => e.category === c.id);
      return { ...c, totalMinor: sumMinor(items), count: items.length };
    })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.totalMinor - a.totalMinor);

    const days = new Set(expenses.map((e) => e.date));
    return {
      month,
      expenses,
      totalMinor: sumMinor(expenses),
      byCategory,
      daysWithSpending: days.size,
    };
  }

  function getDailyTotals(days, endDate) {
    const byDate = {};
    for (const e of load().expenses) {
      byDate[e.date] = (byDate[e.date] || 0) + (Number(e.amountMinor) || 0);
    }
    // Pure UTC calendar arithmetic so day-stepping never shifts across a
    // timezone boundary (see app.js todayStr for the matching read side).
    const [y, m, d] = endDate.split('-').map(Number);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - i);
      const dateStr = dt.toISOString().slice(0, 10);
      out.push({ date: dateStr, totalMinor: byDate[dateStr] || 0 });
    }
    return out;
  }

  function getRecentDays(limit) {
    const byDate = {};
    for (const e of load().expenses) {
      if (!byDate[e.date]) byDate[e.date] = { date: e.date, totalMinor: 0, count: 0 };
      byDate[e.date].totalMinor += Number(e.amountMinor) || 0;
      byDate[e.date].count += 1;
    }
    return Object.values(byDate)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);
  }

  // ---------- Comparison analytics ----------

  // A "period" is a plain string key: 'YYYY-MM' for months, 'YYYY' for years.
  function periodOf(dateStr, granularity) {
    return granularity === 'year' ? dateStr.slice(0, 4) : dateStr.slice(0, 7);
  }

  function shiftPeriod(period, granularity, delta) {
    if (granularity === 'year') return String(Number(period) + delta);
    const [y, m] = period.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  }

  // One pass over the log builds every total the comparison screen needs,
  // rather than re-filtering the list once per period and per category.
  function buildIndex(expenses, granularity) {
    const idx = {};
    for (const e of expenses) {
      const p = periodOf(e.date, granularity);
      if (!idx[p]) idx[p] = { total: 0, count: 0, byCat: {} };
      idx[p].total += e.amountMinor;
      idx[p].count += 1;
      idx[p].byCat[e.category] = (idx[p].byCat[e.category] || 0) + e.amountMinor;
    }
    return idx;
  }

  function listPeriods(granularity) {
    const idx = buildIndex(load().expenses, granularity);
    return Object.keys(idx).sort();
  }

  /**
   * Everything the compare dashboard renders, for one selected period.
   *
   * categoryId scopes the headline and the period series (the "focus"), but the
   * category rows always cover every category so the focused one keeps its peer
   * context - the highlighted row's value is exactly the headline value, so the
   * two never disagree.
   */
  function getComparison({ granularity = 'month', period, endPeriod, categoryId = null, span = 12 }) {
    const expenses = load().expenses;
    const idx = buildIndex(expenses, granularity);

    const valueAt = (p) => {
      const bucket = idx[p];
      if (!bucket) return 0;
      return categoryId ? bucket.byCat[categoryId] || 0 : bucket.total;
    };

    // The window is anchored independently of the selection, so picking a bar
    // highlights it in place instead of sliding it to the right-hand edge.
    const windowEnd = endPeriod || period;
    const periods = [];
    for (let i = span - 1; i >= 0; i--) periods.push(shiftPeriod(windowEnd, granularity, -i));
    const series = periods.map((p) => ({ period: p, totalMinor: valueAt(p) }));

    const previous = shiftPeriod(period, granularity, -1);
    const currentTotal = valueAt(period);
    const previousTotal = valueAt(previous);

    const curBucket = idx[period] || { byCat: {}, count: 0 };
    const prevBucket = idx[previous] || { byCat: {}, count: 0 };

    const categories = CATEGORIES.map((c) => {
      const cur = curBucket.byCat[c.id] || 0;
      const prev = prevBucket.byCat[c.id] || 0;
      return { ...c, currentMinor: cur, previousMinor: prev, deltaMinor: cur - prev };
    })
      .filter((c) => c.currentMinor > 0 || c.previousMinor > 0)
      .sort((a, b) => b.currentMinor - a.currentMinor || b.previousMinor - a.previousMinor);

    return {
      granularity,
      period,
      previousPeriod: previous,
      categoryId,
      series,
      currentTotal,
      previousTotal,
      deltaMinor: currentTotal - previousTotal,
      entryCount: categoryId
        ? expenses.filter((e) => e.category === categoryId && periodOf(e.date, granularity) === period).length
        : curBucket.count,
      categories,
      hasPrevious: Boolean(idx[previous]),
    };
  }

  // ---------- Settings ----------

  function normalizeSettings(s) {
    const budget = Math.round(Number(s.monthlyBudgetMinor) || 0);
    return {
      currency: typeof s.currency === 'string' && s.currency ? s.currency : DEFAULT_SETTINGS.currency,
      locale: typeof s.locale === 'string' && s.locale ? s.locale : DEFAULT_SETTINGS.locale,
      monthlyBudgetMinor: Math.max(0, budget),
    };
  }

  function getSettings() {
    return load().settings;
  }

  function setSettings(patch) {
    const data = load();
    data.settings = normalizeSettings({ ...data.settings, ...patch });
    save(data);
    return data.settings;
  }

  // ---------- Backup ----------

  function exportData() {
    const data = load();
    return {
      app: 'tappy',
      version: 1,
      exportedAt: new Date().toISOString(),
      expenses: data.expenses,
      nextId: data.nextId,
      settings: data.settings,
    };
  }

  function importData(parsed) {
    if (!parsed || parsed.app !== 'tappy' || !Array.isArray(parsed.expenses)) {
      throw new Error('Not a valid Tappy backup file.');
    }
    const data = load();
    data.expenses = parsed.expenses.map(normalizeExpense).filter((e) => e.id && e.date);
    data.nextId =
      Number(parsed.nextId) || Math.max(0, ...data.expenses.map((e) => e.id)) + 1;
    if (parsed.settings) data.settings = normalizeSettings({ ...data.settings, ...parsed.settings });
    save(data);
    return { expenses: data.expenses.length };
  }

  function clearAll() {
    save(freshData());
  }

  return {
    CATEGORIES,
    MINOR_PER_MAJOR,
    toMinor,
    addExpense,
    updateExpense,
    deleteExpense,
    getExpense,
    getDay,
    getMonth,
    getDailyTotals,
    getRecentDays,
    periodOf,
    shiftPeriod,
    listPeriods,
    getComparison,
    getSettings,
    setSettings,
    exportData,
    importData,
    clearAll,
  };
})();
