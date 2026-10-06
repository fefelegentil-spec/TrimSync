// Ce que partagent enregistrer.mjs et rendu.mjs : Chrome, ffmpeg, un petit serveur de fichiers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // outils/video
/** Le site à filmer : la racine du dépôt, ou une autre copie (variable SITE). */
export const SITE = path.resolve(process.env.SITE || path.join(ICI, '../..'));

export const CHROME = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));

// ffmpeg : variable FFMPEG, sinon celui qu'apporte le paquet Python imageio-ffmpeg, sinon le PATH.
function ffmpegPython() {
  const racines = [process.env.APPDATA && path.join(process.env.APPDATA, 'Python'), 'C:/Python314/Lib/site-packages'].filter(Boolean);
  for (const r of racines) {
    if (!fs.existsSync(r)) continue;
    const pile = [r];
    for (let n = 0; pile.length && n < 400; n++) {
      const d = pile.pop();
      let entrees; try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of entrees) {
        const p = path.join(d, e.name);
        if (e.isDirectory() && /^(Python\d*|site-packages|imageio_ffmpeg|binaries)$/i.test(e.name)) pile.push(p);
        else if (/^ffmpeg.*\.exe$/i.test(e.name)) return p;
      }
    }
  }
  return null;
}
export const FFMPEG = process.env.FFMPEG || ffmpegPython() || 'ffmpeg';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };

/** Serveur de fichiers : `montages` associe un préfixe d'URL à un dossier ({ '/': SITE, '/film/': ICI }). */
export async function servir(montages) {
  const prefixes = Object.keys(montages).sort((a, b) => b.length - a.length);
  const serveur = http.createServer((req, res) => {
    let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const pre = prefixes.find(p => chemin.startsWith(p));
    if (!pre) { res.writeHead(404); return res.end(); }
    const racine = path.resolve(montages[pre]);
    let f = path.join(racine, chemin.slice(pre.length));
    if (!f.startsWith(racine)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';   // /reserver → reserver.html, comme en ligne
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(ok => serveur.listen(0, '127.0.0.1', ok));
  return { port: serveur.address().port, origine: `http://127.0.0.1:${serveur.address().port}`, fermer: () => serveur.close() };
}

export const args = process.argv.slice(2);
export const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
export const drapeau = k => args.includes('--' + k);
