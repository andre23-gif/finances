// ui-recurrent.js
import { add, put, del, all, putMany, STORES } from './db.js';

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

/* ==================== Mois financier courant ==================== */

/**
 * Retourne le mois financier courant = le plus récent présent dans MOVEMENTS.
 * Fallback sur le mois civil si aucun mouvement.
 */
async function getCurrentFinancialMonth() {
  const movements = await all(STORES.MOVEMENTS);
  const months = Array.from(
    new Set(movements.map(m => m.financialMonth).filter(Boolean))
  ).sort();
  return months.length ? months[months.length - 1] : todayISO().slice(0, 7);
}

/**
 * Retourne un Set des recurrenceId déjà appliqués pour un mois financier donné.
 */
async function getAppliedRecurrenceIds(financialMonth) {
  const movements = await all(STORES.MOVEMENTS);
  const ids = new Set();
  movements
    .filter(m => m.financialMonth === financialMonth && m.origin === 'RECURRENTE')
    .forEach(m => ids.add(m.recurrenceId));
  return ids;
}

/* ==================== Totaux ==================== */

async function computeTotals() {
  const movements = await all(STORES.MOVEMENTS);

  // FIX : on utilise le mois financier courant, pas le mois civil
  const fm = await getCurrentFinancialMonth();

  const sum = () => ({ in: 0, out: 0 });
  const pack = t => ({ in: t.in, out: Math.abs(t.out), net: t.in + t.out });

  const monthAll = sum();
  const allAll   = sum();

  const byAccMonth = { perso: sum(), commun: sum(), internet: sum(), cash: sum() };
  const byAccAll   = { perso: sum(), commun: sum(), internet: sum(), cash: sum() };

  for (const m of movements) {
    const amt = Number(m.amount || 0);
    const acc = m.account;

    if (amt > 0) allAll.in  += amt;
    if (amt < 0) allAll.out += amt;
    if (byAccAll[acc]) {
      if (amt > 0) byAccAll[acc].in  += amt;
      if (amt < 0) byAccAll[acc].out += amt;
    }

    if (m.financialMonth === fm) {
      if (amt > 0) monthAll.in  += amt;
      if (amt < 0) monthAll.out += amt;
      if (byAccMonth[acc]) {
        if (amt > 0) byAccMonth[acc].in  += amt;
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
    financialMonth: fm,
    monthAll:   pack(monthAll),
    allAll:     pack(allAll),
    byAccMonth: mapPack(byAccMonth),
    byAccAll:   mapPack(byAccAll)
  };
}

function renderTotals(totalsEl, state, t) {
  const acc   = state.selectedAccount;
  const label = acc === 'all'
    ? 'Tous les comptes'
    : acc.charAt(0).toUpperCase() + acc.slice(1);

  const month = acc === 'all' ? t.monthAll : t.byAccMonth[acc];
  const glob  = acc === 'all' ? t.allAll   : t.byAccAll[acc];

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
    ${card('Mois financier courant', month, t.financialMonth)}
    ${card('Cumul global', glob)}
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
    { value: 'all',      label: 'Tous' },
    { value: 'perso',    label: 'Perso' },
    { value: 'commun',   label: 'Commun' },
    { value: 'internet', label: 'Internet' },
    { value: 'cash',     label: 'Cash' }
  ];

  const mkBtn = (v, label) => {
    const b = el('button', { type: 'button' }, label);
    b.style.padding = '8px 10px';
    b.style.borderRadius = '999px';
    b.style.border = '1px solid #2a2a2a';
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
      b.style.background  = state.selectedAccount === v ? '#1a1a1a' : '#0f0f0f';
      b.style.fontWeight  = state.selectedAccount === v ? '800'     : '600';
    });
  }

  refreshStyles();
  wrap._refresh = refreshStyles;
  return wrap;
}

/* ==================== UI ==================== */

