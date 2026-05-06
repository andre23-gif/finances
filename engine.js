import { add, put, all, STORES } from './db.js';

/* ==================== Utils ==================== */

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

/** "YYYY-MM" -> mois suivant */
function nextMonth(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clampDay(year, month1to12, day) {
  const last = new Date(year, month1to12, 0).getDate();
  return Math.max(1, Math.min(day, last));
}

/** "YYYY-MM" + day -> "YYYY-MM-DD" */
function dateFromFinancialMonth(financialMonth, day) {
  const [y, m] = financialMonth.split('-').map(Number);
  const dd = clampDay(y, m, Number(day));
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/* ==================== Mois budgétaire ==================== */

/**
 * Détermine le mois budgétaire à partir du dernier salaire AVANT une date donnée
 * Règle : salaire = début du mois budgétaire jusqu’au salaire suivant
 */
async function getFinancialMonthForDate(date) {
  const movements = await all(STORES.MOVEMENTS);

  const salaries = movements
    .filter(m => m.type === 'SALAIRE')
    .sort((a, b) => b.date.localeCompare(a.date)); // plus récent d’abord

  for (const s of salaries) {
    if (date >= s.date) {
      return s.financialMonth;
    }
  }

  // Cas extrême : aucun salaire encore
  return monthFromDate(date);
}

/* ==================== Récurrences ==================== */

async function isApplied(financialMonth) {
  const flags = await all(STORES.FLAGS);
  return flags.some(
    f => f.financialMonth === financialMonth && f.recurrentsApplied === true
  );
}

async function markApplied(financialMonth, triggeredByMovementId) {
  return put(STORES.FLAGS, {
    financialMonth,
    recurrentsApplied: true,
    triggeredByMovementId,
    appliedAt: new Date().toISOString()
  });
}

/**
 * Applique les templates récurrents (UNE FOIS par mois budgétaire)
 * amount dans template = négatif
 */
export async function applyRecurring(financialMonth, triggeredByMovementId) {
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

/* ==================== Entrée principale ==================== */

/**
 * Ajout d’un mouvement + déclencheurs
 * ✅ Salaire = ouvre un NOUVEAU mois budgétaire
 * ✅ Dépense / entrée = rattachée au dernier salaire AVANT sa date
 */
export async function addMovementWithTriggers(m) {
  const month = monthFromDate(m.date);
  let financialMonth;

  if (m.type === 'SALAIRE') {
    // Salaire = ouverture du mois budgétaire suivant
    financialMonth = nextMonth(month);
  } else {
    // Dépense / entrée = mois budgétaire du dernier salaire
    financialMonth = await getFinancialMonthForDate(m.date);
  }

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

  // Le salaire déclenche les récurrences du mois budgétaire
  if (movement.type === 'SALAIRE') {
    await applyRecurring(movement.financialMonth, movement.id);
  }

  return movement;
}
