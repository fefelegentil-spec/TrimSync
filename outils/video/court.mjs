// Le film court : 20 s, vertical, sans voix. Une seule prise de caméra, un geste par temps
// de la musique (140 BPM) : chaque notification, chaque toucher tombe sur un temps.
// Pour un instant t, l'état exact de chaque élément (voir court.html).
import { $, $$, borne, mix, E, av, pose, entre, lignes, reveler } from './film/outils.mjs';
import { decor } from './film/decor.mjs';

await Promise.all(['800 100px "Bricolage Grotesque"', 'italic 800 100px "Bricolage Grotesque"', '600 60px "Bricolage Grotesque"', '500 30px Figtree', '600 30px Figtree', '700 30px Figtree', '30px tabler-icons']
  .map(f => document.fonts.load(f)).concat(document.fonts.load('30px "Noto Color Emoji"', '🙃')));
await document.fonts.ready;

const TEMPS = 60 / 140, MESURE = 4 * TEMPS, B = n => n * TEMPS;   // B(8) : le 9e temps, là où le beat entre
const DUREE = 12 * MESURE;
const json = async f => (await fetch(f)).json();
const CLIPS = Object.fromEntries(await Promise.all(['resa'].map(async n => [n, await json(`clips/${n}/meta.json`)])));
const attentes = [], AMB = { gain: 1, sombre: 0, zoom: 1, teinte: [0.10, 0.78, 0.78] };
const D = decor({ CLIPS, attentes, AMB });
const p = $('#p'), ti = $('#ti');
/** Suit une liste de repères [instant, valeur] : entre deux repères, en ligne droite. */
const suivre = (reperes, t) => {
  if (t <= reperes[0][0]) return reperes[0][1];
  for (let i = 1; i < reperes.length; i++) if (t <= reperes[i][0]) { const [a, va] = reperes[i - 1], [b, vb] = reperes[i]; return mix(va, vb, (t - a) / (b - a)); }
  return reperes[reperes.length - 1][1];
};

/* ── 1. l'accroche (temps 0 à 8) : les DM s'empilent, un rendez-vous est perdu ── */
const DM = [
  ['ines.mrt', 'Coucou ! Tu aurais une place samedi ?', '14:07'],
  ['lea.nails', 'C’est combien la pose gel ?', '14:52'],
  ['cam.rl', 'Dispo demain matin ?', '15:36'],
  ['sarah.bnl', 'Tu fais aussi le nail art ?', '16:20'],
  ['jade.mrl', 'T’as une place vendredi ?', '18:05'],
  ['ines.mrt', 'Laisse, j’ai trouvé ailleurs 🙃', '21:48'],
];
const ARRIVEES = [-0.4, B(1), B(2), B(3), B(4), B(5)];   // la première est déjà là à l'ouverture
const telV = D.telephone(p, { mode: 'libre', heure: DM[0][2], html: D.verrou('v', 'Jeudi 8 octobre', DM[0][2], []) });
// (dans le calque à plat, pas dans le monde 3D : le coin du téléphone incliné les traverserait)
ti.insertAdjacentHTML('beforeend', DM.map((d, i) => D.notif('gnotif', { heure: d[2], titre: d[0], texte: d[1], perdu: i === 5 })).join(''));
const cartes = $$('.gnotif', ti);
ti.insertAdjacentHTML('beforeend', `<div class="c-titre" id="h1">${lignes('Tu croules|<em>sous les DM ?</em>')}</div><div class="c-titre alerte" id="h2">${lignes('<em>Trop tard.</em>')}</div>`);

/* ── 2. la réservation (temps 8 à 20) : la vraie page, un toucher par temps ── */
const Y2 = 2600;   // plus bas dans le monde : la caméra y plonge quand le beat entre
const telR = D.telephone(p, { mode: 'safari', url: 'trimsync.tech/r/studio-nova', heure: '12:41', clip: 'resa' });
const TAPS = CLIPS.resa.touchers.map(k => k.t);   // sept touchers filmés : prestation, continuer, jour, heure, continuer, accord, confirmer
const RESA = [[B(8) - 1.2, TAPS[0] - 1.9], [B(8), TAPS[0] - 0.62], ...TAPS.map((tc, i) => [B(9 + i), tc]), [B(16), TAPS[6] + 0.75], [B(20), TAPS[6] + 2.6]];
ti.insertAdjacentHTML('beforeend', `<div class="c-marque" id="mq">Trim<span>Sync</span></div>
  <div class="c-titre" id="r1" style="font-size:114px">${lignes('Tes clients|<em>réservent seuls.</em>')}</div>
  <div class="c-etapes" id="et">${['La prestation', 'Le créneau', 'Confirmé'].map(x => `<span class="c-etape"><i class="ti ti-check"></i>${x}</span>`).join('')}</div>`);
const ETAPES = [B(9), B(12), B(15)];   // quand chaque étape est faite

/* ── ce qui s'entend : chaque notification, chaque toucher donne un petit coup à l'image ── */
const COUPS = [...ARRIVEES.slice(1), ...[8, 9, 10, 11, 12, 13, 14, 15, 16].map(B)];
const coup = t => { let v = 0; for (const c of COUPS) if (t >= c) v = Math.exp(-(t - c) * 9); return v; };
const camY = t => Y2 * E.va(borne((t - (B(8) - 0.3)) / 0.44));

