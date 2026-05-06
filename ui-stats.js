// ui-stats.js
import { all, STORES } from './db.js';

/* ==================== Utils ==================== */

function eur(v) {
  return Number(v || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}

function el(tag, attrs = {}, html = '') {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  if (html) n.innerHTML = html;
  return n;
}

/* ==================== Agrégations ==================== */

function aggregate(movements, { account, category, months }) {
  const byMonth = {};
  const byCategory = {};

  movements.forEach(m => {
    if (account !== 'all' && m.account !== account) return;
    if (category !== 'all' && m.category !== category) return;
    if (months && !months.includes(m.financialMonth)) return;

    const amt = Number(m.amount || 0);
    const fm = m.financialMonth;

    if (!byMonth[fm]) byMonth[fm] = { in: 0, out: 0 };
    if (amt > 0) byMonth[fm].in += amt;
    if (amt < 0) byMonth[fm].out += Math.abs(amt);

    if (amt < 0) {
      const cat = (m.category || 'Sans catégorie').trim();
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(amt);
    }
  });

  return { byMonth, byCategory };
}

/* ==================== Graphiques ==================== */

function renderPie(container, byCategory, onSelect) {
  const total = Object.values(byCategory).reduce((a,b) => a+b, 0);
  if (!total) {
    container.innerHTML = '<div class="muted">Aucune dépense.</div>';
    return;
  }

  let start = 0;
  const colors = ['#ff6b6b','#feca57','#54a0ff','#1dd1a1','#5f27cd','#c8d6e5'];

  const slices = Object.entries(byCategory).map(([cat,val], i) => {
    const pct = val / total;
    const a0 = start * 2 * Math.PI;
    const a1 = (start + pct) * 2 * Math.PI;
    start += pct;

    const x0 = Math.cos(a0), y0 = Math.sin(a0);
    const x1 = Math.cos(a1), y1 = Math.sin(a1);
    const large = pct > 0.5 ? 1 : 0;

    return `
      <path d="
        M 0 0
        L ${x0} ${y0}
        A 1 1 0 ${large} 1 ${x1} ${y1}
        Z"
        fill="${colors[i % colors.length]}"
        data-cat="${cat}"
      />
    `;
  }).join('');

  container.innerHTML = `
    <svg viewBox="-1.1 -1.1 2.2 2.2" style="width:220px;height:220px;">
      ${slices}
    </svg>
    <div class="muted">Cliquer une famille pour filtrer</div>
  `;

  container.querySelectorAll('path').forEach(p => {
    p.style.cursor = 'pointer';
    p.addEventListener('click', () => onSelect(p.dataset.cat));
  });
}

function renderLines(container, months, byMonth) {
  const max = Math.max(...months.map(m => {
    const t = byMonth[m] || { in:0,out:0 };
    return Math.max(t.in, t.out);
  }));

  container.innerHTML = months.map(m => {
    const t = byMonth[m] || { in:0,out:0 };
    return `
      <div style="margin:6px 0;">
        <strong>${m}</strong>
        <div>Dépenses : ${eur(t.out)}</div>
        <div style="height:6px;background:#1a1a1a;border-radius:4px;">
          <div style="width:${(t.out/max)*100}%;height:100%;background:#ff6b6b;"></div>
        </div>
        <div>Recettes : ${eur(t.in)}</div>
        <div style="height:6px;background:#1a1a1a;border-radius:4px;">
          <div style="width:${(t.in/max)*100}%;height:100%;background:#1dd1a1;"></div>
        </div>
      </div>
    `;
  }).join('');
}

/* ==================== UI ==================== */

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

  const allMonths = Array.from(
    new Set(movements.map(m => m.financialMonth))
  ).sort();

  const state = {
    account: 'all',
    category: 'all',
    period: 6
  };

  container.innerHTML = '';

  /* ---------- Filtres ---------- */

  const filters = el('div', {}, `
    <select data-filter="account">
      <option value="all">Tous les comptes</option>
      <option value="perso">Perso</option>
      <option value="commun">Commun</option>
      <option value="internet">Internet</option>
      <option value="cash">Cash</option>
    </select>

    <select data-filter="category">
      <option value="all">Toutes les familles</option>
    </select>

    <select data-filter="period">
      <option value="3">3 mois</option>
      <option value="6" selected>6 mois</option>
      <option value="12">12 mois</option>
    </select>
  `);

  const pie = el('div');
  const lines = el('div');

  container.append(filters, pie, lines);

  /* ---------- Render ---------- */

  function render() {
    const months = allMonths.slice(-state.period);
    const { byMonth, byCategory } = aggregate(movements, {
      account: state.account,
      category: state.category,
      months
    });

    // Remplir familles
    const catSelect = filters.querySelector('[data-filter="category"]');
    catSelect.innerHTML = `<option value="all">Toutes les familles</option>` +
      Object.keys(byCategory).map(c => `<option value="${c}">${c}</option>`).join('');
    catSelect.value = state.category;

    renderPie(pie, byCategory, cat => {
      state.category = cat;
      render();
    });

    renderLines(lines, months, byMonth);
  }

  filters.addEventListener('change', e => {
    const f = e.target.dataset.filter;
    state[f] = f === 'period' ? Number(e.target.value) : e.target.value;
    render();
  });

  render();
}
