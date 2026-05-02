// ui-etat.js
import { getAll, STORES } from './db.js';

const { STORE_MOVEMENTS } = STORES;

function eur(v) {
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export async function updateEtatUI() {
  const all = await getAll(STORE_MOVEMENTS);

  const months = Array.from(new Set(all.map(m => m.financialMonth).filter(Boolean))).sort();
  const fm = months.length ? months[months.length - 1] : currentMonth();

  const accounts = ['perso', 'internet', 'commun', 'cash'];

  for (const acc of accounts) {
    const box = document.querySelector(`.account-values[data-account="${acc}"]`);
    if (!box) continue;

    const ms = all.filter(m => m.financialMonth === fm && m.account === acc)
                  .filter(m => m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');

    let income = 0;
    let expense = 0;
    ms.forEach(m => {
      if (m.amount > 0) income += m.amount;
      else expense += Math.abs(m.amount);
    });

    box.innerHTML = `
      <div class="kpi">Mois budgétaire : <strong>${fm}</strong></div>
      <div class="kpi">Entrées : <strong>${eur(income)}</strong></div>
      <div class="kpi">Dépenses : <strong>${eur(expense)}</strong></div>
      <div class="kpi">Solde : <strong>${eur(income - expense)}</strong></div>
    `;
  }
}
