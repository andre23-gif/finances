// ui-saisie.js
import { addMovementWithTriggers } from './engine.js';

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

function input(type, placeholder = '', extra = {}) {
  return el('input', { type, placeholder, ...extra });
}

function select(options, value) {
  const s = el('select');
  options.forEach(o => {
    s.appendChild(el('option', { value: o.value }, o.label));
  });
  if (value) s.value = value;
  return s;
}

function field(label, control) {
  const wrap = el('div', { class: 'saisie-field' });
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '6px';
  wrap.style.marginBottom = '10px';

  const l = el('label', { class: 'muted' }, label);
  l.style.fontSize = '0.9em';

  wrap.appendChild(l);
  wrap.appendChild(control);
  return wrap;
}

function card(title) {
  const wrap = el('div', { class: 'saisie-card' });
  wrap.style.border = '1px solid #2a2a2a';
  wrap.style.borderRadius = '14px';
  wrap.style.padding = '12px';
  wrap.style.margin = '12px 0';
  wrap.style.background = '#0f0f0f';

  const h = el('div', {}, title);
  h.style.fontWeight = '700';
  h.style.marginBottom = '10px';

  wrap.appendChild(h);
  return wrap;
}

/* ==================== Form blocs ==================== */

function buildMovementBlock(kind) {
  const isExpense = kind === 'expense';
  const wrap = card(isExpense ? '+ Dépense' : '+ Recette');

  const iDate = input('date');
  iDate.value = todayISO();

  const sAccount = select(ACCOUNTS, 'perso');
  const iAmount = input('number', '0.00', { step: '0.01', inputmode: 'decimal' });
  const sPayment = select(PAYMENTS, isExpense ? 'card' : 'transfer');
  const iCategory = input('text', 'Famille');
  const iLabel = input('text', 'Précision');

  wrap.appendChild(field('Date', iDate));
  wrap.appendChild(field('Compte', sAccount));
  wrap.appendChild(field('Montant', iAmount));
  wrap.appendChild(field('Moyen de paiement', sPayment));
  wrap.appendChild(field('Famille', iCategory));
  wrap.appendChild(field('Précision', iLabel));

  return {
    root: wrap,
    getValue() {
      const amountNum = Number(iAmount.value);

      if (!iDate.value || !sAccount.value || !amountNum) {
        return null;
      }

      let type = isExpense ? 'DEPENSE' : 'ENTREE';

      // Si la recette est catégorisée "salaire", on force le type SALAIRE
      if (!isExpense && (iCategory.value || '').trim().toLowerCase() === 'salaire') {
        type = 'SALAIRE';
      }

      const amount = type === 'DEPENSE'
        ? -Math.abs(amountNum)
        : Math.abs(amountNum);

      return {
        account: sAccount.value,
        date: iDate.value,
        amount,
        type,
        status: 'SAISIE_MANUELLE',
        category: (iCategory.value || '').trim(),
        label: (iLabel.value || '').trim(),
        paymentMethod: sPayment.value
      };
    },
    reset() {
      iDate.value = todayISO();
      sAccount.value = 'perso';
      iAmount.value = '';
      sPayment.value = isExpense ? 'card' : 'transfer';
      iCategory.value = '';
      iLabel.value = '';
    },
    focus() {
      iAmount.focus();
    }
  };
}

/* ==================== UI ==================== */

export function initSaisieUI() {
  const page = document.querySelector('.page[data-page="saisie"]');
  if (!page) return;

  const expContainer = page.querySelector('[data-expenses]');
  const incContainer = page.querySelector('[data-incomes]');
  if (!expContainer || !incContainer) return;

  // On vide les anciens contenus
  expContainer.innerHTML = '';
  incContainer.innerHTML = '';

  // On supprime les restes éventuels d’ancienne UI
  page.querySelector('.saisie-totals')?.remove();
  page.querySelector('.account-menu')?.remove();

  // Construire les deux blocs de saisie
  const expenseBlock = buildMovementBlock('expense');
  const incomeBlock = buildMovementBlock('income');

  expContainer.appendChild(expenseBlock.root);
  incContainer.appendChild(incomeBlock.root);

  // Boutons existants si déjà présents dans le HTML
  const addExpenseBtn = page.querySelector('[data-add-expense]');
  const addIncomeBtn = page.querySelector('[data-add-income]');
  const saveBtn = page.querySelector('[data-save-all]');

  // Comme on n’est plus en logique tableau multi-lignes,
  // les boutons + servent juste à remettre le focus / réinitialiser le bloc
  addExpenseBtn?.addEventListener('click', () => {
    expenseBlock.reset();
    expenseBlock.focus();
  });

  addIncomeBtn?.addEventListener('click', () => {
    incomeBlock.reset();
    incomeBlock.focus();
  });

  saveBtn?.addEventListener('click', async () => {
    const values = [
      expenseBlock.getValue(),
      incomeBlock.getValue()
    ].filter(Boolean);

    if (!values.length) return;

    for (const m of values) {
      await addMovementWithTriggers(m);
    }

    expenseBlock.reset();
    incomeBlock.reset();
    expenseBlock.focus();
  });
}
