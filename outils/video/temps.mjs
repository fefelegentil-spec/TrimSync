// La partition du film : scènes, voix, repères. Lue par Node (enregistrer.mjs, rendu.mjs)
// et par la page (film.html) : un seul endroit dit quand tombe chaque chose.
//
// Le film est monté sur la musique (Young Trizzy, 140 BPM) : chaque scène dure un nombre
// entier de temps, les blocs de scènes un nombre entier de mesures, et MONTAGE dit quelles
// mesures du morceau jouent dessous (le problème sur l'intro, le nom sur l'entrée du beat,
// le bot sur la pause, le bot au travail sur la reprise, les offres sur la fin).
//
// Les gestes sont calés sur les MOTS de la voix (mot('r3', 'acompte')), relevés par
// voix.py : réécrire une phrase puis relancer voix.py recale tout, sans toucher aux scènes.

export const BPM = 140;
export const TEMPS = 60 / BPM;        // 0,4286 s
export const MESURE = 4 * TEMPS;      // 1,7143 s
export const PRINCIPALE = 'remy';     // l'image est calée sur cette voix
export const VOIX = ['remy', 'vivienne'];

// [scène, durée en temps (4 = une mesure), [[phrase, départ en secondes dans la scène], …]]
export const SCENES = [
  ['accroche', 28, [['h1', 0.7], ['h2', 4.5], ['h3', 9.0]]],
  ['nom', 8, [['nom', 0.2]]],
  ['resa', 28, [['r1', 0.45], ['r2', 5.0], ['r3', 8.3]]],
  ['dash', 20, [['d1', 0.4], ['d2', 3.1]]],
  ['bot', 16, [['b1', 0.6]]],
  ['lien', 16, [['c1', 0.4]]],
  ['perso', 22, [['p1', 0.5], ['p2', 4.2]]],
  ['action', 26, [['a1', 0.4], ['a2', 7.9]]],
  ['cas', 16, [['k1', 0.35], ['k2', 3.4]]],
  ['relais', 20, [['m1', 0.45], ['m2', 5.9]]],
  ['offres', 20, [['o1', 0.5], ['o2', 5.7]]],
  ['fin', 16, [['fin', 0.5]]],
];

