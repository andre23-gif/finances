// app.js
import { initRouter } from './router.js';
import { openDB } from './db.js';
import { initStatsUI } from './ui-stats.js';
import { initArchivesUI } from './ui-archives.js';
import { updateEtatUI } from './ui-etat.js';
import { initRecurrentUI } from './ui-recurrent.js';


function currentRoute() {
  return (location.hash || '').replace('#', '') || 'etat';
}

/**
 * Appelle uniquement l'UI de la page active.
 * Important : évite d'initialiser des pages cachées.
 */
function renderActivePage() {
  const r = currentRoute();

  if (r === 'etat') {
    updateEtatUI();
    return;
  }

  if (r === 'saisie') {
    initSaisieUI();
    return;
  }

  if (r === 'recurrent') {
    initRecurrentUI();
    return;
  }

  if (r === 'stats') {
    initStatsUI();
    return;
  }

  if (r === 'archives') {
    initArchivesUI();
    return;
  }
}

async function init() {
  // 1) Navigation (affiche la page selon le hash)
  initRouter();

  // 2) DB prête
  await openDB();

  // 3) Rendu initial de la page active
  renderActivePage();

  // 4) À chaque changement d'onglet, on rend la page active
  window.addEventListener('hashchange', renderActivePage);

  // 5) Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

document.addEventListener('DOMContentLoaded', init);

import { initSaisieUI } from './ui-saisie.js';
