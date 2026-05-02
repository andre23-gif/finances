// ui-stats.js
import { all } from './db.js';

function formatEUR(value) {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}

export async function initStatsUI() {
  const container = document.querySelector('[data-stats]');
  if (!container) return;

  const movements = await all('movements');

  container.innerHTML = '<h3>Statistiques</h3>';

  const totalsByMonth = {};

  movements.forEach(m => {
    if (!m.financialMonth) return;
    totalsByMonth[m.financialMonth] =
      (totalsByMonth[m.financialMonth] || 0) + m.amount;
  });

  Object.keys(totalsByMonth)
    .sort()
    .forEach(month => {
      const div = document.createElement('div');
      div.textContent = `${month} : ${formatEUR(totalsByMonth[month])}`;
      container.appendChild(div);
    });
}
