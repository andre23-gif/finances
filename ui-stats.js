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
  const byMonth    = {};
  const byCategory = {};
  const byAccount  = {};

  movements.forEach(m => {
    if (account !== 'all' && m.account !== account) return;
    if (category !== 'all' && m.category !== category) return;
    if (months && !months.includes(m.financialMonth)) return;

    const amt = Number(m.amount || 0);
    const fm  = m.financialMonth;
    const acc = m.account || 'inconnu';

    // byMonth
    if (!byMonth[fm]) byMonth[fm] = { in: 0, out: 0, net: 0 };
    if (amt > 0) { byMonth[fm].in  += amt; byMonth[fm].net += amt; }
    if (amt < 0) { byMonth[fm].out += Math.abs(amt); byMonth[fm].net += amt; }

    // byCategory (dépenses uniquement)
    if (amt < 0) {
      const cat = (m.category || 'Sans catégorie').trim();
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(amt);
    }

    // byAccount (dépenses uniquement)
    if (amt < 0) {
      byAccount[acc] = (byAccount[acc] || 0) + Math.abs(amt);
    }
  });

  return { byMonth, byCategory, byAccount };
}

/* ==================== Camembert interactif ==================== */

function renderPie(container, byData, onSelect, activeSlice) {
  const total = Object.values(byData).reduce((a, b) => a + b, 0);
  if (!total) {
    container.innerHTML = '<div class="muted" style="padding:12px 0">Aucune dépense.</div>';
    return;
  }

  const colors = ['#ff6b6b','#feca57','#54a0ff','#1dd1a1','#5f27cd','#ff9f43','#c8d6e5','#00d2d3'];
  const entries = Object.entries(byData).sort((a, b) => b[1] - a[1]);

  // SVG camembert
  let start = 0;
  const slices = entries.map(([cat, val], i) => {
    const pct   = val / total;
    const a0    = start * 2 * Math.PI - Math.PI / 2;
    const a1    = (start + pct) * 2 * Math.PI - Math.PI / 2;
    start      += pct;
    const x0 = Math.cos(a0), y0 = Math.sin(a0);
    const x1 = Math.cos(a1), y1 = Math.sin(a1);
    const large = pct > 0.5 ? 1 : 0;
    const isActive = activeSlice === cat;
    const scale = isActive ? 'scale(1.06)' : 'scale(1)';

    return `
      <path
        d="M 0 0 L ${x0} ${y0} A 1 1 0 ${large} 1 ${x1} ${y1} Z"
        fill="${colors[i % colors.length]}"
        data-cat="${cat}"
        style="cursor:pointer;transform:${scale};transform-origin:center;transition:transform .15s;
               opacity:${activeSlice && !isActive ? 0.45 : 1};"
      />
    `;
  }).join('');

  // Légende avec montant et %
  const legend = entries.map(([cat, val], i) => {
    const pct     = ((val / total) * 100).toFixed(1);
    const isActive = activeSlice === cat;
    return `
      <div data-cat="${cat}" style="
        display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;
        cursor:pointer;margin-bottom:3px;
        background:${isActive ? 'rgba(255,255,255,.07)' : 'transparent'};
        opacity:${activeSlice && !isActive ? 0.5 : 1};
      ">
        <span style="width:12px;height:12px;border-radius:3px;flex-shrink:0;
          background:${colors[i % colors.length]};display:inline-block;"></span>
        <span style="flex:1;font-size:13px">${cat}</span>
        <span style="font-size:13px;color:#aaa">${pct}%</span>
        <span style="font-size:13px;font-weight:700">${eur(val)}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;">
      <div style="flex-shrink:0;">
        <svg viewBox="-1.1 -1.1 2.2 2.2" style="width:200px;height:200px;">${slices}</svg>
      </div>
      <div style="flex:1;min-width:180px;" class="pie-legend">${legend}</div>
    </div>
    <div class="muted" style="font-size:12px;margin-top:4px;">
      Total dépenses : <b>${eur(total)}</b>${activeSlice ? ` · Filtre actif : <b>${activeSlice}</b> — <a href="#" class="reset-filter" style="color:var(--green)">réinitialiser</a>` : ''}
    </div>
  `;

  container.querySelectorAll('[data-cat]').forEach(p => {
    p.addEventListener('click', () => {
      const cat = p.dataset.cat;
      onSelect(activeSlice === cat ? 'all' : cat);
    });
  });

  container.querySelector('.reset-filter')?.addEventListener('click', e => {
    e.preventDefault();
    onSelect('all');
  });
}

/* ==================== Répartition par compte ==================== */

function renderByAccount(container, byAccount) {
  const total = Object.values(byAccount).reduce((a, b) => a + b, 0);
  if (!total) {
    container.innerHTML = '<div class="muted">Aucune dépense.</div>';
    return;
  }

  const colors = { perso: '#54a0ff', internet: '#1dd1a1', commun: '#feca57', cash: '#ff6b6b' };
  const entries = Object.entries(byAccount).sort((a, b) => b[1] - a[1]);

  container.innerHTML = entries.map(([acc, val]) => {
    const pct   = (val / total) * 100;
    const color = colors[acc] || '#c8d6e5';
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">
          <span style="font-weight:600">${acc.toUpperCase()}</span>
          <span>${eur(val)} <span class="muted">(${pct.toFixed(1)}%)</span></span>
        </div>
        <div style="height:8px;background:#1a1a1a;border-radius:4px;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width .3s;"></div>
        </div>
      </div>
    `;
  }).join('');
}

/* ==================== Barres entrées / sorties ==================== */

function renderLines(container, months, byMonth) {
  const vals = months.flatMap(m => {
    const t = byMonth[m] || { in: 0, out: 0 };
    return [t.in, t.out];
  });
  const max = Math.max(...vals, 1);

  container.innerHTML = months.map(m => {
    const t = byMonth[m] || { in: 0, out: 0, net: 0 };
    const netColor = t.net >= 0 ? '#1dd1a1' : '#ff6b6b';
    return `
      <div style="margin:10px 0;padding:10px;background:#0f0f0f;border-radius:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <strong>${m}</strong>
          <span style="font-size:13px;color:${netColor};font-weight:700">Net : ${eur(t.net)}</span>
        </div>
        <div style="font-size:13px;margin-bottom:2px;">Recettes : <b>${eur(t.in)}</b></div>
        <div style="height:6px;background:#1a1a1a;border-radius:4px;margin-bottom:6px;">
          <div style="width:${(t.in/max)*100}%;height:100%;background:#1dd1a1;border-radius:4px;"></div>
        </div>
        <div style="font-size:13px;margin-bottom:2px;">Dépenses : <b>${eur(t.out)}</b></div>
        <div style="height:6px;background:#1a1a1a;border-radius:4px;">
          <div style="width:${(t.out/max)*100}%;height:100%;background:#ff6b6b;border-radius:4px;"></div>
        </div>
      </div>
    `;
  }).join('');
}

/* ==================== Évolution solde net ==================== */

function renderNetEvolution(container, months, byMonth) {
  if (!months.length) return;

  const vals  = months.map(m => (byMonth[m] || { net: 0 }).net);
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  const H = 80; // hauteur SVG en px de chaque côté de la ligne zéro

  const W     = 300;
  const stepX = W / Math.max(months.length - 1, 1);

  const points = vals.map((v, i) => ({
    x: i * stepX,
    y: H - (v / maxAbs) * (H - 8)
  }));

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  const dots = points.map((p, i) => {
    const v = vals[i];
    const color = v >= 0 ? '#1dd1a1' : '#ff6b6b';
    return `
      <circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}" />
      <title>${months[i]} : ${eur(v)}</title>
    `;
  }).join('');

  const labels = months.map((m, i) => `
    <text x="${i * stepX}" y="${H * 2 + 14}" text-anchor="middle"
      font-size="9" fill="#92a0ad">${m.slice(5)}</text>
  `).join('');

  container.innerHTML = `
    <svg viewBox="-10 0 ${W + 20} ${H * 2 + 20}"
         style="width:100%;max-width:500px;display:block;overflow:visible;">
      <!-- ligne zéro -->
      <line x1="0" y1="${H}" x2="${W}" y2="${H}"
            stroke="#2a2a2a" stroke-width="1" stroke-dasharray="4 3"/>
      <!-- courbe -->
      <polyline points="${polyline}"
        fill="none" stroke="#29ff8a" stroke-width="2" stroke-linejoin="round"/>
      <!-- points -->
      ${dots}
      <!-- labels mois -->
      ${labels}
    </svg>
  `;
}

/* ==================== Tableau récapitulatif ==================== */

function renderTable(container, months, byMonth) {
  const totIn  = months.reduce((s, m) => s + (byMonth[m]?.in  || 0), 0);
  const totOut = months.reduce((s, m) => s + (byMonth[m]?.out || 0), 0);
  const totNet = totIn - totOut;
  const netColor = totNet >= 0 ? '#1dd1a1' : '#ff6b6b';

  const rows = months.map(m => {
    const t = byMonth[m] || { in: 0, out: 0, net: 0 };
    const nc = t.net >= 0 ? '#1dd1a1' : '#ff6b6b';
    return `
      <tr>
        <td style="padding:7px 10px;font-weight:600">${m}</td>
        <td style="padding:7px 10px;text-align:right;color:#1dd1a1">${eur(t.in)}</td>
        <td style="padding:7px 10px;text-align:right;color:#ff6b6b">${eur(t.out)}</td>
        <td style="padding:7px 10px;text-align:right;color:${nc};font-weight:700">${eur(t.net)}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid #2a2a2a;">
            <th style="padding:7px 10px;text-align:left;color:#92a0ad">Mois</th>
            <th style="padding:7px 10px;text-align:right;color:#92a0ad">Entrées</th>
            <th style="padding:7px 10px;text-align:right;color:#92a0ad">Sorties</th>
            <th style="padding:7px 10px;text-align:right;color:#92a0ad">Net</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="border-top:1px solid #2a2a2a;">
            <td style="padding:7px 10px;font-weight:700">Total</td>
            <td style="padding:7px 10px;text-align:right;color:#1dd1a1;font-weight:700">${eur(totIn)}</td>
            <td style="padding:7px 10px;text-align:right;color:#ff6b6b;font-weight:700">${eur(totOut)}</td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;color:${netColor}">${eur(totNet)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

/* ==================== Section avec titre ==================== */

function section(title) {
  const wrap = el('div', {});
  wrap.style.margin = '20px 0 8px';
  const h = el('div', {}, title);
  h.style.fontWeight = '700';
  h.style.fontSize = '15px';
  h.style.marginBottom = '10px';
  h.style.color = 'var(--green)';
  wrap.appendChild(h);
  const body = el('div');
  wrap.appendChild(body);
  return { wrap, body };
}

/* ==================== UI principale ==================== */

export async function initStatsUI() {
  const page = document.querySelector('.page[data-page="stats"]');
  if (!page || page.hidden) return;

  const container = page.querySelector('[data-stats]');
  if (!container) return;

  // Tous les mouvements (manuels + récurrents + reports système)
  const movements = await all(STORES.MOVEMENTS);

  if (!movements.length) {
    container.innerHTML = '<div class="muted">Aucune donnée.</div>';
    return;
  }

  const allMonths = Array.from(
    new Set(movements.map(m => m.financialMonth).filter(Boolean))
  ).sort();

  const state = {
    account:  'all',
    category: 'all',
    period:   6
  };

  container.innerHTML = '';

  /* ---------- Filtres ---------- */
  const filters = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;' }, `
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

  const secPie    = section('Dépenses par famille');
  const secAcc    = section('Dépenses par compte');
  const secBars   = section('Entrées / Sorties par mois');
  const secNet    = section('Évolution du solde net');
  const secTable  = section('Tableau récapitulatif');

  container.append(
    filters,
    secPie.wrap,
    secAcc.wrap,
    secBars.wrap,
    secNet.wrap,
    secTable.wrap
  );

  /* ---------- Render ---------- */
  function render() {
    const months = allMonths.slice(-state.period);
    const { byMonth, byCategory, byAccount } = aggregate(movements, {
      account:  state.account,
      category: state.category,
      months
    });

    // Mise à jour filtre familles
    const catSelect = filters.querySelector('[data-filter="category"]');
    const prevCat   = catSelect.value;
    catSelect.innerHTML =
      `<option value="all">Toutes les familles</option>` +
      Object.keys(byCategory)
        .sort((a, b) => byCategory[b] - byCategory[a])
        .map(c => `<option value="${c}">${c}</option>`)
        .join('');
    catSelect.value = prevCat;

    renderPie(secPie.body, byCategory, cat => {
      state.category = cat;
      render();
    }, state.category !== 'all' ? state.category : null);

    renderByAccount(secAcc.body, byAccount);
    renderLines(secBars.body, months, byMonth);
    renderNetEvolution(secNet.body, months, byMonth);
    renderTable(secTable.body, months, byMonth);
  }

  filters.addEventListener('change', e => {
    const f = e.target.dataset.filter;
    if (!f) return;
    state[f] = f === 'period' ? Number(e.target.value) : e.target.value;
    if (f !== 'category') state.category = 'all'; // reset filtre famille si autre filtre change
    render();
  });

  render();
}
