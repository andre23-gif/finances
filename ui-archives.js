// ui-archives.js
import { all, STORES } from './db.js';

function eur(value) {
  const v = Number(value || 0);
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  URL.revokeObjectURL(url);
  a.remove();
}

export async function initArchivesUI() {
  const page = document.querySelector('.page[data-page="archives"]');
  if (!page || page.hidden) return;

  const container = page.querySelector('[data-archives]');
  if (!container) return;

  const movements = await all(STORES.MOVEMENTS);

  const counted = movements.filter(m =>
    !m.status || m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE'
  );

  const months = Array.from(new Set(counted.map(m => m.financialMonth).filter(Boolean))).sort();

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'archives-header';

  const select = document.createElement('select');
  select.className = 'archives-select';

  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'Tous les mois';
  select.appendChild(optAll);

  for (const m of months) {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    select.appendChild(o);
  }

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-primary';
  exportBtn.type = 'button';
  exportBtn.textContent = 'Exporter JSON';

const importBtn = document.createElement('button');
importBtn.className = 'btn-secondary';
importBtn.type = 'button';
importBtn.textContent = 'Importer JSON';

header.appendChild(select);
header.appendChild(importBtn);
header.appendChild(exportBtn);

  const list = document.createElement('div');
  list.className = 'archives-list';

  container.appendChild(header);
  container.appendChild(list);

  function render() {
    list.innerHTML = '';
    const fm = select.value;

    const data = (fm === 'all') ? counted : counted.filter(m => m.financialMonth === fm);

    if (!data.length) {
      list.innerHTML = '<div class="muted">Aucune donnée.</div>';
      return;
    }

    data
      .slice()
      .sort((a, b) => {
        const ak = `${String(a.financialMonth)}|${String(a.date)}|${String(a.label || '')}`;
        const bk = `${String(b.financialMonth)}|${String(b.date)}|${String(b.label || '')}`;
        return ak.localeCompare(bk);
      })
      .forEach(m => {
        const row = document.createElement('div');
        row.className = 'archive-row';

        const label = m.label || '(sans libellé)';
        const cat = m.category || '—';
        const acc = m.account || '—';
        const date = m.date || '—';
        const amt = Number(m.amount || 0);

        row.innerHTML = `
          <div class="ar-main">
            <span class="ar-date">${date}</span>
            <span class="ar-label">${label}</span>
            <span class="ar-cat">${cat}</span>
          </div>
          <div class="ar-side">
            <span class="ar-acc">${acc}</span>
            <span class="ar-amt ${amt < 0 ? 'neg' : 'pos'}">${eur(amt)}</span>
          </div>
        `;

        list.appendChild(row);
      });
  }
importBtn.addEventListener('click', async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (!Array.isArray(imported)) {
        alert('Import refusé : le fichier doit contenir un tableau JSON.');
        return;
      }

      // 1) Vider complètement le store MOVEMENTS
      const existing = await all(STORES.MOVEMENTS);
      for (const m of existing) {
        await del(STORES.MOVEMENTS, m.id);
      }

      // 2) Réinsérer les mouvements importés
      for (const m of imported) {
        if (!m.id) {
          alert('Import refusé : chaque mouvement doit avoir un champ "id".');
          return;
        }
        await put(STORES.MOVEMENTS, m);
      }

      alert('Import JSON terminé (remplacement total).');

      // 3) Rafraîchir la page Archives
      initArchivesUI();

    } catch (e) {
      console.error(e);
      alert('Erreur lors de la lecture du fichier JSON.');
    }
  };

  input.click();
});
  exportBtn.addEventListener('click', () => {
    const fm = select.value;
    const data = (fm === 'all') ? counted : counted.filter(m => m.financialMonth === fm);
    const name = (fm === 'all') ? 'archives-completes.json' : `archives-${fm}.json`;
    downloadJSON(name, data);
  });

  select.addEventListener('change', render);
  render();
}
