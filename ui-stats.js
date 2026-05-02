// ui-stats.js
import { getAllMovements } from './db.js';

function eur(v) {
  return v.toLocaleAllMovements();  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  container.innerHTML = '<h3>Statistiques</h3>';

  const byMonth = {};
  data.forEach(m => {
    if (!byMonth[m.financialMonth]) byMonth[m.financialMonth] = 0;
    byMonth[m.financialMonth] += m.amount;
  });

  Object.entries(byMonth)
    .sort()
    .forEach(([month, total]) => {
      const div = document.createElement('div');
      div.textContent = `${month} : ${eur(total)}`;
      container.appendChild(div);
    });
}
}

export async function initStatsUI() {
  const container = document.querySelector('[data-stats]');
  if (!container) return;

