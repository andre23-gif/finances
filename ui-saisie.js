// ui-saisie.js
import { addMovementWithTriggers } from './engine.js';

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
  const i = el('input', { type, placeholder, ...extra });
  return i;
}

function buildTable(container, kind) {
  const table = el('table', { class: 'data-table' });
  const thead = el('thead');
  const trh = el('tr');
  ['Date', 'Compte', 'Montant', 'Famille', 'Précision', 'Paiement', ''].forEach(h => trh.appendChild(el('th', {}, h)));
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
  const sAcc = select(ACCOUNTS, 'perso');
  tdAcc.appendChild(sAcc);

  const tdAmt = el('td');
  const iAmt = input('number', '0.00', { step: '0.01' });
  tdAmt.appendChild(iAmt);

  const tdCat = el('td');
  const iCat = input('text', 'Famille');
  tdCat.appendChild(iCat);

  const tdLab = el('td');
  const iLab = input('text', 'Précision');
  tdLab.appendChild(iLab);

  const tdPay = el('td');
  const sPay = select(PAYMENTS, 'card');
  tdPay.appendChild(sPay);

  const tdDel = el('td');
  const delBtn = el('button', { class: 'icon-btn', type: 'button', title: 'Supprimer' }, '✕');
  delBtn.addEventListener('click', () => tr.remove());
  tdDel.appendChild(delBtn);

  tr.appendChild(tdDate);
  tr.appendChild(tdAcc);
  tr.appendChild(tdAmt);
  tr.appendChild(tdCat);
  tr.appendChild(tdLab);
  tr.appendChild(tdPay);
  tr.appendChild(tdDel);

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

    const cat = (category || '').trim();
    const lab = (label || '').trim();

    let type = (kind === 'expense') ? 'DEPENSE' : 'ENTREE';
    if (kind === 'income' && cat.toLowerCase() === 'salaire') type = 'SALAIRE';

    const amount = (type === 'DEPENSE') ? -Math.abs(amountNum) : Math.abs(amountNum);

    result.push({
      account,
      date,
      amount,
      type,
      status: 'SAISIE_MANUELLE',
      category: cat,
      label: lab,
      paymentMethod
    });
  }

  return result;
}

export function initSaisieUI() {
  const page = document.querySelector('.page[data-page="saisie"]');
  if (!page) return;

  const expContainer = page.querySelector('[data-expenses]');
  const incContainer = page.querySelector('[data-incomes]');
  if (!expContainer || !incContainer) return;

  const expBody = buildTable(expContainer, 'expense');
  const incBody = buildTable(incContainer, 'income');

  page.querySelector('[data-add-expense]')?.addEventListener('click', () => addRow(expBody, 'expense'));
  page.querySelector('[data-add-income]')?.addEventListener('click', () => addRow(incBody, 'income'));

  page.querySelector('[data-save-all]')?.addEventListener('click', async () => {
    const movements = [
      ...readRows(expBody, 'expense'),
      ...readRows(incBody, 'income')
    ];
    if (movements.length === 0) return;

    for (const m of movements) {
      await addMovementWithTriggers(m);
    }

    // reset
    expBody.innerHTML = '';
    incBody.innerHTML = '';
    addRow(expBody, 'expense');
    addRow(incBody, 'income');
  });
}
