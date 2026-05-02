import { initRouter } from './router.js';
import { openDB } from './db.js';
import { initSaisieUI } from './ui-saisie.js';
import { initRecurrentUI } from './ui-recurrent.js';
import { updateEtatUI } from './ui-etat.js';
import { initStatsUI } from './ui-stats.js';
import { initArchivesUI } from './ui-archives.js';

async function init() {
  initRouter();
  await openDB();
  initSaisieUI();
  initRecurrentUI();
  initStatsUI();
  initArchivesUI();
  updateEtatUI();
}

window.addEventListener('hashchange', () => {
  if (!location.hash || location.hash === '#etat') updateEtatUI();
});

document.addEventListener('DOMContentLoaded', init);
