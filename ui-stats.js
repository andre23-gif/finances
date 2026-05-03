// ui-stats.js
import { all, STORES } from './db.js';

/* ---------- Utils ---------- */

function eur(v) {
  return Number(v || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}

function el(tag, cls = '', html = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
}

/* ---------- Stats ---------- */

export async function initStatsUI() {
  const page = document.querySelector('.page[data-page="stats"]');
  if (!page || page.hidden) return;

  const container = page.querySelector('[data-stats]');
  if (!container) return;

  const movements = (await all(STORES.MOVEMENTS))
    .filter(m => m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');

  if (!movements.length) {
    container.innerHTML = '<div class="muted">Aucune donnée.</div>';
    return;
  }

  const months = Array.from(
    new Set(movements.map(m => m.financialMonth).filter(Boolean))
  ).sort();

  container.innerHTML = '';

  /* ---------- Sélecteur de mois ---------- */

  const select = document.createElement('select');
  select.className = 'stats-select';
  months.forEach(m => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    select.appendChild(o);
  });
  select.value = months[months.length - 1];

  container.appendChild(select);

  /* ---------- Blocs ---------- */

  const summary = el('div', 'stats-block');
  const timeline = el('div', 'stats-block');
  const cumul = el('div', 'stats-block');
  const byAccount = el('div', 'stats-block');

  container.append(summary, timeline, cumul, byAccount);

  /* ---------- Render ---------- */

  function render() {
    const fm = select.value;

    const byMonth = {};
    const byAcc = {};

    for (const m of movements) {
      const amt = Number(m.amount || 0);
      const month = m.financialMonth;

      if (!byMonth[month]) byMonth[month] = { in: 0, out: 0 };
      if (amt > 0) byMonth[month].in += amt;
      if (amt < 0) byMonth[month].out += amt;

      if (amt < 0) {
        const acc = m.account || 'inconnu';
        byAcc[acc] = (byAcc[acc] || 0) + Math.abs(amt);
      }
    }

    /* ---- 1. Synthèse mois ---- */

    const cur = byMonth[fm] || { in: 0, out: 0 };
    const net = cur.in + cur.out;

    summary.innerHTML = `
      <h3>Mois ${fm}</h3>
      <div>Entrées : <strong>${eur(cur.in)}</strong></div>
      <div>Dépenses : <strong>${eur(Math.abs(cur.out))}</strong></div>
      <div>Solde : <strong>${eur(net)}</strong></div>
    `;

    /* ---- 2. Timeline mensuelle ---- */

    timeline.innerHTML = `<h3>Timeline mensuelle</h3>`;
    months.forEach(m => {
      const t = byMonth[m];
      if (!t) return;
      timeline.innerHTML += `
        <div class="line">
          <strong>${m}</strong> —
          +${eur(t.in)} / -${eur(Math.abs(t.out))} →
          <b>${eur(t.in + t.out)}</b>
        </div>
      `;
    });

    /* ---- 3. Cumul dans le temps ---- */

    let running = 0;
    cumul.innerHTML = `<h3>Cumul dans le temps</h3>`;
    months.forEach(m => {
      const t = byMonth[m];
      if (!t) return;
      running += t.in + t.out;
      cumul.innerHTML += `
        <div class="line">
          ${m} → <strong>${eur(running)}</strong>
        </div>
      `;
    });

    /* ---- 4. Répartition par compte ---- */

    byAccount.innerHTML = `<h3>Dépenses par compte</h3>`;
    Object.entries(byAcc)
      .sort((a, b) => b[1] - a[1])
      .forEach(([acc, v]) => {
        byAccount.innerHTML += `
          <div class="line">
            ${acc} : <strong>${eur(v)}</strong>
          </div>
        `;
      });
  }

  select.addEventListener('change', render);
  render();
}
