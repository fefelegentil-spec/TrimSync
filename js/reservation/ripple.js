/* ═══════════════════════════════════════════════════════════
   FCUTZ — Bubble / Ripple effect (global, non-intrusif)
   - Cercle au point de clic sur boutons, .btn, [role="button"], a.btn, [data-ripple]
   - Bubble plein écran à l'ouverture d'un .modal-bg (classe "open")
   - Origine du bubble : dernier point de clic si récent, sinon centre du modal
   - Opt-out : [data-no-ripple] sur l'élément
   - API : window.rippleBurst(x, y, host?) pour déclenchement manuel
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.__fcutzRippleInit) return;
  window.__fcutzRippleInit = true;

  const TRIGGER_SELECTOR =
    'button, .btn, [role="button"], a.btn, [data-ripple]';

  // Éléments void qui ne peuvent pas contenir d'enfant — on évite d'y greffer un ripple
  const VOID_TAGS = new Set(['INPUT', 'IMG', 'BR', 'HR', 'AREA', 'EMBED']);

  // Mémoire du dernier point de clic pour relier un clic au modal qu'il a ouvert
  let lastPointer = null; // { x, y, t }

  // ─── Ripple sur clic ─────────────────────────────────────────
  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // gauche uniquement
    const target = e.target.closest(TRIGGER_SELECTOR);
    if (!target) return;
    if (target.hasAttribute('data-no-ripple')) return;
    if (target.disabled) return;
    if (VOID_TAGS.has(target.tagName)) return;

    lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() };
    spawnRipple(target, e.clientX, e.clientY);
  }

  function spawnRipple(host, clientX, clientY) {
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Garantir un parent positionné pour les enfants absolus, sans toucher overflow
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.classList.add('ripple-host');

    // Calque de clipping (un seul, partagé entre toutes les vagues actives)
    let clip = host.querySelector(':scope > .ripple-clip');
    if (!clip) {
      clip = document.createElement('span');
      clip.className = 'ripple-clip';
      host.appendChild(clip);
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Rayon = distance jusqu'au coin le plus éloigné => couvre l'élément entier
    const radius = Math.hypot(
      Math.max(x, rect.width - x),
      Math.max(y, rect.height - y)
    );
    const size = radius * 2;

    const wave = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.width = wave.style.height = size + 'px';
    wave.style.left = x + 'px';
    wave.style.top = y + 'px';

    clip.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove(), { once: true });
    // Garde-fou si animationend n'est pas tiré (onglet en arrière-plan, etc.)
    setTimeout(() => wave.remove(), 900);
  }

  document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });

  // ─── Modal bubble ───────────────────────────────────────────
  function spawnModalBubble(originX, originY) {
    const bubble = document.createElement('span');
    bubble.className = 'modal-bubble';

    // Diamètre = 2 × diagonale viewport => couvre tout l'écran
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    const size = diag * 2;
    bubble.style.width = bubble.style.height = size + 'px';
    bubble.style.left = originX + 'px';
    bubble.style.top = originY + 'px';

    document.body.appendChild(bubble);
    bubble.addEventListener('animationend', () => bubble.remove(), { once: true });
    setTimeout(() => bubble.remove(), 1000);
  }

  function handleModalOpened(modalBg) {
    if (modalBg.hasAttribute('data-no-ripple')) return;
    const rect = modalBg.getBoundingClientRect();
    let ox, oy;
    if (lastPointer && Date.now() - lastPointer.t < 600) {
      ox = lastPointer.x;
      oy = lastPointer.y;
    } else {
      ox = rect.left + rect.width / 2;
      oy = rect.top + rect.height / 2;
    }
    spawnModalBubble(ox, oy);
  }

  // Détection : .modal-bg passe de sans "open" à avec "open"
  const modalObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
      const wasOpen = (m.oldValue || '').split(/\s+/).includes('open');
      const isOpen = m.target.classList.contains('open');
      if (!wasOpen && isOpen) handleModalOpened(m.target);
    }
  });

  function attachModalWatcher(el) {
    modalObserver.observe(el, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    });
  }

  function attachAllModals() {
    document.querySelectorAll('.modal-bg').forEach(attachModalWatcher);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAllModals);
  } else {
    attachAllModals();
  }

  // Modaux insérés dynamiquement : on les surveille aussi
  const bodyObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches && n.matches('.modal-bg')) attachModalWatcher(n);
        if (n.querySelectorAll) {
          n.querySelectorAll('.modal-bg').forEach(attachModalWatcher);
        }
      });
    }
  });
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });

  // API publique pour déclenchement manuel
  window.rippleBurst = function (x, y, host) {
    if (host) spawnRipple(host, x, y);
    else spawnModalBubble(x, y);
  };
})();
