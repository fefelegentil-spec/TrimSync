const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

// partiel = modification : seuls les champs présents sont vérifiés.
function lireChamps(b, partiel) {
  const c = {};
  if (!partiel || b.nom !== undefined) {
    const nom = sanitizeText(b.nom, 60);
    if (!nom) return { erreur: 'Donne un nom à la prestation' };
    c.nom = nom;
  }
  if (!partiel || b.duree_min !== undefined) {
    const d = Number(b.duree_min);
    if (!Number.isInteger(d) || d < 5 || d > 480 || d % 5) return { erreur: 'Durée invalide (de 5 min à 8 h, par pas de 5 min)' };
    c.duree_min = d;
  }
  if (!partiel || b.prix !== undefined) {
    const p = Number(b.prix);
    if (!Number.isFinite(p) || p < 0 || p > 10000) return { erreur: 'Prix invalide' };
    c.prix = Math.round(p * 100) / 100;
  }
  if (partiel && b.actif !== undefined) c.actif = !!b.actif;
  return { c };
}

router.get('/api/prestations', exigerCompte, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM prestations WHERE salon_id = $1 ORDER BY ordre, nom', [req.salonId]);
    res.json({ prestations: r.rows });
  } catch (e) { erreurServeur(res, e, 'prestations'); }
});

router.post('/api/prestations', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, false);
  if (erreur) return res.status(400).json({ error: erreur });
  try {
    const r = await pool.query(
      `INSERT INTO prestations (id, salon_id, nom, duree_min, prix, ordre)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(ordre) + 1, 0) FROM prestations WHERE salon_id = $2))
       RETURNING *`, [uid('p'), req.salonId, c.nom, c.duree_min, c.prix]);
    res.status(201).json({ prestation: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'prestations/creer'); }
});

router.patch('/api/prestations/:id', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, true);
  if (erreur) return res.status(400).json({ error: erreur });
  const cles = Object.keys(c); // clés fixées par lireChamps
  try {
    const r = cles.length
      ? await pool.query(
        `UPDATE prestations SET ${cles.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND salon_id = $2 RETURNING *`,
        [req.params.id, req.salonId, ...cles.map(k => c[k])])
      : await pool.query('SELECT * FROM prestations WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Prestation introuvable' });
    res.json({ prestation: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'prestations/modifier'); }
});

router.put('/api/prestations/ordre', exigerCompte, exigerEcriture, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
  if (!ids) return res.status(400).json({ error: 'Liste attendue' });
  try {
    await transaction(async q => {
      for (const [ordre, id] of ids.entries()) {
        await q.query('UPDATE prestations SET ordre = $3 WHERE id = $1 AND salon_id = $2', [id, req.salonId, ordre]);
      }
    });
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'prestations/ordre'); }
});

module.exports = router;
