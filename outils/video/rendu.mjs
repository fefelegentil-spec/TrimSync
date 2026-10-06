// Rendu de la vidéo de présentation TrimSync (presentation.html), image par image, avec la voix.
//
//   python voix.py                     → la voix off (voix/*.mp3, durees.json, mots.json) — à faire une fois
//   node rendu.mjs                     → sortie/trimsync-presentation.mp4
//   node rendu.mjs --stills 12,30,55   → PNG dans ./apercus/, pour relire un instant précis
//   node rendu.mjs --muet              → sans la bande son
//   node rendu.mjs --fps 60            → plus fluide, deux fois plus lourd
//
// Chrome (ou Edge) est piloté sans fenêtre : pour chaque image la page reçoit seek(t),
// puis on la photographie. ffmpeg : variable FFMPEG, sinon celui d'imageio-ffmpeg (pip),
// sinon celui du PATH. Les bruitages et la musique viennent de Mixkit, déjà téléchargés
// par l'arbre FCUTZ (../../../outils/videos/sons) : licence « commerciale, sans mention,
// mais pas de redistribution des fichiers seuls », donc jamais commités ici.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FPS = +opt('fps', 30);
const STILLS = opt('stills', null);
const MUET = args.includes('--muet');
const OUT = path.resolve(ICI, opt('out', 'sortie/trimsync-presentation.mp4'));
const SONS = path.resolve(ICI, '../../../outils/videos/sons');
const FFMPEG = process.env.FFMPEG || [
  path.join(process.env.APPDATA || '', 'Python/Python314/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'),
].find(p => fs.existsSync(p)) || 'ffmpeg';

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.js': 'text/javascript', '.css': 'text/css' };
const serveur = http.createServer((req, res) => {
  const p = path.join(ICI, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ICI) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(ok => serveur.listen(0, '127.0.0.1', ok));

const exe = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(p => fs.existsSync(p));
const navigateur = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await navigateur.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.error('[page]', m.text()); });
page.on('pageerror', e => console.error('[page]', e.message));
await page.goto(`http://127.0.0.1:${serveur.address().port}/presentation.html?capture`);
await page.waitForFunction(() => window.pret, null, { timeout: 120000 });
const etat = await page.evaluate(() => window.pret);
if (etat !== true) throw new Error(`presentation.html ne s'est pas chargée (${etat})`);
const repères = await page.evaluate(() => ({ DUREE: window.DUREE, SCN: window.SCN, V: window.V, SFX: window.SFX, VOIX: window.VOIX, MUSIQUE: window.MUSIQUE, ECH: window.ECHANTILLONS }));
const DUREE = repères.DUREE;
console.log(`durée : ${DUREE.toFixed(1)} s, ${repères.SFX.length} bruitages`);
console.log('scènes :', repères.SCN.map(s => s.a.toFixed(1)).join(' | '), '\nvoix :', Object.entries(repères.V).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));

async function image(t) { await page.evaluate(t => window.seek(t), t); return page.screenshot({ type: 'png' }); }

// ── son : bruitages sommés en Node (décodés par ffmpeg), puis mixage final par ffmpeg ──
const EXTRAITS = { tic: [.096, .13] };
function decoder(f) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg ne lit pas ${f} : ${r.stderr}`);
  const a = new Float32Array(r.stdout.byteLength >> 2); Buffer.from(a.buffer).set(r.stdout.subarray(0, a.length << 2));
  return a;
}
function lit(id) { for (const e of ['wav', 'mp3']) { const f = path.join(SONS, `mixkit-${id}.${e}`); if (fs.existsSync(f)) return f; } throw new Error(`son manquant : mixkit-${id} dans ${SONS}`); }
function lit_musique(id) { const f = path.join(SONS, `mixkit-musique-${id}.mp3`); if (!fs.existsSync(f)) throw new Error(`musique manquante : ${f}`); return f; }
function ecrireWav(f, pcm) {   // pcm : Float32 entrelacé stéréo, 48 kHz → WAV 16 bits
  const n = pcm.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(48000, 24); b.writeUInt32LE(48000 * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(f, b);
}
function bruitages(chemin) {
  const total = Math.ceil(DUREE * 48000) * 2, bed = new Float32Array(total), cache = {};
  for (const e of repères.SFX) {
    const id = repères.ECH[e.f]; if (!id) throw new Error(`bruitage inconnu : ${e.f}`);
    let s = cache[e.f] ||= decoder(lit(id));
    if (EXTRAITS[e.f]) s = s.subarray(Math.round(EXTRAITS[e.f][0] * 48000) * 2, Math.round(EXTRAITS[e.f][1] * 48000) * 2);
    const o = Math.round(Math.max(0, e.t) * 48000) * 2, g = e.v ?? .5, fin = s.length;
    for (let i = 0; i < fin && o + i < total; i++) { const rel = i / fin; bed[o + i] += s[i] * g * (rel > .85 ? (1 - rel) / .15 : 1); }
  }
  ecrireWav(chemin, bed);
}
function mixer(chemin, tmp) {
  const bed = path.join(tmp, 'bruitages.wav'); bruitages(bed);
  const musique = lit_musique(repères.MUSIQUE.id), M = repères.MUSIQUE;
  const ins = ['-i', bed, '-i', musique, ...repères.VOIX.flatMap(v => ['-i', path.join(ICI, v.f)])];
  const nv = repères.VOIX.length;
  const f = [];
  repères.VOIX.forEach((v, i) => f.push(`[${i + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(v.t * 1000)}:all=1,volume=1.35[v${i}]`));
  f.push(`${repères.VOIX.map((_, i) => `[v${i}]`).join('')}amix=inputs=${nv}:normalize=0:duration=longest[vo]`, `[vo]asplit=2[vo1][vo2]`);
  f.push(`[1:a]atrim=start=${M.debut},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=${M.gain},afade=t=in:st=0:d=2.5,afade=t=out:st=${(DUREE - 3.5).toFixed(2)}:d=3.5[mu]`);
  f.push(`[mu][vo2]sidechaincompress=threshold=0.015:ratio=7:attack=20:release=450[mud]`);
  f.push(`[vo1][mud][0:a]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-15:TP=-1.5:LRA=11,atrim=0:${DUREE.toFixed(2)}[out]`);
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', ...ins, '-filter_complex', f.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '48000', chemin], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('mixage : ' + r.stderr);
  return chemin;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (STILLS) {
  const dossier = path.join(ICI, 'apercus'); fs.mkdirSync(dossier, { recursive: true });
  for (const s of STILLS.split(',').map(Number)) { const f = path.join(dossier, `t${s.toFixed(2).padStart(6, '0')}.png`); fs.writeFileSync(f, await image(s)); console.log(f); }
} else {
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || ICI, 'ts-video-'));
  const son = MUET ? [] : ['-i', mixer(path.join(tmp, 'son.wav'), tmp), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest'];
  const n = Math.round(DUREE * FPS);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...son,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const debut = Date.now();
  for (let i = 0; i < n; i++) {
    if (!ff.stdin.write(await image(i / FPS))) await once(ff.stdin, 'drain');
    if (i % FPS === 0) process.stdout.write(`\r${(i / FPS).toFixed(0)} / ${DUREE.toFixed(0)} s — ${((Date.now() - debut) / 1000).toFixed(0)} s écoulées`);
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  console.log(code === 0 ? `\n→ ${OUT}` : `\nffmpeg a échoué (${code})`);
}
await navigateur.close();
serveur.close();
