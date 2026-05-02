import { addMovementWithTriggers } from './engine.js';

export function initSaisieUI() {
  document.querySelectorAll('[data-table]').forEach(c => {
    const acc = c.dataset.table;
    const btn = document.createElement('button');
    btn.textContent = '+';

    btn.onclick = () => {
      const i = document.createElement('input');
      i.placeholder = `Montant ${acc}`;
      i.onchange = () => addMovementWithTriggers({
        account: acc,
        date: new Date().toISOString().slice(0,10),
        amount: Number(i.value),
        type: i.value > 0 ? 'ENTREE' : 'DEPENSE'
      });
      c.appendChild(i);
    };
    c.appendChild(btn);
  });
}
