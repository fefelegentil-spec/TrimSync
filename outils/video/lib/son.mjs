// La bande son du film : la voix, la musique remontée sur les scènes, les bruitages.
//
// - La musique (Young Trizzy, Arulo, 140 BPM) est recoupée MESURE PAR MESURE d'après
//   MONTAGE (temps.mjs) : son intro sous le problème, l'entrée de son beat sur le nom, sa
//   pause sous « Le bot », sa reprise quand le bot se met au travail. Les coupes tombent
//   sur les barres de mesure, avec un fondu de 10 ms : on ne les entend pas.
// - Elle s'efface sous la voix (et remonte dans les silences), sans compresseur : on sait
//   exactement quand la voix parle (voix/<voix>/durees.json).
// - Les bruitages sont de vrais enregistrements (Mixkit), jamais synthétisés ; chacun est
//   posé de façon que son PIC tombe sur le geste.
//
// Musique et bruitages viennent de Mixkit (licence gratuite : usage commercial dans une
// vidéo permis, redistribution des fichiers seuls interdite). Ils ne sont pas versionnés :
// ce module les lit dans le dossier des vidéos FCUTZ (variable SONS pour un autre dossier).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ICI, FFMPEG } from './outils.mjs';
import { MONTAGE, MESURE, PRINCIPALE } from '../temps.mjs';

const SR = 48000;
const SONS = path.resolve(process.env.SONS || path.join(ICI, '../../../outils/videos/sons'));
const MUSIQUE = 'mixkit-musique-431.mp3';
// nom utilisé par les scènes → [fichier Mixkit, gain propre]
const BRUITS = {
  souffle: [['1490', 1]], fouet: [['1492', 0.8]], aspire: [['2608', 0.7]], balaye: [['166', 0.8]], basse: [['2299', 0.62]], coup: [['2150', 0.8]],
  clic: [['1109', 0.9]], bulle: [['2354', 1.5]], pop: [['3005', 0.6]], montee: [['790', 1.5]], tic: [['1109', 0.6]],
  vibre: [['2299', 0.3]], envoi: [['3005', 0.5], ['166', 0.3]], reussi: [['3005', 0.6], ['2354', 1.2]], pose: [['2299', 0.5], ['3005', 0.5]],
};

