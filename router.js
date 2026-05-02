// router.js
  return (location.hash || '').replace('#', '') || DEFAULT_ROUTE;const DEFAULT_ROUTE = 'etat';
}

function show(route) {
  document.querySelectorAll('.page[data-page]').forEach(p => {
    p.hidden = (p.dataset.page !== route);
  });

  document.querySelectorAll('.nav-item[data-route]').forEach(b => {
    b.classList.toggle('active', b.dataset.route === route);
  });
}

export function initRouter() {
  show(getRoute());

  window.addEventListener('hashchange', () => show(getRoute()));

  document.querySelector('.nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item[data-route]');
    if (!btn) return;
    location.hash = btn.dataset.route;
  });
}

function getRoute() {
