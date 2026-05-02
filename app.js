// app.js
import { initRouter } from './router.js';
import { openDB } from './db.js';

import { initSaisieUI } from './ui-saisie.js';
import { initRecurrentUI } from './ui-recurrent.js';
import { initStatsUI } from './ui-stats.js';
import { initArchivesUI } from './ui-archives.js';
import { updateEtatUI } from './ui-etat.js';

async function init() {
  initRouter();
  await openDB();

  // Init UIs (elles se rendent uniquement dans leur conteneur de page)
  initSaisieUI();
  initRecurrentUI();
  initStatsUI();
  initArchivesUI();

  // État au démarrage
  updateEtatUI();

  // Mise à jour État quand on revient dessus
  window.addEventListener('hashchange', () => {
    const r = (location.hash || '').replace('#', '') || 'etat';
    if (r === 'etat') updateEtatUI();
  });

  // Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

document.addEventListener('DOMContentLoaded', init);
