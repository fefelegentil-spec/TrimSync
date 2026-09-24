/* ── Fiches clients ──
   Visites et dépense sont calculées à la lecture, jamais stockées : une visite
   est un JOUR où le client a un RDV confirmé déjà passé. Rien à recalculer
   quand un statut change. */
const express = require('express');
const { pool, uid } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { nowParis } = require('../lib/dates');
const { telAStocker } = require('../lib/telephone');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

// $2 = date du jour, $3 = heure actuelle (Paris).
const VENU = `r.statut = 'confirme' AND (r.date < $2 OR (r.date = $2 AND r.heure <= $3))`;
const STATS = `
  COUNT(DISTINCT r.date) FILTER (WHERE ${VENU}) AS visites,
  COALESCE(SUM(r.prix) FILTER (WHERE ${VENU}), 0) AS depense,
  MAX(r.date) FILTER (WHERE ${VENU}) AS derniere_venue`;

function lireChamps(b, partiel) {
  const c = {};
  if (!partiel || b.nom !== undefined) {
    const nom = sanitizeText(b.nom, 80);
    if (!nom) return { erreur: 'Indique le nom du client' };
    c.nom = nom;
  }
  if (b.telephone !== undefined) c.telephone = telAStocker(sanitizeText(b.telephone, 30));
  if (b.email !== undefined) c.email = sanitizeText(b.email, 120);
  if (b.notes !== undefined) c.notes = sanitizeText(b.notes, 1000);
  return { c };
}

router.get('/api/clients', exigerCompte, async (req, res) => {
  const { date, time } = nowParis();
  const q = String(req.query.q || '').trim().slice(0, 60);
  try {
    const r = await pool.query(
      `SELECT c.*, ${STATS}
         FROM clients c LEFT JOIN rdv r ON r.client_id = c.id AND r.salon_id = c.salon_id
        WHERE c.salon_id = $1 AND ($4 = '' OR c.nom ILIKE '%' || $4 || '%' OR c.telephone LIKE '%' || $4 || '%')
        GROUP BY c.id ORDER BY c.nom`, [req.salonId, date, time, q]);
    res.json({ clients: r.rows });
  } catch (e) { erreurServeur(res, e, 'clients'); }
});

router.get('/api/clients/:id', exigerCompte, async (req, res) => {
  const { date, time } = nowParis();
  try {
    const r = await pool.query(
      `SELECT c.*, ${STATS}
         FROM clients c LEFT JOIN rdv r ON r.client_id = c.id AND r.salon_id = c.salon_id
        WHERE c.salon_id = $1 AND c.id = $4 GROUP BY c.id`, [req.salonId, date, time, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Client introuvable' });
    const [habituelle, historique] = await Promise.all([
      pool.query(
        `SELECT r.prestation_nom FROM rdv r WHERE r.salon_id = $1 AND r.client_id = $4 AND ${VENU}
          GROUP BY r.prestation_nom ORDER BY COUNT(*) DESC, MAX(r.date) DESC, r.prestation_nom LIMIT 1`,
        [req.salonId, date, time, req.params.id]),
      pool.query('SELECT * FROM rdv WHERE salon_id = $1 AND client_id = $2 ORDER BY date DESC, heure DESC LIMIT 100', [req.salonId, req.params.id]),
    ]);
    res.json({ client: { ...r.rows[0], habituelle: habituelle.rows[0]?.prestation_nom || null }, historique: historique.rows });
  } catch (e) { erreurServeur(res, e, 'clients/fiche'); }
});

// Création explicite depuis le dashboard : pas de rapprochement automatique.
router.post('/api/clients', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, false);
  if (erreur) return res.status(400).json({ error: erreur });
  try {
    const r = await pool.query(
      'INSERT INTO clients (id, salon_id, nom, telephone, email, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uid('c'), req.salonId, c.nom, c.telephone || '', c.email || '', c.notes || '']);
    res.status(201).json({ client: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'clients/creer'); }
});

router.patch('/api/clients/:id', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, true);
  if (erreur) return res.status(400).json({ error: erreur });
  const cles = Object.keys(c); // clés fixées par lireChamps
  try {
    const r = cles.length
      ? await pool.query(
        `UPDATE clients SET ${cles.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND salon_id = $2 RETURNING *`,
        [req.params.id, req.salonId, ...cles.map(k => c[k])])
      : await pool.query('SELECT * FROM clients WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ client: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'clients/modifier'); }
});

module.exports = router;
