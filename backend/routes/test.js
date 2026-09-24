/* Monté seulement quand TRIMSYNC_TEST=1 (voir server.js) : jamais en production. */
const express = require('express');
const { boite } = require('../lib/boite');

const router = express.Router();
router.get('/api/test/boite', (_req, res) => res.json({ boite }));
module.exports = router;
