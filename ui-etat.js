// ui-etat.js
import { all, STORES } from './db.js';

function eur(v) {
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function updateEtatUI() {
  const movements = await all(STORES.MOVEMENTS);

  // On travaille par mois budgétaire (financialMonth)
  const months = Array.from(new Set(
    movements.map(m => m.financialMonth).filter(Boolean)
  )).sort();

  const fm = months.length ? months[months.length - 1] : currentMonth();

  const accounts = ['perso', 'internet', 'commun', 'cash'];

  accounts.forEach(acc => {
    const box = document.querySelector(`.account-values[data-account="${acc}"]`);
    if (!box) return;

    const ms = movements
      .filter(m => m.financialMonth === fm && m.account === acc)
      .filter(m => !m.status || m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');

let income = 0;
let expense = 0;

// Nouveaux calculs
let currentBalance = 0; // solde réel logique
let futureExpense = 0;  // dépenses à venir

const today = new Date().toISOString().slice(0, 10);

ms.forEach(m => {
  const amt = Number(m.amount || 0);

  // Budget mensuel (existant)
  if (amt > 0) income += amt;
  else expense += Math.abs(amt);

  // Présent / futur
  if (m.date <= today) {
    currentBalance += amt;
  } else {
    if (amt < 0) {
      futureExpense += Math.abs(amt);
    }
  }
});


box.innerHTML = `
  <div class="kpi"><strong>État du mois</strong></div>

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
    Reste fin de mois :
    <strong>${eur(income - expense)}</strong>
  </div>

  <div class="kpi muted">
    Mois budgétaire : ${fm}
  </div>
`;
});
}


