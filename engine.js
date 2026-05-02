// engine.js
import { addItem, getAll  // salaire fin de mois => dépenses du mois suivantimport { addItem, getAll, getByIndex, putItem, STORES } from './db.js';
  const financialMonth = (m.type === 'SALAIRE')
    ? nextMonth(month)
    : month;

  const movement = {
    id: uid(),
    account: m.account,
    date: m.date,
    amount: m.amount,
    type: m.type, // DEPENSE | ENTREE | SALAIRE
    status: m.status || 'SAISIE_MANUELLE',
    category: m.category || '',
    label: m.label || '',
    paymentMethod: m.paymentMethod || 'transfer',
    month,
    financialMonth,
    origin: 'MANUELLE',
    createdAt: new Date().toISOString()
  };

  await addItem(STORE_MOVEMENTS, movement);

  if (movement.type === 'SALAIRE') {
    await applyRecurrentsIfNeeded(movement.financialMonth, movement.id);
  }

  return movement;
}

const { STORE_MOVEMENTS, STORE_RECURRING, STORE_FLAGS } = STORES;

const uid = () => (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function monthFromDate(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function nextMonth(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m, 1); // month is 1..12 => JS auto next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clampDay(y, m1to12, day) {
  const last = new Date(y, m1to12, 0).getDate();
  return Math.max(1, Math.min(day, last));
}

function dateFromFinancialMonth(financialMonth, day) {
  const [y, m] = financialMonth.split('-').map(Number);
  const d = clampDay(y, m, day);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

async function isApplied(financialMonth) {
  const flags = await getAll(STORE_FLAGS);
  return flags.some(f => f.financialMonth === financialMonth && f.recurrentsApplied);
}

async function markApplied(financialMonth, triggeredByMovementId) {
  await putItem(STORE_FLAGS, {
    financialMonth,
    recurrentsApplied: true,
    triggeredByMovementId,
    appliedAt: new Date().toISOString()
  });
}

async function applyRecurrentsIfNeeded(financialMonth, triggeredByMovementId) {
  if (await isApplied(financialMonth)) return;

  const templates = (await getAll(STORE_RECURRING)).filter(t => t.active !== false);
  if (templates.length === 0) {
    await markApplied(financialMonth, triggeredByMovementId);
    return;
  }

  for (const t of templates) {
    const movement = {
      id: uid(),
      account: t.account,
      date: dateFromFinancialMonth(financialMonth, t.day),
      amount: t.amount, // négatif
      type: 'DEPENSE',
      status: 'APPLIQUEE',
      category: t.category || '',
      label: t.label || '',
      paymentMethod: t.paymentMethod || 'transfer',
      month: monthFromDate(dateFromFinancialMonth(financialMonth, t.day)),
      financialMonth,
      origin: 'RECURRENTE',
      recurrenceId: t.id,
      createdAt: new Date().toISOString()
    };
    await addItem(STORE_MOVEMENTS, movement);
  }

  await markApplied(financialMonth, triggeredByMovementId);
}

export async function addMovementWithTriggers(m) {
  const month = monthFromDate(m.date);

