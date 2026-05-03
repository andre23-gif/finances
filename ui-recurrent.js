// ui-recurrent.js
import { add, put, del, all, STORES } from './db.js';

/* ==================== Utils ==================== */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function eur(v) {
  return Number(v || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}

function el(tag, attrs = {}, text = '') {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  if (text) n.textContent = text;
  return n;
}

function select(options, value) {
  const s = el('select');
  options.forEach(o => s.appendChild(el('option', { value: o.value }, o.label)));
  if (value) s.value = value;
  return s;
}

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

/* ==================== Totaux ==================== */

async function computeTotals() {
  const movements = await all(STORES.MOVEMENTS);
  const currentMonth = todayISO().slice(0, 7);

  const sum = () => ({ in: 0, out: 0 });

  const month = sum();
  const allTime = sum();
  const byAccount = {
    perso: sum(),
    commun: sum(),
    internet: sum(),
    cash: sum()
  };

  for (const m of movements) {
    const amt = Number(m.amount || 0);

    if (amt > 0) allTime.in += amt;
    if (amt < 0) allTime.out += amt;

    if (m.financialMonth === currentMonth) {
      if (amt > 0) month.in += amt;
      if (amt < 0) month.out += amt;

      if (byAccount[m.account]) {
        if (amt > 0) byAccount[m.account].in += amt;
        if (amt < 0) byAccount[m.account].out += amt;
      }
    }
  }

  const pack = t => ({
    in: t.in,
    out: Math.abs(t.out),
    net: t.in + t.out
  });

  const byAccPacked = {};
  ['perso','commun','internet','cash'].forEach(k => {
    byAccPacked[k] = pack(byAccount[k]);
  });

  return {
    currentMonth,
    month: pack(month),
    all: pack(allTime),
    byAccountMonth: byAccPacked
  };
}

function renderTotals(totals, t) {
  const row = (label, v) =>
    `<div style="display:flex;justify-content:space-between;gap:8px">
      <span>${label}</span><b>${v}</b>
     </div>`;

  totals.innerHTML = `
    <div style="border:1px solid #2a2a2a;border-radius:14px;padding:12px;margin:10px 0;background:#0f0f0f;">
      <strong>Mois courant (${t.currentMonth})</strong>
      ${row('Entrées', eur(t.month.in))}
      ${row('Sorties', eur(t.month.out))}
      ${row(
        'Net',
        `<span style="color:${t.month.net < 0 ? '#ff6b6b' : '#6ee7b7'}">${eur(t.month.net)}</span>`
      )}
    </div>

    <div style="border:1px solid #2a2a2a;border-radius:14px;padding:12px;margin:10px 0;background:#0f0f0f;">
      <strong>Cumul global</strong>
      ${row('Entrées', eur(t.all.in))}
      ${row('Sorties', eur(t.all.out))}
      ${row(
        'Net',
        `<span style="color:${t.all.net < 0 ? '#ff6b6b' : '#6ee7b7'}">${eur(t.all.net)}</span>`
      )}
    </div>

    <div style="border:1px solid #2a2a2a;border-radius:14px;padding:12px;margin:10px 0;background:#0f0f0f;">
      <strong>Par compte (mois courant)</strong>
      ${['perso','commun','internet','cash'].map(k => {
        const a = t.byAccountMonth[k];
        return row(
          k,
          `${eur(a.in)} / ${eur(a.out)} → 
           <span style="color:${a.net < 0 ? '#ff6b6b' : '#6ee7b7'}">${eur(a.net)}</span>`
        );
      }).join('')}
    </div>
  `;
}

/* ==================== UI ==================== */

export function initRecurrentUI() {
  const page = document.querySelector('.page[data-page="recurrent"]');
  if (!page || page.hidden) return;

  const container = page.querySelector('[data-recurrent]');
  if (!container) return;

  container.innerHTML = '';

  /* ---------- Totaux ---------- */
  const totals = el('div', { class: 'recurrent-totals' }, 'Chargement des totaux…');
  page.insertBefore(totals, container);

  (async () => {
    const t = await computeTotals();
    renderTotals(totals, t);
  })();

  /* ---------- Formulaire ---------- */

  const ACCOUNTS = [
    { value: 'perso', label: 'Compte perso' },
    { value: 'internet', label: 'Compte internet' },
    { value: 'commun', label: 'Compte commun' },
    { value: 'cash', label: 'Compte cash' }
  ];

  const PAYMENTS = [
    { value: 'transfer', label: 'Virement' },
    { value: 'card', label: 'Carte' },
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Chèque' }
  ];

  const form = el('div', { class: 'recurrent-form' });

  const sAcc = select(ACCOUNTS, 'perso');
  const iDay = el('input', { type: 'number', min: '1', max: '31', placeholder: 'Jour (1-31)' });
  const iAmt = el('input', { type: 'number', step: '0.01', placeholder: 'Montant' });
  const iCat = el('input', { type: 'text', placeholder: 'Catégorie' });
  const iLab = el('input', { type: 'text', placeholder: 'Libellé' });
  const sPay = select(PAYMENTS, 'transfer');

  const addBtn = el('button', { class: 'btn-primary', type: 'button' }, 'Ajouter');
  const hint = el('div', { class: 'muted' }, 'Astuce : le montant est stocké en dépense (valeur négative).');

  form.append(sAcc, iDay, iAmt, iCat, iLab, sPay, addBtn, hint);

  /* ---------- Liste ---------- */

  const list = el('div', { class: 'recurrent-list' });
  container.append(form, list);

  async function refresh() {
    list.innerHTML = '';
    const items = await all(STORES.RECURRING);

    if (!items.length) {
      list.appendChild(el('div', { class: 'muted' }, 'Aucun prélèvement enregistré.'));
      return;
    }

    items
      .slice()
      .sort((a, b) =>
        (a.account + String(a.day).padStart(2, '0'))
          .localeCompare(b.account + String(b.day).padStart(2, '0'))
      )
      .forEach(item => {
        const row = el('div', { class: 'recurrent-item' });

        const left = el('div');
        left.appendChild(el('div', { class: 'ri-label' }, item.label || '(sans libellé)'));

        const meta = el('div', { class: 'ri-meta' });
        meta.append(
          el('span', { class: 'badge' }, item.account),
          el('span', { class: 'badge' }, `Jour ${item.day}`),
          el('span', { class: 'badge' }, item.category || '—'),
          el('span', { class: 'badge' }, item.paymentMethod || '—')
        );
        left.appendChild(meta);

        const right = el('div', { class: 'ri-side' });
        right.appendChild(el('div', { class: 'ri-amount' }, eur(item.amount)));

        const toggle = el(
          'button',
          { class: 'btn-secondary', type: 'button' },
          item.active === false ? 'Activer' : 'Désactiver'
        );
        toggle.addEventListener('click', async () => {
          item.active = item.active === false ? true : false;
          await put(STORES.RECURRING, item);
          refresh();
        });

        const remove = el('button', { class: 'btn-secondary', type: 'button' }, 'Supprimer');
        remove.addEventListener('click', async () => {
          await del(STORES.RECURRING, item.id);
          refresh();
        });

        right.append(toggle, remove);
        row.append(left, right);
        list.appendChild(row);
      });
  }

  addBtn.addEventListener('click', async () => {
    const day = Number(iDay.value);
    const amt = Number(iAmt.value);

    if (!day || day < 1 || day > 31) return;
    if (!amt || amt <= 0) return;

    const tpl = {
      id: uid(),
      account: sAcc.value,
      day,
      amount: -Math.abs(amt),
      category: (iCat.value || '').trim(),
      label: (iLab.value || '').trim(),
      paymentMethod: sPay.value,
      active: true,
      createdAt: new Date().toISOString()
    };

    await add(STORES.RECURRING, tpl);

    const t = await computeTotals();
    renderTotals(totals, t);

    iDay.value = '';
    iAmt.value = '';
    iCat.value = '';
    iLab.value = '';

    refresh();
  });

  refresh();
}
