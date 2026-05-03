// ui-saisie.js
import { addMovementWithTriggers } from './engine.js';
import { all, STORES } from './db.js';

/* ==================== Constantes ==================== */

const ACCOUNTS = [
  { value: 'perso', label: 'Perso' },
  { value: 'internet', label: 'Internet' },
  { value: 'commun', label: 'Commun' },
  { value: 'cash', label: 'Cash' }
];

const PAYMENTS = [
  { value: 'cash', label: '💵 Cash' },
  { value: 'transfer', label: '🔁 Virement' },
  { value: 'card', label: '💳 Carte' },
  { value: 'check', label: '🧾 Chèque' }
];

/* ==================== Utils ==================== */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function input(type, placeholder, extra = {}) {
  return el('input', { type, placeholder, ...extra });
}

function money(n) {
  return (Number(n || 0)).toFixed(2) + ' €';
}

function netColor(n) {
  return n < 0 ? '#ff6b6b' : '#6ee7b7';
}

/* ==================== Tables ==================== */

function buildTable(container, kind) {
  const table = el('table', { class: 'data-table' });
  const thead = el('thead');
  const trh = el('tr');

  ['Date', 'Compte', 'Montant', 'Famille', 'Précision', 'Paiement', ''].forEach(h =>
    trh.appendChild(el('th', {}, h))
  );

  thead.appendChild(trh);
  const tbody = el('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);

  addRow(tbody, kind);
  return tbody;
}

function addRow(tbody, kind) {
  const tr = el('tr');
  tr.classList.add(kind === 'expense' ? 'row-neg' : 'row-pos');

  const tdDate = el('td');
  const iDate = input('date', '');
  iDate.value = todayISO();
  tdDate.appendChild(iDate);

  const tdAcc = el('td');
  tdAcc.appendChild(select(ACCOUNTS, 'perso'));

  const tdAmt = el('td');
  tdAmt.appendChild(input('number', '0.00', { step: '0.01' }));

  const tdCat = el('td');
  tdCat.appendChild(input('text', 'Famille'));

  const tdLab = el('td');
  tdLab.appendChild(input('text', 'Précision'));

  const tdPay = el('td');
  tdPay.appendChild(select(PAYMENTS, 'card'));

  const tdDel = el('td');
  const delBtn = el('button', { class: 'icon-btn', type: 'button', title: 'Supprimer' }, '✕');
  delBtn.addEventListener('click', () => tr.remove());
  tdDel.appendChild(delBtn);

  tr.append(tdDate, tdAcc, tdAmt, tdCat, tdLab, tdPay, tdDel);
  tbody.appendChild(tr);
}

function readRows(tbody, kind) {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const result = [];

  for (const tr of rows) {
    const fields = Array.from(tr.querySelectorAll('input, select')).map(x => x.value);
    const [date, account, amountRaw, category, label, paymentMethod] = fields;

    const amountNum = Number(amountRaw);
    if (!date || !account || !amountNum) continue;

    let type = (kind === 'expense') ? 'DEPENSE' : 'ENTREE';
    if (kind === 'income' && (category || '').toLowerCase() === 'salaire') {
      type = 'SALAIRE';
    }

    const amount = (type === 'DEPENSE') ? -Math.abs(amountNum) : Math.abs(amountNum);

    result.push({
      account,
      date,
      amount,
      type,
      status: 'SAISIE_MANUELLE',
      category: (category || '').trim(),
      label: (label || '').trim(),
      paymentMethod
    });
  }

  return result;
}

/* ==================== Totaux (avec filtre compte) ==================== */

async function computeTotals() {
  const movements = await all(STORES.MOVEMENTS);
  const currentMonth = todayISO().slice(0, 7);

  const sum = () => ({ in: 0, out: 0 });
  const pack = t => ({ in: t.in, out: Math.abs(t.out), net: t.in + t.out });

  const monthAll = sum();
  const allAll = sum();

  const byAccMonth = { perso: sum(), commun: sum(), internet: sum(), cash: sum() };
  const byAccAll = { perso: sum(), commun: sum(), internet: sum(), cash: sum() };

  for (const m of movements) {
    const amt = Number(m.amount || 0);
    const acc = m.account;
    const fm = m.financialMonth;

    // Global
    if (amt > 0) allAll.in += amt;
    if (amt < 0) allAll.out += amt;

    if (byAccAll[acc]) {
      if (amt > 0) byAccAll[acc].in += amt;
      if (amt < 0) byAccAll[acc].out += amt;
    }

    // Mois courant
    if (fm === currentMonth) {
      if (amt > 0) monthAll.in += amt;
      if (amt < 0) monthAll.out += amt;

      if (byAccMonth[acc]) {
        if (amt > 0) byAccMonth[acc].in += amt;
        if (amt < 0) byAccMonth[acc].out += amt;
      }
    }
  }

  const mapPack = (obj) => {
    const out = {};
    Object.keys(obj).forEach(k => out[k] = pack(obj[k]));
    return out;
  };

  return {
    currentMonth,
    monthAll: pack(monthAll),
    allAll: pack(allAll),
    byAccMonth: mapPack(byAccMonth),
    byAccAll: mapPack(byAccAll)
  };
}

function renderTotals(totalsEl, state, t) {
  const acc = state.selectedAccount;

  const label = (acc === 'all')
    ? 'Tous les comptes'
    : (ACCOUNTS.find(a => a.value === acc)?.label || acc);

  const month = (acc === 'all') ? t.monthAll : t.byAccMonth[acc];
  const all = (acc === 'all') ? t.allAll : t.byAccAll[acc];

  const card = (title, x, subtitle = '') => `
    <div style="border:1px solid #2a2a2a;border-radius:14px;padding:10px;margin:8px 0;background:#0f0f0f;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
        <strong>${title}</strong>
        ${subtitle ? `<span class="muted" style="font-size:.9em;">${subtitle}</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;">
        <div style="padding:8px;border-radius:10px;background:rgba(31,95,85,.10);border:1px solid rgba(31,95,85,.25);text-align:center;">
          <div class="muted" style="font-size:.8em;">Entrées</div>
          <div style="font-weight:800;">${money(x.in)}</div>
        </div>
        <div style="padding:8px;border-radius:10px;background:rgba(201,162,77,.08);border:1px solid rgba(201,162,77,.25);text-align:center;">
          <div class="muted" style="font-size:.8em;">Sorties</div>
          <div style="font-weight:800;">${money(x.out)}</div>
        </div>
        <div style="padding:8px;border-radius:10px;background:rgba(207,214,213,.06);border:1px solid rgba(207,214,213,.20);text-align:center;">
          <div class="muted" style="font-size:.8em;">Net</div>
          <div style="font-weight:900;color:${netColor(x.net)};">${money(x.net)}</div>
        </div>
      </div>
    </div>
  `;

  totalsEl.innerHTML = `
    <div class="muted" style="margin-top:6px;margin-bottom:6px;">
      Contexte : <b>${label}</b>
    </div>
    ${card('Mois courant', month, t.currentMonth)}
    ${card('Cumul global', all)}
  `;
}

/* ==================== Menu par compte (Saisie) ==================== */

function buildAccountMenu(state, onChange) {
  const wrap = el('div', { class: 'account-menu' });
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.flexWrap = 'wrap';
  wrap.style.margin = '10px 0 6px';

  const mkBtn = (value, text) => {
    const b = el('button', { type: 'button' }, text);
    b.style.padding = '8px 10px';
    b.style.borderRadius = '999px';
    b.style.border = '1px solid #2a2a2a';
    b.style.background = (state.selectedAccount === value) ? '#1a1a1a' : '#0f0f0f';
    b.style.color = '#e8e8e8';
    b.style.fontWeight = (state.selectedAccount === value) ? '800' : '600';
    b.style.cursor = 'pointer';
    b.addEventListener('click', () => {
      state.selectedAccount = value;
      onChange();
    });
    return b;
  };

  wrap.appendChild(mkBtn('all', 'Tous'));
  ACCOUNTS.forEach(a => wrap.appendChild(mkBtn(a.value, a.label)));

  // expose pour rafraîchir styles
  wrap._refresh = () => {
    Array.from(wrap.querySelectorAll('button')).forEach(btn => {
      const v = btn.textContent === 'Tous'
        ? 'all'
        : (ACCOUNTS.find(a => a.label === btn.textContent)?.value);

      const active = (v && state.selectedAccount === v);
      btn.style.background = active ? '#1a1a1a' : '#0f0f0f';
      btn.style.fontWeight = active ? '800' : '600';
    });
  };

  return wrap;
}

/* ==================== UI ==================== */

export function initSaisieUI() {
  const page = document.querySelector('.page[data-page="saisie"]');
  if (!page) return;

  // évite doublons si on revient sur l’onglet
  page.querySelector('.account-menu')?.remove();
  page.querySelector('.saisie-totals')?.remove();

  const toolbar = page.querySelector('.saisie-toolbar');

  const state = { selectedAccount: 'all' };

  // menu par compte (juste sous le titre, donc avant toolbar)
  const menu = buildAccountMenu(state, async () => {
    const t = await computeTotals();
    menu._refresh && menu._refresh();
    renderTotals(totals, state, t);
  });
  page.insertBefore(menu, toolbar);

  // totaux (compact)
  const totals = el('div', { class: 'saisie-totals' });
  totals.innerHTML = '<div class="muted">Chargement…</div>';
  page.insertBefore(totals, toolbar);

  // tables existantes inchangées
  const expContainer = page.querySelector('[data-expenses]');
  const incContainer = page.querySelector('[data-incomes]');
  if (!expContainer || !incContainer) return;

  const expBody = buildTable(expContainer, 'expense');
  const incBody = buildTable(incContainer, 'income');

  // premier rendu des totaux
  (async () => {
    const t = await computeTotals();
    renderTotals(totals, state, t);
  })();

  // actions existantes inchangées
  page.querySelector('[data-add-expense]')?.addEventListener('click', () => addRow(expBody, 'expense'));
  page.querySelector('[data-add-income]')?.addEventListener('click', () => addRow(incBody, 'income'));

  page.querySelector('[data-save-all]')?.addEventListener('click', async () => {
    const movements = [
      ...readRows(expBody, 'expense'),
      ...readRows(incBody, 'income')
    ];
    if (!movements.length) return;

    for (const m of movements) {
      await addMovementWithTriggers(m);
    }

    // reset tables
    expBody.innerHTML = '';
    incBody.innerHTML = '';
    addRow(expBody, 'expense');
    addRow(incBody, 'income');

    // refresh totaux
    const t = await computeTotals();
    renderTotals(totals, state, t);
  });
}
