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

function netColor(n) {
  return n < 0 ? '#ff6b6b' : '#6ee7b7';
}

/* ==================== Totaux ==================== */

async function computeTotals() {
  const movements = await all(STORES.MOVEMENTS);
  const currentMonth = todayISO().slice(0, 7);

  const sum = () => ({ in: 0, out: 0 });
  const pack = t => ({ in: t.in, out: Math.abs(t.out), net: t.in + t.out });

  const monthAll = sum();
  const allAll = sum();

  const byAccMonth = { perso: sum(), commun: sum(), internet: sum(), cash: sum() };
  const byAccAll   = { perso: sum(), commun: sum(), internet: sum(), cash: sum() };

  for (const m of movements) {
    const amt = Number(m.amount || 0);
    const acc = m.account;

    // global
    if (amt > 0) allAll.in += amt;
    if (amt < 0) allAll.out += amt;
    if (byAccAll[acc]) {
      if (amt > 0) byAccAll[acc].in += amt;
      if (amt < 0) byAccAll[acc].out += amt;
    }

    // mois courant
    if (m.financialMonth === currentMonth) {
      if (amt > 0) monthAll.in += amt;
      if (amt < 0) monthAll.out += amt;
      if (byAccMonth[acc]) {
        if (amt > 0) byAccMonth[acc].in += amt;
        if (amt < 0) byAccMonth[acc].out += amt;
      }
    }
  }

  const mapPack = o => {
    const r = {};
    Object.keys(o).forEach(k => r[k] = pack(o[k]));
    return r;
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
  const label = acc === 'all'
    ? 'Tous les comptes'
    : acc.charAt(0).toUpperCase() + acc.slice(1);

  const month = acc === 'all' ? t.monthAll : t.byAccMonth[acc];
  const all   = acc === 'all' ? t.allAll   : t.byAccAll[acc];

  const card = (title, x, subtitle = '') => `
    <div style="border:1px solid #2a2a2a;border-radius:14px;padding:10px;margin:8px 0;background:#0f0f0f;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <strong>${title}</strong>
        ${subtitle ? `<span class="muted" style="font-size:.9em;">${subtitle}</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;">
        <div style="text-align:center;">
          <div class="muted" style="font-size:.8em;">Entrées</div>
          <b>${eur(x.in)}</b>
        </div>
        <div style="text-align:center;">
          <div class="muted" style="font-size:.8em;">Sorties</div>
          <b>${eur(x.out)}</b>
        </div>
        <div style="text-align:center;">
          <div class="muted" style="font-size:.8em;">Net</div>
          <b style="color:${netColor(x.net)}">${eur(x.net)}</b>
        </div>
      </div>
    </div>
  `;

  totalsEl.innerHTML = `
    <div class="muted" style="margin:6px 0;">Contexte : <b>${label}</b></div>
    ${card('Mois courant', month, t.currentMonth)}
    ${card('Cumul global', all)}
  `;
}

/* ==================== Menu par compte ==================== */

function buildAccountMenu(state, onChange) {
  const wrap = el('div', { class: 'account-menu' });
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.flexWrap = 'wrap';
  wrap.style.margin = '10px 0';

  const accounts = [
    { value: 'all', label: 'Tous' },
    { value: 'perso', label: 'Perso' },
    { value: 'commun', label: 'Commun' },
    { value: 'internet', label: 'Internet' },
    { value: 'cash', label: 'Cash' }
  ];

  const mkBtn = (v, label) => {
    const b = el('button', { type: 'button' }, label);
    b.style.padding = '8px 10px';
    b.style.borderRadius = '999px';
    b.style.border = '1px solid #2a2a2a';
    b.style.background = state.selectedAccount === v ? '#1a1a1a' : '#0f0f0f';
    b.style.fontWeight = state.selectedAccount === v ? '800' : '600';
    b.style.cursor = 'pointer';

    b.addEventListener('click', () => {
      state.selectedAccount = v;
      refreshStyles();
      onChange();
    });
    wrap.appendChild(b);
    return b;
  };

  const buttons = accounts.map(a => mkBtn(a.value, a.label));

  function refreshStyles() {
    buttons.forEach((b, i) => {
      const v = accounts[i].value;
      b.style.background = state.selectedAccount === v ? '#1a1a1a' : '#0f0f0f';
      b.style.fontWeight = state.selectedAccount === v ? '800' : '600';
    });
  }

  wrap._refresh = refreshStyles;
  return wrap;
}

/* ==================== UI ==================== */

export function initRecurrentUI() {
  const page = document.querySelector('.page[data-page="recurrent"]');
  if (!page || page.hidden) return;

  // évite doublons
  page.querySelector('.account-menu')?.remove();
  page.querySelector('.recurrent-totals')?.remove();

  const container = page.querySelector('[data-recurrent]');
  if (!container) return;
  container.innerHTML = '';

  // --- AJOUT EXPORT/IMPORT ---
  let toolbar = page.querySelector('.recurrent-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'recurrent-toolbar';
    page.prepend(toolbar);
  }
  toolbar.innerHTML = '';

  // Bouton Export
  const btnExport = document.createElement('button');
  btnExport.textContent = "Exporter les récurrents";
  btnExport.onclick = async () => {
    const recurrents = await all(STORES.RECURRING);
    const blob = new Blob([JSON.stringify(recurrents, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recurrents-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  toolbar.appendChild(btnExport);

  // Bouton Import
  const btnImport = document.createElement('button');
  btnImport.textContent = "Importer des récurrents";
  btnImport.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      let recurrents;
      try {
        recurrents = JSON.parse(text);
      } catch (e) {
        alert("Fichier invalide !");
        return;
      }
      if (!Array.isArray(recurrents)) {
        alert("Format non reconnu.");
        return;
      }
      for (const r of recurrents) {
        if (r && r.id && r.account && r.day && r.amount) {
          await put(STORES.RECURRING, r);
        }
      }
      alert("Import terminé !");
      location.reload();
    };
    input.click();
  };
  toolbar.appendChild(btnImport);
  // --- FIN EXPORT/IMPORT ---

  const state = { selectedAccount: 'all' };

  const menu = buildAccountMenu(state, async () => {
    const t = await computeTotals();
    renderTotals(totals, state, t);
  });
  page.insertBefore(menu, container);

  const totals = el('div', { class: 'recurrent-totals' }, 'Chargement…');
  page.insertBefore(totals, container);

  (async () => {
    const t = await computeTotals();
    renderTotals(totals, state, t);
  })();

  /* ---------- Formulaire & liste (inchangés) ---------- */

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

        const badgeApply = el(
          'span',
          { class: 'badge' },
          item.active === false ? '⏸ Inactif' : '✅ Appliqué au prochain salaire'
        );

        badgeApply.style.borderColor = item.active === false ? '#555' : '#2f7f55';
        badgeApply.style.color = item.active === false ? '#aaa' : '#6ee7b7';

        meta.append(
          el('span', { class: 'badge' }, item.account),
          el('span', { class: 'badge' }, `Jour ${item.day}`),
          el('span', { class: 'badge' }, item.category || '—'),
          el('span', { class: 'badge' }, item.paymentMethod || '—'),
          badgeApply
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
    renderTotals(totals, state, t);

    iDay.value = '';
    iAmt.value = '';
    iCat.value = '';
    iLab.value = '';

    refresh();
  });

  refresh();
}
