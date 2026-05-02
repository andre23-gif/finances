// ui-stats.js
import { getAllMovements } from './db.js';

function valid(m) {
  return m && (m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');
}

function eur(v) {
  return v.toLocaleString = new Date();  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export async function initStatsUI() {
  const container = document.querySelector('[data-stats]');
  if (!container) return;

  const all = (await getAllMovements()).filter(valid);
  const months = [...new Set(all.map(m => m.financialMonth))].sort();

  const select = document.createElement('select');
  months.forEach(m => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    select.appendChild(o);
  });
  select.value = months.includes(currentFinancialMonth())
    ? currentFinancialMonth()
    : months[months.length-1];

  const pie = document.createElement('div');
  const line = document.createElement('div');

  container.appendChild(select);
  container.appendChild(pie);
  container.appendChild(line);

  function render() {
    const month = select.value;
    const data = all.filter(m => m.financialMonth === month && m.amount < 0);

    const byCat = {};
    data.forEach(d => {
      const k = d.category || 'Sans catégorie';
      byCat[k] = (byCat[k] || 0) + Math.abs(d.amount);
    });

    pie.innerHTML = '<h3>Répartition</h3>' +
      Object.entries(byCat)
        .map(([k,v]) => `<div>${k} : <strong>${eur(v)}</strong></div>`)
        .join('');

    const series = months.map(m => {
      const mv = all.filter(x => x.financialMonth === m);
      const bal = mv.reduce((s,x)=>s+x.amount,0);
      return `<div>${m} → ${eur(bal)}</div>`;
    }).join('');

    line.innerHTML = '<h3>Évolution</h3>' + series;
  }

  select.onchange = render;
  render();
}
}

function currentFinancialMonth() {
