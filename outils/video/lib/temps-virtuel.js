/* Horloge virtuelle — injectée dans la page filmée AVANT ses propres scripts.

   Le site n'est pas écrit pour être filmé : ses animations suivent l'horloge réelle
   (CSS, Web Animations, setTimeout, requestAnimationFrame, performance.now, Date).
   Filmé tel quel, image par image, il saccaderait : une capture prend 100 à 300 ms,
   pendant lesquels une transition de 200 ms est déjà finie.

   Ici le temps de la page n'avance que quand enregistrer.mjs le demande
   (__tv.avancer(ms)) : minuteurs, rAF, Date et performance.now lisent une horloge
   à nous, et chaque animation CSS / Web Animations est mise en pause puis posée
   à la main sur cette horloge. Le site joue donc exactement ses propres animations,
   une image après l'autre, quelle que soit la vitesse de la machine.               */
(() => {
  if (window.__tv) return;
  const vrai = {
    st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window),
    raf: window.requestAnimationFrame.bind(window), Date,
    fetch: window.fetch ? window.fetch.bind(window) : null,
  };
  const EPOQUE = window.__TV_EPOQUE || Date.now();
  const tv = window.__tv = { t: 0, n: 1, minuteurs: new Map(), rafs: new Map(), reseau: 0, vus: new WeakMap(), vrai, erreurs: [] };

  /* ── l'heure ── */
  performance.now = () => tv.t;
  function DateV(...a) {
    if (!new.target) return new vrai.Date(EPOQUE + tv.t).toString();
    return a.length ? new vrai.Date(...a) : new vrai.Date(EPOQUE + tv.t);
  }
  DateV.prototype = vrai.Date.prototype;
  DateV.now = () => EPOQUE + tv.t; DateV.parse = vrai.Date.parse; DateV.UTC = vrai.Date.UTC;
  window.Date = DateV;

  /* ── minuteurs et images ── */
  window.setTimeout = (fn, d, ...a) => { const id = tv.n++; tv.minuteurs.set(id, { t: tv.t + Math.max(0, +d || 0), fn, a }); return id; };
  window.clearTimeout = id => { tv.minuteurs.delete(id); };
  window.setInterval = (fn, d, ...a) => { const id = tv.n++, p = Math.max(4, +d || 0); tv.minuteurs.set(id, { t: tv.t + p, fn, a, p }); return id; };
  window.clearInterval = window.clearTimeout;
  window.requestAnimationFrame = fn => { const id = tv.n++; tv.rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = id => { tv.rafs.delete(id); };
  window.requestIdleCallback = fn => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 1);
  window.cancelIdleCallback = window.clearTimeout;

  /* ── réseau : on sait s'il reste une réponse en route ── */
  if (vrai.fetch) window.fetch = (...a) => { tv.reseau++; return vrai.fetch(...a).finally(() => vrai.st(() => { tv.reseau--; }, 0)); };

  /* ── défilement doux : rejoué sur l'horloge virtuelle ── */
  const io = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const posEl = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  const vraiFenetre = window.scrollTo.bind(window);
  function glisser(lire, ecrire, cible, duree = 460) {
    const y0 = lire(), t0 = tv.t;
    if (Math.abs(cible - y0) < 2) return ecrire(cible);
    const pas = () => { const k = Math.min(1, (tv.t - t0) / duree); ecrire(y0 + (cible - y0) * io(k)); if (k < 1) window.requestAnimationFrame(pas); };
    window.requestAnimationFrame(pas);
  }
  const brut = (el, y) => { const s = el.style.scrollBehavior; el.style.scrollBehavior = 'auto'; posEl.set.call(el, y); el.style.scrollBehavior = s; };
  const fenetreBrut = y => { const r = document.documentElement, s = r.style.scrollBehavior; r.style.scrollBehavior = 'auto'; vraiFenetre(0, y); r.style.scrollBehavior = s; };
  const doux = (o, el) => (o && typeof o === 'object' && o.behavior === 'smooth') || (!(o && typeof o === 'object' && o.behavior) && el && getComputedStyle(el).scrollBehavior === 'smooth');
  window.scrollTo = window.scroll = function (a, b) {
    const y = a && typeof a === 'object' ? (a.top ?? window.scrollY) : (b ?? 0);
    if (doux(a, document.documentElement)) glisser(() => window.scrollY, fenetreBrut, y); else fenetreBrut(y);
  };
  window.scrollBy = function (a, b) {
    const obj = a && typeof a === 'object', dy = obj ? (a.top || 0) : (b || 0);
    window.scrollTo({ top: window.scrollY + dy, behavior: obj ? a.behavior : undefined });
  };
  Element.prototype.scrollTo = Element.prototype.scroll = function (a, b) {
    const y = a && typeof a === 'object' ? (a.top ?? posEl.get.call(this)) : (b ?? 0);
    if (doux(a, this)) glisser(() => posEl.get.call(this), v => brut(this, v), y); else brut(this, y);
  };
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get() { return posEl.get.call(this); },
    set(y) {
      if (this.isConnected && getComputedStyle(this).scrollBehavior === 'smooth') glisser(() => posEl.get.call(this), v => brut(this, v), +y);
      else posEl.set.call(this, y);
    },
  });
  Element.prototype.scrollIntoView = function (o) {
    const bloc = (o && typeof o === 'object' && o.block) || (o === false ? 'end' : 'start');
    const comportement = o && typeof o === 'object' ? o.behavior : undefined;
    let p = this.parentElement;
    while (p && p !== document.documentElement && !(/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1)) p = p.parentElement;
    const r = this.getBoundingClientRect();
    if (p && p !== document.documentElement && p !== document.body) {
      const pr = p.getBoundingClientRect(), y0 = posEl.get.call(p);
      const y = bloc === 'center' ? y0 + r.top - pr.top - (pr.height - r.height) / 2
        : bloc === 'end' ? y0 + r.bottom - pr.bottom
        : bloc === 'nearest' ? (r.top < pr.top ? y0 + r.top - pr.top : r.bottom > pr.bottom ? y0 + r.bottom - pr.bottom : y0)
        : y0 + r.top - pr.top;
      p.scrollTo({ top: y, behavior: comportement });
    } else {
      const h = window.innerHeight, y0 = window.scrollY;
      const y = bloc === 'center' ? y0 + r.top - (h - r.height) / 2
        : bloc === 'end' ? y0 + r.bottom - h
        : bloc === 'nearest' ? (r.top < 0 ? y0 + r.top : r.bottom > h ? y0 + r.bottom - h : y0)
        : y0 + r.top;
      window.scrollTo({ top: y, behavior: comportement });
    }
  };

  /* ── animations CSS et Web Animations : en pause, posées à la main ── */
  // geler() : toute animation jamais vue est arrêtée à son début (elle a pu partir sur
  // l'horloge réelle, entre deux images : on la ramène à zéro).
  tv.geler = () => {
    let neuves = 0;
    for (const a of document.getAnimations()) {
      if (tv.vus.has(a)) continue;
      tv.vus.set(a, 0); neuves++;
      try { a.pause(); a.currentTime = 0; } catch (_) {}
    }
    return neuves;
  };
  tv.animer = dt => {
    for (const a of document.getAnimations()) {
      let e = tv.vus.get(a);
      if (e === undefined) { e = 0; try { a.pause(); } catch (_) {} } else e += dt;
      tv.vus.set(a, e);
      try {
        const fin = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
        if (Number.isFinite(fin) && e >= fin) a.finish(); else a.currentTime = e;
      } catch (_) {}
    }
  };

  /* ── avancer de dt millisecondes ── */
  const appeler = (fn, a) => {
    try { typeof fn === 'function' ? fn(...a) : (0, eval)(String(fn)); }
    catch (e) { tv.erreurs.push(String((e && e.stack) || e)); console.error(e); }
  };
  tv.avancer = async dt => {
    tv.lance = true;
    const fin = tv.t + dt;
    for (let garde = 0; garde < 5000; garde++) {
      let id = 0, m = null;
      for (const [k, v] of tv.minuteurs) if (v.t <= fin && (!m || v.t < m.t)) { m = v; id = k; }
      if (!m) break;
      tv.t = Math.max(tv.t, m.t);
      if (m.p) m.t += m.p; else tv.minuteurs.delete(id);
      appeler(m.fn, m.a);
      await Promise.resolve();
    }
    tv.t = fin;
    const rafs = [...tv.rafs.values()]; tv.rafs.clear();
    for (const fn of rafs) appeler(fn, [tv.t]);
    await Promise.resolve();
    tv.animer(dt);
  };
  // repos() : laisse arriver ce qui dépend du monde réel (réponses réseau, fins
  // d'animation, observateurs), puis fige ce que cela a déclenché.
  tv.repos = async (images = 2) => {
    const debut = vrai.Date.now();
    while (tv.reseau > 0 && vrai.Date.now() - debut < 4000) await new Promise(r => vrai.st(r, 8));
    for (let i = 0; i < images; i++) await new Promise(r => vrai.raf(r));
    await new Promise(r => vrai.st(r, 0));
    tv.geler();
  };
  // Tant que la page charge (avant la première image), rien ne doit partir en temps réel.
  (function veille() { if (!tv.lance) { try { tv.geler(); } catch (_) {} vrai.raf(veille); } })();
})();
