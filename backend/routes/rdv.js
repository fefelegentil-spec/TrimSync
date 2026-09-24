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
      `INSERT INTO rdv (id, salon_id, client_id, client_nom, telephone, prestation_id, prestation_nom, prix, duree_min, date, heure, source, jeton_annulation, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'dashboard', $12, $13) RETURNING *`,
      [uid('r'), req.salonId, client.id, client.nom, client.telephone, presta.id, presta.nom, presta.prix, presta.duree_min,
        b.date, b.heure, crypto.randomBytes(24).toString('hex'), sanitizeText(b.note, 300)]);
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
    // Changer de prestation reprend son nom, son prix et sa durée actuels.
    let presta = { id: avant.prestation_id, nom: avant.prestation_nom, prix: avant.prix, duree_min: avant.duree_min };
    if (b.prestation_id !== undefined && b.prestation_id !== avant.prestation_id) {
      presta = (await pool.query('SELECT * FROM prestations WHERE id = $1 AND salon_id = $2', [String(b.prestation_id), req.salonId])).rows[0];
      if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    }
    // Changer de client : même rapprochement nom + numéro qu'à la création.
    let client = { id: avant.client_id, nom: avant.client_nom, telephone: avant.telephone };
    const nouveauNom = b.client_nom !== undefined ? sanitizeText(b.client_nom, 80) : '';
    if (nouveauNom && nouveauNom !== avant.client_nom) {
      const tel = b.telephone !== undefined ? sanitizeText(b.telephone, 30) : avant.telephone;
      const id = await trouverOuCreerClient(pool, req.salonId, { nom: nouveauNom, telephone: tel });
      client = (await pool.query('SELECT id, nom, telephone FROM clients WHERE id = $1', [id])).rows[0];
    }
    const note = b.note !== undefined ? sanitizeText(b.note, 300) : avant.note;
    const bouge = apres.date !== avant.date || apres.heure !== avant.heure;
    const rallonge = presta.duree_min > avant.duree_min;
    if ((bouge || rallonge) && apres.statut === 'confirme' && !b.forcer
      && chevauche(await rdvDuJour(req.salonId, apres.date), apres.date, apres.heure, presta.duree_min, avant.id)) {
      return res.status(409).json(CHEVAUCHEMENT);
    }
    const r = await pool.query(
      `UPDATE rdv SET date = $3, heure = $4, statut = $5, prestation_id = $6, prestation_nom = $7, prix = $8, duree_min = $9,
              client_id = $10, client_nom = $11, telephone = $12, note = $13
        WHERE id = $1 AND salon_id = $2 RETURNING *`,
      [avant.id, req.salonId, apres.date, apres.heure, apres.statut, presta.id, presta.nom, presta.prix, presta.duree_min,
        client.id, client.nom, client.telephone, note]);
    // L'ancienne place se libère si le RDV est annulé, marqué no-show ou déplacé.
    if (avant.statut === 'confirme' && (apres.statut !== 'confirme' || bouge)) await signalerPlaceLibre(req.salonId, avant.date);
    res.json({ rdv: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'rdv/modifier'); }
});

module.exports = router;
