import { add, del, all, STORES } from './db.js';

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

/* ==================== Solde reporté ==================== */

/**
 * Calcule le solde réel d'un compte juste AVANT la date du salaire.
 *
 * Important :
 * - si un "Solde reporté" existe déjà dans l'historique, on repart de ce report
 * - sinon on cumule tous les mouvements antérieurs
 *
 * Cela évite de doubler l'historique lorsqu'on utilise des reports mensuels.
 */
async function getAccountBalanceBeforeDate(account, salaryDate) {
  const movements = await all(STORES.MOVEMENTS);

  const accountMovements = movements
    .filter(m => m.account === account && m.date < salaryDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  // dernier report existant avant la date
  const lastReport = [...accountMovements]
    .reverse()
    .find(m => m.origin === 'SYSTEM' && m.category === 'report');

  if (!lastReport) {
    return accountMovements.reduce((sum, m) => sum + Number(m.amount || 0), 0);
  }

  return accountMovements.reduce((sum, m) => {
    if (m.id === lastReport.id) return Number(lastReport.amount || 0);
    if (m.date <= lastReport.date) return sum;
    return sum + Number(m.amount || 0);
  }, 0);
}

/**
 * Supprime les lignes générées automatiquement pour un mois financier :
 * - les reports de solde
 * - les récurrents
 *
 * Cela permet de recalculer proprement le mois si on ressaisit un salaire.
 */
async function deleteGeneratedForFinancialMonth(financialMonth) {
  const movements = await all(STORES.MOVEMENTS);

  const generated = movements.filter(
    m =>
      m.financialMonth === financialMonth &&
      (m.origin === 'SYSTEM' || m.origin === 'RECURRENTE')
  );

  for (const m of generated) {
    await del(STORES.MOVEMENTS, m.id);
  }
}

/**
 * Crée une ligne "Solde reporté" pour chaque compte dans le nouveau mois financier.
 *
 * Règle métier :
 * - le report est daté à la date du salaire
 * - il appartient au NOUVEAU mois financier
 */
async function createBalanceCarryOver(newFinancialMonth, salaryDate) {
  const accounts = ['perso', 'internet', 'commun', 'cash'];

  for (const acc of accounts) {
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
 * Recrée complètement les mouvements récurrents d'un mois financier.
 *
 * Important :
 * - pas de flag bloquant
 * - on repart toujours des templates actifs
 * - le recalcul est piloté par la saisie du salaire
 */
export async function applyRecurring(financialMonth) {
  const templates = await all(STORES.RECURRING);

  for (const t of templates) {
    if (t.active === false) continue;

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
 * Recalcule complètement un mois financier :
 * 1. supprime reports/récurrents générés
 * 2. recrée les reports
 * 3. recrée les récurrents
 */
async function rebuildFinancialMonth(financialMonth, salaryDate) {
  await deleteGeneratedForFinancialMonth(financialMonth);
  await createBalanceCarryOver(financialMonth, salaryDate);
  await applyRecurring(financialMonth);
}

/* ==================== Entrée principale ==================== */

/**
 * Ajout d’un mouvement.
 *
 * Règles métier :
 * - SALAIRE :
 *    ouvre le mois financier suivant
 *    puis recalcule complètement ce mois (solde reporté + récurrents)
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
    await rebuildFinancialMonth(movement.financialMonth, movement.date);
  }

  return movement;
}
