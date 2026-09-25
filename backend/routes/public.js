/* ── Page de réservation publique d'un salon ──
   Rien d'autre ne sort que le nom, la ville, l'adresse, le téléphone, les
   prestations actives et les heures libres : pas de liste des RDV (les
   créneaux se calculent ici, pas dans le navigateur). */
const crypto = require('crypto');
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { creneaux } = require('../lib/dispo');
const { contexteDispo } = require('../lib/contexte');
const { trouverOuCreerClient } = require('../lib/clients');
const { signalerPlaceLibre } = require('../lib/notifs');
const { notifierSalon } = require('../lib/push');
const { reservable } = require('../lib/salon');
const { nowParis, decaleJours, estDate, estHeure, creneauPasse, jourLisible } = require('../lib/dates');
const { telAStocker, telComposable } = require('../lib/telephone');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur, quota } = require('../lib/http');

const router = express.Router();
const DIX_MIN = 10 * 60 * 1000;
const quotaLecture = quota(300, DIX_MIN);
const quotaEcriture = quota(30, DIX_MIN);
const quotaAnnulation = quota(30, DIX_MIN);
const HORIZON_JOURS = 30;

async function salonDuSlug(slug) {
  const r = await pool.query('SELECT * FROM salons WHERE slug = $1', [String(slug || '').toLowerCase()]);
  return r.rows[0] || null;
}

async function prestationActive(salonId, id) {
  const r = await pool.query('SELECT * FROM prestations WHERE id = $1 AND salon_id = $2 AND actif', [String(id || ''), salonId]);
  return r.rows[0] || null;
}

const INDISPONIBLE = salon => ({ error: 'Réservation en ligne indisponible, appelle le salon', telephone: salon.telephone });

function lireClient(b) {
  const nom = sanitizeText(b.nom, 80);
  const telephone = telAStocker(sanitizeText(b.telephone, 30));
  if (!nom) return { erreur: 'Indique ton nom' };
  if (!telComposable(telephone)) return { erreur: 'Numéro de téléphone invalide' };
  if (b.consentement !== true) return { erreur: 'Tu dois accepter que le salon garde tes coordonnées' };
  return { nom, telephone, email: sanitizeText(b.email, 120) };
}

router.get('/api/public/salons/:slug', quotaLecture, async (req, res) => {
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const p = await pool.query(
      'SELECT id, nom, duree_min, prix FROM prestations WHERE salon_id = $1 AND actif ORDER BY ordre, nom', [salon.id]);
    res.json({
      nom: salon.nom, ville: salon.ville, adresse: salon.adresse, telephone: salon.telephone, slug: salon.slug,
      reservable: reservable(salon), horizon_jours: HORIZON_JOURS, prestations: p.rows,
    });
  } catch (e) { erreurServeur(res, e, 'public/salon'); }
});

// Nombre d'heures libres pour chacun des 30 prochains jours (jours complets grisés).
router.get('/api/public/salons/:slug/jours', quotaLecture, async (req, res) => {
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const presta = await prestationActive(salon.id, req.query.prestation);
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    const maintenant = nowParis();
    const ctx = await contexteDispo(pool, salon.id, maintenant.date, decaleJours(maintenant.date, HORIZON_JOURS - 1));
    const jours = [];
    for (let i = 0; i < HORIZON_JOURS; i++) {
      const date = decaleJours(maintenant.date, i);
      // « ouvert » : le jour a des horaires (hors fermeture) ; ouvert sans place libre = complet.
      const ouvert = creneaux({ ...ctx, rdv: [], duree: presta.duree_min, date, maintenant }).length > 0;
      jours.push({ date, ouvert, libres: ouvert ? creneaux({ ...ctx, duree: presta.duree_min, date, maintenant }).length : 0 });
    }
    res.json({ jours });
  } catch (e) { erreurServeur(res, e, 'public/jours'); }
});

router.get('/api/public/salons/:slug/dispo', quotaLecture, async (req, res) => {
  const date = String(req.query.date || '');
  if (!estDate(date)) return res.status(400).json({ error: 'Date invalide' });
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const presta = await prestationActive(salon.id, req.query.prestation);
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    const ctx = await contexteDispo(pool, salon.id, date, date);
    res.json({ heures: creneaux({ ...ctx, duree: presta.duree_min, date, maintenant: nowParis() }) });
  } catch (e) { erreurServeur(res, e, 'public/dispo'); }
});

