import { add, all, STORES } from './db.js';

/* ==================== Utils ==================== */

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

/* ==================== Mois financier ==================== */

/**
 * Retourne le mois financier du dernier salaire antérieur (ou égal) à une date.
 * Si aucun salaire n'existe encore, fallback sur le mois civil.
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

  return monthFromDate(date);
}

/* ==================== Reports de solde ==================== */

async function getAccountBalanceBeforeDate(account, salaryDate) {
  const movements = await all(STORES.MOVEMENTS);

  const accountMovements = movements
    .filter(m => m.account === account && m.date < salaryDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const lastReport = [...accountMovements]
    .reverse()
    .find(m => m.origin === 'SYSTEM' && m.category === 'report');

  if (!lastReport) {
    // Pas de report antérieur : on cumule tout
    return accountMovements.reduce((sum, m) => sum + Number(m.amount || 0), 0);
  }

  // On repart du montant du report, et on n'additionne
  // QUE les mouvements STRICTEMENT postérieurs au report
  const afterReport = accountMovements.filter(m => m.date > lastReport.date);
  return afterReport.reduce(
    (sum, m) => sum + Number(m.amount || 0),
    Number(lastReport.amount || 0)   // ← point de départ = solde du report
  );
}

/**
 * Vérifie si un report de solde existe déjà pour un compte et un mois financier.
 */
async function hasCarryOverForMonth(account, financialMonth) {
  const movements = await all(STORES.MOVEMENTS);
  return movements.some(
    m =>
      m.account === account &&
      m.financialMonth === financialMonth &&
      m.origin === 'SYSTEM' &&
      m.category === 'report'
  );
}

/**
 * Crée une ligne "Solde reporté" pour chaque compte dans le nouveau mois financier,
 * uniquement si elle n'existe pas déjà.
 *
 * Règle métier :
 * - le report est daté à la date du salaire
 * - il appartient au NOUVEAU mois financier
 */
async function createBalanceCarryOver(newFinancialMonth, salaryDate) {
  const accounts = ['perso', 'internet', 'commun', 'cash'];

  for (const acc of accounts) {
    const alreadyExists = await hasCarryOverForMonth(acc, newFinancialMonth);
    if (alreadyExists) continue;

    const balance = await getAccountBalanceBeforeDate(acc, salaryDate);
    if (balance === 0) continue;

    await add(STORES.MOVEMENTS, {
      id: uid(),
      account: acc,
      date: salaryDate,
      month: monthFromDate(salaryDate),
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

/* ==================== Récurrents ==================== */

/**
 * Vérifie si un mouvement récurrent existe déjà pour ce template dans ce mois financier.
 */
async function hasRecurringMovement(financialMonth, recurrenceId) {
  const movements = await all(STORES.MOVEMENTS);
  return movements.some(
    m =>
      m.financialMonth === financialMonth &&
      m.origin === 'RECURRENTE' &&
      m.recurrenceId === recurrenceId
  );
}

/**
 * Ajoute les mouvements récurrents d'un mois financier
 * uniquement s'ils n'existent pas déjà.
 *
 * Important :
 * - les templates de STORES.RECURRING restent intouchables
 * - pas de suppression
 * - pas de flag bloquant
 */
export async function applyRecurring(financialMonth, _triggeredByMovementId = null) {
  const templates = await all(STORES.RECURRING);

  for (const t of templates) {
    if (t.active === false) continue;

    const alreadyExists = await hasRecurringMovement(financialMonth, t.id);
    if (alreadyExists) continue;

    const day = Number(t.day) || 1;
    const d = dateFromFinancialMonth(financialMonth, day);

    await add(STORES.MOVEMENTS, {
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
    });
  }
}

/**
 * Ouvre / complète un mois financier :
 * - ajoute les reports manquants
 * - ajoute les récurrents manquants
 *
 * Aucun effacement.
 */
async function ensureFinancialMonth(financialMonth, salaryDate, salaryMovementId) {
  await createBalanceCarryOver(financialMonth, salaryDate);
  await applyRecurring(financialMonth, salaryMovementId);
}

/* ==================== Entrée principale ==================== */

/**
 * Ajout d’un mouvement.
 *
 * Règles métier :
 * - SALAIRE :
 *    ouvre le mois financier suivant
 *    puis complète ce mois (reports + récurrents)
 *
 * - toute autre écriture :
 *    est rattachée au dernier salaire antérieur
 */
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
    await ensureFinancialMonth(movement.financialMonth, movement.date, movement.id);
  }

  return movement;
}
