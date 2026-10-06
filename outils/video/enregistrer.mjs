// Filme les vraies pages du site, image par image, pour le film de présentation.
//
//   node enregistrer.mjs                 → tous les clips de clips.mjs, dans clips/<nom>/
//   node enregistrer.mjs resa agenda     → seulement ceux-là
//   node enregistrer.mjs resa --jusqua 3 → les 3 premières secondes (essai rapide)
//   node enregistrer.mjs --fps 30        → défaut 60
//   SITE=/chemin/vers/une/copie node enregistrer.mjs   → filmer une autre copie du site
//
// Chaque clip ouvre une page du site dans Chrome, avec le réseau simulé (lib/demo.mjs)
// et le temps tenu en laisse (lib/temps-virtuel.js) : pour chaque image, la page avance
// d'exactement 1/fps seconde, joue les gestes du scénario tombés à cet instant (vrais
// touchers, vraie frappe), puis est photographiée. Ce sont les animations du site
// lui-même qu'on voit, sans une saccade, quelle que soit la machine.
//
// Sortie : clips/<nom>/00000.jpg… et clips/<nom>/meta.json (taille, cadence, touchers,
// repères posés par le scénario). clips/ n'est pas versionné : tout se régénère d'ici.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { ICI, SITE, CHROME, servir, opt, args } from './lib/outils.mjs';
import { brancherApi } from './lib/demo.mjs';
import { CLIPS } from './clips.mjs';

const FPS = +opt('fps', 60);
const JUSQUA = opt('jusqua', null);
const PARALLELE = +opt('parallele', 3);
const demandes = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const aFilmer = demandes.length ? CLIPS.filter(c => demandes.includes(c.nom)) : CLIPS;
if (!aFilmer.length) { console.error('clip inconnu. Disponibles :', CLIPS.map(c => c.nom).join(', ')); process.exit(1); }

