// app.js
// ==================== VERSION APP (anti-cache iOS Safari) ====================
const APP_VERSION = '2026.05.03'; // ⬅️ change à CHAQUE déploiement

const storedVersion = localStorage.getItem('APP_VERSION');

if (storedVersion && storedVersion !== APP_VERSION) {
  console.log('[App] Nouvelle version détectée, rechargement forcé');
  localStorage.setItem('APP_VERSION', APP_VERSION);
  window.location.reload(true); // force reload sans cache (clé iOS)
} else if (!storedVersion) {
  localStorage.setItem('APP_VERSION', APP_VERSION);
}
// ============================================================================


import { initRouter } from './router.js';
import { openDB } from './db.js';
import { initStatsUI } from './ui-stats.js';
import { initArchivesUI } from './ui-archives.js';
import { updateEtatUI } from './ui-etat.js';
import { initRecurrentUI } from './ui-recurrent.js';
import { initSaisieUI } from './ui-saisie.js';

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
