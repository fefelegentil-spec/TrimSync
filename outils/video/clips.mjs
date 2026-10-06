// Les clips : quelles pages du site sont filmées, à quelle heure de l'histoire, avec quels gestes.
//
// Chaque clip appartient à une scène du film et y démarre à `depart` secondes (négatif :
// avant la scène, le temps que l'écran arrive dans le champ). Les gestes sont écrits en
// secondes de la SCÈNE et calés sur les repères de temps.mjs, donc sur les mots de la voix.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partition, PRINCIPALE } from './temps.mjs';
import { heure, jour } from './lib/demo.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = f => JSON.parse(fs.readFileSync(path.join(ICI, 'voix', PRINCIPALE, f), 'utf8'));
export const P = partition(lire('durees.json'), lire('mots.json'));
const { C, scenes } = P;

// Un écran de téléphone fait 390 × 844 points. Une page ouverte dans Safari y dispose de 714
// (barre d'état en haut, barre d'adresse en bas) ; l'appli installée, de 777.
const SAFARI = { largeur: 390, hauteur: 714, dpr: 3, mobile: true };
const APPLI = { largeur: 390, hauteur: 777, dpr: 3, mobile: true };
const CLIENTE = JSON.stringify({ fname: 'Inès', lname: 'Martin', telephone: '06 12 34 56 78', email: '', nom: 'Inès Martin' });
const session = epoque => ({ ts_jeton: 'film', ts_notif_plus_tard: String(epoque) });
const texte = (sel, t) => ({ trouve: `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim() === ${JSON.stringify(t)})` });
const contient = (sel, t) => ({ trouve: `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(t)}))` });
const agenda = (page, date, vue = 'day') => page.evaluate(async ([d, v]) => { nav('agenda'); agView = v; agDate = new Date(d + 'T12:00:00'); await renderAgenda(); }, [date, vue]);
// L'agenda garde en mémoire la période déjà chargée : on l'oublie pour qu'il relise les rendez-vous.
const rafraichir = h => h.js(async () => { rdvCharges = { du: null, au: null }; await renderAgenda(); });

/** Fabrique un clip : les gestes passent du temps de la scène au temps du clip. */
function clip(def) {
  const scene = scenes[def.scene];
  const fin = def.fin ?? scene.d + 0.6;    // par défaut jusqu'à la fin de la scène, plus le temps de sortir du champ
  return { ...def, duree: +(fin - def.depart).toFixed(3), scenario: (def.gestes || []).map(([quand, geste]) => [quand - def.depart, geste]) };
}

const R = C.resa, D = C.dash, L = C.lien, O = C.perso, A = C.action, K = C.cas;

