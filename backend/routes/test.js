/* Monté seulement quand TRIMSYNC_TEST=1 (voir server.js) : jamais en production. */
const express = require('express');
const { boite } = require('../lib/boite');

const router = express.Router();
router.get('/api/test/boite', (_req, res) => res.json({ boite }));
// Lance le rappel de la veille sans attendre 10 h.
router.post('/api/test/rappels', async (_req, res) => { await require('../lib/taches').rappelsVeille(true); res.json({ ok: true }); });
module.exports = router;
