import { add, addMany, all, STORES } from './db.js';

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
 * Retourne le mois financier du dernier salaire STRICTEMENT antérieur à une date.
 *
 * FIX : on utilise > (strict) au lieu de >= pour que les dépenses saisies
 * le même jour qu'un salaire soient rattachées à l'ANCIEN mois financier,
 * pas au nouveau. Le salaire ouvre le nouveau mois ; tout ce qui est saisi
 * le même jour mais n'est pas un salaire appartient encore à l'ancien.
 *
 * Si aucun salaire n'existe encore, fallback sur le mois civil.
 */
async function getFinancialMonthForDate(date) {
  const movements = await all(STORES.MOVEMENTS);

  const salaries = movements
    .filter(m => m.type === 'SALAIRE')
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const s of salaries) {
    if (date > s.date) return s.financialMonth;
    if (date === s.date) continue; // même jour → ancien mois
  }

  return monthFromDate(date);
}

/* ==================== Reports de solde ==================== */

/**
 * Calcule le solde réel d'un compte juste AVANT la date du salaire.
 *
 * FIX : repart du dernier report existant comme point de départ,
 * puis additionne uniquement les mouvements STRICTEMENT postérieurs.
 * Retourne null si le compte n'a aucun historique (pas de report à créer).
 */
async function getAccountBalanceBeforeDate(account, previousFinancialMonth) {
  // FIX COMPLET : le report = solde du mois financier précédent
  // = somme de TOUS ses mouvements (report entrant + salaire + récurrents + manuels)
  // C'est exactement ce que la page État affiche pour ce mois.
  // Les approches précédentes (cumul depuis le dernier report, exclusion des salaires/récurrents)
  // produisaient toutes des doubles comptages ou des omissions.
  const movements = await all(STORES.MOVEMENTS);

  const fmMovements = movements.filter(
    m => m.account === account && m.financialMonth === previousFinancialMonth
  );

  if (!fmMovements.length) return null;

  return fmMovements.reduce((sum, m) => sum + Number(m.amount || 0), 0);
}

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
 * Crée les lignes "Solde reporté" pour tous les comptes du nouveau mois financier.
 *
 * ATOMIQUE : tous les reports sont préparés en mémoire, puis insérés en une
 * seule transaction via addMany. Si un seul échoue, aucun n'est écrit.
 *
 * FIX balance=0 : on crée le report même à 0 si le compte a un historique,
 * pour éviter que le mois suivant repart d'un cumul complet.
 */
async function createBalanceCarryOver(newFinancialMonth, salaryDate) {
  // Le mois financier précédent = celui qui précède newFinancialMonth
  const [y, m] = newFinancialMonth.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1); // m-2 car mois JS est 0-indexé
  const previousFinancialMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const accounts = ['perso', 'internet', 'commun', 'cash'];
  const toInsert = [];

  for (const acc of accounts) {
    const alreadyExists = await hasCarryOverForMonth(acc, newFinancialMonth);
    if (alreadyExists) continue;

    const balance = await getAccountBalanceBeforeDate(acc, previousFinancialMonth);
    if (balance === null) continue; // compte vierge, pas de report

    toInsert.push({
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

  if (toInsert.length) {
    // Une seule transaction pour tous les reports
    await addMany(STORES.MOVEMENTS, toInsert);
  }
}

/* ==================== Récurrents ==================== */

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
 * Ajoute les mouvements récurrents du mois financier.
 *
 * ATOMIQUE : tous les récurrents à créer sont préparés en mémoire,
 * puis insérés en une seule transaction via addMany.
 * Si un seul échoue, aucun n'est écrit — pas d'état partiel.
 */
export async function applyRecurring(financialMonth, _triggeredByMovementId = null) {
  const templates = await all(STORES.RECURRING);
  const toInsert = [];

  for (const t of templates) {
    if (t.active === false) continue;

    const alreadyExists = await hasRecurringMovement(financialMonth, t.id);
    if (alreadyExists) continue;

    const day = Number(t.day) || 1;
    const d = dateFromFinancialMonth(financialMonth, day);

    toInsert.push({
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

  if (toInsert.length) {
    // Une seule transaction pour tous les récurrents
    await addMany(STORES.MOVEMENTS, toInsert);
  }
}

/**
 * Ouvre / complète un mois financier :
 * - ajoute les reports manquants (atomique)
 * - ajoute les récurrents manquants (atomique)
 */
async function ensureFinancialMonth(financialMonth, salaryDate, salaryMovementId) {
  await createBalanceCarryOver(financialMonth, salaryDate);
  await applyRecurring(financialMonth, salaryMovementId);
}

/* ==================== Entrée principale ==================== */

/**
 * Ajout d'un mouvement.
 *
 * Règles métier :
 * - SALAIRE : ouvre le mois financier suivant (reports + récurrents)
 * - toute autre écriture : rattachée au dernier salaire antérieur (strict)
 *
 * Gestion d'erreur remontée à l'appelant avec message lisible.
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
    type: m.type,
    status: m.status || 'SAISIE_MANUELLE',

    category: m.category || '',
    label: m.label || '',
    paymentMethod: m.paymentMethod || 'transfer',

    origin: 'MANUELLE',
    createdAt: new Date().toISOString()
  };

  try {
    await add(STORES.MOVEMENTS, movement);
  } catch (err) {
    console.error('[engine] Impossible d\'enregistrer le mouvement :', err);
    throw new Error('Enregistrement échoué. Réessaie.');
  }

  if (movement.type === 'SALAIRE') {
    try {
      await ensureFinancialMonth(movement.financialMonth, movement.date, movement.id);
    } catch (err) {
      console.error('[engine] Erreur lors de l\'ouverture du mois financier :', err);
      throw new Error(
        `Salaire enregistré, mais l'ouverture du mois a échoué : ${err.message}`
      );
    }
  }

  return movement;
}
