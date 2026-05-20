/* ═══════════════════════════════════════════════════════════
   TrimSync — Spotlight / GlowCard (port vanilla du composant React)

   Coordonnées relatives à la carte (pas en screen coords)
   pour fonctionner correctement avec le scroll.
   ═══════════════════════════════════════════════════════════ */

(function () {

  /* ── Injecte le nœud enfant blur externe si absent ── */
  function prepareCard(el) {
    if (el.dataset.glowReady) return;
    el.dataset.glowReady = '1';
    if (!el.querySelector(':scope > [data-glow-inner]')) {
      var inner = document.createElement('div');
      inner.setAttribute('data-glow-inner', '');
      el.insertBefore(inner, el.firstChild);
    }
  }

  /* ── Marque les éléments cibles et prépare leur nœud enfant ── */
  function initAll() {
    /* Cards features et plans */
    document.querySelectorAll('.feat, .plan').forEach(function (el) {
      el.setAttribute('data-glow', '');
      prepareCard(el);
    });

    /* Demo chat sur le hero */
    var chatCard = document.querySelector('.chat-wrap .glow-card');
    if (chatCard) {
      chatCard.setAttribute('data-glow', '');
      prepareCard(chatCard);
    }

    /* Tout [data-glow] posé manuellement dans le HTML */
    document.querySelectorAll('[data-glow]').forEach(prepareCard);
  }

  /* ── Tracker pointeur : coordonnées relatives à chaque carte ── */
  document.addEventListener('pointermove', function (e) {
    document.querySelectorAll('[data-glow]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--x', (e.clientX - r.left).toFixed(1));
      el.style.setProperty('--xp', ((e.clientX - r.left) / r.width).toFixed(3));
      el.style.setProperty('--y', (e.clientY - r.top).toFixed(1));
      el.style.setProperty('--yp', ((e.clientY - r.top) / r.height).toFixed(3));
    });
  }, { passive: true });

  /* ── Init au chargement + surveille les ajouts DOM ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  new MutationObserver(initAll).observe(document.body, { childList: true, subtree: true });

})();
