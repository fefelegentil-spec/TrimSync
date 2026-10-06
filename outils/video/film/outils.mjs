// Outils du film : courbes, poses, révélations de texte. Tout est fonction du temps reçu,
// jamais d'une horloge : la même image sort toujours du même instant.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const borne = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mix = (a, b, k) => a + (b - a) * k;
export const pad5 = i => String(i).padStart(5, '0');

// Les courbes du site : --ex (cubic-bezier(.16,1,.3,1)) pour ce qui entre, une courbe en S
// pour ce qui se déplace, une accélération franche pour ce qui sort. Aucun rebond.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 10; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-6) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    return Y(borne(t));
  };
}
export const E = { sort: bezier(.16, 1, .3, 1), doux: bezier(.25, 1, .5, 1), va: bezier(.77, 0, .175, 1), vient: bezier(.65, 0, .35, 1), part: bezier(.7, 0, .84, 0), tiroir: bezier(.32, .72, 0, 1), lin: x => x };
/** Avancement (0 → 1) d'un mouvement parti à `a` et qui dure `d`. */
export const av = (t, a, d, e = E.sort) => e(borne((t - a) / d));

export function pose(el, { x = 0, y = 0, z = 0, s = 1, rx = 0, ry = 0, rz = 0, o = 1, flou = 0 } = {}) {
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px)`
    + (rx ? ` rotateX(${rx.toFixed(3)}deg)` : '') + (ry ? ` rotateY(${ry.toFixed(3)}deg)` : '') + (rz ? ` rotateZ(${rz.toFixed(3)}deg)` : '') + (s !== 1 ? ` scale(${s.toFixed(4)})` : '');
  el.style.opacity = o <= 0.002 ? '0' : o >= 0.998 ? '1' : o.toFixed(3);
  el.style.filter = flou > 0.25 ? `blur(${flou.toFixed(1)}px)` : '';
}
/** Entrée standard : monte, se précise, se pose. `sortie` (un instant) le fait repartir, plus vite qu'il n'est venu. */
export function entre(el, t, a, { d = 0.6, x = 0, y = 26, s = 0.965, flou = 8, sortie = Infinity, ds = 0.3, sx = 0, sy = -16, bx = 0, by = 0, bs = 1, bo = 1 } = {}) {
  const k = av(t, a, d), q = t >= sortie ? E.part(borne((t - sortie) / ds)) : 0;
  pose(el, { x: bx + x * (1 - k) + sx * q, y: by + y * (1 - k) + sy * q, s: bs * mix(s, 1, k) * (1 - 0.03 * q), o: bo * borne(k * 1.6) * (1 - q), flou: flou * (1 - k) + 7 * q });
  return k * (1 - q);
}
/** Titres : chaque ligne monte de derrière son propre bord (« a|b » = deux lignes). */
export const lignes = html => html.split('|').map(l => `<span class="ligne"><span>${l}</span></span>`).join('');
export function reveler(el, t, a, { pas = 0.09, d = 0.8, sortie = Infinity } = {}) {
  $$('.ligne>span', el).forEach((s, i) => {
    const k = av(t, a + i * pas, d), q = t >= sortie ? E.part(borne((t - sortie - i * 0.03) / 0.3)) : 0;
    s.style.transform = `translateY(${((1 - k) * 114 - q * 114).toFixed(2)}%)`;
  });
}
/** Texte mot à mot : chaque mot arrive à son instant (ceux de la voix). */
export const mots = (texte, classe = '') => texte.split(' ').map(m => `<span class="mot ${classe}">${m} </span>`).join('');
export function dire(el, t, instants, { d = 0.5, y = 30, flou = 10 } = {}) {
  $$('.mot', el).forEach((m, i) => {
    const k = av(t, (instants[i] ?? instants[instants.length - 1]) - 0.08, d);
    m.style.transform = `translateY(${((1 - k) * y).toFixed(2)}px)`; m.style.opacity = borne(k * 1.5).toFixed(3); m.style.filter = k < 0.98 ? `blur(${((1 - k) * flou).toFixed(1)}px)` : '';
  });
}
/** Où se trouve un élément dans son écran de téléphone (mise en page, donc sans la 3D). */
export function dansEcran(el, ecran) {
  let x = 0, y = 0, e = el;
  while (e && e !== ecran) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2, l: el.offsetWidth, h: el.offsetHeight };
}
