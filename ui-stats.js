// ui-stats.js
import { all, STORES } from './db.js';

/* ==================== Utils ==================== */

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

function bar(value, max, color) {
  const pct = max > 0 ? Math.round((Math.abs(value) / max) * 100) : 0;
  return `
    <div style="height:8px;background:#1a1a1a;border-radius:6px;overflow:hidden;margin-top:4px;">
      <div style="height:100%;width:${pct}%;background:${color};"></div>
    </div>
  `;
}

/* ==================== UI ==================== */

export async function initStatsUI() {
  const page = document.querySelector('.page[data-page="stats"]');
  if (!page || page.hidden) return;

  const container = page.querySelector('[data-stats]');
  if (!container) return;

  const movements = (await all(STORES.MOVEMENTS))
    .filter(m => m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');

  container.innerHTML = '';

  if (!movements.length) {
    container.innerHTML = '<div class="muted">Aucune donnée.</div>';
    return;
  }

  const months = Array.from(
    new Set(movements.map(m => m.financialMonth).filter(Boolean))
  ).sort();

  /* ---------- Sélecteur ---------- */

  const select = document.createElement('select');
  select.style.marginBottom = '10px';
  select.style.width = '100%';
  months.forEach(m => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    select.appendChild(o);
  });
  select.value = months[months.length - 1];

  container.appendChild(select);

  /* ---------- Blocs ---------- */

  const summary = el('div');
  const timeline = el('div');
  const accounts = el('div');

  container.append(summary, timeline, accounts);

  /* ---------- Render ---------- */

  function render() {
    const fm = select.value;

    const byMonth = {};
    const byAccount = {};

    for (const m of movements) {
      const amt = Number(m.amount || 0);
      const mo = m.financialMonth;

      if (!byMonth[mo]) byMonth[mo] = { in: 0, out: 0 };
      if (amt > 0) byMonth[mo].in += amt;
      if (amt < 0) byMonth[mo].out += Math.abs(amt);

      if (amt < 0) {
        byAccount[m.account] = (byAccount[m.account] || 0) + Math.abs(amt);
      }
    }

    const cur = byMonth[fm] || { in: 0, out: 0 };
    const maxIO = Math.max(cur.in, cur.out);
    const net = cur.in - cur.out;

    /* ----- 1. Synthèse ----- */

    summary.innerHTML = `
      <div style="border:1px solid #2a2a2a;border-radius:14px;padding:12px;margin:10px 0;">
        <strong>Mois ${fm}</strong>
        <div style="margin-top:6px;">
          <div>Entrées : <b>${eur(cur.in)}</b></div>
          ${bar(cur.in, maxIO, '#6ee7b7')}
        </div>
        <div style="margin-top:6px;">
          <div>Sorties : <b>${eur(cur.out)}</b></div>
          ${bar(cur.out, maxIO, '#ffb86c')}
        </div>
        <div style="margin-top:6px;">
          Net :
          <b style="color:${net < 0 ? '#ff6b6b' : '#6ee7b7'}">${eur(net)}</b>
        </div>
      </div>
    `;

    /* ----- 2. Timeline ----- */

    const maxNet = Math.max(...Object.values(byMonth).map(m => Math.abs(m.in - m.out)));

    timeline.innerHTML = `
      <div style="border:1px solid #2a2a2a;border-radius:14px;padding:12px;margin:10px 0;">
        <strong>Timeline mensuelle</strong>
        ${
          months.map(m => {
            const t = byMonth[m];
            if (!t) return '';
            const n = t.in - t.out;
            return `
              <div style="margin-top:6px;">
                <div style="display:flex;justify-content:space-between;">
                  <span>${m}</span>
                  <b style="color:${n < 0 ? '#ff6b6b' : '#6ee7b7'}">${eur(n)}</b>
                </div>
                ${bar(n, maxNet, n < 0 ? '#ff6b6b' : '#6ee7b7')}
              </div>
            `;
          }).join('')
        }
      </div>
    `;

    /* ----- 3. Par compte ----- */

    const maxAcc = Math.max(...Object.values(byAccount));

    accounts.innerHTML = `
      <div style="border:1px solid #2a2a2a;border-radius:14px;padding:12px;margin:10px 0;">
        <strong>Dépenses par compte</strong>
        ${
          Object.entries(byAccount)
            .sort((a,b) => b[1] - a[1])
            .map(([acc,val]) => `
              <div style="margin-top:6px;">
                <div style="display:flex;justify-content:space-between;">
                  <span>${acc}</span>
                  <b>${eur(val)}</b>
                </div>
                ${bar(val, maxAcc, '#ffb86c')}
              </div>
            `).join('')
        }
      </div>
    `;
  }

  select.addEventListener('change', render);
  render();
}
