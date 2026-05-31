import { all, STORES } from './db.js';

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

export async function updateEtatUI() {
  const movements = await all(STORES.MOVEMENTS);

  // Mois financier courant
  const months = Array.from(
    new Set(movements.map(m => m.financialMonth).filter(Boolean))
  ).sort();

  const fm = months.length ? months[months.length - 1] : currentMonth();

  const accounts = ['perso', 'internet', 'commun', 'cash'];
  const today = new Date().toISOString().slice(0, 10);

  accounts.forEach(acc => {
    const box = document.querySelector(`.account-values[data-account="${acc}"]`);
    if (!box) return;

    // Tous les mouvements utiles
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

      // ✅ Solde réel
      if (m.date <= today) {
        currentBalance += amt;

        // ✅ TOTAL RÉCURRENTS DÉJÀ APPLIQUÉS
        if (m.origin === 'RECURRENTE') {
          recurringApplied += Math.abs(amt);
        }
      }

      // ✅ À venir
      if (m.date > today && amt < 0) {
        futureExpense += Math.abs(amt);
      }
    });

    const projected = currentBalance - futureExpense;

    box.innerHTML = `
      <div class="kpi"><strong>${acc.toUpperCase()}</strong></div>

      <div class="kpi">
        Solde actuel :
        <strong>${eur(currentBalance)}</strong>
      </div>

      <div class="kpi">
        À venir :
        <strong>-${eur(futureExpense)}</strong>
      </div>

      <div class="kpi">
        <hr>
        Solde prévisionnel :
        <strong>${eur(projected)}</strong>
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
