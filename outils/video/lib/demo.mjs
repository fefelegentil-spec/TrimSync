// Le salon de démonstration et la fausse API des pages filmées.
//
// Les pages du site (reserver.html, app.html) sont filmées telles qu'elles sont : seul
// le réseau est simulé. Chaque appel à /__api/… reçoit ici une réponse au format exact
// du backend (backend/routes/*.js), avec les données d'un salon inventé. Rien ne sort
// de la machine et la production n'est jamais appelée.
//
// L'histoire se passe le jeudi 8 octobre 2026 : une cliente réserve en ligne le
// samedi 10 à 14 h 30, une autre obtient 16 h par message, une troisième annule son
// vendredi. Chaque clip tient son `etat.moment`, qui dit où on en est : la liste des
// rendez-vous en dépend.

export const J0 = '2026-10-08';   // jeudi
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const jour = n => { const d = new Date(J0 + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
/** Instant de l'histoire, en millisecondes : heure('03:12', 1) = vendredi 3 h 12. */
export const heure = (hhmm, decalage = 0) => new Date(`${jour(decalage)}T${hhmm}:00`).getTime();

export const SALONS = {
  'studio-nova': {
    nom: 'Studio Nova', ville: 'Lyon', adresse: '12 rue des Capucins', telephone: '0478284512', instagram: 'studio.nova', couleur: '#3bbfcc',
    description: 'Pose gel, semi-permanent et nail art. Sur rendez-vous.',
    // (la page présélectionne la première prestation : « Pose gel » est 2e pour qu'on voie le choix se faire)
    prestations: [['Semi-permanent', 45, 28, 0, 'Pose et couleur'], ['Pose gel', 75, 45, 10, 'Pose complète, forme au choix'], ['Remplissage', 60, 35, 0, 'Toutes les 3 semaines'], ['Nail art', 30, 10, 0, 'En plus d’une pose']],
  },
  'lash-room': {
    nom: 'Lash Room', ville: 'Bordeaux', adresse: '4 place du Parlement', telephone: '0556440912', instagram: 'lashroom.bdx', couleur: '#f48fb1',
    description: 'Extensions de cils, sur rendez-vous.',
    prestations: [['Pose cil à cil', 90, 65, 15, 'Effet naturel'], ['Volume russe', 120, 85, 20, ''], ['Remplissage', 60, 40, 0, 'Sous 3 semaines'], ['Rehaussement', 45, 45, 0, '']],
  },
  'maison-solene': {
    nom: 'Maison Solène', ville: 'Nantes', adresse: '18 rue Crébillon', telephone: '0240483310', instagram: 'maison.solene', couleur: '#ff8a65',
    description: 'Coiffure et couleur, sur rendez-vous.',
    prestations: [['Coupe + brushing', 45, 42, 0, ''], ['Balayage', 150, 110, 20, 'Diagnostic inclus'], ['Couleur', 90, 65, 0, ''], ['Soin profond', 30, 25, 0, '']],
  },
};
const prestationsDe = slug => SALONS[slug].prestations.map(([nom, duree_min, prix, acompte, description], i) =>
  ({ id: 'p' + (i + 1), salon_id: slug, nom, duree_min, prix: prix.toFixed(2), acompte: acompte.toFixed(2), description, actif: true, ordre: i }));

/* ── Studio Nova : clientes, rendez-vous, horaires ── */
const CLIENTES = ['Camille Roux', 'Léa Moreau', 'Sarah Benali', 'Manon Girard', 'Julie Petit', 'Chloé Lambert', 'Emma Faure', 'Nina Costa', 'Lina Haddad', 'Zoé Mercier',
  'Clara Dupuis', 'Jade Morel', 'Inès Martin', 'Louna Da Costa', 'Anaïs Perrin', 'Margot Leroy', 'Sofia Ricci', 'Élise Garnier'];
const tel = i => '06 ' + String(12345678 + i * 7654321 % 87654321).padStart(8, '0').replace(/(..)(..)(..)(..)/, '$1 $2 $3 $4');
const P = prestationsDe('studio-nova');
const NOMS_PRESTA = ['Pose gel', 'Remplissage', 'Semi-permanent', 'Nail art'];   // rdv(…, 0) = pose gel
let compteur = 0;
const rdv = (d, h, cliente, presta, source = 'site', statut = 'confirme') => {
  const c = CLIENTES.indexOf(cliente), p = P.find(x => x.nom === NOMS_PRESTA[presta]);
  return { id: 'r' + (++compteur), salon_id: 'studio-nova', client_id: 'c' + c, client_nom: cliente, telephone: tel(c).replace(/ /g, ''), prestation_id: p.id, prestation_nom: p.nom,
    prix: p.prix, duree_min: p.duree_min, date: jour(d), heure: h, statut, source, jeton_annulation: 'j' + compteur, note: '', created_at: new Date(J0 + 'T08:00:00').toISOString() };
};
// La semaine de l'histoire (mardi 6 → samedi 10).
const SEMAINE = [
  rdv(-2, '09:30', 'Camille Roux', 0), rdv(-2, '11:00', 'Léa Moreau', 1, 'instagram'), rdv(-2, '14:00', 'Sarah Benali', 2), rdv(-2, '15:00', 'Manon Girard', 0, 'instagram'), rdv(-2, '17:00', 'Julie Petit', 1),
  rdv(-1, '10:00', 'Chloé Lambert', 0), rdv(-1, '14:30', 'Emma Faure', 2, 'instagram'), rdv(-1, '16:00', 'Nina Costa', 1),
  rdv(0, '09:30', 'Lina Haddad', 0), rdv(0, '11:30', 'Zoé Mercier', 3), rdv(0, '14:00', 'Clara Dupuis', 0, 'instagram'), rdv(0, '16:00', 'Camille Roux', 1),
  rdv(1, '10:00', 'Élise Garnier', 0), rdv(1, '13:30', 'Léa Moreau', 1), rdv(1, '15:00', 'Sarah Benali', 0, 'instagram'),
  rdv(2, '09:30', 'Manon Girard', 0), rdv(2, '11:00', 'Julie Petit', 0, 'instagram'), rdv(2, '17:30', 'Emma Faure', 1),
];
const RDV_SITE = rdv(2, '14:30', 'Inès Martin', 0, 'site');          // la réservation en ligne du film
const RDV_BOT = rdv(2, '16:00', 'Louna Da Costa', 0, 'instagram');   // celle que le bot pose
// Le mardi suivant : celui de la cliente qui annule par message (assez tôt pour la règle des 24 h).
const MARDI = [rdv(5, '09:30', 'Anaïs Perrin', 0), rdv(5, '11:00', 'Jade Morel', 0, 'instagram'), rdv(5, '14:00', 'Margot Leroy', 1), rdv(5, '16:00', 'Sofia Ricci', 2, 'instagram')];
const ANNULE = MARDI[1];
// La semaine d'après et le mois écoulé : assez de matière pour les courbes et les compteurs.
const alea = (() => { let s = 20261008; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
const AUTRES = [];
for (let d = -34; d <= 12; d++) {
  if ((d >= -2 && d <= 2) || d === 5) continue;
  const j = new Date(jour(d) + 'T12:00:00').getDay();
  if (j === 0 || j === 1) continue;
  const n = d > 2 ? 1 + Math.floor(alea() * 3) : 3 + Math.floor(alea() * 3) + (j === 6 ? 1 : 0);
  const heures = ['09:30', '11:00', '14:00', '15:30', '17:00'].sort(() => alea() - .5).slice(0, n).sort();
  for (const h of heures) AUTRES.push(rdv(d, h, CLIENTES[Math.floor(alea() * 12)], [0, 0, 1, 1, 2, 3][Math.floor(alea() * 6)], alea() < .45 ? 'instagram' : 'site'));
}

// etat.moment : 'debut' → 'reserve' → 'bot' → 'annule'.
const ORDRE = ['debut', 'reserve', 'bot', 'annule'];
const apres = (etat, m) => ORDRE.indexOf(etat.moment) >= ORDRE.indexOf(m);
function tousLesRdv(etat) {
  let l = [...AUTRES, ...SEMAINE, ...MARDI];
  if (apres(etat, 'reserve')) l.push(RDV_SITE);
  if (apres(etat, 'bot')) l.push(RDV_BOT);
  if (apres(etat, 'annule')) l = l.map(r => r === ANNULE ? { ...r, statut: 'annule' } : r);
  return l;
}
function clientes(etat, maintenant) {
  const [date, hm] = maintenant;
  const venues = tousLesRdv(etat).filter(r => r.statut === 'confirme' && (r.date < date || (r.date === date && r.heure <= hm)));
  return CLIENTES.map((nom, i) => {
    const v = venues.filter(r => r.client_nom === nom);
    if (!v.length && !tousLesRdv(etat).some(r => r.client_nom === nom)) return null;
    return { id: 'c' + i, salon_id: 'studio-nova', nom, telephone: tel(i).replace(/ /g, ''), email: '', notes: '', created_at: '2026-06-02T09:00:00.000Z',
      visites: String(new Set(v.map(r => r.date)).size), depense: v.reduce((s, r) => s + Number(r.prix), 0).toFixed(2), derniere_venue: v.length ? v.map(r => r.date).sort().pop() : null };
  }).filter(Boolean);
}
const HORAIRES = { semaine: [2, 3, 4, 5, 6].map(j => ({ jour: j, ouverture: '09:00', fermeture: '18:30', pause_debut: '12:30', pause_fin: '13:30' })), fermetures: [] };
const vueSalon = (slug, etat = {}) => {
  const s = SALONS[slug];
  return { id: slug, slug, nom: s.nom, ville: s.ville, telephone: s.telephone, adresse: s.adresse, statut: 'actif', essai_fin: null, jours_essai_restants: null, plan: 'pro', bot_statut: etat.bot || 'actif',
    mise_en_route: true, description: s.description, instagram: s.instagram, couleur: s.couleur, logo: null, delai_min_h: 2, annulation_h: 24, rappel_veille: true, options: {}, objectif_mensuel: 3000,
    lien_public: `https://trimsync.tech/r/${slug}` };
};

/* ── créneaux libres de la page publique (Studio Nova : ceux que l'agenda laisse) ── */
const minutes = h => +h.slice(0, 2) * 60 + +h.slice(3);
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function libres(etat, slug, date, duree, maintenant) {
  const j = new Date(date + 'T12:00:00').getDay();
  if (j === 0 || j === 1) return null;   // fermé
  const pris = slug === 'studio-nova' ? tousLesRdv(etat).filter(r => r.date === date && r.statut === 'confirme').map(r => [minutes(r.heure), minutes(r.heure) + r.duree_min]) : [[600, 690], [840, 930]];
  pris.push([750, 810]);   // la pause
  const out = [];
  for (let m = 540; m + duree <= 1110; m += 30) {
    if (date === maintenant[0] && m < minutes(maintenant[1]) + 120) continue;
    if (!pris.some(([a, b]) => m < b && m + duree > a)) out.push(hhmm(m));
  }
  return out;
}

/** Branche la fausse API sur une page Playwright. `maintenant()` renvoie [date, 'HH:MM'] de l'histoire,
    `etat.moment` dit où elle en est (le scénario du clip le fait avancer). */
export async function brancherApi(page, { maintenant, salon = 'studio-nova', etat = { moment: 'debut' } }) {
  await page.route('**/__api/**', async route => {
    const req = route.request(), u = new URL(req.url()), ch = u.pathname.replace(/^.*\/__api/, ''), m = req.method();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const now = maintenant();
    let k;
    // ── page publique
    if ((k = ch.match(/^\/api\/public\/salons\/([a-z0-9-]+)$/))) {
      const s = SALONS[k[1]]; if (!s) return json({ error: 'Salon introuvable' }, 404);
      return json({ nom: s.nom, ville: s.ville, adresse: s.adresse, telephone: s.telephone, slug: k[1], annulation_h: 24, validation: false, prix_masques: false, description: s.description,
        instagram: s.instagram, couleur: s.couleur, logo: null, reservable: true, horizon_jours: 30,
        prestations: prestationsDe(k[1]).map(({ id, nom, duree_min, prix, acompte, description }) => ({ id, nom, duree_min, prix, acompte, description })) });
    }
    if ((k = ch.match(/^\/api\/public\/salons\/([a-z0-9-]+)\/jours$/))) {
      const duree = prestationsDe(k[1]).find(p => p.id === u.searchParams.get('prestation'))?.duree_min || 60, jours = [];
      for (let i = 0; i < 30; i++) {
        const date = jour(i), l = libres(etat, k[1], date, duree, now);
        jours.push({ date, ouvert: !!l, libres: l ? l.length : 0 });
      }
      return json({ jours });
    }
    if ((k = ch.match(/^\/api\/public\/salons\/([a-z0-9-]+)\/dispo$/))) {
      const duree = prestationsDe(k[1]).find(p => p.id === u.searchParams.get('prestation'))?.duree_min || 60;
      return json({ heures: libres(etat, k[1], u.searchParams.get('date'), duree, now) || [] });
    }
    if ((k = ch.match(/^\/api\/public\/salons\/([a-z0-9-]+)\/reserver$/))) {
      const c = JSON.parse(req.postData() || '{}'), p = prestationsDe(k[1]).find(x => x.id === c.prestation_id);
      if (!apres(etat, 'reserve')) etat.moment = 'reserve';
      return json({ rdv: { id: 'r-film', date: c.date, heure: c.heure, prestation: p.nom, prestation_nom: p.nom, prix: p.prix, duree_min: p.duree_min, statut: 'confirme', acompte_paye: false, client_nom: c.nom },
        annulation: 'jeton-film', acompte: Number(p.acompte) > 0 ? { montant: Number(p.acompte), url: '#' } : null });
    }
    // ── app (compte connecté)
    if (ch === '/api/moi') return json({ email: 'bonjour@studionova.fr', email_verifie: true, salon: vueSalon(salon, etat) });
    if (ch === '/api/salon') return json({ salon: vueSalon(salon, etat) });
    if (ch === '/api/salon/demande-bot') { etat.bot = 'demande'; return json({ bot_statut: 'demande' }); }
    if (ch === '/api/rdv' && m === 'GET') { const du = u.searchParams.get('du'), au = u.searchParams.get('au'); return json({ rdv: tousLesRdv(etat).filter(r => r.date >= du && r.date <= au).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure)) }); }
    if (ch === '/api/clients') return json({ clients: clientes(etat, now) });
    if (ch === '/api/prestations') return json({ prestations: P });
    if (ch === '/api/horaires') return json(HORAIRES);
    if (ch === '/api/attente') return json({ attente: [] });
    if (ch === '/api/push/cle-publique') return json({ cle: null });
    console.warn('[api simulée] sans réponse :', m, ch);
    return json({});
  });
}
