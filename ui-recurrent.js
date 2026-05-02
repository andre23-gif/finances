// ui-recurrent.js
import { add, all } from './db.js';

/**
 * UI des dépenses mensuelles (templates)
 * Stockage dans le store "recurring"
 *
 * Un template ressemble à :
 * {
 *   id: string,
 *   account: "perso"|"internet"|"commun"|"cash",
 *   day: number (1..31),
 *   amount: number (négatif),
 *   category: string,
 *   label: string,
 *   paymentMethod: "transfer"|"card"|"cash"|"check",
 *   active: boolean
 * }
 */

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

const uid = () => (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function createSelect(options, className) {
  const s = document.createElement('select');
  s.className = className;
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    s.appendChild(opt);
  });
  return s;
}

function createInput(type, placeholder, className) {
  const i = document.createElement('input');
  i.type = type;
  i.placeholder = placeholder;
  i.className = className;
  return i;
}

function rowTemplateItem(tpl) {
  const div = document.createElement('div');
  div.className = 'recurrent-item';
  div.innerHTML = `
    <div class="ri-main">
      <div class="ri-label">${tpl.label || '(sans libellé)'}</div>
      <div class="ri-meta">
        <span>${tpl.account}</span>
        <span>Jour ${tpl.day}</span>
        <span>${tpl.category || '—'}</span>
        <span>${tpl.paymentMethod || '—'}</span>
      </div>
    </div>
    <div class="ri-side">
      <div class="ri-amount">${tpl.amount} €</div>
      <div class="ri-active">${tpl.active ? 'Actif' : 'Inactif'}</div>
    </div>
  `;
  return div;
}

export function initRecurrentUI() {
  const container = document.querySelector('[data-recurrent]');
  if (!container) return;

  container.innerHTML = '';

  // --- Formulaire ajout ---
  const form = document.createElement('div');
  form.className = 'recurrent-form';

  const account = createSelect(ACCOUNTS, 'rf-account');
  const day = createInput('number', 'Jour (1-31)', 'rf-day');
  day.min = '1'; day.max = '31';

  const amount = createInput('number', 'Montant (ex: 49.99)', 'rf-amount');
  amount.step = '0.01';

  const category = createInput('text', 'Catégorie', 'rf-category');
  const label = createInput('text', 'Libellé', 'rf-label');
  const payment = createSelect(PAYMENTS, 'rf-payment');

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-primary';
  addBtn.type = 'button';
  addBtn.textContent = 'Ajouter';

  const info = document.createElement('div');
  info.className = 'muted';
  info.textContent = 'Astuce : le montant sera enregistré comme une dépense (valeur négative).';

  form.appendChild(account);
  form.appendChild(day);
  form.appendChild(amount);
  form.appendChild(category);
  form.appendChild(label);
  form.appendChild(payment);
  form.appendChild(addBtn);
  form.appendChild(info);

  // --- Liste ---
  const list = document.createElement('div');
  list.className = 'recurrent-list';

  container.appendChild(form);
  container.appendChild(list);

  async function refresh() {
    list.innerHTML = '';
    const templates = await all('recurring');
    if (!templates || templates.length === 0) {
      list.innerHTML = `<div class="muted">Aucun prélèvement enregistré.</div>`;
      return;
    }

    // tri : compte puis jour
    templates
      .slice()
      .sort((a, b) => (a.account + String(a.day).padStart(2, '0')).localeCompare(b.account + String(b.day).padStart(2, '0')))
      .forEach(tpl => {
        list.appendChild(rowTemplateItem(tpl));
      });
  }

  addBtn.addEventListener('click', async () => {
    // validations simples
    const d = Number(day.value);
    const a = Number(amount.value);

    if (!d || d < 1 || d > 31) return;
    if (!a || a <= 0) return;

    const tpl = {
      id: uid(),
      account: account.value,
      day: d,
      amount: -Math.abs(a),               // dépense
      category: category.value?.trim() || '',
      label: label.value?.trim() || '',
      paymentMethod: payment.value,
      active: true
    };

    await add('recurring', tpl);

    // reset minimal
    day.value = '';
    amount.value = '';
    category.value = '';
    label.value = '';

    await refresh();
  });

  // rendu initial
  refresh();
}

