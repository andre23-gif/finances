// ui-archives.js
import { all, del, replaceAll, STORES } from './db.js';

/* ---------- Utils ---------- */
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

/* ---------- UI ---------- */
export async function initArchivesUI() {
  const page = document.querySelector('.page[data-page="archives"]');
  if (!page || page.hidden) return;

  const container = page.querySelector('[data-archives]');
  if (!container) return;

  const movements = await all(STORES.MOVEMENTS);
  const counted = movements.filter(m =>
    !m.status || m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE'
  );

  const months = Array.from(
    new Set(counted.map(m => m.financialMonth).filter(Boolean))
  ).sort();

  container.innerHTML = '';

  /* ---------- Header ---------- */
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

  const importBtn = document.createElement('button');
  importBtn.className = 'btn-secondary';
  importBtn.type = 'button';
  importBtn.textContent = 'Importer JSON';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-primary';
  exportBtn.type = 'button';
  exportBtn.textContent = 'Exporter JSON';

  header.appendChild(select);
  header.appendChild(importBtn);
  header.appendChild(exportBtn);

  const feedback = document.createElement('div');
  feedback.className = 'archives-feedback muted';
  feedback.style.margin = '8px 0';

  const list = document.createElement('div');
  list.className = 'archives-list';

  container.appendChild(header);
  container.appendChild(feedback);
  container.appendChild(list);

  function showFeedback(msg, isError = false) {
    feedback.textContent = msg;
    feedback.style.color = isError ? '#ff6b6b' : '#6ee7b7';
    setTimeout(() => { feedback.textContent = ''; }, 4000);
  }

  /* ---------- Render ---------- */
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
            <button class="ar-del" type="button" title="Supprimer">❌</button>
          </div>
        `;

        row.querySelector('.ar-del').addEventListener('click', async () => {
          const ok = confirm('Supprimer cette saisie ?');
          if (!ok) return;
          try {
            await del(STORES.MOVEMENTS, m.id);
            showFeedback('Saisie supprimée.');
            initArchivesUI();
          } catch (e) {
            console.error(e);
            showFeedback('Erreur lors de la suppression.', true);
          }
        });

        list.appendChild(row);
      });
  }

  /* ---------- Import (remplacement total) ---------- */
  importBtn.addEventListener('click', async () => {
    // Double confirmation avant d'écraser toute la base
    const step1 = confirm(
      `⚠️ ATTENTION\n\nL'import va EFFACER et REMPLACER TOUS les mouvements existants.\n\nContinuer ?`
    );
    if (!step1) return;

    const step2 = confirm(
      `Dernière confirmation.\n\nTu vas écraser ${counted.length} mouvement(s).\nCette action est irréversible.\n\nConfirmer l'import ?`
    );
    if (!step2) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      importBtn.disabled = true;
      importBtn.textContent = 'Import en cours…';

      try {
        const text = await file.text();
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
          showFeedback('Import refusé : le fichier doit contenir un tableau JSON.', true);
          return;
        }

        // Vérification de tous les ids AVANT d'écraser quoi que ce soit
        const invalid = imported.filter(m => !m.id);
        if (invalid.length) {
          showFeedback(
            `Import refusé : ${invalid.length} mouvement(s) sans id dans le fichier.`,
            true
          );
          return;
        }

        // ATOMIQUE : clear + insert en une seule transaction
        await replaceAll(STORES.MOVEMENTS, imported);

        showFeedback(`Import terminé : ${imported.length} mouvement(s) chargés.`);
        initArchivesUI();
      } catch (e) {
        console.error(e);
        showFeedback('Erreur lors de l\'import. Fichier invalide ou base corrompue.', true);
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = 'Importer JSON';
      }
    };

    input.click();
  });

  /* ---------- Export ---------- */
  exportBtn.addEventListener('click', () => {
    const fm = select.value;
    const data = (fm === 'all') ? counted : counted.filter(m => m.financialMonth === fm);
    const name = (fm === 'all') ? 'archives-completes.json' : `archives-${fm}.json`;
    downloadJSON(name, data);
    showFeedback(`Export "${name}" téléchargé.`);
  });

  select.addEventListener('change', render);
  render();
}
