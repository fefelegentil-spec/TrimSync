// Rend le film de présentation (film.html) image par image, puis monte le son.
//
//   node rendu.mjs                      → sortie/trimsync-presentation-<voix>.mp4, une par voix (temps.mjs : VOIX)
//   node rendu.mjs --stills 12.5,30     → apercus/t012.50.png… pour relire un instant
//   node rendu.mjs --bande 11.4:12.6:8  → apercus/bande-….jpg : 8 images de 11,4 à 12,6 s côte à côte (relire un mouvement)
//   node rendu.mjs --planche 24         → apercus/planche.jpg : 24 images réparties sur tout le film
//   node rendu.mjs --de 20 --a 36       → seulement cette portion (essai)
//   node rendu.mjs --son                → sortie/son-<voix>.wav : la bande son seule, sans rendre l'image
//   --fps 60 (défaut) · --dpr 2 (défaut : rendu en 3840 × 2160 puis réduit, bords nets) · --travailleurs 4 · --muet · --4k
//
// Avant : python voix.py (la voix), node enregistrer.mjs (les clips du site).
// Chrome est piloté sans fenêtre ; pour chaque image la page reçoit seek(t) puis est
// photographiée : aucune animation ne tourne « en vrai », donc aucune saccade.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { ICI, CHROME, FFMPEG, servir, opt, drapeau } from './lib/outils.mjs';
import { bandeSon, sousTitres } from './lib/son.mjs';
import { VOIX } from './temps.mjs';

const FPS = +opt('fps', 60), DPR = +opt('dpr', 2), TRAVAILLEURS = +opt('travailleurs', 4);
const FILM = opt('film', 'film');   // film : 1 min 41, avec voix · court : 20 s, vertical, sans voix (court.html)
const [L, H] = FILM === 'court' ? [1080, 1920] : [1920, 1080], NOM = FILM === 'court' ? 'trimsync-20s' : 'trimsync-presentation';
const STILLS = opt('stills', null), BANDE = opt('bande', null), PLANCHE = opt('planche', null);
const serveur = await servir({ '/': ICI });
const navigateur = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ['--force-color-profile=srgb', '--disable-lcd-text'] });

async function ouvrir(dpr = DPR) {
  const page = await navigateur.newPage({ viewport: { width: L, height: H }, deviceScaleFactor: dpr });
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/favicon/.test(m.text())) console.error('[page]', m.text().slice(0, 300)); });
  page.on('pageerror', e => console.error('[page]', e.message));
  await page.goto(`${serveur.origine}/${FILM}.html`);
  await page.waitForFunction(() => window.pret, null, { timeout: 120000 });
  return page;
}
const photo = async (page, t, type = 'png') => { await page.evaluate(t => window.seek(t), t); return page.screenshot(type === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 97 }); };
const apercus = path.join(ICI, 'apercus');
const montagePlanche = (fichiers, sortie, colonnes, largeur) => spawnSync(FFMPEG, ['-y', '-v', 'error', ...fichiers.flatMap(f => ['-i', f]), '-filter_complex',
  `${fichiers.map((_, i) => `[${i}:v]scale=${largeur}:-1[v${i}]`).join(';')};${fichiers.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${fichiers.length}:layout=${fichiers.map((_, i) => `${(i % colonnes) * largeur}_${Math.floor(i / colonnes) * Math.round(largeur * H / L)}`).join('|')}`,
  '-frames:v', '1', '-q:v', '3', sortie], { stdio: 'inherit' });

