const express = require('express');
const { pool } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { nowParis } = require('../lib/dates');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

router.get('/api/attente', exigerCompte, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM attente WHERE salon_id = $1 AND date >= $2 ORDER BY date, created_at', [req.salonId, nowParis().date]);
    res.json({ attente: r.rows });
  } catch (e) { erreurServeur(res, e, 'attente'); }
});

router.patch('/api/attente/:id', exigerCompte, exigerEcriture, async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE attente SET prevenu_le = CASE WHEN $3 THEN NOW() ELSE NULL END WHERE id = $1 AND salon_id = $2 RETURNING *',
      [req.params.id, req.salonId, !!req.body?.prevenu]);
    if (!r.rowCount) return res.status(404).json({ error: 'Demande introuvable' });
    res.json({ attente: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'attente/modifier'); }
});

router.delete('/api/attente/:id', exigerCompte, exigerEcriture, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM attente WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Demande introuvable' });
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'attente/supprimer'); }
});

module.exports = router;
