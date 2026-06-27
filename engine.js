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
    .sort((a, b) => b.date.localeCompare(a.date)); // plus récent d'abord

  for (const s of salaries) {
    if (date > s.date) {
      // dépense postérieure au salaire → nouveau mois financier
      return s.financialMonth;
    }
    if (date === s.date) {
      // même jour que le salaire → ancien mois financier (avant ouverture)
      // on continue vers le salaire précédent
      continue;
    }
  }

  return monthFromDate(date);
}

/* ==================== Reports de solde ==================== */

/**
 * Calcule le solde réel d'un compte juste AVANT la date du salaire.
 *
 * FIX : au lieu d'un reduce complexe et cassé, on :
 *   1. cherche le dernier report existant (SYSTEM / report)
 *   2. repart de son montant comme point de départ
 *   3. additionne uniquement les mouvements STRICTEMENT postérieurs à ce report
 *
 * FIX balance=0 : on ne crée pas de report si le solde calculé est 0 ET
 * qu'il n'y a aucun mouvement après le dernier report (compte vraiment vide).
 * En revanche si des mouvements existent et se compensent, on crée bien le report
 * à 0 pour marquer le point de départ du nouveau mois.
 */
async function getAccountBalanceBeforeDate(account, salaryDate) {
  const movements = await all(STORES.MOVEMENTS);

  const accountMovements = movements
    .filter(m => m.account === account && m.date < salaryDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!accountMovements.length) return null; // compte sans historique → pas de report

  const lastReport = [...accountMovements]
    .reverse()
    .find(m => m.origin === 'SYSTEM' && m.category === 'report');

  if (!lastReport) {
    // Pas de report antérieur : cumul complet
    return accountMovements.reduce((sum, m) => sum + Number(m.amount || 0), 0);
  }

  // Repart du montant du report + mouvements STRICTEMENT postérieurs
  const afterReport = accountMovements.filter(m => m.date > lastReport.date);
  return afterReport.reduce(
    (sum, m) => sum + Number(m.amount || 0),
    Number(lastReport.amount || 0)
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
 * FIX balance=0 : on crée le report même si le solde est 0, dès lors que le
 * compte a un historique. Cela évite que le mois suivant repart d'un cumul
 * complet de tout l'historique.
 * Exception : si getAccountBalanceBeforeDate retourne null (aucun mouvement),
 * on ne crée pas de report — le compte est vraiment vierge.
 */
async function createBalanceCarryOver(newFinancialMonth, salaryDate) {
  const accounts = ['perso', 'internet', 'commun', 'cash'];
  const errors = [];

  for (const acc of accounts) {
    try {
      const alreadyExists = await hasCarryOverForMonth(acc, newFinancialMonth);
      if (alreadyExists) continue;

      const balance = await getAccountBalanceBeforeDate(acc, salaryDate);

      // null = compte sans historique → pas de report à créer
      if (balance === null) continue;

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
    } catch (err) {
      console.error(`[engine] Erreur report compte ${acc} :`, err);
      errors.push(acc);
    }
  }

  if (errors.length) {
    throw new Error(`Reports échoués pour : ${errors.join(', ')}`);
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
 * FIX : gestion d'erreur par récurrent — un échec n'interrompt pas les autres.
 */
export async function applyRecurring(financialMonth, _triggeredByMovementId = null) {
  const templates = await all(STORES.RECURRING);
  const errors = [];

  for (const t of templates) {
    if (t.active === false) continue;

    try {
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
    } catch (err) {
      console.error(`[engine] Erreur récurrent "${t.label}" :`, err);
      errors.push(t.label || t.id);
    }
  }

  if (errors.length) {
    throw new Error(`Récurrents échoués : ${errors.join(', ')}`);
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
 * Ajout d'un mouvement.
 *
 * Règles métier :
 * - SALAIRE :
 *    ouvre le mois financier suivant
 *    puis complète ce mois (reports + récurrents)
 *
 * - toute autre écriture :
 *    est rattachée au dernier salaire antérieur (strictement)
 *
 * FIX : gestion d'erreur remontée à l'appelant avec message lisible.
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
      // Le salaire est enregistré mais reports/récurrents partiels
      console.error('[engine] Erreur lors de l\'ouverture du mois financier :', err);
      throw new Error(
        `Salaire enregistré, mais certains reports ou récurrents n'ont pas pu être créés : ${err.message}`
      );
    }
  }

  return movement;
}
