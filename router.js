// router.js
const DEFAULT_ROUTE = 'etat';

function getRoute() {
  return (location.hash || '').replace('#', '') || DEFAULT_ROUTE;
}

function show(route) {
  document.querySelectorAll('.page[data-page]').forEach((p) => {
    p.hidden = (p.dataset.page !== route);
  });

  document.querySelectorAll('.nav-item[data-route]').forEach((b) => {
    b.classList.toggle('active', b.dataset.route === route);
  });
}

export function initRouter() {
  // affichage initial
  show(getRoute());

  // bouton retour / changement de hash
  window.addEventListener('hashchange', () => {
    show(getRoute());
  });

  // clics sur la nav
  const nav = document.querySelector('.nav');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item[data-route]');
    if (!btn) return;
    location.hash = btn.dataset.route;
  });
}
