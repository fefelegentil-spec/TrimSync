/* ── Agenda du barbier ──
   Le barbier sait ce qu'il fait : il peut saisir un RDV passé ou hors
   horaires. Il est seulement prévenu d'un chevauchement (forcer: true). */
const crypto = require('crypto');
const express = require('express');
const { pool, uid } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { chevauche } = require('../lib/dispo');
const { trouverOuCreerClient } = require('../lib/clients');
const { signalerPlaceLibre } = require('../lib/notifs');
const { estDate, estHeure, nowParis, decaleJours } = require('../lib/dates');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();
const STATUTS = ['confirme', 'annule', 'noshow'];
const CHEVAUCHEMENT = { error: 'Ce créneau chevauche un autre rendez-vous', chevauchement: true };

const rdvDuJour = (salonId, date) =>
  pool.query('SELECT id, date, heure, duree_min, statut FROM rdv WHERE salon_id = $1 AND date = $2', [salonId, date]).then(r => r.rows);

router.get('/api/rdv', exigerCompte, async (req, res) => {
  const du = String(req.query.du || nowParis().date);
  const au = String(req.query.au || (estDate(du) ? decaleJours(du, 6) : ''));
  if (!estDate(du) || !estDate(au) || au < du) return res.status(400).json({ error: 'Période invalide' });
  try {
    const r = await pool.query(
      'SELECT * FROM rdv WHERE salon_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, heure', [req.salonId, du, au]);
    res.json({ rdv: r.rows });
  } catch (e) { erreurServeur(res, e, 'rdv'); }
});

router.post('/api/rdv', exigerCompte, exigerEcriture, async (req, res) => {
  const b = req.body || {};
  if (!estDate(b.date) || !estHeure(b.heure)) return res.status(400).json({ error: 'Date ou heure invalide' });
  try {
    const presta = (await pool.query('SELECT * FROM prestations WHERE id = $1 AND salon_id = $2', [String(b.prestation_id || ''), req.salonId])).rows[0];
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    let client;
    if (b.client_id) {
      client = (await pool.query('SELECT id, nom, telephone FROM clients WHERE id = $1 AND salon_id = $2', [String(b.client_id), req.salonId])).rows[0];
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
    } else {
      const nom = sanitizeText(b.client_nom, 80);
      if (!nom) return res.status(400).json({ error: 'Indique le nom du client' });
      const id = await trouverOuCreerClient(pool, req.salonId, { nom, telephone: sanitizeText(b.telephone, 30) });
      client = (await pool.query('SELECT id, nom, telephone FROM clients WHERE id = $1', [id])).rows[0];
    }
    if (!b.forcer && chevauche(await rdvDuJour(req.salonId, b.date), b.date, b.heure, presta.duree_min)) {
      return res.status(409).json(CHEVAUCHEMENT);
    }
    const r = await pool.query(
      `INSERT INTO rdv (id, salon_id, client_id, client_nom, telephone, prestation_id, prestation_nom, prix, duree_min, date, heure, source, jeton_annulation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'dashboard', $12) RETURNING *`,
      [uid('r'), req.salonId, client.id, client.nom, client.telephone, presta.id, presta.nom, presta.prix, presta.duree_min,
        b.date, b.heure, crypto.randomBytes(24).toString('hex')]);
    res.status(201).json({ rdv: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'rdv/creer'); }
});

router.patch('/api/rdv/:id', exigerCompte, exigerEcriture, async (req, res) => {
  const b = req.body || {};
  try {
    const avant = (await pool.query('SELECT * FROM rdv WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId])).rows[0];
    if (!avant) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    const apres = {
      date: b.date !== undefined ? b.date : avant.date,
      heure: b.heure !== undefined ? b.heure : avant.heure,
      statut: b.statut !== undefined ? b.statut : avant.statut,
    };
    if (!estDate(apres.date) || !estHeure(apres.heure)) return res.status(400).json({ error: 'Date ou heure invalide' });
    if (!STATUTS.includes(apres.statut)) return res.status(400).json({ error: 'Statut inconnu' });
    const bouge = apres.date !== avant.date || apres.heure !== avant.heure;
    if (bouge && apres.statut === 'confirme' && !b.forcer
      && chevauche(await rdvDuJour(req.salonId, apres.date), apres.date, apres.heure, avant.duree_min, avant.id)) {
      return res.status(409).json(CHEVAUCHEMENT);
    }
    const r = await pool.query(
      'UPDATE rdv SET date = $3, heure = $4, statut = $5 WHERE id = $1 AND salon_id = $2 RETURNING *',
      [avant.id, req.salonId, apres.date, apres.heure, apres.statut]);
    // L'ancienne place se libère si le RDV est annulé, marqué no-show ou déplacé.
    if (avant.statut === 'confirme' && (apres.statut !== 'confirme' || bouge)) await signalerPlaceLibre(req.salonId, avant.date);
    res.json({ rdv: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'rdv/modifier'); }
});

module.exports = router;
