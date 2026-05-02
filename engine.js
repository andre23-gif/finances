// engine.js
import { add, all } from './db.js';

const uid = () =>
  (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function monthFromDate(dateStr) {
  // "YYYY-MM-DD" -> "YYYY-MM"
  return String(dateStr).slice(0, 7);
}

function nextMonth(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number); // m = 1..12
  const d = new Date(y, m, 1); // mois suivant
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clampDay(year, month1to12, day) {
  const last = new Date(year, month1to12, 0).getDate();
  return Math.max(1, Math.min(day, last));
}

function dateFromFinancialMonth(financialMonth, day) {
  const [y, m] = financialMonth.split('-').map(Number);
  const dd = clampDay(y, m, day);
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

async function hasFlag(financialMonth) {
  const flags = await all('flags');
  return flags.some(f => f.financialMonth === financialMonth);
}

async function setFlag(financialMonth, triggeredByMovementId) {
  // flags store a keyPath 'financialMonth'
  return add('flags', {
    financialMonth,
    recurrentsApplied: true,
    triggeredByMovementId,
    appliedAt: new Date().toISOString()
  });
}

async function applyRecurring(financialMonth, triggeredByMovementId) {
  if (await hasFlag(financialMonth)) return;

  const templates = await all('recurring');

  for (const t of templates) {
    // par défaut actif si non défini
    if (t.active === false) continue;

    const movement = {
      id: uid(),
      account: t.account,
      date: dateFromFinancialMonth(financialMonth, Number(t.day)),
      amount: Number(t.amount), // doit être négatif
      type: 'DEPENSE',
      status: 'APPLIQUEE',
      category: t.category || '',
      label: t.label || '',
      paymentMethod: t.paymentMethod || 'transfer',
      month: monthFromDate(dateFromFinancialMonth(financialMonth, Number(t.day))),
      financialMonth,
      origin: 'RECURRENTE',
      recurrenceId: t.id,
      createdAt: new Date().toISOString()
    };

    await add('movements', movement);
  }

  await setFlag(financialMonth, triggeredByMovementId);
}

/**
 * Ajoute un mouvement + applique la règle :
 * - SALAIRE (reçu fin de mois) -> déclenche les dépenses mensuelles du mois suivant
 */
export async function addMovementWithTriggers(m) {
  const month = monthFromDate(m.date);

  const financialMonth =
    m.type === 'SALAIRE'
      ? nextMonth(month)
      : month;

  const movement = {
    id: uid(),
    account: m.account,
    date: m.date,
    amount: Number(m.amount),
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

  await add('movements', movement);

  if (movement.type === 'SALAIRE') {
    await applyRecurring(movement.financialMonth, movement.id);
  }

  return movement;
}