const flou = $('#bouge-flou'), cadre = $('#cadre'), noir = $('#noir'), eclair = $('#eclair'), heureV = $('#v-heure'), soir = $('#v-soir');
function rendre(t) {
  attentes.length = 0;
  const y = camY(t), k = coup(t), apres = t >= B(8);
  p.style.transform = `translate3d(0,${(-y).toFixed(2)}px,${(k * 30).toFixed(2)}px)`;
  const fy = Math.min(48, Math.abs(camY(t + 1 / 120) - camY(t - 1 / 120)) * 60 * 0.0052);
  if (fy > 0.5) { flou.setAttribute('stdDeviation', `0 ${fy.toFixed(1)}`); cadre.style.filter = 'url(#bouge)'; } else cadre.style.filter = '';

  // 1. l'accroche
  const recus = ARRIVEES.filter(a => t >= a).length, perdu = av(t, ARRIVEES[5], 0.3);
  telV.heureEl.textContent = heureV.textContent = DM[Math.max(0, recus - 1)][2];
  soir.style.opacity = (0.45 * borne((t - B(2)) / (B(5) - B(2)))).toFixed(3);
  telV.pose({ x: 540, y: 1290, z: k * 16, s: 1.42, rx: 5, ry: -9 + 2 * Math.sin(t * 1.3), rz: -1.5 + (apres ? 0 : 0.8 * k * (recus % 2 ? 1 : -1)), o: t < B(8) + 0.2 ? 1 : 0 });
  cartes.forEach((c, i) => {
    const a = av(t, ARRIVEES[i], 0.26), rang = ARRIVEES.reduce((s, x, j) => s + (j > i ? av(t, x, 0.3) : 0), 0);
    const s = (i === 5 ? 1.27 : 1.2) * (1 - 0.035 * Math.min(rang, 3)) * mix(1.1, 1, a) * (1 + 0.012 * k);
    // trois cartes visibles sous l'horloge : la quatrième s'efface pendant qu'on la pousse
    pose(c, { x: (1080 - 800 * s) / 2, y: 1485 - rang * 198 + 150 * (1 - a) - y, s, o: t < B(8) + 0.2 ? borne(a * 3) * borne(1 - (rang - 2) * 2.2) * (i === 5 ? 1 : mix(1, 0.34, perdu)) : 0 });
  });
  reveler($('#h1'), t, -1, { sortie: B(5) - 0.1 });
  reveler($('#h2'), t, B(5) - 0.02, { d: 0.5, sortie: B(7) + 0.04 });

  // 2. la réservation
  const arrive = av(t, B(8) - 0.3, 0.75);
  telR.pose({ x: 540, y: Y2 + 1290, z: k * 16, s: 1.42, rx: mix(9, 3, arrive), ry: mix(15, 5, arrive) - 7 * borne((t - B(8)) / (B(20) - B(8))), o: t > B(8) - 0.5 ? 1 : 0 });
  if (t > B(8) - 0.6) telR.temps(suivre(RESA, t));
  entre($('#mq'), t, B(8) - 0.02, { d: 0.45, y: -18, flou: 6 });
  reveler($('#r1'), t, B(8) - 0.04, { d: 0.6 });
  $$('.c-etape').forEach((e, i) => {
    const a = av(t, B(8) + 0.12 + i * 0.07, 0.4), fait = av(t, ETAPES[i], 0.22);
    pose(e, { y: 18 * (1 - a), s: 1 + 0.07 * fait * Math.exp(-Math.max(0, t - ETAPES[i]) * 7), o: borne(a * 2) });
    e.classList.toggle('faite', t >= ETAPES[i]);
  });

  // lumière : elle baisse quand le rendez-vous est perdu, elle claque quand le beat entre
  AMB.gain = (apres ? 1.25 : mix(0.95, 0.6, perdu)) + 0.45 * k;
  D.fond(t, { x: 0, y });
  eclair.style.opacity = apres ? (0.34 * Math.exp(-(t - B(8)) * 13)).toFixed(3) : '0';
  noir.style.opacity = t > DUREE - 0.5 ? borne((t - (DUREE - 0.5)) / 0.45).toFixed(3) : '0';
}

/* ── les bruitages (de vrais sons, posés sur les temps) ── */
window.SONS = [
  ...[0.03, B(1), B(2), B(3), B(4)].map(t => ({ t, son: 'bulle', gain: 0.5 })),
  { t: B(5), son: 'coup', gain: 0.7 }, { t: B(5), son: 'vibre', gain: 0.6 },
  { t: B(8), son: 'montee', gain: 0.45 }, { t: B(8) - 0.1, son: 'fouet', gain: 0.45 }, { t: B(8), son: 'basse', gain: 0.6 },
  ...[9, 10, 11, 12, 13, 14, 15].map(n => ({ t: B(n), son: 'clic', gain: 0.55 })), { t: B(16), son: 'reussi', gain: 0.6 },
].map(s => ({ ...s, t: +s.t.toFixed(3) })).sort((a, b) => a.t - b.t);
window.DUREE = DUREE;
// pas de voix : la musique seule (mesures 6-7 du morceau sous l'accroche, puis son beat), et les bruitages
window.PARTITION = { alertes: [], sansVoix: true, montage: [[6, 7], [8, 17]], reference: [B(8) + 0.2, 12], fondus: [0.05, 0.9] };
window.seek = async t => { rendre(t); await Promise.all(attentes); };
await window.seek(+new URLSearchParams(location.search).get('t') || 0);
window.pret = true;
