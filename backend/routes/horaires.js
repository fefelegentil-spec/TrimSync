/* ── Horaires de la semaine et fermetures ── */
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { estDate, estHeure, nowParis } = require('../lib/dates');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

// Comparer des 'HH:MM' comme des chaînes est juste : même longueur, zéros en tête.
function lireJour(j) {
  const jour = Number(j?.jour);
  if (!Number.isInteger(jour) || jour < 0 || jour > 6) return { erreur: 'Jour invalide' };
  if (!estHeure(j.ouverture) || !estHeure(j.fermeture) || j.ouverture >= j.fermeture) {
    return { erreur: "L'heure d'ouverture doit précéder celle de fermeture" };
  }
  const avecPause = j.pause_debut || j.pause_fin;
  if (avecPause && (!estHeure(j.pause_debut) || !estHeure(j.pause_fin)
    || j.pause_debut >= j.pause_fin || j.pause_debut < j.ouverture || j.pause_fin > j.fermeture)) {
    return { erreur: 'La pause doit tomber pendant les heures d’ouverture' };
  }
  return { j: { jour, ouverture: j.ouverture, fermeture: j.fermeture, pause_debut: avecPause ? j.pause_debut : null, pause_fin: avecPause ? j.pause_fin : null } };
}

router.get('/api/horaires', exigerCompte, async (req, res) => {
  try {
    const [semaine, fermetures] = await Promise.all([
      pool.query('SELECT jour, ouverture, fermeture, pause_debut, pause_fin FROM horaires WHERE salon_id = $1 ORDER BY jour', [req.salonId]),
      pool.query('SELECT * FROM fermetures WHERE salon_id = $1 AND date >= $2 ORDER BY date, debut NULLS FIRST', [req.salonId, nowParis().date]),
    ]);
    res.json({ semaine: semaine.rows, fermetures: fermetures.rows });
  } catch (e) { erreurServeur(res, e, 'horaires'); }
});

// Remplace toute la semaine : un jour absent de la liste est un jour fermé.
router.put('/api/horaires', exigerCompte, exigerEcriture, async (req, res) => {
  const liste = Array.isArray(req.body?.semaine) ? req.body.semaine : null;
  if (!liste) return res.status(400).json({ error: 'Semaine attendue' });
  const jours = [];
  for (const brut of liste) {
    const { j, erreur } = lireJour(brut);
    if (erreur) return res.status(400).json({ error: erreur });
    if (jours.some(x => x.jour === j.jour)) return res.status(400).json({ error: 'Un jour apparaît deux fois' });
    jours.push(j);
  }
  try {
    await transaction(async q => {
      await q.query('DELETE FROM horaires WHERE salon_id = $1', [req.salonId]);
      for (const j of jours) {
        await q.query(
          'INSERT INTO horaires (salon_id, jour, ouverture, fermeture, pause_debut, pause_fin) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.salonId, j.jour, j.ouverture, j.fermeture, j.pause_debut, j.pause_fin]);
      }
    });
    res.json({ semaine: jours.sort((a, b) => a.jour - b.jour) });
  } catch (e) { erreurServeur(res, e, 'horaires/modifier'); }
});

router.post('/api/fermetures', exigerCompte, exigerEcriture, async (req, res) => {
  const b = req.body || {};
  if (!estDate(b.date)) return res.status(400).json({ error: 'Date invalide' });
  const plage = b.debut || b.fin;
  if (plage && (!estHeure(b.debut) || !estHeure(b.fin) || b.debut >= b.fin)) {
    return res.status(400).json({ error: 'Plage horaire invalide' });
  }
  try {
    const r = await pool.query(
      'INSERT INTO fermetures (id, salon_id, date, debut, fin, motif) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uid('f'), req.salonId, b.date, plage ? b.debut : null, plage ? b.fin : null, sanitizeText(b.motif, 120)]);
    res.status(201).json({ fermeture: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'fermetures/creer'); }
});

router.delete('/api/fermetures/:id', exigerCompte, exigerEcriture, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM fermetures WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Fermeture introuvable' });
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'fermetures/supprimer'); }
});

module.exports = router;
