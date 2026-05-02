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

    ms.forEach(m => {
      const amt = Number(m.amount || 0);
      if (amt > 0) income += amt;
      else expense += Math.abs(amt);
    });

    box.innerHTML = `
      <div class="kpi">Mois budgétaire : <strong>${fm}</strong></div>
      <div class="kpi">Entrées : <strong>${eur(income)}</strong></div>
      <div class="kpi">Dépenses : <strong>${eur(expense)}</strong></div>
      <div class="kpi">Solde : <strong>${eur(income - expense)}</strong></div>
    `;
  });
}
``