router.post('/api/public/salons/:slug/reserver', quotaEcriture, async (req, res) => {
  const b = req.body || {};
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    if (!reservable(salon)) return res.status(403).json(INDISPONIBLE(salon));
    const client = lireClient(b);
    if (client.erreur) return res.status(400).json({ error: client.erreur });
    if (!estDate(b.date) || !estHeure(b.heure)) return res.status(400).json({ error: 'Créneau invalide' });
    if (b.date > decaleJours(nowParis().date, HORIZON_JOURS - 1)) {
      return res.status(400).json({ error: `On ne réserve pas plus de ${HORIZON_JOURS} jours à l'avance` });
    }
    const presta = await prestationActive(salon.id, b.prestation_id);
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    // Heure hors de la grille du jour (10:07, jour fermé, heure passée) : 400.
    // Déjà prise : 409, vérifié sous verrou juste après.
    const grille = await contexteDispo(pool, salon.id, b.date, b.date)
      .then(ctx => creneaux({ ...ctx, rdv: [], duree: presta.duree_min, date: b.date, maintenant: nowParis() }));
    if (!grille.includes(b.heure)) return res.status(400).json({ error: "Cette heure n'est pas proposée" });
    // Verrou par salon : deux clients qui cliquent la même heure au même instant
    // ne l'obtiennent pas tous les deux.
    const rdv = await transaction(async q => {
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [salon.id]);
      const ctx = await contexteDispo(q, salon.id, b.date, b.date);
      if (!creneaux({ ...ctx, duree: presta.duree_min, date: b.date, maintenant: nowParis() }).includes(b.heure)) return null;
      const clientId = await trouverOuCreerClient(q, salon.id, client);
      const nouveau = { id: uid('r'), jeton: crypto.randomBytes(24).toString('hex') };
      await q.query(
        `INSERT INTO rdv (id, salon_id, client_id, client_nom, telephone, prestation_id, prestation_nom, prix, duree_min, date, heure, source, jeton_annulation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'site', $12)`,
        [nouveau.id, salon.id, clientId, client.nom, client.telephone, presta.id, presta.nom, presta.prix, presta.duree_min, b.date, b.heure, nouveau.jeton]);
      return nouveau;
    });
    if (!rdv) return res.status(409).json({ error: "Ce créneau vient d'être pris, choisis-en un autre" });
    notifierSalon(salon.id, {
      type: 'nouveau-rdv', titre: 'Nouveau rendez-vous',
      corps: `${client.nom} — ${presta.nom}, ${jourLisible(b.date)} à ${b.heure}`,
    });
    res.status(201).json({ rdv: { date: b.date, heure: b.heure, prestation: presta.nom, prix: presta.prix }, annulation: rdv.jeton });
  } catch (e) { erreurServeur(res, e, 'public/reserver'); }
});

router.post('/api/public/salons/:slug/attente', quotaEcriture, async (req, res) => {
  const b = req.body || {};
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    if (!reservable(salon)) return res.status(403).json(INDISPONIBLE(salon));
    const client = lireClient(b);
    if (client.erreur) return res.status(400).json({ error: client.erreur });
    const auj = nowParis().date;
    if (!estDate(b.date) || b.date < auj || b.date > decaleJours(auj, HORIZON_JOURS - 1)) {
      return res.status(400).json({ error: 'Date invalide' });
    }
    const deja = await pool.query('SELECT 1 FROM attente WHERE salon_id = $1 AND date = $2 AND telephone = $3', [salon.id, b.date, client.telephone]);
    if (!deja.rowCount) {
      await pool.query('INSERT INTO attente (id, salon_id, date, nom, telephone) VALUES ($1, $2, $3, $4, $5)',
        [uid('a'), salon.id, b.date, client.nom, client.telephone]);
      notifierSalon(salon.id, { type: 'attente', titre: "Liste d'attente", corps: `${client.nom} attend une place ${jourLisible(b.date)}` });
    }
    res.status(201).json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'public/attente'); }
});

const JETON = /^[0-9a-f]{48}$/;

router.get('/api/public/rdv/:jeton', quotaAnnulation, async (req, res) => {
  if (!JETON.test(req.params.jeton)) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  try {
    const r = (await pool.query(
      `SELECT r.*, s.nom AS salon_nom, s.telephone AS salon_tel, s.slug FROM rdv r JOIN salons s ON s.id = r.salon_id WHERE r.jeton_annulation = $1`,
      [req.params.jeton])).rows[0];
    if (!r) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    res.json({
      salon: { nom: r.salon_nom, telephone: r.salon_tel, slug: r.slug },
      rdv: { date: r.date, heure: r.heure, prestation: r.prestation_nom, prix: r.prix, statut: r.statut,
        annulable: r.statut === 'confirme' && !creneauPasse(r.date, r.heure) },
    });
  } catch (e) { erreurServeur(res, e, 'public/rdv'); }
});

router.post('/api/public/annuler', quotaAnnulation, async (req, res) => {
  const jeton = String(req.body?.jeton || '');
  if (!JETON.test(jeton)) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  try {
    const r = (await pool.query('SELECT * FROM rdv WHERE jeton_annulation = $1', [jeton])).rows[0];
    if (!r) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    if (r.statut !== 'confirme') return res.status(409).json({ error: 'Ce rendez-vous est déjà annulé' });
    if (creneauPasse(r.date, r.heure)) {
      return res.status(409).json({ error: "L'heure du rendez-vous est passée : il ne s'annule plus en ligne" });
    }
    const maj = await pool.query(`UPDATE rdv SET statut = 'annule' WHERE id = $1 AND statut = 'confirme'`, [r.id]);
    if (!maj.rowCount) return res.status(409).json({ error: 'Ce rendez-vous est déjà annulé' });
    notifierSalon(r.salon_id, { type: 'annulation', titre: 'Rendez-vous annulé', corps: `${r.client_nom} a annulé ${jourLisible(r.date)} à ${r.heure}` });
    await signalerPlaceLibre(r.salon_id, r.date);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'public/annuler'); }
});

module.exports = router;