export function initRecurrentUI() {
  const page = document.querySelector('.page[data-page="recurrent"]');
  if (!page || page.hidden) return;

  page.querySelector('.account-menu')?.remove();
  page.querySelector('.recurrent-totals')?.remove();

  const container = page.querySelector('[data-recurrent]');
  if (!container) return;
  container.innerHTML = '';

  /* ---------- Toolbar export / import ---------- */
  let toolbar = page.querySelector('.recurrent-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'recurrent-toolbar';
    page.prepend(toolbar);
  }
  toolbar.innerHTML = '';

  // Feedback toolbar
  const tbFeedback = el('span', { class: 'muted' });
  tbFeedback.style.fontSize = '13px';
  tbFeedback.style.marginLeft = '10px';

  function showTbFeedback(msg, isError = false) {
    tbFeedback.textContent = msg;
    tbFeedback.style.color = isError ? '#ff6b6b' : '#6ee7b7';
    setTimeout(() => { tbFeedback.textContent = ''; }, 4000);
  }

  const btnExport = document.createElement('button');
  btnExport.textContent = 'Exporter les récurrents';
  btnExport.onclick = async () => {
    const recurrents = await all(STORES.RECURRING);
    const blob = new Blob([JSON.stringify(recurrents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recurrents-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    showTbFeedback(`${recurrents.length} récurrent(s) exporté(s).`);
  };

  const btnImport = document.createElement('button');
  btnImport.textContent = 'Importer des récurrents';
  btnImport.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const recurrents = JSON.parse(text);
        if (!Array.isArray(recurrents)) {
          showTbFeedback('Format non reconnu.', true);
          return;
        }
        const valid = recurrents.filter(r => r && r.id && r.account && r.day && r.amount);
        // FIX : putMany atomique au lieu d'une boucle de put
        await putMany(STORES.RECURRING, valid);
        showTbFeedback(`${valid.length} récurrent(s) importé(s).`);
        refresh();
      } catch (err) {
        console.error(err);
        showTbFeedback('Fichier invalide.', true);
      }
    };
    input.click();
  };

  toolbar.append(btnExport, btnImport, tbFeedback);

  /* ---------- Menu compte + totaux ---------- */
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

  /* ---------- Formulaire d'ajout ---------- */

  const ACCOUNTS = [
    { value: 'perso',    label: 'Compte perso' },
    { value: 'internet', label: 'Compte internet' },
    { value: 'commun',   label: 'Compte commun' },
    { value: 'cash',     label: 'Compte cash' }
  ];

  const PAYMENTS = [
    { value: 'transfer', label: 'Virement' },
    { value: 'card',     label: 'Carte' },
    { value: 'cash',     label: 'Cash' },
    { value: 'check',    label: 'Chèque' }
  ];

  const form = el('div', { class: 'recurrent-form' });

  const sAcc = select(ACCOUNTS, 'perso');
  const iDay = el('input', { type: 'number', min: '1', max: '31', placeholder: 'Jour (1-31)' });
  const iAmt = el('input', { type: 'number', step: '0.01', placeholder: 'Montant' });
  const iCat = el('input', { type: 'text', placeholder: 'Catégorie' });
  const iLab = el('input', { type: 'text', placeholder: 'Libellé' });
  const sPay = select(PAYMENTS, 'transfer');

  const addBtn    = el('button', { class: 'btn-primary', type: 'button' }, 'Ajouter');
  const formHint  = el('div', { class: 'muted' }, 'Astuce : le montant est stocké en dépense (valeur négative).');
  const formFeedback = el('div', { class: 'muted' });
  formFeedback.style.fontSize = '13px';

  function showFormFeedback(msg, isError = false) {
    formFeedback.textContent = msg;
    formFeedback.style.color = isError ? '#ff6b6b' : '#6ee7b7';
    setTimeout(() => { formFeedback.textContent = ''; }, 3000);
  }

  form.append(sAcc, iDay, iAmt, iCat, iLab, sPay, addBtn, formHint, formFeedback);

  /* ---------- Liste des récurrents ---------- */

  const list = el('div', { class: 'recurrent-list' });
  container.append(form, list);

  async function refresh() {
    list.innerHTML = '';
    const [items, fm] = await Promise.all([
      all(STORES.RECURRING),
      getCurrentFinancialMonth()
    ]);

    // FIX : on récupère les ids réellement appliqués ce mois-ci
    const appliedIds = await getAppliedRecurrenceIds(fm);

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

        // FIX badge : état réel basé sur les mouvements, pas juste sur item.active
        let badgeText, badgeBorder, badgeColor;
        if (item.active === false) {
          badgeText   = '⏸ Inactif';
          badgeBorder = '#555';
          badgeColor  = '#aaa';
        } else if (appliedIds.has(item.id)) {
          badgeText   = `✅ Appliqué (${fm})`;
          badgeBorder = '#2f7f55';
          badgeColor  = '#6ee7b7';
        } else {
          badgeText   = '⏳ En attente du prochain salaire';
          badgeBorder = '#7f6f2f';
          badgeColor  = '#e7c76e';
        }

        const badgeApply = el('span', { class: 'badge' }, badgeText);
        badgeApply.style.borderColor = badgeBorder;
        badgeApply.style.color       = badgeColor;

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
          item.active = item.active !== false;
          await put(STORES.RECURRING, item);
          refresh();
        });

        const remove = el('button', { class: 'btn-secondary', type: 'button' }, 'Supprimer');
        remove.addEventListener('click', async () => {
          if (!confirm(`Supprimer "${item.label || item.id}" ?`)) return;
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

    if (!day || day < 1 || day > 31) {
      showFormFeedback('Jour invalide (1-31).', true);
      return;
    }
    if (!amt || amt <= 0) {
      showFormFeedback('Montant invalide.', true);
      return;
    }

    const tpl = {
      id:            uid(),
      account:       sAcc.value,
      day,
      amount:        -Math.abs(amt),
      category:      (iCat.value || '').trim(),
      label:         (iLab.value || '').trim(),
      paymentMethod: sPay.value,
      active:        true,
      createdAt:     new Date().toISOString()
    };

    try {
      await add(STORES.RECURRING, tpl);
      showFormFeedback(`"${tpl.label || tpl.id}" ajouté.`);

      const t = await computeTotals();
      renderTotals(totals, state, t);

      iDay.value = '';
      iAmt.value = '';
      iCat.value = '';
      iLab.value = '';

      refresh();
    } catch (err) {
      console.error(err);
      showFormFeedback('Erreur lors de l\'ajout.', true);
    }
  });

  refresh();
}
