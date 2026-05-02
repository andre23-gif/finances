// ui-etat.js
import { all } from './db.js';

function formatEUR(value) {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}

export async function updateEtatUI() {
  const movements = await all('movements');

  const accounts = ['perso', 'internet', 'commun', 'cash'];

  accounts.forEach(account => {
    const container = document.querySelector(`[data-account="${account}"]`);
    if (!container) return;

    const total = movements
      .filter(m => m.account === account)
      .reduce((sum, m) => sum + m.amount, 0);

    container.innerHTML = `
      <div><strong>Solde :</strong> ${formatEUR(total)}</div>
    `;
  });
}
