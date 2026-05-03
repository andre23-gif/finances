// ui-recurrent.js
import { add, put, del, all, STORES } from './db.js';

/* ---------- Utils ---------- */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function eur(value) {
  const v = Number(value || 0);
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
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

/* ---------- Totaux ---------- */

async function computeTotals() {
  const movements = await all(STORES.MOVEMENTS);
  const currentMonth = todayISO().slice(0, 7);

  const sum = () => ({ in: 0, out: 0 });
  const month = sum();
  const allTime = sum();

  for (const m of movements) {
    const amt = Number(m.amount || 0);

    if (amt > 0) {
      allTime.in += amt;
      if (m.financialMonth === currentMonth) month.in += amt;
    }
    if (amt < 0) {
      allTime.out += amt;
      if (m.financialMonth === currentMonth) month.out += amt;
    }
  }

  return {
    month: {
      in: month.in,
      out: Math.abs(month.out),
      net: month.in + month.out
    },
    all: {
      in: allTime.in,
      out: Math.abs(allTime.out),
      net: allTime.in + allTime.out
    }
  };
}

/* ---------- UI ---------- */

export function initRecurrentUI() {
  const page = document.querySelector('.page[data-page="recurrent"]');
  if (!page || page.hidden) return;

  const container = page.querySelector('[data-recurrent]');
  if (!container) return;

  container.innerHTML = '';

  /* ---------- Totaux en haut ---------- */
  const totals = el('div', { class: 'recurrent-totals' });
  totals.innerHTML = '<div class="muted">Chargement des totaux…</div>';
  page.insertBefore(totals, container);

  (async () => {
    const t = await computeTotals();
    totals.innerHTML = `
      <div class="totals-block">
        <strong>Mois courant</strong>
        <div>Entrées : ${eur(t.month.in)}</div>
        <div>Sorties : ${eur(t.month.out)}</div>
        <div><b>Net : ${eur(t.month.net)}</b></div>
      </div>
      <div class="totals-block">
        <strong>Cumul global</strong>
        <div>Entrées : ${eur(t.all.in)}</div>
        <div>Sorties : ${eur(t.all.out)}</div>
        <div><b>Net : ${eur(t.all.net)}</b></div>
      </div>
    `;
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

    iDay.value = '';
    iAmt.value = '';
    iCat.value = '';
    iLab.value = '';

    refresh();
  });

  refresh();
}
