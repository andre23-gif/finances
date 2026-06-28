// ui-archives.js
import { all, del, replaceAll, putMany, STORES } from './db.js';

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

/**
 * Format de sauvegarde complète :
 * { version: 1, movements: [...], recurring: [...] }
 * Rétrocompatible : si le fichier est un tableau simple (ancien format),
 * on l'interprète comme movements seulement.
 */
function parseBackup(raw) {
  if (Array.isArray(raw)) {
    // ancien format : tableau de mouvements uniquement
    return { movements: raw, recurring: [] };
  }
  if (raw && raw.version === 1 && Array.isArray(raw.movements)) {
    return { movements: raw.movements, recurring: raw.recurring || [] };
  }
  return null;
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

  // Filtre compte
  const selectAccount = document.createElement('select');
  selectAccount.className = 'archives-select';
  [
    { value: 'all',      label: 'Tous les comptes' },
    { value: 'perso',    label: 'Perso' },
    { value: 'internet', label: 'Internet' },
    { value: 'commun',   label: 'Commun' },
    { value: 'cash',     label: 'Cash' }
  ].forEach(({ value, label }) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    selectAccount.appendChild(o);
  });

  // Filtre tri
  const selectSort = document.createElement('select');
  selectSort.className = 'archives-select';
  [
    { value: 'date-asc',   label: '📅 Date ↑' },
    { value: 'date-desc',  label: '📅 Date ↓' },
    { value: 'amt-asc',    label: '💶 Montant ↑' },
    { value: 'amt-desc',   label: '💶 Montant ↓' },
    { value: 'label-asc',  label: '🔤 Libellé ↑' },
  ].forEach(({ value, label }) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    selectSort.appendChild(o);
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'btn-secondary';
  importBtn.type = 'button';
  importBtn.textContent = 'Importer JSON';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-primary';
  exportBtn.type = 'button';
  exportBtn.textContent = 'Exporter JSON';

  header.appendChild(select);
  header.appendChild(selectAccount);
  header.appendChild(selectSort);
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

  /* ---------- Totaux filtrés ---------- */
  const summary = document.createElement('div');
  summary.className = 'muted';
  summary.style.cssText = 'font-size:13px;margin:6px 0;display:flex;gap:16px;flex-wrap:wrap;';
  container.insertBefore(summary, list);

  /* ---------- Render ---------- */
  function render() {
    list.innerHTML = '';
    const fm   = select.value;
    const acc  = selectAccount.value;
    const sort = selectSort.value;

    let data = (fm === 'all') ? counted : counted.filter(m => m.financialMonth === fm);
    if (acc !== 'all') data = data.filter(m => m.account === acc);

    // Tri
    data = data.slice().sort((a, b) => {
      switch (sort) {
        case 'date-asc':  return a.date.localeCompare(b.date) || a.label?.localeCompare(b.label||'');
        case 'date-desc': return b.date.localeCompare(a.date) || a.label?.localeCompare(b.label||'');
        case 'amt-asc':   return Number(a.amount) - Number(b.amount);
        case 'amt-desc':  return Number(b.amount) - Number(a.amount);
        case 'label-asc': return (a.label||'').localeCompare(b.label||'');
        default:          return a.date.localeCompare(b.date);
      }
    });

    // Résumé
    const totalIn  = data.filter(m => Number(m.amount) > 0).reduce((s,m) => s + Number(m.amount), 0);
    const totalOut = data.filter(m => Number(m.amount) < 0).reduce((s,m) => s + Number(m.amount), 0);
    const net      = totalIn + totalOut;
    const netColor = net >= 0 ? '#6ee7b7' : '#ff6b6b';
    summary.innerHTML = `
      <span>${data.length} ligne(s)</span>
      <span style="color:#6ee7b7">Entrées : ${eur(totalIn)}</span>
      <span style="color:#ff6b6b">Sorties : ${eur(Math.abs(totalOut))}</span>
      <span style="color:${netColor};font-weight:700">Net : ${eur(net)}</span>
    `;

    if (!data.length) {
      list.innerHTML = '<div class="muted">Aucune donnée.</div>';
      return;
    }

    data
      .forEach(m => {
        const row = document.createElement('div');
        row.className = 'archive-row';

        const label = m.label || '(sans libellé)';
        const cat = m.category || '—';
        const acc = m.account || '—';
        const date = m.date || '—';
        const amt = Number(m.amount || 0);

        // Badge origine
        const originBadge = (() => {
          if (m.origin === 'RECURRENTE') return '<span class="ar-badge ar-badge-rec">🔁 récurrent</span>';
          if (m.origin === 'SYSTEM' && m.category === 'report') return '<span class="ar-badge ar-badge-sys">⚙️ report</span>';
          return '';
        })();

        row.innerHTML = `
          <div class="ar-main">
            <span class="ar-date">${date}</span>
            <span class="ar-label">${label}</span>
            <span class="ar-cat">${cat}</span>
            ${originBadge}
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

        const backup = parseBackup(imported);
        if (!backup) {
          showFeedback('Format non reconnu. Attendu : tableau ou objet {version:1, movements, recurring}.', true);
          return;
        }

        // Vérification ids mouvements
        const invalidMov = backup.movements.filter(m => !m.id);
        if (invalidMov.length) {
          showFeedback(`Import refusé : ${invalidMov.length} mouvement(s) sans id.`, true);
          return;
        }

        // ATOMIQUE : remplacer les mouvements
        await replaceAll(STORES.MOVEMENTS, backup.movements);

        // Restaurer les récurrents si présents
        if (backup.recurring.length) {
          await putMany(STORES.RECURRING, backup.recurring);
        }

        const msg = backup.recurring.length
          ? `Import terminé : ${backup.movements.length} mouvement(s) + ${backup.recurring.length} récurrent(s).`
          : `Import terminé : ${backup.movements.length} mouvement(s) (pas de récurrents dans ce fichier).`;
        showFeedback(msg);
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
  exportBtn.addEventListener('click', async () => {
    const fm = select.value;
    const movementsToExport = (fm === 'all') ? counted : counted.filter(m => m.financialMonth === fm);
    const name = (fm === 'all') ? 'archives-completes.json' : `archives-${fm}.json`;

    // Export complet = mouvements + récurrents (seulement pour "tous les mois")
    if (fm === 'all') {
      const recurring = await all(STORES.RECURRING);
      downloadJSON(name, { version: 1, movements: movementsToExport, recurring });
      showFeedback(`Export complet : ${movementsToExport.length} mouvement(s) + ${recurring.length} récurrent(s).`);
    } else {
      // Export partiel (un mois) = juste les mouvements, format simple
      downloadJSON(name, movementsToExport);
      showFeedback(`Export "${name}" téléchargé.`);
    }
  });

  select.addEventListener('change', render);
  selectAccount.addEventListener('change', render);
  selectSort.addEventListener('change', render);
  render();
}
