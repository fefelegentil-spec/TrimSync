// Le film : pour un instant t, l'état exact de chaque élément (voir film.html).
//   film/outils.mjs   courbes, poses, révélations de texte
//   film/decor.mjs    le fond, les téléphones, l'écran verrouillé, la messagerie
//   film/scenes-*.mjs les douze scènes
import { partition, PRINCIPALE } from './temps.mjs';
import { $, borne, mix, E } from './film/outils.mjs';
import { decor } from './film/decor.mjs';
import { scenes1 } from './film/scenes-1.mjs';
import { scenes2 } from './film/scenes-2.mjs';
import { scenes3 } from './film/scenes-3.mjs';

// Les polices d'abord : certaines scènes mesurent leur texte pour le mettre en page.
await Promise.all(['800 100px "Bricolage Grotesque"', '600 60px "Bricolage Grotesque"', 'italic 800 100px "Bricolage Grotesque"', '500 30px Figtree', '600 30px Figtree', '700 30px Figtree', '800 30px Figtree', '30px tabler-icons']
  .map(f => document.fonts.load(f)).concat(document.fonts.load('30px "Noto Color Emoji"', '🙃✨🙏😕🤍💅')));
await document.fonts.ready;

const json = async f => (await fetch(f)).json();
const P = partition(await json(`voix/${PRINCIPALE}/durees.json`), await json(`voix/${PRINCIPALE}/mots.json`));
const { C, scenes: S } = P;
const NOMS_CLIPS = ['resa', 'resa-rose', 'resa-corail', 'agenda', 'appli', 'bot-carte', 'reglage', 'agenda-bot', 'agenda-annule'];
const CLIPS = Object.fromEntries(await Promise.all(NOMS_CLIPS.map(async n => [n, await json(`clips/${n}/meta.json`)])));
const attentes = [];   // images en cours de décodage : seek() les attend avant de rendre la main
const AMB = { gain: 1, sombre: 0, zoom: 1, teinte: [0.10, 0.78, 0.78] };   // l'ambiance du fond, que chaque scène règle

// Où se trouve chaque plateau dans le monde : la caméra file de l'un à l'autre.
const POS = { accroche: [0, 0], nom: [0, 0], resa: [2700, 0], dash: [4500, 1500], bot: [4500, 1500], lien: [4500, 3300], perso: [7200, 3300], action: [7200, 5000], cas: [7200, 5000], relais: [4500, 5000], offres: [4500, 6700], fin: [4500, 6700] };

const K = { P, C, S, CLIPS, AMB, POS, attentes };
Object.assign(K, decor(K));
const SC = { ...scenes1(K), ...scenes2(K), ...scenes3(K) };

/* ── la caméra ──
   Elle va d'un plateau au suivant autour de chaque changement de scène : le milieu du trajet
   tombe sur le temps fort. Sous l'aplat teal (scène « bot »), elle saute sans être vue. */
const TRAJETS = [];
P.ordre.forEach((id, i) => {
  const suiv = P.ordre[i + 1]; if (!suiv) return;
  const [ax, ay] = POS[id], [bx, by] = POS[suiv];
  if (ax === bx && ay === by) return;
  if (id === 'bot') TRAJETS.push({ a: S.bot.a + 1.2, d: 0, de: POS[id], vers: POS[suiv] });
  else if (id === 'resa') TRAJETS.push({ a: S.resa.b - 0.62, d: 1.05, de: POS[id], vers: POS[suiv] });   // elle suit le rendez-vous qui part vers l'agenda
  else TRAJETS.push({ a: S[id].b - 0.4, d: 0.92, de: POS[id], vers: POS[suiv] });
});
function camera(t) {
  let x = POS[P.ordre[0]][0], y = POS[P.ordre[0]][1], z = 0;
  for (const tr of TRAJETS) {
    if (t < tr.a) break;
    const k = tr.d ? E.va(borne((t - tr.a) / tr.d)) : 1;
    x = mix(tr.de[0], tr.vers[0], k); y = mix(tr.de[1], tr.vers[1], k); z = tr.d ? 300 * Math.sin(Math.PI * k) : 0;
  }
  return { x, y, z };
}

/* ── montage ── */
const monde = $('#monde'), titres = $('#titres');
for (const id of P.ordre) {
  const def = SC[id];
  const pl = document.createElement('div'); pl.className = 'plateau'; pl.id = 'p-' + id; pl.innerHTML = def.plateau ? def.plateau() : ''; monde.appendChild(pl);
  const ti = document.createElement('div'); ti.className = 'calque'; ti.id = 't-' + id; ti.innerHTML = def.titres ? def.titres() : ''; titres.appendChild(ti);
  def.pl = pl; def.ti = ti;
  if (def.init) def.init(pl, ti);
}
const flou = $('#bouge-flou'), cadre = $('#cadre'), noir = $('#noir');
function rendre(t) {
  attentes.length = 0;
  Object.assign(AMB, { gain: 1, sombre: 0, zoom: 1 });
  const c = camera(t), c1 = camera(t - 1 / 120), c2 = camera(t + 1 / 120);
  for (const id of P.ordre) {
    const def = SC[id], s = S[id], actif = t >= s.a - (def.avant ?? 0.75) && t < s.b + (def.apres ?? 0.8);
    def.pl.style.display = def.ti.style.display = actif ? '' : 'none';
    if (!actif) { if (def.cacher) def.cacher(); continue; }
    const dx = POS[id][0] - c.x, dy = POS[id][1] - c.y;
    const avance = mix(-26, 34, (t - s.a) / s.d);   // une lente avancée pendant la scène : rien n'est jamais tout à fait immobile
    def.pl.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,${(avance - c.z).toFixed(2)}px)`;
    def.ti.style.transform = `translate(${(dx * 1.14).toFixed(2)}px,${(dy * 1.14).toFixed(2)}px)`;
    def.rendre(t - s.a, t);
  }
  // flou de bougé : proportionnel à la vitesse de la caméra, dans son sens
  const fx = Math.min(44, Math.abs(c2.x - c1.x) * 60 * 0.0052), fy = Math.min(44, Math.abs(c2.y - c1.y) * 60 * 0.0052);
  if (fx > 0.5 || fy > 0.5) { flou.setAttribute('stdDeviation', `${fx.toFixed(1)} ${fy.toFixed(1)}`); cadre.style.filter = 'url(#bouge)'; } else cadre.style.filter = '';
  K.fond(t, c);
  noir.style.opacity = t > P.DUREE - 0.6 ? borne((t - (P.DUREE - 0.6)) / 0.55).toFixed(3) : t < 0.4 ? (1 - t / 0.4).toFixed(3) : '0';
}

/* ── les bruitages : chaque scène dit lesquels, en secondes de sa scène ── */
window.SONS = P.ordre.flatMap(id => (SC[id].sons || []).map(([t, son, gain]) => ({ t: +(S[id].a + t).toFixed(3), son, gain })))
  .concat(TRAJETS.filter(tr => tr.d).map(tr => ({ t: +(tr.a + 0.12).toFixed(3), son: 'fouet', gain: 0.4 })))
  .filter(s => s.t >= 0).sort((a, b) => a.t - b.t);
window.DUREE = P.DUREE;
window.PARTITION = { scenes: S, V: P.V, C, alertes: P.alertes };
window.seek = async t => { rendre(t); await Promise.all(attentes); };
await window.seek(+new URLSearchParams(location.search).get('t') || 0);
window.pret = true;
