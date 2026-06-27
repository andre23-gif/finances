// ui-saisie.js
import { addMovementWithTriggers } from './engine.js';

/* ==================== Constantes ==================== */

const ACCOUNTS = [
  { value: 'perso',    label: 'Perso' },
  { value: 'internet', label: 'Internet' },
  { value: 'commun',   label: 'Commun' },
  { value: 'cash',     label: 'Cash' }
];

const PAYMENTS = [
  { value: 'cash',     label: '💵 Cash' },
  { value: 'transfer', label: '🔁 Virement' },
  { value: 'card',     label: '💳 Carte' },
  { value: 'check',    label: '🧾 Chèque' }
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

function field(label, control) {
  const wrap = el('div', { class: 'saisie-field' });
  const l = el('label', { class: 'muted' }, label);
  wrap.appendChild(l);
  wrap.appendChild(control);
  return wrap;
}

/* ==================== Bloc de saisie ==================== */

/**
 * Crée un bloc de saisie (dépense ou recette) avec un bouton ✕ pour le supprimer.
 * onRemove : callback appelé quand l'utilisateur clique ✕.
 */
function buildMovementBlock(kind, onRemove) {
  const isExpense = kind === 'expense';

  const wrap = el('div', { class: 'saisie-card' });

  /* --- En-tête avec bouton suppression --- */
  const header = el('div', { class: 'saisie-card-header' });
  const title  = el('span', {}, isExpense ? 'Dépense' : 'Recette');
  const removeBtn = el('button', { type: 'button', class: 'btn-remove', title: 'Supprimer cette ligne' }, '✕');
  removeBtn.addEventListener('click', () => onRemove());
  header.appendChild(title);
  header.appendChild(removeBtn);
  wrap.appendChild(header);

  /* --- Champs --- */
  const iDate    = el('input', { type: 'date' });
  iDate.value    = todayISO();

  const sAccount = select(ACCOUNTS, 'perso');
  const iAmount  = el('input', { type: 'number', placeholder: '0.00', step: '0.01', inputmode: 'decimal' });
  const sPayment = select(PAYMENTS, isExpense ? 'card' : 'transfer');
  const iCategory = el('input', { type: 'text', placeholder: 'Famille' });
  const iLabel   = el('input', { type: 'text', placeholder: 'Précision' });

  wrap.appendChild(field('Date',               iDate));
  wrap.appendChild(field('Compte',             sAccount));
  wrap.appendChild(field('Montant',            iAmount));
  wrap.appendChild(field('Moyen de paiement',  sPayment));
  wrap.appendChild(field('Famille',            iCategory));
  wrap.appendChild(field('Précision',          iLabel));

  return {
    root: wrap,
    focus() { iAmount.focus(); },
    getValue() {
      const amountNum = Number(iAmount.value);
      if (!iDate.value || !sAccount.value || !amountNum) return null;

      let type = isExpense ? 'DEPENSE' : 'ENTREE';
      if (!isExpense && (iCategory.value || '').trim().toLowerCase() === 'salaire') {
        type = 'SALAIRE';
      }

      const amount = type === 'DEPENSE' ? -Math.abs(amountNum) : Math.abs(amountNum);

      return {
        account:       sAccount.value,
        date:          iDate.value,
        amount,
        type,
        status:        'SAISIE_MANUELLE',
        category:      (iCategory.value || '').trim(),
        label:         (iLabel.value || '').trim(),
        paymentMethod: sPayment.value
      };
    }
  };
}

/* ==================== Gestionnaire de liste ==================== */

/**
 * Gère une liste dynamique de blocs de saisie (dépenses ou recettes).
 * - addBlock()  : ajoute un nouveau bloc vide et scrolle dessus
 * - getValues() : retourne les valeurs valides de tous les blocs
 * - clear()     : supprime tous les blocs sauf un vide
 */
function buildBlockList(kind, container) {
  const blocks = [];

  function removeBlock(block) {
    const idx = blocks.indexOf(block);
    if (idx === -1) return;
    blocks.splice(idx, 1);
    block.root.remove();
    // Toujours garder au moins un bloc vide
    if (!blocks.length) addBlock();
  }

  function addBlock() {
    const block = buildMovementBlock(kind, () => removeBlock(block));
    blocks.push(block);
    container.appendChild(block.root);
    block.focus();
    block.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return block;
  }

  function getValues() {
    return blocks.map(b => b.getValue()).filter(Boolean);
  }

  function clear() {
    blocks.forEach(b => b.root.remove());
    blocks.length = 0;
    addBlock();
  }

  // Bloc initial
  addBlock();

  return { addBlock, getValues, clear };
}

/* ==================== UI principale ==================== */

export function initSaisieUI() {
  const page = document.querySelector('.page[data-page="saisie"]');
  if (!page) return;

  const expContainer = page.querySelector('[data-expenses]');
  const incContainer = page.querySelector('[data-incomes]');
  if (!expContainer || !incContainer) return;

  expContainer.innerHTML = '';
  incContainer.innerHTML = '';

  const expList = buildBlockList('expense', expContainer);
  const incList = buildBlockList('income',  incContainer);

  /* --- Boutons toolbar --- */
  const addExpenseBtn = page.querySelector('[data-add-expense]');
  const addIncomeBtn  = page.querySelector('[data-add-income]');
  const saveBtn       = page.querySelector('[data-save-all]');

  addExpenseBtn?.addEventListener('click', () => expList.addBlock());
  addIncomeBtn?.addEventListener('click',  () => incList.addBlock());

  /* --- Feedback --- */
  let feedbackEl = page.querySelector('.saisie-feedback');
  if (!feedbackEl) {
    feedbackEl = el('div', { class: 'saisie-feedback muted' });
    feedbackEl.style.margin = '8px 0';
    saveBtn?.parentElement?.insertAdjacentElement('afterend', feedbackEl);
  }

  function showFeedback(msg, isError = false) {
    feedbackEl.textContent = msg;
    feedbackEl.style.color = isError ? '#ff6b6b' : '#6ee7b7';
    setTimeout(() => { feedbackEl.textContent = ''; }, 4000);
  }

  /* --- Validation & enregistrement --- */
  saveBtn?.addEventListener('click', async () => {
    const values = [
      ...expList.getValues(),
      ...incList.getValues()
    ];

    if (!values.length) {
      showFeedback('Aucune ligne valide à enregistrer.', true);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement…';

    try {
      for (const m of values) {
        await addMovementWithTriggers(m);
      }
      showFeedback(`${values.length} mouvement(s) enregistré(s).`);
      expList.clear();
      incList.clear();
    } catch (err) {
      console.error('[saisie]', err);
      showFeedback(err.message || 'Erreur lors de l\'enregistrement.', true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Valider tout';
    }
  });
}