function decoder(f) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg ne lit pas ${f} : ${r.stderr}`);
  const a = new Float32Array(r.stdout.byteLength >> 2); Buffer.from(a.buffer).set(r.stdout.subarray(0, a.length << 2));
  return a;   // stéréo entrelacée
}
function fichier(id) {
  for (const e of ['wav', 'mp3']) { const f = path.join(SONS, `mixkit-${id}.${e}`); if (fs.existsSync(f)) return f; }
  throw new Error(`bruitage manquant : mixkit-${id} dans ${SONS} (les vidéos FCUTZ les téléchargent : cd outils/videos && node rendu.mjs --video tarifs --son-seul x.wav)`);
}
function ecrireWav(f, pcm) {
  const n = pcm.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, n * 4).copy(b, 44);
  fs.writeFileSync(f, b);
}
const efficace = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };

/** La musique, remontée : les mesures de MONTAGE mises bout à bout, fondues aux coupes. */
function musique(duree, montage = MONTAGE) {
  const src = decoder(path.join(SONS, MUSIQUE)), n = Math.round(duree * SR), out = new Float32Array(n * 2), X = Math.round(0.010 * SR);
  // L'intro et la pause du morceau n'ont ni basse ni batterie : on les remonte, sinon elles disparaissent sous la voix.
  const relief = mesure => mesure <= 6 ? 1.8 : mesure === 7 ? null : (mesure >= 24 && mesure <= 30) ? 1.7 : mesure === 31 ? null : 1;
  let mesures = 0;
  for (const [a, b] of montage) {
    const pos = Math.round(mesures * MESURE * SR), s0 = Math.round(a * MESURE * SR), len = Math.round((b - a + 1) * MESURE * SR);
    for (let i = -X; i < len + X; i++) {
      const d = pos + i, s = s0 + i;
      if (d < 0 || d >= n || s < 0 || s * 2 + 1 >= src.length) continue;
      const fenetre = Math.min(1, (i + X) / (2 * X), (len + X - i) / (2 * X));   // fondu croisé de 20 ms à chaque coupe
      const m = a + Math.floor(i / (MESURE * SR)), dans = (i / (MESURE * SR)) % 1;
      let g = relief(Math.min(b, Math.max(a, m)));
      if (g === null) g = (m === 7 ? 1.8 : 1.7) + (1 - (m === 7 ? 1.8 : 1.7)) * Math.max(0, dans);   // la mesure de montée redescend au gain normal
      out[d * 2] += src[s * 2] * fenetre * g; out[d * 2 + 1] += src[s * 2 + 1] * fenetre * g;
    }
    mesures += b - a + 1;
  }
  return out;
}

/** La voix : chaque phrase posée à son instant. Une phrase trop longue pour sa place est légèrement accélérée. */
function voixOff(voix, partition, duree) {
  const n = Math.round(duree * SR), out = new Float32Array(n * 2), parle = [];
  if (!voix) return { out, parle };   // le film court n'a pas de voix
  const lire = f => JSON.parse(fs.readFileSync(path.join(ICI, 'voix', voix, f), 'utf8'));
  const d = lire('durees.json');
  const lignes = Object.entries(partition.V).sort((x, y) => x[1].t - y[1].t);
  lignes.forEach(([k, v], i) => {
    const suivant = lignes[i + 1], limite = Math.min(suivant ? suivant[1].t - 0.08 : duree, partition.scenes[v.scene].b + 0.25);
    let f = path.join(ICI, 'voix', voix, `${k}.mp3`), fin = d[k].fin, debut = d[k].debut;
    if (v.t + fin > limite) {
      const tempo = Math.min(1.25, (fin - debut) / Math.max(0.2, limite - v.t - debut));
      const tmp = path.join(os.tmpdir(), `ts-voix-${process.pid}-${k}.wav`);
      spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', f, '-af', `atempo=${tempo.toFixed(4)}`, tmp]);
      console.log(`  voix ${voix} : « ${k} » accélérée de ${((tempo - 1) * 100).toFixed(0)} % pour tenir avant la phrase suivante`);
      f = tmp; fin = debut + (fin - debut) / tempo; debut /= tempo;
    }
    const x = decoder(f), o = Math.round(v.t * SR) * 2;
    for (let j = 0; j < x.length && o + j < out.length; j++) out[o + j] += x[j];
    parle.push([v.t + debut, v.t + fin, k]);
    if (f.endsWith('.wav')) fs.rmSync(f, { force: true });
  });
  return { out, parle };
}

/** Les bruitages : le pic de chaque son tombe sur son instant. */
function bruitages(sons, duree) {
  const n = Math.round(duree * SR), out = new Float32Array(n * 2), cache = {};
  for (const { t, son, gain } of sons) {
    if (!BRUITS[son]) throw new Error(`bruitage inconnu : ${son}`);
    for (const [id, propre] of BRUITS[son]) {
      const x = cache[id] ||= (() => { const s = decoder(fichier(id)); let pic = 0, m = 0; for (let i = 0; i < s.length; i += 2) { const a = Math.abs(s[i]) + Math.abs(s[i + 1]); if (a > m) { m = a; pic = i >> 1; } } return { s, pic, crete: m / 2 }; })();
      const o = (Math.round(t * SR) - x.pic) * 2, g = gain * propre / Math.max(0.5, x.crete);
      for (let j = Math.max(0, -o); j < x.s.length && o + j < out.length; j++) out[o + j] += x.s[j] * g;
    }
  }
  return out;
}

/** Construit la bande son complète (WAV) pour une voix. */
export async function bandeSon({ voix, partition, duree, sortie }) {
  const n = Math.round(duree * SR);
  const { out: v, parle } = voixOff(voix, partition, duree);
  // niveau de la voix : mesuré là où elle parle, ramené à une valeur fixe
  let s = 0, c = 0; for (const [a, b] of parle) for (let i = Math.round(a * SR) * 2; i < Math.round(b * SR) * 2 && i < v.length; i++) { s += v[i] * v[i]; c++; }
  if (c) { const gv = 0.10 / Math.sqrt(s / c); for (let i = 0; i < v.length; i++) v[i] *= gv; }
  // la musique : 14 dB sous la voix quand elle parle, 8 dB sous elle dans les silences
  const [r0, r1] = partition.reference || [16, 26], [ouvre, ferme] = partition.fondus || [0.5, 2.4];   // où mesurer la musique ; ses fondus de début et de fin
  const m = musique(duree, partition.montage), ref = efficace(m, Math.round(r0 * SR) * 2, Math.round(r1 * SR) * 2);
  // (le nom et la dernière phrase tombent sur les deux moments forts de la musique : elle s'y efface moins)
  const niveau = dB => 0.10 * Math.pow(10, dB / 20) / ref, haut = niveau(-8), sous = k => niveau(k === 'nom' || k === 'fin' ? -10 : -14);
  let env = haut, k = 0; const att = 1 - Math.exp(-1 / (0.10 * SR)), rel = 1 - Math.exp(-1 / (0.45 * SR));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (k < parle.length && t > parle[k][1] + 0.12) k++;
    const cible = k < parle.length && t >= parle[k][0] - 0.18 ? sous(parle[k][2]) : haut;
    env += (cible - env) * (cible < env ? att : rel);
    const fondu = Math.min(1, t / ouvre, (duree - t) / ferme);
    m[i * 2] *= env * Math.max(0, fondu); m[i * 2 + 1] *= env * Math.max(0, fondu);
  }
  const b = bruitages(partition.sons, duree);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-son-'));
  const [fv, fm, fb] = ['voix', 'musique', 'bruits'].map(x => path.join(tmp, x + '.wav'));
  ecrireWav(fv, v); ecrireWav(fm, m); ecrireWav(fb, b);
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', fv, '-i', fm, '-i', fb, '-filter_complex',
    `[0:a]highpass=f=75,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=140:makeup=2[v];[2:a]volume=0.55[b];[v][1:a][b]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-2:LRA=11,alimiter=limit=0.8:level=false,atrim=0:${duree.toFixed(3)}[s]`,
    '-map', '[s]', '-ar', String(SR), '-c:a', 'pcm_s16le', sortie]);
  if (r.status !== 0) throw new Error('mixage : ' + r.stderr);
  if (process.env.GARDER_PISTES) console.log('  pistes séparées gardées dans', tmp); else fs.rmSync(tmp, { recursive: true, force: true });
  return sortie;
}

/** Les sous-titres (une réplique par phrase), calés sur la voix principale. */
export function sousTitres(partition, sortie) {
  const d = JSON.parse(fs.readFileSync(path.join(ICI, 'voix', PRINCIPALE, 'durees.json'), 'utf8'));
  const hms = t => { const ms = Math.round(t * 1000), p = (x, n = 2) => String(x).padStart(n, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  const lignes = Object.entries(partition.V).sort((x, y) => x[1].t - y[1].t);
  fs.writeFileSync(sortie, lignes.map(([k, v], i) => `${i + 1}\n${hms(v.t + d[k].debut)} --> ${hms(v.t + d[k].fin + 0.25)}\n${d[k].texte}\n`).join('\n'), 'utf8');
}