const serveur = await servir({ '/': SITE });
const navigateur = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function filmer(def) {
  const dossier = path.join(ICI, 'clips', def.nom);
  fs.rmSync(dossier, { recursive: true, force: true });
  fs.mkdirSync(dossier, { recursive: true });
  const duree = JUSQUA ? Math.min(+JUSQUA, def.duree) : def.duree;
  const n = Math.round(duree * FPS), dt = 1000 / FPS;
  const ctx = await navigateur.newContext({ viewport: { width: def.largeur, height: def.hauteur }, deviceScaleFactor: def.dpr || 2, isMobile: !!def.mobile, hasTouch: !!def.mobile, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const stockage = { ts_api: serveur.origine + '/__api', 'ts-lang': 'fr', ...(def.stockage || {}) };
  await ctx.addInitScript(([epoque, stockage]) => {
    window.__TV_EPOQUE = epoque;
    try { for (const [k, v] of Object.entries(stockage)) localStorage.setItem(k, v); } catch (_) {}
  }, [def.epoque, stockage]);
  await ctx.addInitScript({ path: path.join(ICI, 'lib/temps-virtuel.js') });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const soucis = [];
  page.on('pageerror', e => soucis.push('erreur : ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) soucis.push('console : ' + m.text().slice(0, 200)); });
  let t = 0;   // secondes écoulées dans le clip
  const maintenant = () => { const d = new Date(def.epoque + t * 1000); return [ymd(d), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`]; };
  const etat = { moment: 'debut', ...(def.etat || {}) };
  await brancherApi(page, { maintenant, salon: def.salon, etat });

  await page.goto(serveur.origine + def.url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__tv.repos(4));
  if (def.pret) await def.pret(page);
  await page.evaluate(() => window.__tv.repos(2));
  // `avant` : secondes jouées sans être filmées (la page finit de s'installer)
  for (let k = 0; k < Math.round((def.avant || 0) * 60); k++) { await page.evaluate(() => window.__tv.avancer(1000 / 60)); if (k % 6 === 5) await page.evaluate(() => window.__tv.repos(1)); }
  await page.evaluate(() => window.__tv.repos(2));

  // ── les gestes du scénario ──
  const meta = { nom: def.nom, scene: def.scene, depart: def.depart || 0, fps: FPS, images: n, largeur: def.largeur, hauteur: def.hauteur, dpr: def.dpr || 2, touchers: [], reperes: {} };
  const file = def.scenario.map(([quand, geste]) => ({ quand, geste })).sort((a, b) => a.quand - b.quand);
  const plus = (quand, geste) => { file.push({ quand, geste }); file.sort((a, b) => a.quand - b.quand); };
  const boite = async (cible) => {
    if (Array.isArray(cible)) return { x: cible[0], y: cible[1], l: 0, h: 0 };
    // cible : un sélecteur CSS, ou { trouve: 'expression JS qui rend un élément' }
    const r = await page.evaluate(c => {
      const e = typeof c === 'string' ? document.querySelector(c) : (0, eval)(c.trouve);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.width, h: b.height, gauche: b.left, haut: b.top };
    }, cible);
    if (!r) throw new Error(`[${def.nom}] introuvable à ${t.toFixed(2)} s : ${JSON.stringify(cible)}`);
    return r;
  };
  const h = {
    page, t: () => t,
    /** Vrai toucher (ou clic sur ordinateur), tenu `maintien` secondes : les états pressés du site se voient. */
    async tap(cible, { dx = 0, dy = 0, maintien = 0.09 } = {}) {
      const b = await boite(cible), x = b.x + dx, y = b.y + dy;
      meta.touchers.push({ t: +t.toFixed(4), x: +x.toFixed(1), y: +y.toFixed(1), d: maintien });
      if (def.mobile) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        plus(t + maintien, async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); });
      } else {
        await page.mouse.move(x, y); await page.mouse.down();
        plus(t + maintien, async () => { await page.mouse.up(); });
      }
    },
    /** Frappe lettre à lettre dans le champ (déjà touché, donc actif), une lettre toutes les `pas` secondes. */
    taper(texte, { pas = 0.055 } = {}) { [...texte].forEach((c, i) => plus(t + i * pas, () => page.keyboard.insertText(c))); },
    js: (fn, arg) => page.evaluate(fn, arg),
    /** Change l'état de l'histoire côté fausse API (voir demo.mjs) : pose({ moment: 'bot' }), pose({ bot: 'actif' }). */
    pose(o) { Object.assign(etat, o); },
    /** Retient où se trouve un élément à cet instant, pour que le film puisse le désigner. */
    async repere(nom, cible) { const b = await boite(cible); meta.reperes[nom] = { t: +t.toFixed(4), x: +b.gauche.toFixed(1), y: +b.haut.toFixed(1), l: +b.l.toFixed(1), h: +b.h.toFixed(1) }; },
  };

  const debut = Date.now();
  for (let i = 0; i < n; i++) {
    t = i / FPS;
    if (i > 0) await page.evaluate(d => window.__tv.avancer(d), dt);
    while (file.length && file[0].quand <= t + 1e-6) {
      const { geste } = file.shift();
      await geste(h);
      await page.evaluate(() => window.__tv.geler());
    }
    await page.evaluate(() => window.__tv.repos(2));
    fs.writeFileSync(path.join(dossier, String(i).padStart(5, '0') + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 93 }));
    if (i % FPS === 0) process.stdout.write(`\r[${def.nom}] ${t.toFixed(0)} / ${duree} s — ${((Date.now() - debut) / 1000).toFixed(0)} s   `);
  }
  const erreurs = await page.evaluate(() => window.__tv.erreurs);
  fs.writeFileSync(path.join(dossier, 'meta.json'), JSON.stringify(meta, null, 1));
  await ctx.close();
  console.log(`\r[${def.nom}] ${n} images en ${((Date.now() - debut) / 1000).toFixed(0)} s` + ([...soucis, ...erreurs].length ? '\n  ⚠ ' + [...new Set([...soucis, ...erreurs])].slice(0, 8).join('\n  ⚠ ') : ''));
}

for (let i = 0; i < aFilmer.length; i += PARALLELE) await Promise.all(aFilmer.slice(i, i + PARALLELE).map(filmer));
await navigateur.close();
serveur.fermer();
