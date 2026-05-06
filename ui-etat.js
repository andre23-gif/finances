import { all, STORES } from './db.js';
import { applyRecurring } from './engine.js';

function eur(v) {
  return Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function updateEtatUI() {
  const movements = await all(STORES.MOVEMENTS);

  // Détermination du mois budgétaire courant
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
    let currentBalance = 0;
    let futureExpense = 0;

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

  // Ajout du bouton "Forcer les récurrents du mois financier"
  let etatToolbar = document.querySelector('.etat-toolbar');
  if (!etatToolbar) {
    etatToolbar = document.createElement('div');
    etatToolbar.className = 'etat-toolbar';
    document.querySelector('.page[data-page="etat"]')?.prepend(etatToolbar);
  }

  // Supprime le bouton s'il existe déjà pour éviter les doublons
  etatToolbar.querySelector('.btn-force-recurrents')?.remove();

  const btn = document.createElement('button');
  btn.textContent = "Forcer les récurrents du mois financier";
  btn.className = "btn-primary btn-force-recurrents";
  btn.style.margin = "12px";

  btn.onclick = async () => {
    // Trouve le dernier salaire
    const salaries = movements
      .filter(m => m.type === 'SALAIRE')
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!salaries.length) {
      alert("Aucun salaire trouvé !");
      return;
    }
    const lastSalary = salaries[salaries.length - 1];
    const fm = lastSalary.financialMonth;

    await applyRecurring(fm, lastSalary.id);
    alert("Récurrents générés pour le mois financier " + fm + " !");
    location.reload();
  };

  etatToolbar.appendChild(btn);
}
