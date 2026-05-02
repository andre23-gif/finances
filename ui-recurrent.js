// ui-recurrent.js
import { addItem, getAll, putItem, deleteItem, STORES } from './db.js';

const { STORE_RECURRING } = STORES;

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

export function initRecurrentUI() {
  const page = document.querySelector('.page[data-page="recurrent"]');
  if (!page) return;

  const container = page.querySelector('[data-recurrent]');
  if (!container) return;

  container.innerHTML = '';

  const form = el('div', { class: 'recurrent-form' });

  const sAcc = select(ACCOUNTS, 'perso');
  const iDay = el('input', { type: 'number', min: '1', max: '31', placeholder: 'Jour (1-31)' });
  const iAmt = el('input', { type: 'number', step: '0.01', placeholder: 'Montant (ex: 49.99)' });
  const iCat = el('input', { type: 'text', placeholder: 'Catégorie' });
  const iLab = el('input', { type: 'text', placeholder: 'Libellé' });
  const sPay = select(PAYMENTS, 'transfer');

  const addBtn = el('button', { class: 'btn-primary', type: 'button' }, 'Ajouter');

  form.appendChild(sAcc);
  form.appendChild(iDay);
  form.appendChild(iAmt);
  form.appendChild(iCat);
  form.appendChild(iLab);
  form.appendChild(sPay);
  form.appendChild(addBtn);

  const list = el('div', { class: 'recurrent-list' });

  container.appendChild(form);
  container.appendChild(list);

  async function refresh() {
    list.innerHTML = '';
    const items = await getAll(STORE_RECURRING);

    if (!items.length) {
      list.appendChild(el('div', { class: 'muted' }, 'Aucun prélèvement enregistré.'));
      return;
    }

    items
      .slice()
      .sort((a,b) => (a.account + String(a.day).padStart(2,'0')).localeCompare(b.account + String(b.day).padStart(2,'0')))
      .forEach(item => {
        const row = el('div', { class: 'recurrent-item' });

        const left = el('div');
        left.appendChild(el('div', { class: 'ri-label' }, item.label || '(sans libellé)'));
        const meta = el('div', { class: 'ri-meta' });
        meta.appendChild(el('span', { class: 'badge' }, item.account));
        meta.appendChild(el('span', { class: 'badge' }, `Jour ${item.day}`));
        meta.appendChild(el('span', { class: 'badge' }, item.category || '—'));
        meta.appendChild(el('span', { class: 'badge' }, item.paymentMethod || '—'));
        left.appendChild(meta);

        const right = el('div', { class: 'ri-side' });
        right.appendChild(el('div', { class: 'ri-amount' }, `${item.amount} €`));

        const toggle = el('button', { class: 'btn-secondary', type: 'button' }, item.active === false ? 'Activer' : 'Désactiver');
        toggle.addEventListener('click', async () => {
          item.active = item.active === false ? true : false;
          await putItem(STORE_RECURRING, item);
          refresh();
        });

        const del = el('button', { class: 'btn-secondary', type: 'button' }, 'Supprimer');
        del.addEventListener('click', async () => {
          await deleteItem(STORE_RECURRING, item.id);
          refresh();
        });

        right.appendChild(toggle);
        right.appendChild(del);

        row.appendChild(left);
        row.appendChild(right);
        list.appendChild(row);
      });
  }

  addBtn.addEventListener('click', async () => {
    const day = Number(iDay.value);
    const amt = Number(iAmt.value);

    if (!day || day < 1 || day > 31) return;
    if (!amt || amt <= 0) return;

    await addItem(STORE_RECURRING, {
      id: uid(),
      account: sAcc.value,
      day,
      amount: -Math.abs(amt),
      category: (iCat.value || '').trim(),
      label: (iLab.value || '').trim(),
      paymentMethod: sPay.value,
      active: true,
      createdAt: new Date().toISOString()
    });

    iDay.value = '';
    iAmt.value = '';
    iCat.value = '';
    iLab.value = '';

    refresh();
  });

  refresh();
}
