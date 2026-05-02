// ui-archives.js
import { getAllMovements } from './db.js';

function isCounted(m) {
  return m && (m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');
}

function formatEUR(v) {
  return v.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return d;
  }
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
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
  const container = document.querySelector('[data-archives]');
  if (!container) return;

  const allMovements = (await getAllMovements()).filter(isCounted);

  // Mois budgétaires disponibles
  const months = Array.from(
    new Set(allMovements.map(m => m.financialMonth))
  ).sort();

  /* ===== Header ===== */
  const header = document.createElement('div');
  header.className = 'archives-header';

  const monthSelect = document.createElement('select');
  monthSelect.className = 'archives-select';

  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'Tous les mois';
  monthSelect.appendChild(optAll);

  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    monthSelect.appendChild(opt);
  });

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-primary';
  exportBtn.textContent = 'Exporter JSON';

  header.appendChild(monthSelect);
  header.appendChild(exportBtn);

  /* ===== Liste ===== */
  const list = document.createElement('div');
  list.className = 'archives-list';

  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(list);

  function render() {
    list.innerHTML = '';
    const selected = monthSelect.value;

    const filtered = selected === 'all'
      ? allMovements
      : allMovements.filter(m => m.financialMonth === selected);

    if (!filtered.length) {
      list.innerHTML =
        `<div class="muted">Aucune donnée pour ce mois.</div>`;
      return;
    }

    filtered
      .sort((a, b) =>
        (a.financialMonth + a.date).localeCompare(b.financialMonth + b.date)
      )
      .forEach(m => {
        const row = document.createElement('div');
        row.className = 'archive-row';

        row.innerHTML = `
          <div class="ar-main">
            <span class="ar-date">${formatDate(m.date)}</span>
            <span class="ar-label">${m.label || '(sans libellé)'}</span>
            <span class="ar-cat">${m.category || '—'}</span>
          </div>
          <div class="ar-side">
            <span class="ar-acc">${m.account}</span>
            <span class="ar-amt ${m.amount < 0 ? 'neg' : 'pos'}">
              ${formatEUR(m.amount)}
            </span>
          </div>
        `;
        list.appendChild(row);
      });
  }

  exportBtn.addEventListener('click', () => {
    const selected = monthSelect.value;
    const data = selected === 'all'
      ? allMovements
      : allMovements.filter(m => m.financialMonth === selected);

    const name = selected === 'all'
      ? 'archives-completes.json'
      : `archives-${selected}.json`;

    downloadJSON(name, data);
  });

  monthSelect.addEventListener('change', render);
  render();
}
