// ui-stats.js
import { all, STORES } from './db.js';
const { STORE_MOVEMENTS } = STORES;

function eur(v){ return v.toLocaleString('fr-FR',{style:'currency',currency:'EUR'}); }

export async function initStatsUI(){
  const page = document.querySelector('.page[data-page="stats"]');
  if(!page) return;
  const container = page.querySelector('[data-stats]');
  if(!container) return;

  const all = (await getAll(STORE_MOVEMENTS))
    .filter(m => m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');

  const months = Array.from(new Set(all.map(m=>m.financialMonth).filter(Boolean))).sort();

  container.innerHTML = '';
  if(!months.length){
    container.innerHTML = `<div class="muted">Aucune donnée pour afficher des statistiques.</div>`;
    return;
  }

  const select = document.createElement('select');
  select.style.marginBottom = '0.75rem';
  select.style.width = '100%';
  select.style.background = '#111';
  select.style.border = '1px solid #2a2a2a';
  select.style.color = '#e0e0e0';
  select.style.borderRadius = '10px';
  select.style.padding = '0.6rem';

  months.forEach(m=>{
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    select.appendChild(o);
  });
  select.value = months[months.length-1];

  const box = document.createElement('div');
  box.className = 'muted';

  container.appendChild(select);
  container.appendChild(box);

  function render(){
    const fm = select.value;
    const ms = all.filter(m=>m.financialMonth===fm);
    const income = ms.filter(m=>m.amount>0).reduce((s,m)=>s+m.amount,0);
    const expense = ms.filter(m=>m.amount<0).reduce((s,m)=>s+Math.abs(m.amount),0);

    const byCat = {};
    ms.filter(m=>m.amount<0).forEach(m=>{
      const k = (m.category||'Sans catégorie').trim()||'Sans catégorie';
      byCat[k] = (byCat[k]||0)+Math.abs(m.amount);
    });

    const lines = Object.entries(byCat)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,12)
      .map(([k,v])=>`<div>${k} : <strong>${eur(v)}</strong></div>`)
      .join('');

    box.innerHTML = `
      <div>Mois : <strong>${fm}</strong></div>
      <div>Entrées : <strong>${eur(income)}</strong></div>
      <div>Dépenses : <strong>${eur(expense)}</strong></div>
      <div>Solde : <strong>${eur(income-expense)}</strong></div>
      <hr style="border:0;border-top:1px solid #2a2a2a;margin:0.75rem 0;">
      <div><strong>Répartition dépenses (top)</strong></div>
      ${lines || '<div>Aucune dépense.</div>'}
    `;
  }

  select.addEventListener('change', render);
  render();
}