export const CLIPS = [
  /* ── La réservation : la vraie page publique, du splash au rendez-vous confirmé ── */
  clip({
    nom: 'resa', scene: 'resa', depart: R.clip, ...SAFARI, url: '/reserver.html?salon=studio-nova', epoque: heure('12:41'), stockage: { ts_client: CLIENTE },
    gestes: [
      [R.presta, h => h.tap('.svc[data-id="p2"]')],
      [R.suite1, h => h.tap('#pay-btn')],
      [R.jour, h => h.tap(texte('#cal-grid .cal-d', '10'))],
      [R.creneau, h => h.tap(texte('#slots .slot', '14:30'))],
      [R.suite2, h => h.tap('#pay-btn')],
      [R.accord, h => h.tap('.consent-label', { dx: -150 })],
      [R.confirme, h => h.tap('#pay-btn')],
      [R.acompte - 0.35, h => h.js(() => { const b = document.querySelector('.acompte-bloc'); if (b) window.scrollTo({ top: window.scrollY + b.getBoundingClientRect().top - 230, behavior: 'smooth' }); })],
      [R.acompte + 0.4, h => h.repere('acompte', '.acompte-bloc')],
    ],
  }),
  // Deux autres salons, pour « à ton nom, à tes couleurs » : même page, autre nom, autre teinte.
  clip({ nom: 'resa-rose', scene: 'resa', depart: R.eventail - 0.15, ...SAFARI, url: '/reserver.html?salon=lash-room', epoque: heure('12:41') }),
  clip({ nom: 'resa-corail', scene: 'resa', depart: R.eventail + 0.05, ...SAFARI, url: '/reserver.html?salon=maison-solene', epoque: heure('12:41') }),

  /* ── Le dashboard : le rendez-vous pris à l'instant arrive dans l'agenda de la semaine ── */
  clip({
    nom: 'agenda', scene: 'dash', depart: D.clipAgenda, fin: D.clipAppli + 2.2, largeur: 1440, hauteur: 900, dpr: 2, url: '/app.html', epoque: heure('12:42'), stockage: session(heure('12:42')),
    pret: page => agenda(page, jour(0), 'week'), avant: 0.8,
    gestes: [
      [D.arrive - 0.12, async h => { h.pose({ moment: 'reserve' }); await rafraichir(h); }],
      [D.arrive + 0.1, h => h.repere('nouveau', contient('.ag-appt', 'Inès Martin'))],
    ],
  }),
  // … puis le tour de l'appli, sur le téléphone : clients, chiffre, horaires.
  clip({
    nom: 'appli', scene: 'dash', depart: D.clipAppli, ...APPLI, url: '/app.html', epoque: heure('12:43'), stockage: session(heure('12:43')), etat: { moment: 'reserve' },
    pret: page => agenda(page, jour(2)), avant: 0.8,
    gestes: [
      [D.clients, h => h.tap('.mnav-item[data-page="clients"]')],
      [D.chiffre, h => h.tap('.mnav-item[data-page="dashboard"]')],
      [D.horaires, h => h.tap('.mnav-item[data-page="disponibilites"]')],
    ],
  }),

  /* ── Brancher le bot : la vraie carte « Bot Instagram » des réglages ── */
  clip({
    nom: 'bot-carte', scene: 'lien', depart: L.clip, ...APPLI, url: '/app.html', epoque: heure('18:20'), stockage: session(heure('18:20')), etat: { moment: 'reserve', bot: 'inactif' },
    pret: async page => {
      await page.evaluate(() => nav('parametres'));
      await page.waitForFunction(() => [...document.querySelectorAll('#page-parametres button')].some(b => b.textContent.includes('Activer le bot')));
      await page.evaluate(() => { const b = [...document.querySelectorAll('#page-parametres button')].find(x => x.textContent.includes('Activer le bot')); window.scrollTo(0, window.scrollY + b.getBoundingClientRect().top - 420); });
    },
    avant: 0.6,
    gestes: [
      [L.activer, h => h.tap(contient('#page-parametres button', 'Activer le bot'))],
      [L.actif - 0.1, async h => { h.pose({ bot: 'actif' }); await h.js(() => renderParametres()); }],
      [L.actif + 0.3, h => h.repere('carte', contient('#page-parametres .ts-texte', 'est actif'))],
    ],
  }),

  /* ── Régler le bot : le vrai formulaire « Ton bot, en ligne en 2 minutes » de la landing ── */
  clip({
    nom: 'reglage', scene: 'perso', depart: O.clip, ...SAFARI, url: '/index.html', epoque: heure('18:31'),
    pret: async page => {
      await page.evaluate(() => { openBotModal(); document.getElementById('bf-name').value = 'Maya'; document.getElementById('bf-ville').value = 'Lyon'; document.getElementById('bf-ig').value = '@studio.nova';
        document.getElementById('bf-accueil').placeholder = 'Coucou ! Ici le bot de Studio Nova, je peux te trouver un créneau.'; });
      await page.evaluate(() => { const o = document.getElementById('bot-overlay'), c = document.getElementById('bf-salon'); o.scrollTo(0, o.scrollTop + c.getBoundingClientRect().top - 330); });
    },
    avant: 1.2,
    gestes: [
      [O.salon, async h => { await h.tap('#bf-salon'); }],
      [O.salon + 0.12, h => h.taper('Studio Nova', { pas: 0.045 })],
      [O.prestations - 0.5, h => h.js(() => { const o = document.getElementById('bot-overlay'), c = document.getElementById('bchips'); o.scrollTo({ top: o.scrollTop + c.getBoundingClientRect().top - 250, behavior: 'smooth' }); })],
      [O.prestations + 0.1, h => h.tap(texte('#bchips .bchip', 'Nail art'))],
      [O.prix - 0.05, async h => { await h.tap('#bf-prix'); await h.js(() => { document.getElementById('bf-prix').value = ''; }); }],
      [O.prix + 0.1, h => h.taper('45', { pas: 0.12 })],
      [O.horaires - 0.55, h => h.js(() => { document.activeElement && document.activeElement.blur(); const o = document.getElementById('bot-overlay'), c = document.getElementById('bhours-grid'); o.scrollTo({ top: o.scrollTop + c.getBoundingClientRect().top - 200, behavior: 'smooth' }); })],
      [O.horaires + 0.1, h => h.tap({ trouve: 'document.querySelector("#bhours-grid .bhours-row .btoggle")' })],
      [O.ton - 0.6, h => h.js(() => { const o = document.getElementById('bot-overlay'), c = document.getElementById('bton-grid'); o.scrollTo({ top: o.scrollTop + c.getBoundingClientRect().top - 330, behavior: 'smooth' }); })],
      [O.ton, h => h.repere('tons', '#bton-grid')],
      [O.ton + 0.05, h => h.tap('.bton-btn[data-ton="pro"]')],
      [O.ton2, h => h.tap('.bton-btn[data-ton="girly"]')],
      [O.ton3, h => h.tap('.bton-btn[data-ton="chill"]')],
    ],
  }),

  /* ── Le bot au travail : l'agenda du samedi, où tombe le rendez-vous pris par message ── */
  clip({
    nom: 'agenda-bot', scene: 'action', depart: A.clip, ...APPLI, url: '/app.html', epoque: heure('03:12', 1), stockage: session(heure('03:12', 1)), etat: { moment: 'reserve' },
    pret: async page => { await agenda(page, jour(2)); await page.evaluate(() => window.scrollTo(0, 190)); }, avant: 0.8,
    gestes: [
      [A.rdv - 0.1, async h => { h.pose({ moment: 'bot' }); await rafraichir(h); }],
      [A.rdv + 0.15, h => h.repere('nouveau', contient('.ag-appt', 'Louna'))],
    ],
  }),
  // … et celui du mardi, dont un rendez-vous s'annule par message.
  clip({
    nom: 'agenda-annule', scene: 'cas', depart: K.clip, ...APPLI, url: '/app.html', epoque: heure('18:40', 1), stockage: session(heure('18:40', 1)), etat: { moment: 'bot' },
    pret: async page => { await agenda(page, jour(5)); await page.evaluate(() => window.scrollTo(0, 60)); }, avant: 0.8,
    gestes: [
      [-0.3, h => h.repere('annule', contient('.ag-appt', 'Jade'))],
      [K.libere - 0.1, async h => { h.pose({ moment: 'annule' }); await rafraichir(h); }],
    ],
  }),
];
