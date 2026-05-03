// ui-saisie.js
import { addMovementWithTriggers } from './engine.js';
import { all, STORES } from './db.js';

/* ---------- Constantes ---------- */

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

/* ---------- Utils ---------- */

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

/* ---------- Tables ---------- */

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

/* ---------- Totaux ---------- */

async function computeTotals() {
  const movements = await all(STORES.MOVEMENTS);

  // Mois budgétaire courant (cohérent avec le moteur : financialMonth est déjà écrit en base)
  const currentMonth = todayISO().slice(0, 7);

  const sum = () => ({ in: 0, out: 0 });
  const month = sum();
  const allTime = sum();

  // Totaux par compte (mois courant)
  const byAccount = {
    perso: sum(),
    internet: sum(),
    commun: sum(),
    cash: sum()
  };

  for (const m of movements) {
    const amt = Number(m.amount || 0);
    const fm = m.financialMonth;
    const acc = m.account;

    // Global
    if (amt > 0) allTime.in += amt;
    if (amt < 0) allTime.out += amt;

    // Mois courant
    if (fm === currentMonth) {
      if (amt > 0) month.in += amt;
      if (amt < 0) month.out += amt;

      // Par compte (mois courant)
      if (byAccount[acc]) {
        if (amt > 0) byAccount[acc].in += amt;
        if (amt < 0) byAccount[acc].out += amt;
      }
    }
  }

  const pack = (t) => ({
    in: t.in,
    out: Math.abs(t.out),
    net: t.in + t.out
  });

  const byAccPacked = {};
  for (const [k, v] of Object.entries(byAccount)) {
    byAccPacked[k] = pack(v);
  }

  return {
    currentMonth,
    month: pack(month),
    all: pack(allTime),
    byAccountMonth: byAccPacked
  };
}

/* ---------- UI ---------- */

export function initSaisieUI() {
  const page = document.querySelector('.page[data-page="saisie"]');
  if (!page) return;

  /* Totaux en haut */
  const totals = document.createElement('div');
  totals.className = 'saisie-totals';
  totals.innerHTML = '<div class="muted">Chargement des totaux…</div>';

  const toolbar = page.querySelector('.saisie-toolbar');
  page.insertBefore(totals, toolbar);

  /* Tables */
  const expContainer = page.querySelector('[data-expenses]');
  const incContainer = page.querySelector('[data-incomes]');
  if (!expContainer || !incContainer) return;

  const expBody = buildTable(expContainer, 'expense');
  const incBody = buildTable(incContainer, 'income');

  /* Totaux DB */
  (async () => {
    const t = await computeTotals();
    totals.innerHTML = `
      <div class="totals-block">
        <strong>Mois courant</strong>
        <div>Entrées : ${t.month.in.toFixed(2)} €</div>
        <div>Sorties : ${t.month.out.toFixed(2)} €</div>
        <div><b>Net : ${t.month.net.toFixed(2)} €</b></div>
      </div>
      <div class="totals-block">
        <strong>Cumul global</strong>
        <div>Entrées : ${t.all.in.toFixed(2)} €</div>
        <div>Sorties : ${t.all.out.toFixed(2)} €</div>
        <div><b>Net : ${t.all.net.toFixed(2)} €</b></div>
      </div>
    `;
  })();

  /* Actions */
  page.querySelector('[data-add-expense]')?.addEventListener('click', () =>
    addRow(expBody, 'expense')
  );

  page.querySelector('[data-add-income]')?.addEventListener('click', () =>
    addRow(incBody, 'income')
  );

  page.querySelector('[data-save-all]')?.addEventListener('click', async () => {
    const movements = [
      ...readRows(expBody, 'expense'),
      ...readRows(incBody, 'income')
    ];
    if (!movements.length) return;

    for (const m of movements) {
      await addMovementWithTriggers(m);
    }

    expBody.innerHTML = '';
    incBody.innerHTML = '';
    addRow(expBody, 'expense');
    addRow(incBody, 'income');
  });
}
