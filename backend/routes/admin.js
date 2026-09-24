/* ── Back-office de Félix ──
   Jeton admin distinct des jetons barbier, obtenu avec ADMIN_PASSWORD. */
const crypto = require('crypto');
const express = require('express');
const { pool } = require('../lib/db');
const { jetonAdmin, exigerAdmin } = require('../lib/auth');
const { vueSalon, PRIX_PLANS } = require('../lib/salon');
const { estDate, nowParis } = require('../lib/dates');
const { erreurServeur, quota } = require('../lib/http');

const router = express.Router();
const STATUTS = ['essai', 'actif', 'expire', 'suspendu'];
const BOT = ['inactif', 'demande', 'actif'];
const empreinte = s => crypto.createHash('sha256').update(String(s)).digest();

router.post('/api/admin/connexion', quota(10, 15 * 60 * 1000), (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD non configuré' });
  if (!crypto.timingSafeEqual(empreinte(req.body?.mdp || ''), empreinte(process.env.ADMIN_PASSWORD))) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  try { res.json({ jeton: jetonAdmin() }); } catch (e) { erreurServeur(res, e, 'admin/connexion'); }
});

async function lesSalons() {
  const r = await pool.query(`
    SELECT s.*, c.email, c.email_verifie_le, c.derniere_connexion_le,
           (SELECT COUNT(*) FROM rdv r WHERE r.salon_id = s.id AND r.created_at > NOW() - INTERVAL '30 days') AS rdv_30j
      FROM salons s LEFT JOIN comptes c ON c.salon_id = s.id
     ORDER BY s.created_at DESC`);
  return r.rows.map(s => ({
    ...vueSalon(s), email: s.email, email_verifie: !!s.email_verifie_le,
    derniere_connexion_le: s.derniere_connexion_le, rdv_30j: s.rdv_30j, created_at: s.created_at,
  }));
}

router.get('/api/admin/salons', exigerAdmin, async (_req, res) => {
  try { res.json({ salons: await lesSalons() }); } catch (e) { erreurServeur(res, e, 'admin/salons'); }
});

router.get('/api/admin/kpi', exigerAdmin, async (_req, res) => {
  try {
    const salons = await lesSalons();
    const compte = st => salons.filter(s => s.statut === st).length;
    res.json({
      essai: compte('essai'), actifs: compte('actif'), expires: compte('expire'), suspendus: compte('suspendu'),
      mrr: salons.filter(s => s.statut === 'actif' && s.plan).reduce((t, s) => t + PRIX_PLANS[s.plan], 0),
      demandes_bot: salons.filter(s => s.bot_statut === 'demande').length,
    });
  } catch (e) { erreurServeur(res, e, 'admin/kpi'); }
});

router.patch('/api/admin/salons/:id', exigerAdmin, async (req, res) => {
  const b = req.body || {};
  try {
    const salon = (await pool.query('SELECT * FROM salons WHERE id = $1', [req.params.id])).rows[0];
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const c = {};
    if (b.statut !== undefined) {
      if (!STATUTS.includes(b.statut)) return res.status(400).json({ error: 'Statut inconnu' });
      c.statut = b.statut;
    }
    if (b.plan !== undefined) {
      if (b.plan !== null && !PRIX_PLANS[b.plan]) return res.status(400).json({ error: 'Plan inconnu' });
      c.plan = b.plan;
    }
    if (b.essai_fin !== undefined) {
      if (!estDate(b.essai_fin)) return res.status(400).json({ error: 'Date invalide' });
      c.essai_fin = b.essai_fin;
      // Prolonger l'essai d'un salon expiré le rouvre.
      if (b.statut === undefined && salon.statut === 'expire' && b.essai_fin >= nowParis().date) c.statut = 'essai';
    }
    if (b.bot_statut !== undefined) {
      if (!BOT.includes(b.bot_statut)) return res.status(400).json({ error: 'Statut de bot inconnu' });
      c.bot_statut = b.bot_statut;
    }
    if (c.statut === 'actif' && !(c.plan || salon.plan)) return res.status(400).json({ error: 'Choisis un plan pour activer ce salon' });
    const cles = Object.keys(c); // clés fixées ci-dessus
    if (!cles.length) return res.json({ salon: vueSalon(salon) });
    const r = await pool.query(
      `UPDATE salons SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [salon.id, ...cles.map(k => c[k])]);
    res.json({ salon: vueSalon(r.rows[0]) });
  } catch (e) { erreurServeur(res, e, 'admin/salon'); }
});

module.exports = router;
