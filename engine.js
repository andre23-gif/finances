// engine.js
import { add, put, all, STORES } from './db.js';

/** ID unique */
function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

/** "YYYY-MM-DD" -> "YYYY-MM" */
function monthFromDate(dateStr) {
  return String(dateStr).slice(0, 7);
}

/** "YYYY-MM" -> mois suivant "YYYY-MM" */
function nextMonth(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number); // m = 1..12
  const d = new Date(y, m, 1); // mois suivant
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clampDay(year, month1to12, day) {
  const last = new Date(year, month1to12, 0).getDate();
  return Math.max(1, Math.min(day, last));
}

/** "YYYY-MM" + day -> "YYYY-MM-DD" (jour clampé) */
function dateFromFinancialMonth(financialMonth, day) {
  const [y, m] = financialMonth.split('-').map(Number);
  const dd = clampDay(y, m, Number(day));
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

async function isApplied(financialMonth) {
  const flags = await all(STORES.FLAGS);
  return flags.some(f => f.financialMonth === financialMonth && f.recurrentsApplied);
}

async function markApplied(financialMonth, triggeredByMovementId) {
  // keyPath = financialMonth => put = upsert
  return put(STORES.FLAGS, {
    financialMonth,
    recurrentsApplied: true,
    triggeredByMovementId,
    appliedAt: new Date().toISOString()
  });
}

/**
 * Applique les templates récurrents (une seule fois par mois budgétaire).
 * NOTE: amount dans template est attendu négatif (dépense).
 */
async function applyRecurring(financialMonth, triggeredByMovementId) {
  if (await isApplied(financialMonth)) return;

  const templates = await all(STORES.RECURRING);

  for (const t of templates) {
    if (t.active === false) continue;

    const d = dateFromFinancialMonth(financialMonth, Number(t.day));
    const movement = {
      id: uid(),
      account: t.account,
      date: d,
      month: monthFromDate(d),
      financialMonth,

      amount: Number(t.amount), // négatif
      type: 'DEPENSE',
      status: 'APPLIQUEE',

      category: t.category || '',
      label: t.label || '',
      paymentMethod: t.paymentMethod || 'transfer',

      origin: 'RECURRENTE',
      recurrenceId: t.id,
      createdAt: new Date().toISOString()
    };

    await add(STORES.MOVEMENTS, movement);
  }

  await markApplied(financialMonth, triggeredByMovementId);
}

/**
 * Ajout d’un mouvement + déclencheurs
 * Règle : SALAIRE reçu fin de mois => dépenses mensuelles du mois suivant
 */
export async function addMovementWithTriggers(m) {
  const month = monthFromDate(m.date);
  const financialMonth = (m.type === 'SALAIRE') ? nextMonth(month) : month;

  const movement = {
    id: uid(),
    account: m.account,
    date: m.date,
    month,
    financialMonth,

    amount: Number(m.amount),
    type: m.type, // DEPENSE | ENTREE | SALAIRE
    status: m.status || 'SAISIE_MANUELLE',

    category: m.category || '',
    label: m.label || '',
    paymentMethod: m.paymentMethod || 'transfer',

    origin: 'MANUELLE',
    createdAt: new Date().toISOString()
  };

  await add(STORES.MOVEMENTS, movement);

  if (movement.type === 'SALAIRE') {
    await applyRecurring(movement.financialMonth, movement.id);
  }

  return movement;
}
