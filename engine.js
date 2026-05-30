import { add, put, all, STORES } from './db.js';

/* ==================== Utils ==================== */

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

function monthFromDate(dateStr) {
  return String(dateStr).slice(0, 7);
}

function nextMonth(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clampDay(year, month1to12, day) {
  const last = new Date(year, month1to12, 0).getDate();
  return Math.max(1, Math.min(day, last));
}

function dateFromFinancialMonth(financialMonth, day) {
  const [y, m] = financialMonth.split('-').map(Number);
  const dd = clampDay(y, m, Number(day));
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/* ==================== REPORT DE SOLDE ==================== */

async function createBalanceCarryOver(newFinancialMonth) {
  const movements = await all(STORES.MOVEMENTS);
  const accounts = ['perso', 'internet', 'commun', 'cash'];

  // mois financier précédent
  const [y, m] = newFinancialMonth.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  for (const acc of accounts) {
    const balance = movements
      .filter(m => m.account === acc && m.financialMonth === prevMonth)
      .reduce((s, m) => s + Number(m.amount || 0), 0);

    if (balance === 0) continue;

    await add(STORES.MOVEMENTS, {
      id: uid(),
      account: acc,
      date: `${newFinancialMonth}-01`,
      month: newFinancialMonth,
      financialMonth: newFinancialMonth,

      amount: balance,
      type: 'ENTREE',
      status: 'APPLIQUEE',

      category: 'report',
      label: 'Solde reporté',
      paymentMethod: 'transfer',

      origin: 'SYSTEM',
      createdAt: new Date().toISOString()
    });
  }
}

/* ==================== MOIS BUDGÉTAIRE ==================== */

async function getFinancialMonthForDate(date) {
  const movements = await all(STORES.MOVEMENTS);

  const salaries = movements
    .filter(m => m.type === 'SALAIRE')
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const s of salaries) {
    if (date >= s.date) return s.financialMonth;
  }

  return monthFromDate(date);
}

/* ==================== RÉCURRENCES ==================== */

async function isApplied(financialMonth) {
  const flags = await all(STORES.FLAGS);
  return flags.some(f => f.financialMonth === financialMonth && f.recurrentsApplied);
}

async function markApplied(financialMonth, triggeredByMovementId) {
  return put(STORES.FLAGS, {
    financialMonth,
    recurrentsApplied: true,
    triggeredByMovementId,
    appliedAt: new Date().toISOString()
  });
}

export async function applyRecurring(financialMonth, triggeredByMovementId) {
  if (await isApplied(financialMonth)) return;

  const templates = await all(STORES.RECURRING);

  for (const t of templates) {
    if (t.active === false) continue;

    const d = dateFromFinancialMonth(financialMonth, Number(t.day));

    await add(STORES.MOVEMENTS, {
      id: uid(),
      account: t.account,
      date: d,
      month: monthFromDate(d),
      financialMonth,

      amount: Number(t.amount),
      type: 'DEPENSE',
      status: 'APPLIQUEE',

      category: t.category || '',
      label: t.label || '',
      paymentMethod: t.paymentMethod || 'transfer',

      origin: 'RECURRENTE',
      recurrenceId: t.id,
      createdAt: new Date().toISOString()
    });
  }

  await markApplied(financialMonth, triggeredByMovementId);
}

/* ==================== ENTRÉE PRINCIPALE ==================== */

export async function addMovementWithTriggers(m) {
  const month = monthFromDate(m.date);
  let financialMonth;

  if (m.type === 'SALAIRE') {
    financialMonth = nextMonth(month);
  } else {
    financialMonth = await getFinancialMonthForDate(m.date);
  }

  const movement = {
    id: uid(),
    account: m.account,
    date: m.date,
    month,
    financialMonth,

    amount: Number(m.amount),
    type: m.type,
    status: m.status || 'SAISIE_MANUELLE',

    category: m.category || '',
    label: m.label || '',
    paymentMethod: m.paymentMethod || 'transfer',

    origin: 'MANUELLE',
    createdAt: new Date().toISOString()
  };

  await add(STORES.MOVEMENTS, movement);

  if (movement.type === 'SALAIRE') {
    await createBalanceCarryOver(movement.financialMonth);
    await applyRecurring(movement.financialMonth, movement.id);
  }

  return movement;
}
