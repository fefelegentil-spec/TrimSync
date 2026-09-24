const express = require('express');
const { pool } = require('../lib/db');
const { exigerCompte } = require('../lib/auth');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

router.get('/api/push/cle-publique', (_req, res) => res.json({ cle: process.env.VAPID_PUBLIC || null }));

// Un même navigateur ne sert qu'un salon : le dernier compte connecté le récupère.
router.post('/api/push/abonnement', exigerCompte, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!/^https:\/\/\S+$/.test(String(endpoint || '')) || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Abonnement invalide' });
  }
  try {
    await pool.query(
      `INSERT INTO push_abonnements (endpoint, salon_id, compte_id, cles) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET salon_id = $2, compte_id = $3, cles = $4`,
      [endpoint, req.salonId, req.compteId, { p256dh: String(keys.p256dh), auth: String(keys.auth) }]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'push/abonnement'); }
});

router.delete('/api/push/abonnement', exigerCompte, async (req, res) => {
  try {
    await pool.query('DELETE FROM push_abonnements WHERE endpoint = $1 AND salon_id = $2', [String(req.body?.endpoint || ''), req.salonId]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'push/desabonnement'); }
});

module.exports = router;
