/* ═══════════════════════════════════════════════════════════
   FCUTZ — Spotlight sur .card et .kpi-card
   ═══════════════════════════════════════════════════════════ */

(function () {
  function initCard(card) {
    if (card.dataset.spotlight) return;
    card.dataset.spotlight = '1';
  }

  function initAll() {
    document.querySelectorAll('.card, .kpi-card').forEach(initCard);
  }

  document.addEventListener('pointermove', function (e) {
    document.querySelectorAll('[data-spotlight]').forEach(function (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--glow-x', (e.clientX - r.left) + 'px');
      card.style.setProperty('--glow-y', (e.clientY - r.top) + 'px');
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  new MutationObserver(initAll).observe(document.body, { childList: true, subtree: true });
})();
