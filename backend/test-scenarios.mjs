/* ── Scénarios TrimSync ──
   Parcours réels contre un serveur lancé avec TRIMSYNC_TEST=1 et une base
   jetable (voir README). Emails et noms de salon sont suffixés par
   l'horodatage : la suite se rejoue sur la même base. */
import crypto from 'node:crypto';

const API = process.env.API || 'http://localhost:3998';
const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test';

let echecs = 0, total = 0;
function ok(condition, message, detail) {
  total++;
  if (condition) return console.log('  ✓ ' + message);
  echecs++;
  console.log('  ✗ ' + message + (detail === undefined ? '' : ' → ' + JSON.stringify(detail).slice(0, 400)));
}

async function appel(methode, chemin, corps, jeton) {
  const r = await fetch(API + chemin, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(jeton ? { authorization: 'Bearer ' + jeton } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let d = null;
  try { d = await r.json(); } catch {}
  return { s: r.status, d };
}

const aujourdhuiParis = () => new Intl.DateTimeFormat('fr-CA',
  { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dansJours = n => {
  const d = new Date(aujourdhuiParis() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const boite = async () => (await appel('GET', '/api/test/boite')).d?.boite || [];
async function dernierJeton(a, type) {
  const m = (await boite()).filter(x => x.a === a && x.type === type);
  return m.length ? m[m.length - 1].jeton : null;
}

const RUN = Date.now().toString(36);
const emailA = `a-${RUN}@test.fr`;
const emailB = `b-${RUN}@test.fr`;
const nomSalon = `Salon ${RUN}`;
const SEMAINE = [0, 1, 2, 3, 4, 5, 6].map(jour =>
  ({ jour, ouverture: '09:00', fermeture: '19:00', pause_debut: '12:00', pause_fin: '13:00' }));

async function main() {
  console.log('T1 — inscription et connexion');
  const insA = await appel('POST', '/api/comptes/inscription',
    { email: emailA, mdp: 'motdepasse1', salon: nomSalon, ville: 'Lyon', telephone: '06 12 34 56 78', metier: 'coiffure', consentement: true });
  ok(insA.s === 201 && insA.d.jeton, 'inscription A', insA);
  if (insA.s !== 201) return;
  const A = insA.d.jeton;
  const slugA = insA.d.salon.slug;
  ok(insA.d.salon.statut === 'essai' && insA.d.salon.jours_essai_restants === 7, 'essai de 7 jours', insA.d.salon);
  ok((await appel('POST', '/api/comptes/inscription',
    { email: emailA.toUpperCase(), mdp: 'motdepasse1', salon: 'X', ville: 'Y', consentement: true })).s === 409,
    'email déjà pris refusé, casse ignorée');
  ok((await appel('POST', '/api/comptes/inscription',
    { email: `c-${RUN}@test.fr`, mdp: 'motdepasse1', salon: 'X', ville: 'Y' })).s === 400, 'sans consentement refusé');
  ok((await appel('POST', '/api/comptes/inscription',
    { email: `d-${RUN}@test.fr`, mdp: 'court', salon: 'X', ville: 'Y', consentement: true })).s === 400, 'mot de passe trop court refusé');
  ok(insA.d.salon.mise_en_route === false, 'nouveau salon : mise en route à faire', insA.d.salon);
  const insN = await appel('POST', '/api/comptes/inscription',
    { email: `n-${RUN}@test.fr`, mdp: 'motdepasse1', salon: 'Studio Ongles', metier: 'ongles', consentement: true });
  const prestasN = (await appel('GET', '/api/prestations', undefined, insN.d?.jeton)).d?.prestations || [];
  ok(prestasN.some(p => p.nom === 'Pose gel') && !prestasN.some(p => /barbe/i.test(p.nom)), "catalogue de départ selon l'activité", prestasN);
  const insX = await appel('POST', '/api/comptes/inscription',
    { email: `x-${RUN}@test.fr`, mdp: 'motdepasse1', salon: 'Studio X', metier: 'constructor', consentement: true });
  const prestasX = (await appel('GET', '/api/prestations', undefined, insX.d?.jeton)).d?.prestations || [];
  ok(prestasX.length === 1 && prestasX[0].nom === 'Rendez-vous', 'activité inconnue : catalogue neutre', prestasX);
  const insB = await appel('POST', '/api/comptes/inscription',
    { email: emailB, mdp: 'motdepasse2', salon: nomSalon, ville: 'Lyon', telephone: '0611111111', consentement: true });
  ok(insB.s === 201 && insB.d.salon.slug === slugA + '-2', 'slug dédupliqué', [slugA, insB.d?.salon?.slug]);
  const B = insB.d.jeton;
  const slugB = insB.d.salon.slug;
  ok((await appel('POST', '/api/comptes/connexion', { email: emailA, mdp: 'motdepasse1' })).s === 200, 'connexion A');
  ok((await appel('POST', '/api/comptes/connexion', { email: emailA, mdp: 'mauvais!!' })).s === 401, 'mauvais mot de passe refusé');
  ok((await appel('POST', '/api/comptes/connexion', { email: 'personne@test.fr', mdp: 'motdepasse1' })).s === 401, 'email inconnu refusé');
  const moi = await appel('GET', '/api/moi', undefined, A);
  ok(moi.s === 200 && moi.d.email === emailA && moi.d.salon.slug === slugA && moi.d.email_verifie === false, '/api/moi', moi);
  ok((await appel('GET', '/api/moi')).s === 401, 'sans jeton refusé');
  ok((await appel('GET', '/api/moi', undefined, A + 'x')).s === 401, 'jeton falsifié refusé');
  ok((await boite()).some(m => m.type === 'verification' && m.a === emailA), 'email de vérification envoyé');

  console.log('T9 — profil et demande de bot');
  const renomme = await appel('PATCH', '/api/salon', { adresse: '12 rue du Test', slug: `Mon Salon ${RUN}` }, A);
  ok(renomme.s === 200 && renomme.d.salon.slug === `mon-salon-${RUN}` && renomme.d.salon.adresse === '12 rue du Test', 'profil modifié', renomme);
  ok((await appel('PATCH', '/api/salon', { slug: slugB }, A)).s === 409, 'slug déjà pris refusé');
  const slugA2 = renomme.d?.salon?.slug || slugA;
  ok((await appel('POST', '/api/salon/demande-bot', undefined, A)).s === 403, 'demande de bot refusée sans email vérifié');
  const jv = await dernierJeton(emailA, 'verification');
  ok((await appel('POST', '/api/comptes/verifier', { jeton: jv })).s === 200, 'email vérifié');
  ok((await appel('POST', '/api/comptes/verifier', { jeton: jv })).s === 400, 'lien de vérification à usage unique');
  const bot = await appel('POST', '/api/salon/demande-bot', undefined, A);
  ok(bot.s === 200 && bot.d.bot_statut === 'demande', 'demande de bot enregistrée', bot);
  ok((await boite()).some(m => m.type === 'alerte-admin' && /bot/i.test(m.sujet)), 'Félix prévenu de la demande');
  ok((await appel('POST', '/api/push/abonnement', { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } }, A)).s === 200, 'abonnement push enregistré');
  ok((await appel('POST', '/api/push/abonnement', { endpoint: 'pas-une-url', keys: {} }, A)).s === 400, 'abonnement push invalide refusé');

  console.log('T3a — prestations et horaires');
  const prestasA = (await appel('GET', '/api/prestations', undefined, A)).d?.prestations || [];
  ok(prestasA.length === 3 && typeof prestasA[0].prix === 'number', 'prestations de départ', prestasA);
  const coupe = prestasA.find(p => p.nom === 'Coupe') || {};
  const barbe = prestasA.find(p => p.nom === 'Barbe') || {};
  const np = await appel('POST', '/api/prestations', { nom: 'Dégradé', duree_min: 40, prix: 25 }, A);
  ok(np.s === 201 && np.d.prestation.ordre === 3, 'prestation ajoutée en dernier', np);
  ok((await appel('POST', '/api/prestations', { nom: 'X', duree_min: 7, prix: 25 }, A)).s === 400, 'durée hors pas de 5 min refusée');
  ok((await appel('PATCH', `/api/prestations/${np.d?.prestation?.id}`, { actif: false }, A)).d?.prestation?.actif === false, 'prestation désactivée');
  const ordre = [np.d?.prestation?.id, ...prestasA.map(p => p.id)];
  ok((await appel('PUT', '/api/prestations/ordre', { ids: ordre }, A)).s === 200, 'prestations réordonnées');
  ok((await appel('GET', '/api/prestations', undefined, A)).d?.prestations?.[0]?.id === np.d?.prestation?.id, 'nouvel ordre lu');
  ok((await appel('PUT', '/api/horaires', { semaine: [{ jour: 1, ouverture: '10:00', fermeture: '09:00' }] }, A)).s === 400, 'horaires incohérents refusés');
  ok((await appel('PUT', '/api/horaires', { semaine: [{ jour: 1, ouverture: '09:00', fermeture: '18:00', pause_debut: '17:00', pause_fin: '19:00' }] }, A)).s === 400, 'pause hors horaires refusée');
  ok((await appel('PUT', '/api/horaires', { semaine: SEMAINE }, A)).s === 200, 'horaires réglés');
  ok((await appel('GET', '/api/horaires', undefined, A)).d?.semaine?.length === 7, 'horaires relus');
  const J = dansJours(3);
  const f = await appel('POST', '/api/fermetures', { date: J, debut: '15:00', fin: '16:00', motif: 'perso' }, A);
  ok(f.s === 201 && f.d.fermeture.id, 'fermeture en plage créée', f);
  ok((await appel('POST', '/api/fermetures', { date: J, debut: '15:00' }, A)).s === 400, 'plage incomplète refusée');
  const f2 = await appel('POST', '/api/fermetures', { date: dansJours(4), motif: 'congé' }, A);
  ok(f2.s === 201, 'fermeture à la journée créée');
  ok((await appel('DELETE', `/api/fermetures/${f2.d?.fermeture?.id}`, undefined, A)).s === 200, 'fermeture supprimée');

  console.log('T3b — créneaux vus de la page publique');
  const dispo = async (date = J, presta = coupe.id) =>
    (await appel('GET', `/api/public/salons/${slugA2}/dispo?prestation=${presta}&date=${date}`)).d?.heures || [];
  let h = await dispo();
  ok(h[0] === '09:00' && h.includes('11:30') && !h.includes('11:45') && !h.includes('12:00') && h.includes('13:00'), 'pause respectée', h);
  ok(!h.includes('15:00') && !h.includes('14:45') && h.includes('14:30') && h.includes('16:00') && h[h.length - 1] === '18:30', 'fermeture en plage respectée', h);
  const pub = await appel('GET', `/api/public/salons/${slugA2}`);
  ok(pub.s === 200 && pub.d.reservable === true && pub.d.prestations.length === 3 && pub.d.email === undefined, 'infos publiques (prestation désactivée masquée)', pub.d);
  ok((await appel('GET', '/api/public/salons/inexistant-zz')).s === 404, 'salon inconnu : 404');
  const jours = (await appel('GET', `/api/public/salons/${slugA2}/jours?prestation=${coupe.id}`)).d?.jours || [];
  ok(jours.length === 30 && jours.find(x => x.date === J)?.libres === h.length && jours.find(x => x.date === J)?.ouvert === true, 'vue des 30 prochains jours', jours.slice(0, 4));
  ok(jours.find(x => x.date === dansJours(4))?.ouvert === true, 'jour sans fermeture : ouvert');

  console.log('T4 — réservation publique et annulation');
  const reserver = (heure, nom = 'Karim Test', tel = '+33 6 22 33 44 55', date = J) => appel('POST', `/api/public/salons/${slugA2}/reserver`,
    { prestation_id: coupe.id, date, heure, nom, telephone: tel, consentement: true });
  const resa = await reserver('10:00');
  ok(resa.s === 201 && /^[0-9a-f]{48}$/.test(resa.d.annulation), 'réservation', resa);
  h = await dispo();
  ok(!h.includes('10:00') && !h.includes('09:45') && h.includes('10:30'), 'le créneau pris disparaît', h);
  ok((await reserver('10:00', 'Autre', '0700000000')).s === 409, 'même heure refusée');
  ok((await reserver('10:07')).s === 400, 'heure hors grille refusée');
  ok((await appel('POST', `/api/public/salons/${slugA2}/reserver`, { prestation_id: coupe.id, date: J, heure: '11:00', nom: 'X', telephone: '12', consentement: true })).s === 400, 'téléphone invalide refusé');
  ok((await reserver('09:00', 'Loin', '0600000000', dansJours(45))).s === 400, 'au-delà de 30 jours refusé');
  const clientsA = (await appel('GET', '/api/clients', undefined, A)).d?.clients || [];
  ok(clientsA.some(c => c.nom === 'Karim Test' && c.telephone === '0622334455'), 'fiche client créée, numéro normalisé', clientsA);
  const re = await reserver('16:00', 'karim  TEST', '06 22 33 44 55');
  ok(re.s === 201, 'deuxième réservation du même client');
  const clientsA2 = (await appel('GET', '/api/clients', undefined, A)).d?.clients || [];
  ok(clientsA2.filter(c => c.telephone === '0622334455').length === 1, 'même nom et même numéro : une seule fiche');
  const frere = await reserver('16:30', 'Yanis Test', '06 22 33 44 55');
  const clientsA3 = (await appel('GET', '/api/clients', undefined, A)).d?.clients || [];
  ok(frere.s === 201 && clientsA3.filter(c => c.telephone === '0622334455').length === 2, 'même numéro, autre prénom : deux fiches');
  ok((await boite()).some(m => m.canal === 'push' && m.type === 'nouveau-rdv'), 'barbier notifié du rdv');

  console.log("T12 — liste d'attente");
  const at = await appel('POST', `/api/public/salons/${slugA2}/attente`, { date: J, nom: 'Patient', telephone: '0688888888', consentement: true });
  ok(at.s === 201, "inscription en liste d'attente", at);
  ok((await appel('POST', `/api/public/salons/${slugA2}/attente`, { date: J, nom: 'Patient', telephone: '0688888888', consentement: true })).s === 201, 'doublon accepté sans nouvelle ligne');

  const vue = await appel('GET', `/api/public/rdv/${resa.d?.annulation}`);
  ok(vue.s === 200 && vue.d.rdv.heure === '10:00' && vue.d.rdv.annulable === true && vue.d.salon.slug === slugA2, 'rdv lisible par son jeton', vue.d);
  ok((await appel('POST', '/api/public/annuler', { jeton: 'f'.repeat(48) })).s === 404, 'mauvais jeton refusé');
  ok((await appel('POST', '/api/public/annuler', { jeton: resa.d?.annulation })).s === 200, 'annulation');
  ok((await dispo()).includes('10:00'), "l'annulation libère le créneau");
  ok((await appel('POST', '/api/public/annuler', { jeton: resa.d?.annulation })).s === 409, 'double annulation refusée');
  const pushs = (await boite()).filter(m => m.canal === 'push');
  ok(pushs.some(m => m.type === 'annulation') && pushs.some(m => m.type === 'place-libre'), 'barbier prévenu : annulation et place libre avec attente');

  console.log('T5 — deux réservations simultanées');
  const [x, y] = await Promise.all(['Un', 'Deux'].map((nom, i) => reserver('14:00', nom, `065555555${i}`)));
  ok([x.s, y.s].sort().join() === '201,409', 'une seule passe', [x.s, y.s]);

  console.log('T6 — agenda du barbier et visites');
  const hier = dansJours(-1);
  const passe = await appel('POST', '/api/rdv', { client_nom: 'Ancien', telephone: '0600000001', prestation_id: coupe.id, date: hier, heure: '10:00' }, A);
  ok(passe.s === 201 && passe.d.rdv.source === 'dashboard', 'le dashboard saisit un rdv passé', passe);
  ok((await appel('POST', '/api/public/annuler', { jeton: passe.d?.rdv?.jeton_annulation })).s === 409, "annulation en ligne après l'heure refusée");
  const onze = await appel('POST', '/api/rdv', { client_nom: 'Midi', telephone: '0600000002', prestation_id: coupe.id, date: J, heure: '11:00' }, A);
  ok(onze.s === 201 && !(await dispo()).includes('11:00'), 'rdv du dashboard bloque la page publique');
  ok((await appel('POST', '/api/rdv', { client_nom: 'Collé', telephone: '0600000003', prestation_id: coupe.id, date: J, heure: '11:15' }, A)).s === 409, 'chevauchement signalé');
  ok((await appel('POST', '/api/rdv', { client_nom: 'Collé', telephone: '0600000003', prestation_id: coupe.id, date: J, heure: '11:15', forcer: true }, A)).s === 201, 'chevauchement forcé accepté');
  ok((await appel('PATCH', `/api/rdv/${onze.d?.rdv?.id}`, { statut: 'noshow' }, A)).d?.rdv?.statut === 'noshow', 'no-show enregistré');
  ok((await appel('PATCH', `/api/rdv/${onze.d?.rdv?.id}`, { statut: 'parti' }, A)).s === 400, 'statut inconnu refusé');
  const deplace = await appel('PATCH', `/api/rdv/${passe.d?.rdv?.id}`, { date: J, heure: '17:00' }, A);
  ok(deplace.s === 200 && deplace.d.rdv.date === J && !(await dispo()).includes('17:00'), 'rdv déplacé');
  const noteRdv = await appel('POST', '/api/rdv', { client_nom: 'Noté', telephone: '0600000004', prestation_id: coupe.id, date: J, heure: '17:30', note: 'fade court' }, A);
  ok(noteRdv.s === 201 && noteRdv.d.rdv.note === 'fade court', 'note enregistrée à la création', noteRdv.d);
  const change = await appel('PATCH', `/api/rdv/${noteRdv.d?.rdv?.id}`, { prestation_id: barbe.id, client_nom: 'Renommé', note: 'barbe seule' }, A);
  ok(change.s === 200 && change.d.rdv.prestation_nom === 'Barbe' && change.d.rdv.prix === 10 && change.d.rdv.duree_min === 20
    && change.d.rdv.client_nom === 'Renommé' && change.d.rdv.note === 'barbe seule', 'prestation, client et note modifiés', change.d);
  ok((await appel('PATCH', `/api/rdv/${noteRdv.d?.rdv?.id}`, { prestation_id: 'inconnue' }, A)).s === 404, 'prestation inconnue refusée');
  const agenda = await appel('GET', `/api/rdv?du=${J}&au=${J}`, undefined, A);
  ok(agenda.s === 200 && agenda.d.rdv.some(r => r.heure === '17:00') && agenda.d.rdv.every(r => r.date === J), 'agenda du jour', agenda.d);

  const cl = await appel('POST', '/api/clients', { nom: 'Fidèle', telephone: '06 77 77 77 77', notes: 'dégradé bas' }, A);
  ok(cl.s === 201 && cl.d.client.telephone === '0677777777', 'client créé', cl);
  const cid = cl.d?.client?.id;
  const d2 = dansJours(-2), d3 = dansJours(-3), d4 = dansJours(-4);
  await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d2, heure: '10:00' }, A);
  await appel('POST', '/api/rdv', { client_id: cid, prestation_id: barbe.id, date: d2, heure: '10:30' }, A);
  await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d4, heure: '15:00' }, A);
  const an = await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d3, heure: '10:00' }, A);
  await appel('PATCH', `/api/rdv/${an.d?.rdv?.id}`, { statut: 'annule' }, A);
  const ns = await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d3, heure: '14:00' }, A);
  await appel('PATCH', `/api/rdv/${ns.d?.rdv?.id}`, { statut: 'noshow' }, A);
  const fiche = await appel('GET', `/api/clients/${cid}`, undefined, A);
  ok(fiche.s === 200 && fiche.d.client.visites === 2, 'deux rdv le même jour = une visite ; annulé et no-show ne comptent pas', fiche.d?.client);
  ok(fiche.d?.client?.depense === 50 && fiche.d?.client?.derniere_venue === d2, 'dépense et dernière venue', fiche.d?.client);
  ok(fiche.d?.client?.habituelle === 'Coupe' && fiche.d?.historique?.length === 5, 'prestation habituelle et historique', fiche.d);
  ok((await appel('PATCH', `/api/clients/${cid}`, { notes: 'dégradé haut' }, A)).d?.client?.notes === 'dégradé haut', 'notes modifiées');
  ok((await appel('GET', '/api/clients?q=fid', undefined, A)).d?.clients?.some(c => c.id === cid), 'recherche par nom');
  ok((await appel('GET', '/api/clients?q=0677', undefined, A)).d?.clients?.some(c => c.id === cid), 'recherche par numéro');
  const la = await appel('GET', '/api/attente', undefined, A);
  ok(la.d?.attente?.length === 1 && la.d.attente[0].nom === 'Patient', "liste d'attente visible, sans doublon", la.d);
  const idAttente = la.d?.attente?.[0]?.id;
  ok((await appel('PATCH', `/api/attente/${idAttente}`, { prevenu: true }, A)).d?.attente?.prevenu_le, 'marqué prévenu');

  console.log('T2 — isolation entre salons');
  ok((await appel('GET', `/api/clients/${cid}`, undefined, B)).s === 404, 'B ne lit pas un client de A');
  ok((await appel('PATCH', `/api/clients/${cid}`, { nom: 'Pirate' }, B)).s === 404, 'B ne modifie pas un client de A');
  ok((await appel('PATCH', `/api/prestations/${coupe.id}`, { prix: 1 }, B)).s === 404, 'B ne modifie pas une prestation de A');
  ok((await appel('PATCH', `/api/rdv/${passe.d?.rdv?.id}`, { statut: 'annule' }, B)).s === 404, 'B ne touche pas un rdv de A');
  ok((await appel('DELETE', `/api/fermetures/${f.d?.fermeture?.id}`, undefined, B)).s === 404, 'B ne supprime pas une fermeture de A');
  ok((await appel('PATCH', `/api/attente/${idAttente}`, { prevenu: false }, B)).s === 404, "B ne touche pas l'attente de A");
  ok((await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: J, heure: '18:00' }, B)).s === 404, 'B ne réserve pas avec une prestation de A');
  const prestaB0 = (await appel('GET', '/api/prestations', undefined, B)).d?.prestations?.[0] || {};
  ok((await appel('POST', '/api/rdv', { client_id: cid, prestation_id: prestaB0.id, date: J, heure: '18:00' }, B)).s === 404, 'B ne réserve pas pour un client de A');
  ok(!(await appel('GET', '/api/clients', undefined, B)).d?.clients?.some(c => c.id === cid), 'la liste de B ne contient rien de A');
  ok((await appel('GET', `/api/rdv?du=${dansJours(-10)}&au=${dansJours(10)}`, undefined, B)).d?.rdv?.length === 0, "l'agenda de B est vide");
  ok((await appel('GET', '/api/attente', undefined, B)).d?.attente?.length === 0, "l'attente de B est vide");

  console.log("T7 — fin de l'essai");
  ok((await appel('POST', '/api/admin/connexion', { mdp: 'mauvais' })).s === 401, 'mauvais mot de passe admin refusé');
  const adm = await appel('POST', '/api/admin/connexion', { mdp: ADMIN_PASSWORD });
  ok(adm.s === 200 && adm.d.jeton, 'connexion admin');
  const ADM = adm.d?.jeton;
  const salonB = insB.d.salon.id;
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { essai_fin: '2020-01-01' }, ADM)).s === 200, "l'admin avance la fin d'essai");
  ok((await appel('GET', '/api/moi', undefined, B)).d?.salon?.statut === 'expire', 'statut expiré');
  ok((await appel('POST', '/api/prestations', { nom: 'Test', duree_min: 30, prix: 10 }, B)).s === 402, "écriture refusée après l'essai");
  ok((await appel('GET', '/api/prestations', undefined, B)).s === 200, "lecture autorisée après l'essai");
  const pubB = await appel('GET', `/api/public/salons/${slugB}`);
  ok(pubB.d?.reservable === false, 'page publique fermée');
  ok((await appel('POST', `/api/public/salons/${slugB}/reserver`, { prestation_id: prestaB0.id, date: dansJours(3), heure: '10:00', nom: 'X', telephone: '0600000000', consentement: true })).s === 403, 'réservation publique refusée');
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { statut: 'actif' }, ADM)).s === 400, 'activer sans plan refusé');
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { statut: 'actif', plan: 'pro' }, ADM)).s === 200, "l'admin active le salon");
  ok((await appel('POST', '/api/prestations', { nom: 'Test', duree_min: 30, prix: 10 }, B)).s === 201, 'écriture de nouveau possible');

  console.log('T8 — mot de passe oublié');
  ok((await appel('POST', '/api/comptes/mot-de-passe-oublie', { email: 'inconnu@test.fr' })).s === 200, 'email inconnu : même réponse');
  ok((await appel('POST', '/api/comptes/mot-de-passe-oublie', { email: emailA })).s === 200, 'demande de nouveau mot de passe');
  const jr = await dernierJeton(emailA, 'reset');
  ok(!!jr, 'email envoyé');
  ok((await appel('POST', '/api/comptes/reinitialiser', { jeton: jr, mdp: 'nouveaumdp1' })).s === 200, 'mot de passe changé');
  ok((await appel('POST', '/api/comptes/reinitialiser', { jeton: jr, mdp: 'encoreun11' })).s === 400, 'lien à usage unique');
  ok((await appel('POST', '/api/comptes/connexion', { email: emailA, mdp: 'nouveaumdp1' })).s === 200, 'connexion avec le nouveau mot de passe');
  ok((await appel('POST', '/api/comptes/mot-de-passe', { actuel: 'faux', nouveau: 'autremdp11' }, A)).s === 403, 'changement refusé sans le mot de passe actuel');
  ok((await appel('POST', '/api/comptes/mot-de-passe', { actuel: 'nouveaumdp1', nouveau: 'autremdp11' }, A)).s === 200, 'changement de mot de passe');

  console.log('T10 — back-office');
  ok((await appel('GET', '/api/admin/salons')).s === 401, 'sans jeton refusé');
  ok((await appel('GET', '/api/admin/salons', undefined, A)).s === 401, 'un jeton barbier ne suffit pas');
  const sal = await appel('GET', '/api/admin/salons', undefined, ADM);
  const ligneA = sal.d?.salons?.find(s => s.slug === slugA2);
  ok(sal.s === 200 && ligneA && ligneA.bot_statut === 'demande' && ligneA.email === emailA && ligneA.rdv_30j >= 5, 'liste des salons', ligneA);
  const kpi = await appel('GET', '/api/admin/kpi', undefined, ADM);
  ok(kpi.s === 200 && kpi.d.demandes_bot >= 1 && kpi.d.mrr >= 79 && kpi.d.essai >= 1, 'indicateurs', kpi.d);
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { plan: 'gratuit' }, ADM)).s === 400, 'plan inconnu refusé');

  console.log('T16 — règles de réservation et options');
  const N = insN.d?.jeton, slugN = insN.d?.salon?.slug, idN = insN.d?.salon?.id;
  const pubN = () => appel('GET', `/api/public/salons/${slugN}`);
  ok((await appel('PUT', '/api/horaires', { semaine: [0, 1, 2, 3, 4, 5, 6].map(jour => ({ jour, ouverture: '08:00', fermeture: '20:00' })) }, N)).s === 200, 'salon N ouvert tous les jours');
  const prestaN = (await pubN()).d?.prestations?.[0] || {};
  const libresN = async date => (await appel('GET', `/api/public/salons/${slugN}/dispo?date=${date}&prestation=${prestaN.id}`)).d?.heures || [];
  ok((await appel('PATCH', '/api/salon', { delai_min_h: 5 }, N)).s === 400, 'délai hors liste refusé');
  const regles = await appel('PATCH', '/api/salon', { delai_min_h: 48, annulation_h: 48, rappel_veille: true }, N);
  ok(regles.s === 200 && regles.d.salon.delai_min_h === 48 && regles.d.salon.annulation_h === 48, 'règles enregistrées', regles.d);
  ok((await libresN(dansJours(1))).length === 0 && (await libresN(dansJours(4))).length > 0, 'rien de réservable avant le délai minimum');
  await appel('PATCH', '/api/salon', { delai_min_h: 0 }, N);
  ok((await appel('PATCH', `/api/admin/salons/${idN}`, { options: { validation: true, prix_masques: true, inconnue: true } }, ADM)).s === 200, "options activées par l'admin");
  const pubOpt = await pubN();
  ok(pubOpt.d?.validation === true && pubOpt.d?.prix_masques === true && pubOpt.d.prestations.every(p => p.prix === null), 'prix masqués, validation annoncée', pubOpt.d);
  ok(!((await appel('GET', '/api/moi', undefined, N)).d?.salon?.options || {}).inconnue, 'option inconnue ignorée');
  const emailClientN = `client-n-${RUN}@test.fr`;
  const resaN = (date, heure) => appel('POST', `/api/public/salons/${slugN}/reserver`,
    { prestation_id: prestaN.id, date, heure, nom: 'Léa Test', telephone: '0611223344', email: emailClientN, consentement: true });
  const demain = dansJours(1);
  const d1 = await resaN(demain, '10:00');
  ok(d1.s === 201 && d1.d.rdv.statut === 'en_attente' && d1.d.rdv.prix === null, 'réservation en attente de validation', d1.d);
  ok((await boite()).some(m => m.type === 'demande-client' && m.a === emailClientN), 'client prévenu que sa demande est reçue');
  ok(!(await libresN(demain)).includes('10:00'), 'la demande en attente bloque le créneau');
  const rdvN = (await appel('GET', `/api/rdv?du=${demain}&au=${demain}`, undefined, N)).d?.rdv?.find(r => r.heure === '10:00') || {};
  ok(rdvN.statut === 'en_attente', 'le pro voit la demande', rdvN);
  ok((await appel('POST', `/api/rdv/${rdvN.id}/valider`, { accepte: true }, N)).d?.rdv?.statut === 'confirme', 'demande acceptée');
  ok((await boite()).some(m => m.type === 'confirmation-client' && m.a === emailClientN), 'client prévenu de la confirmation');
  ok((await appel('POST', `/api/rdv/${rdvN.id}/valider`, { accepte: true }, N)).s === 409, 'déjà validée : refus');
  const annulTard = await appel('POST', '/api/public/annuler', { jeton: d1.d.annulation });
  ok(annulTard.s === 409 && annulTard.d.delai === true, 'annulation refusée dans le délai du salon', annulTard.d);
  await appel('POST', '/api/test/rappels');
  await appel('POST', '/api/test/rappels');
  ok((await boite()).filter(m => m.type === 'rappel-client' && m.a === emailClientN).length === 1, 'rappel de la veille envoyé une seule fois');
  const d5 = await resaN(dansJours(5), '11:00');
  const rdv5 = (await appel('GET', `/api/rdv?du=${dansJours(5)}&au=${dansJours(5)}`, undefined, N)).d?.rdv?.find(r => r.heure === '11:00') || {};
  ok(d5.s === 201 && (await appel('POST', `/api/rdv/${rdv5.id}/valider`, { accepte: false }, N)).d?.rdv?.statut === 'annule', 'demande refusée');
  ok((await boite()).some(m => m.type === 'refus-client' && m.a === emailClientN), 'client prévenu du refus');
  ok((await libresN(dansJours(5))).includes('11:00'), 'le créneau refusé est de nouveau libre');
  await appel('PATCH', `/api/admin/salons/${idN}`, { options: { validation: false, prix_masques: false } }, ADM);

  console.log('T15 — personnalisation de la page');
  const perso = await appel('PATCH', '/api/salon', { description: 'Ongles et cils à Lyon', instagram: 'https://www.instagram.com/studio_a/?hl=fr', couleur: '#E91E63' }, A);
  ok(perso.s === 200 && perso.d.salon.instagram === 'studio_a' && perso.d.salon.couleur === '#e91e63' && perso.d.salon.description === 'Ongles et cils à Lyon', 'description, pseudo et couleur enregistrés', perso.d);
  const slugPerso = perso.d?.salon?.slug;
  ok((await appel('PATCH', '/api/salon', { couleur: 'rouge' }, A)).s === 400, 'couleur invalide refusée');
  ok((await appel('PATCH', '/api/salon', { instagram: 'pas un pseudo !' }, A)).s === 400, 'pseudo invalide refusé');
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  ok((await appel('PUT', '/api/salon/logo', { image: 'data:text/html;base64,PGgxPg==' }, A)).s === 400, 'logo non image refusé');
  const logo = await appel('PUT', '/api/salon/logo', { image: PNG }, A);
  ok(logo.s === 200 && typeof logo.d.salon.logo === 'number', 'logo enregistré', logo.d);
  const pubPerso = await appel('GET', `/api/public/salons/${slugPerso}`);
  ok(pubPerso.d?.logo && pubPerso.d.couleur === '#e91e63' && pubPerso.d.instagram === 'studio_a', 'personnalisation visible sur la page publique', pubPerso.d);
  const img = await fetch(`${API}/api/public/salons/${slugPerso}/logo`);
  ok(img.status === 200 && img.headers.get('content-type') === 'image/png', 'logo servi en image', img.status);
  ok((await appel('PATCH', `/api/prestations/${coupe.id}`, { description: 'Shampoing compris' }, A)).s === 200, 'description de prestation');
  ok((await appel('GET', `/api/public/salons/${slugPerso}`)).d?.prestations?.some(p => p.description === 'Shampoing compris'), 'description visible sur la page publique');
  ok((await appel('DELETE', '/api/salon/logo', undefined, A)).d?.salon?.logo === null, 'logo retiré');
  ok((await fetch(`${API}/api/public/salons/${slugPerso}/logo`)).status === 404, 'plus de logo servi');

  console.log('T14 — mise en route obligatoire');
  const X = insX.d?.jeton;
  ok((await appel('PUT', '/api/horaires', { semaine: [] }, X)).s === 200, 'semaine fermée');
  ok((await appel('POST', '/api/salon/mise-en-route', undefined, X)).s === 400, 'mise en route refusée sans jour ouvert');
  ok((await appel('PUT', '/api/horaires', { semaine: [{ jour: 2, ouverture: '09:00', fermeture: '18:00' }] }, X)).s === 200, 'un jour ouvert');
  const fin = await appel('POST', '/api/salon/mise-en-route', undefined, X);
  ok(fin.s === 200 && fin.d.salon.mise_en_route === true, 'mise en route terminée', fin.d);
  ok((await appel('GET', '/api/moi', undefined, X)).d?.salon?.mise_en_route === true, 'mise en route retenue côté serveur');

  console.log('T13 — paiement Stripe');
  async function webhook(evt, signature) {
    const corps = JSON.stringify(evt);
    const t = Math.floor(Date.now() / 1000);
    const sig = signature ?? `t=${t},v1=${crypto.createHmac('sha256', STRIPE_SECRET).update(`${t}.${corps}`).digest('hex')}`;
    const r = await fetch(API + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body: corps });
    return r.status;
  }
  const salonN = insN.d?.salon?.id;
  const paiementN = { type: 'checkout.session.completed', data: { object: { id: 'cs_n', amount_total: 5900, client_reference_id: salonN, customer: 'cus_n', subscription: `sub_n_${Date.now()}` } } };
  ok(await webhook(paiementN, 't=1,v1=00') === 400, 'signature Stripe fausse refusée');
  ok(await webhook(paiementN) === 200, 'paiement reçu');
  let moiN = await appel('GET', '/api/moi', undefined, insN.d?.jeton);
  ok(moiN.d?.salon?.statut === 'actif' && moiN.d.salon.plan === 'starter', 'salon actif en Starter après paiement', moiN.d?.salon);
  ok(await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_x', amount_total: 19900, customer_details: { email: `x-${RUN}@test.fr` } } } }) === 200, 'paiement sans référence');
  const moiX = await appel('GET', '/api/moi', undefined, insX.d?.jeton);
  ok(moiX.d?.salon?.statut === 'actif' && moiX.d.salon.plan === 'max', 'retrouvé par email, frais de mise en place ignorés : Max', moiX.d?.salon);
  ok(await webhook({ type: 'customer.subscription.deleted', data: { object: { id: paiementN.data.object.subscription } } }) === 200, 'résiliation reçue');
  moiN = await appel('GET', '/api/moi', undefined, insN.d?.jeton);
  ok(moiN.d?.salon?.statut === 'expire', 'salon expiré après résiliation', moiN.d?.salon);

  console.log('T11 — suppression du compte');
  ok((await appel('DELETE', '/api/salon', { confirmation: 'pas le bon' }, B)).s === 400, 'confirmation exigée');
  ok((await appel('DELETE', '/api/salon', { confirmation: nomSalon }, B)).s === 200, 'compte supprimé');
  ok((await appel('POST', '/api/comptes/connexion', { email: emailB, mdp: 'motdepasse2' })).s === 401, 'plus de connexion');
  ok((await appel('GET', '/api/moi', undefined, B)).s === 401, 'ancien jeton inutilisable');
  ok((await appel('GET', `/api/public/salons/${slugB}`)).s === 404, 'page publique supprimée');
}

main()
  .catch(e => { echecs++; console.error(e); })
  .finally(() => {
    console.log(`\n${total - echecs}/${total} vérifications passées`);
    process.exit(echecs ? 1 : 0);
  });
