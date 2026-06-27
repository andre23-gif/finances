import { all, STORES } from './db.js';

/* ==================== Cache léger ==================== */

// Évite de relire toute la DB à chaque affichage de la page État.
// Le cache est invalidé dès qu'on revient sur la page (TTL 5s).
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5000; // ms

async function getMovements() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  _cache = await all(STORES.MOVEMENTS);
  _cacheTime = now;
  return _cache;
}

/** Appeler après toute écriture pour forcer un rechargement au prochain affichage. */
export function invalidateEtatCache() {
  _cache = null;
}

/* ==================== Utils ==================== */

function eur(v) {
  return Number(v || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ==================== UI ==================== */

export async function updateEtatUI() {
  const movements = await getMovements();

  // Mois financier courant = le plus récent présent dans les mouvements
  const months = Array.from(
    new Set(movements.map(m => m.financialMonth).filter(Boolean))
  ).sort();

  const fm = months.length ? months[months.length - 1] : currentMonth();

  const accounts = ['perso', 'internet', 'commun', 'cash'];
  const today = new Date().toISOString().slice(0, 10);

  accounts.forEach(acc => {
    const box = document.querySelector(`.account-values[data-account="${acc}"]`);
    if (!box) return;

    // Mouvements du mois financier courant pour ce compte
    const ms = movements.filter(
      m =>
        m.financialMonth === fm &&
        m.account === acc &&
        (
          m.status === 'SAISIE_MANUELLE' ||
          m.status === 'APPLIQUEE' ||
          m.origin === 'SYSTEM' ||
          m.origin === 'RECURRENTE'
        )
    );

    let currentBalance = 0;
    let futureExpense = 0;
    let recurringApplied = 0;

    ms.forEach(m => {
      const amt = Number(m.amount || 0);

      // FIX : le report (origin=SYSTEM, category=report) est le point de départ
      // du mois. On l'inclut dans le solde actuel UNIQUEMENT s'il est daté
      // avant ou égal à aujourd'hui — ce qui est toujours le cas puisqu'il est
      // daté à la date du salaire (dans le passé). Pas de traitement spécial
      // nécessaire : la condition m.date <= today suffit.

      if (m.date <= today) {
        currentBalance += amt;

        if (m.origin === 'RECURRENTE') {
          recurringApplied += Math.abs(amt);
        }
      }

      if (m.date > today && amt < 0) {
        futureExpense += Math.abs(amt);
      }
    });

    const projected = currentBalance - futureExpense;

    // Couleur selon solde
    const balColor = currentBalance < 0 ? '#ff6b6b' : 'inherit';
    const projColor = projected < 0 ? '#ff6b6b' : '#6ee7b7';

    box.innerHTML = `
      <div class="kpi">
        Solde actuel :
        <strong style="color:${balColor}">${eur(currentBalance)}</strong>
      </div>

      <div class="kpi">
        À venir :
        <strong>-${eur(futureExpense)}</strong>
      </div>

      <div class="kpi">
        <hr>
        Solde prévisionnel :
        <strong style="color:${projColor}">${eur(projected)}</strong>
      </div>

      <div class="kpi">
        Récurrents déjà appliqués :
        <strong>-${eur(recurringApplied)}</strong>
      </div>

      <div class="kpi muted">
        Mois financier : ${fm}
      </div>
    `;
  });
}