// Les mesures du morceau jouées sous le film, dans l'ordre : [première, dernière] incluses.
// Le morceau : intro 0-7 (la 7 monte vers le beat), A 8-23 (charleys dès la 16), pause 24-30,
// montée 31, B 32-46, variation 47, fin 48-51, fondu 52-55. A et B tournent sur 2 mesures :
// on y coupe ou on y répète par paires sans que ça s'entende.
export const MONTAGE = [
  [1, 7],             // accroche (7 mesures)
  [8, 13], [16, 23],  // nom + resa + dash (14)
  [24, 31],           // bot + lien (8)
  [32, 39], [34, 39], [40, 46],   // perso + action + cas + relais (21)
  [47, 51],           // offres (5)
  [52, 55],           // fin (4)
];

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Construit la partition à partir des relevés de voix.py pour la voix principale. */
export function partition(durees, mots) {
  const scenes = {}, ordre = [], V = {};
  let t = 0;
  for (const [id, temps, lignes] of SCENES) {
    const a = t, b = t + temps * TEMPS;
    scenes[id] = { id, a, b, d: b - a, i: ordre.length };
    ordre.push(id);
    for (const [k, dec] of lignes) V[k] = { scene: id, t: a + dec, fin: a + dec + durees[k].fin, total: durees[k].total };
    t = b;
  }
  const DUREE = t;
  /** Instant (absolu, en secondes) où commence le n-ième mot de la phrase qui débute par `debut`. */
  const mot = (k, debut, n = 0) => {
    const q = norm(debut), l = mots[k].filter(w => norm(w.m).startsWith(q));
    if (!l.length) throw new Error(`mot introuvable : ${k} « ${debut} »`);
    return V[k].t + (l[n] || l[0]).t;
  };
  /** Le même, compté depuis le début de la scène de la phrase. */
  const local = (k, debut, n = 0) => mot(k, debut, n) - scenes[V[k].scene].a;

  // ── Repères par scène, en secondes depuis le début de la scène ──
  const C = {};
  {
    // La réservation : le parcours finit quand la voix dit « si tu veux » (l'acompte est à l'écran).
    const succes = local('r3', 'si') + 0.25;
    C.resa = {
      clip: 0.25,                              // le clip « resa » démarre là (le splash joue pendant l'arrivée du téléphone)
      titre: local('r1', 'ta'),
      nom: local('r1', 'nom'), couleurs: local('r1', 'couleurs'),
      eventail: local('r1', 'À') - 0.45,       // les deux autres salons se déploient
      replie: local('r2', 'Un') - 0.5,
      lien: local('r2', 'lien'),
      presta: succes - 3.8, suite1: succes - 3.25, jour: succes - 2.55, creneau: succes - 1.95, suite2: succes - 1.4, accord: succes - 0.85, confirme: succes - 0.3,
      succes, acompte: local('r3', 'contre') - 0.1,
    };
    C.dash = {
      clipAgenda: -0.6, arrive: local('d1', 'arrive'),
      clipAppli: 2.3, clients: local('d2', 'clients') - 0.12, chiffre: local('d2', 'chiffre') - 0.15, horaires: local('d2', 'horaires') - 0.15, appli: local('d2', 'tout'),
    };
    C.bot = { messages: local('b1', 'pour'), bot: local('b1', 'le') - 0.05, ia: local('b1', 'Une'), repond: local('b1', 'répond'), reserve: local('b1', 'réserve'), place: local('b1', 'place') };
    C.lien = {
      clip: -0.5, activer: local('c1', 'connectes') + 0.1, feuille: local('c1', 'compte') - 0.1, officielle: local('c1', 'connexion'), meta: local('c1', 'Meta'),
      autoriser: local('c1', 'Meta') + 0.5, actif: local('c1', 'Aucun') - 0.25, motdepasse: local('c1', 'mot'),
    };
    C.perso = {
      clip: -0.4, salon: 0.25, prestations: local('p1', 'prestations'), prix: local('p1', 'prix'), horaires: local('p1', 'horaires'),
      ton: local('p2', 'choisis'), ton2: local('p2', 'son', 0) + 0.25, ton3: local('p2', 'son', 0) + 0.95, max: local('p2', 'avec'), apprend: local('p2', 'apprend'), toi: local('p2', 'toi'),
    };
    C.action = {
      clip: -0.5, message: local('a1', 'message') + 0.1, regarde: local('a1', 'regarde'), agenda: local('a1', 'agenda'), ecrit: local('a1', 'propose') - 0.45, propose: local('a1', 'propose'),
      libre: local('a1', 'libre'), oui: local('a1', 'et') - 0.55, pose: local('a1', 'pose'), rdv: local('a1', 'rendez'), notif: local('a1', 'rendez') + 0.75,
      meme: local('a2', 'Même'), trois: local('a2', 'trois'), matin: local('a2', 'matin'),
    };
    C.cas = {
      clip: -0.5, annulation: local('k1', 'annulation') - 0.1, reponse: local('k1', 'Il') - 0.55, libere: local('k1', 'libère'),
      question: local('k2', 'question') - 0.1, connait: local('k2', 'connaît'), main: local('k2', 'passe'), fin: local('k2', 'main'),
    };
    C.relais = {
      toi: local('m1', 'Toi'), metier: local('m1', 'métier'), lui: local('m1', 'Lui'), repond: local('m1', 'répond'), reserve: local('m1', 'réserve'), confirme: local('m1', 'confirme'),
      telephone: local('m2', 'Ton'), redevient: local('m2', 'redevient'), un: local('m2', 'un'),
    };
    C.offres = { appli: local('o1', 'L'), dixneuf: local('o1', 'dix'), avec: local('o1', 'Avec'), quarante: local('o1', 'quarante'), sept: local('o2', 'Sept'), sans: local('o2', 'sans') };
    C.accroche = {
      travailles: local('h1', 'travailles'), telephone: local('h1', 'téléphone'), arrete: local('h1', 'n'), soir: local('h2', 'soir'), trop: local('h2', 'Trop'),
      rdv: local('h2', 'rendez'), parti: local('h2', 'parti'), ailleurs: local('h2', 'ailleurs'), phrase: local('h3', 'Ton'),
      mots: mots.h3.map(w => V.h3.t + w.t),
    };
    C.nom = { nom: local('nom', 'TrimSync'), slogan: mots.nom.slice(1).map(w => V.nom.t + w.t - scenes.nom.a) };
    C.fin = { nom: local('fin', 'TrimSync'), slogan: mots.fin.slice(1).map(w => V.fin.t + w.t - scenes.fin.a), bouton: local('fin', 'seul') + 0.9 };
  }

  // contrôle : aucune phrase ne déborde de sa scène ni sur la suivante
  const alertes = [];
  const lignes = Object.entries(V).sort((x, y) => x[1].t - y[1].t);
  lignes.forEach(([k, v], i) => {
    if (v.fin > scenes[v.scene].b + 0.02) alertes.push(`${k} déborde de la scène ${v.scene} de ${(v.fin - scenes[v.scene].b).toFixed(2)} s`);
    if (i && v.t < lignes[i - 1][1].fin + 0.15) alertes.push(`${k} suit ${lignes[i - 1][0]} de trop près`);
  });
  const mesures = MONTAGE.reduce((s, [a, b]) => s + b - a + 1, 0);
  if (Math.abs(mesures * MESURE - DUREE) > 0.01) alertes.push(`le montage de la musique fait ${mesures} mesures, le film ${(DUREE / MESURE).toFixed(2)}`);
  return { scenes, ordre, V, DUREE, mot, local, C, alertes };
}
