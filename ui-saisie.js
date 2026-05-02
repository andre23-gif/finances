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

const TYPES_ALL = [
  { value: 'DEPENSE', label: 'Dépense' },
  { value: 'ENTREE', label: 'Recette' },
  { value: 'SALAIRE', label: 'Salaire' }
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function el(tag, attrs = {}, html = '') {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'hidden') n.hidden = !!v;
    else n.setAttribute(k, v);
  });
  if (html) n.innerHTML = html;
  return n;
}

function select(options, value) {
  const s = el('select');
  options.forEach(o => {
    const opt = el('option', { value: o.value });
    opt.textContent = o.label;
    s.appendChild(opt);
  });
  if (value) s.value = value;
  return s;
}

function numberInput(placeholder) {
  const i = el('input', { type: 'number', step: '0.01', placeholder });
  return i;
}

function textInput(placeholder) {
  return el('input', { type: 'text', placeholder });
}

function dateInput() {
  const i = el('input', { type: 'date' });
  i.value = todayISO();
  return i;
}

function buildTable(mode) {
  // mode: depenses | recettes | tous
  const wrap = el('div', { class: 'table-wrap' });

  const table = el('table', { class: 'data-table' });
  const thead = el('thead');
  const trh = el('tr');

  const cols = [
    'Date',
    'Compte',
    (mode === 'tous' ? 'Type' : ''),
    'Montant',
    'Famille',
    'Précision',
    'Paiement',
    ''
  ].filter(Boolean);

  cols.forEach(c => trh.appendChild(el('th', {}, c)));
  thead.appendChild(trh);

  const tbody = el('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);

  wrap.appendChild(table);

  return { wrap, tbody };
}

function addRow(tbody, mode) {
  const tr = el('tr');

  const tdDate = el('td');  const iDate = dateInput(); tdDate.appendChild(iDate);
  const tdAcc = el('td');   const sAcc = select(ACCOUNTS, 'perso'); tdAcc.appendChild(sAcc);

  let tdType = null;
  let sType = null;

  if (mode === 'tous') {
    tdType = el('td');
    sType = select(TYPES_ALL, 'DEPENSE');
    tdType.appendChild(sType);
  }

  const tdAmt = el('td');   const iAmt = numberInput('0.00'); tdAmt.appendChild(iAmt);
  const tdCat = el('td');   const iCat = textInput('Famille'); tdCat.appendChild(iCat);
  const tdLab = el('td');   const iLab = textInput('Précision'); tdLab.appendChild(iLab);
  const tdPay = el('td');   const sPay = select(PAYMENTS, 'card'); tdPay.appendChild(sPay);

  const tdDel = el('td');
  const btnDel = el('button', { class: 'icon-btn', type: 'button', title: 'Supprimer' }, '✕');
  btnDel.addEventListener('click', () => tr.remove());
  tdDel.appendChild(btnDel);

  tr.appendChild(tdDate);
  tr.appendChild(tdAcc);
  if (tdType) tr.appendChild(tdType);
  tr.appendChild(tdAmt);
  tr.appendChild(tdCat);
  tr.appendChild(tdLab);
  tr.appendChild(tdPay);
  tr.appendChild(tdDel);

  // petit hint visuel sur montant
  iAmt.addEventListener('input', () => {
    const v = Number(iAmt.value || 0);
    tr.classList.remove('row-neg', 'row-pos');
    if (!v) return;
    if (mode === 'depenses') tr.classList.add('row-neg');
    if (mode === 'recettes') tr.classList.add('row-pos');
    if (mode === 'tous') {
      const t = sType?.value;
      if (t === 'DEPENSE') tr.classList.add('row-neg');
      else tr.classList.add('row-pos'); // ENTREE ou SALAIRE
    }
  });

  tbody.appendChild(tr);
}

function readRows(tbody, mode) {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const movements = [];

  for (const tr of rows) {
    const inputs = tr.querySelectorAll('input, select');
    // ordre selon mode
    // depenses/recettes : date, account, amount, category, label, payment
    // tous : date, account, type, amount, category, label, payment
    const values = Array.from(inputs).map(x => x.value);

    if (mode === 'tous') {
      const [date, account, type, amountRaw, category, label, paymentMethod] = values;
      const amountNum = Number(amountRaw);
      if (!date || !account || !type || !amountNum) continue;

      const amount = (type === 'DEPENSE') ? -Math.abs(amountNum) : Math.abs(amountNum);

      movements.push({
        account,
        date,
        type,
        amount,
        status: 'SAISIE_MANUELLE',
        category: (category || '').trim(),
        label: (label || '').trim(),
        paymentMethod
      });
    } else {
      const [date, account, amountRaw, category, label, paymentMethod] = values;
      const amountNum = Number(amountRaw);
      if (!date || !account || !amountNum) continue;

      const type = (mode === 'depenses') ? 'DEPENSE' : 'ENTREE';
      const amount = (mode === 'depenses') ? -Math.abs(amountNum) : Math.abs(amountNum);

      movements.push({
        account,
        date,
        type,
        amount,
        status: 'SAISIE_MANUELLE',
        category: (category || '').trim(),
        label: (label || '').trim(),
        paymentMethod
      });
    }
  }

  return movements;
}

export function initSaisieUI() {
  const depPanel = document.querySelector('[data-panel="depenses"]');
  const recPanel = document.querySelector('[data-panel="recettes"]');
  const allPanel = document.querySelector('[data-panel="tous"]');

  if (!depPanel || !recPanel || !allPanel) return;

  // construire 3 tableaux
  const dep = buildTable('depenses');
  const rec = buildTable('recettes');
  const all = buildTable('tous');

  depPanel.appendChild(dep.wrap);
  recPanel.appendChild(rec.wrap);
  allPanel.appendChild(all.wrap);

  // lignes initiales
  addRow(dep.tbody, 'depenses');
  addRow(rec.tbody, 'recettes');
  addRow(all.tbody, 'tous');

  // gestion onglets
  const tabs = document.querySelectorAll('.tab[data-tab]');
  const panels = {
    depenses: depPanel,
    recettes: recPanel,
    tous: allPanel
  };

  let active = 'depenses';

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      const target = t.dataset.tab;
      if (!panels[target]) return;

      tabs.forEach(x => x.classList.toggle('active', x === t));
      Object.entries(panels).forEach(([k, p]) => p.hidden = (k !== target));
      active = target;
    });
  });

  // boutons actions
  const btnAdd = document.querySelector('[data-add-row]');
  const btnSave = document.querySelector('[data-save]');

  btnAdd?.addEventListener('click', () => {
    if (active === 'depenses') addRow(dep.tbody, 'depenses');
    else if (active === 'recettes') addRow(rec.tbody, 'recettes');
    else addRow(all.tbody, 'tous');
  });

  btnSave?.addEventListener('click', async () => {
    const allMovs = [
      ...readRows(dep.tbody, 'depenses'),
      ...readRows(rec.tbody, 'recettes'),
      ...readRows(all.tbody, 'tous')
    ];

    if (allMovs.length === 0) return;

    for (const m of allMovs) {
      // le moteur gère le cas SALAIRE -> déclenche récurrents (mois suivant)
      await addMovementWithTriggers(m);
    }

    // reset
    dep.tbody.innerHTML = ''; rec.tbody.innerHTML = ''; all.tbody.innerHTML = '';
    addRow(dep.tbody, 'depenses');
    addRow(rec.tbody, 'recettes');
    addRow(all.tbody, 'tous');
  });
}