if (STILLS || BANDE || PLANCHE) {
  fs.mkdirSync(apercus, { recursive: true });
  const page = await ouvrir(+opt('dpr', 1));
  const duree = await page.evaluate(() => window.DUREE);
  const alertes = await page.evaluate(() => window.PARTITION.alertes);
  if (alertes.length) console.warn('⚠ partition :', alertes.join(' ; '));
  if (STILLS) for (const s of STILLS.split(',').map(Number)) {
    const f = path.join(apercus, `t${s.toFixed(2).padStart(6, '0')}.png`);
    fs.writeFileSync(f, await photo(page, s)); console.log(f);
  }
  if (BANDE || PLANCHE) {
    const [a, b, n] = BANDE ? BANDE.split(':').map(Number) : [0.4, duree - 0.6, +PLANCHE];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-bande-')), fichiers = [];
    for (let i = 0; i < n; i++) { const t = a + (b - a) * i / (n - 1), f = path.join(tmp, `${i}.jpg`); fs.writeFileSync(f, await photo(page, t, 'jpeg')); fichiers.push(f); }
    const colonnes = +opt('colonnes', BANDE ? Math.min(n, 4) : 6), sortie = path.join(apercus, BANDE ? `bande-${a.toFixed(2)}-${b.toFixed(2)}.jpg` : 'planche.jpg');
    montagePlanche(fichiers, sortie, colonnes, +opt('largeur', (BANDE ? 640 : 480) * (H > L ? 0.5 : 1)));
    console.log(sortie, '| instants :', fichiers.map((_, i) => (a + (b - a) * i / (n - 1)).toFixed(2)).join(' '));
  }
} else if (drapeau('son')) {
  const sortie = path.join(ICI, 'sortie'); fs.mkdirSync(sortie, { recursive: true });
  const page = await ouvrir(1);
  const duree = await page.evaluate(() => window.DUREE), partition = await page.evaluate(() => ({ ...window.PARTITION, sons: window.SONS }));
  for (const voix of partition.sansVoix ? [null] : VOIX) { const f = path.join(sortie, `son-${voix || FILM}.wav`); await bandeSon({ voix, partition, duree, sortie: f }); console.log('→', f); }
} else {
  // ── le film ──
  const sortie = path.join(ICI, 'sortie'); fs.mkdirSync(sortie, { recursive: true });
  const pages = await Promise.all(Array.from({ length: TRAVAILLEURS }, () => ouvrir()));
  const duree = await pages[0].evaluate(() => window.DUREE);
  const partition = await pages[0].evaluate(() => ({ ...window.PARTITION, sons: window.SONS || [] }));
  if (partition.alertes.length) console.warn('⚠ partition :', partition.alertes.join(' ; '));
  const de = +opt('de', 0), a = +opt('a', duree), i0 = Math.round(de * FPS), n = Math.round(a * FPS) - i0;
  const muet = path.join(os.tmpdir(), `ts-film-${process.pid}.mp4`);
  const grand = drapeau('4k') && DPR >= 2;
  // setparams : sans lui, primaires et transfert restent « non précisés » dans le flux, et ffmpeg
  // range alors dans le mp4 le profil ICC des captures à la place de l'étiquette BT.709 attendue partout.
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${grand ? `${L * 2}:${H * 2}` : `${L}:${H}`}:flags=lanczos:in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt('crf', grand ? '20' : '18'), '-profile:v', 'high', '-g', String(FPS * 2), '-bf', '2', '-x264-params', 'aq-mode=3:aq-strength=0.9',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', muet], { stdio: ['pipe', 'inherit', 'inherit'] });
  // Les pages se partagent les images (une sur N chacune) ; on les écrit dans l'ordre.
  const pretes = new Map(); let suivante = 0; const debut = Date.now();
  const ecrire = async () => {
    while (pretes.has(suivante)) {
      const b = pretes.get(suivante); pretes.delete(suivante);
      if (!ff.stdin.write(b)) await once(ff.stdin, 'drain');
      if (suivante % FPS === 0) process.stdout.write(`\r${(de + suivante / FPS).toFixed(0)} / ${a.toFixed(0)} s — ${((Date.now() - debut) / 1000).toFixed(0)} s écoulées   `);
      suivante++;
    }
  };
  let ecriture = Promise.resolve();
  await Promise.all(pages.map(async (page, k) => {
    for (let i = k; i < n; i += TRAVAILLEURS) {
      while (i - suivante > TRAVAILLEURS * 6) await new Promise(r => setTimeout(r, 15));
      pretes.set(i, await photo(page, (i0 + i) / FPS, 'jpeg'));
      ecriture = ecriture.then(ecrire);
    }
  }));
  await ecriture; ff.stdin.end();
  const [code] = await once(ff, 'close');
  if (code !== 0) throw new Error(`ffmpeg a échoué (${code})`);
  console.log(`\nimage : ${n} images en ${((Date.now() - debut) / 1000).toFixed(0)} s`);
  const suffixe = (de > 0 || a < duree) ? `-extrait-${de}-${a}` : '';
  if (drapeau('muet')) {
    const f = path.join(sortie, `${NOM}-muet${suffixe}.mp4`); fs.copyFileSync(muet, f); console.log('→', f);
  } else for (const voix of partition.sansVoix ? [null] : VOIX) {
    const wav = path.join(os.tmpdir(), `ts-son-${process.pid}-${voix}.wav`);
    await bandeSon({ voix, partition, duree, sortie: wav });
    const f = path.join(sortie, `${NOM}${voix ? `-voix-${voix === 'remy' ? 'homme' : 'femme'}` : ''}${grand ? '-4k' : ''}${suffixe}.mp4`);
    const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', muet, ...(de > 0 ? ['-ss', String(de)] : []), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', f], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('montage du son : échec');
    fs.rmSync(wav, { force: true });
    console.log('→', f, `(${(fs.statSync(f).size / 1048576).toFixed(1)} Mio)`);
  }
  if (!suffixe && !partition.sansVoix) { const srt = path.join(sortie, 'trimsync-presentation.srt'); sousTitres(partition, srt); console.log('→', srt); }
  fs.rmSync(muet, { force: true });
}
await navigateur.close();
serveur.fermer();
