/* ── Comptes : inscription, connexion, email, mot de passe ── */
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { hacherMdp, verifierMdp, jetonCompte, exigerCompte } = require('../lib/auth');
const { creerJeton, consommerJeton } = require('../lib/jetons');
const { slugLibre } = require('../lib/slug');
const { nowParis, decaleJours } = require('../lib/dates');
const { telAStocker } = require('../lib/telephone');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur, quota } = require('../lib/http');
const { vueSalon } = require('../lib/salon');
const emails = require('../lib/emails');

const router = express.Router();
const quotaComptes = quota(10, 15 * 60 * 1000);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUREE_ESSAI_JOURS = 30;
const HEURE_MS = 3600 * 1000;
// Pour ne pas partir d'une page vide : tout est modifiable ensuite.
const PRESTATIONS_DEPART = [['Coupe', 30, 20], ['Barbe', 20, 10], ['Coupe + barbe', 45, 28]];
// Même durée de réponse, que l'email existe ou non.
const MDP_LEURRE = hacherMdp('leurre-' + Math.random());

const lireEmail = v => String(v || '').trim().toLowerCase();

router.post('/api/comptes/inscription', quotaComptes, async (req, res) => {
  const b = req.body || {};
  const email = lireEmail(b.email);
  const mdp = String(b.mdp || '');
  const nom = sanitizeText(b.salon, 80);
  const ville = sanitizeText(b.ville, 60);
  const telephone = telAStocker(sanitizeText(b.telephone, 30));
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });
  if (mdp.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  if (!nom) return res.status(400).json({ error: 'Le nom du salon est obligatoire' });
  if (b.consentement !== true) return res.status(400).json({ error: 'Tu dois accepter les conditions pour créer ton compte' });
  try {
    const r = await transaction(async q => {
      if ((await q.query('SELECT 1 FROM comptes WHERE email = $1', [email])).rowCount) return null;
      const salonId = uid('s');
      const compteId = uid('u');
      const slug = await slugLibre(q, `${nom} ${ville}`);
      await q.query(
        `INSERT INTO salons (id, slug, nom, ville, telephone, essai_fin) VALUES ($1, $2, $3, $4, $5, $6)`,
        [salonId, slug, nom, ville, telephone, decaleJours(nowParis().date, DUREE_ESSAI_JOURS)]);
      await q.query(
        `INSERT INTO comptes (id, salon_id, email, mdp_hash, derniere_connexion_le) VALUES ($1, $2, $3, $4, NOW())`,
        [compteId, salonId, email, hacherMdp(mdp)]);
      for (const [ordre, [n, duree, prix]] of PRESTATIONS_DEPART.entries()) {
        await q.query(
          `INSERT INTO prestations (id, salon_id, nom, duree_min, prix, ordre) VALUES ($1, $2, $3, $4, $5, $6)`,
          [uid('p'), salonId, n, duree, prix, ordre]);
      }
      for (let jour = 2; jour <= 6; jour++) {
        await q.query(`INSERT INTO horaires (salon_id, jour, ouverture, fermeture) VALUES ($1, $2, '09:00', '19:00')`, [salonId, jour]);
      }
      const jeton = await creerJeton(q, compteId, 'verification', 24 * HEURE_MS);
      const salon = (await q.query('SELECT * FROM salons WHERE id = $1', [salonId])).rows[0];
      return { compteId, salon, jeton };
    });
    if (!r) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    emails.verification(email, r.jeton);
    emails.alerteAdmin(`Nouveau salon inscrit : ${r.salon.nom}`, {
      Salon: r.salon.nom, Ville: r.salon.ville, Email: email, Téléphone: r.salon.telephone, Page: vueSalon(r.salon).lien_public,
    });
    res.status(201).json({ jeton: jetonCompte({ id: r.compteId }), salon: vueSalon(r.salon) });
  } catch (e) {
    if (e.constraint === 'comptes_email_key') return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    erreurServeur(res, e, 'inscription');
  }
});

router.post('/api/comptes/connexion', quotaComptes, async (req, res) => {
  const email = lireEmail(req.body?.email);
  const mdp = String(req.body?.mdp || '');
  try {
    const compte = (await pool.query('SELECT id, mdp_hash FROM comptes WHERE email = $1', [email])).rows[0];
    const bon = verifierMdp(mdp, compte ? compte.mdp_hash : MDP_LEURRE);
    if (!compte || !bon) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    await pool.query('UPDATE comptes SET derniere_connexion_le = NOW() WHERE id = $1', [compte.id]);
    res.json({ jeton: jetonCompte(compte) });
  } catch (e) { erreurServeur(res, e, 'connexion'); }
});

router.get('/api/moi', exigerCompte, (req, res) => {
  res.json({ email: req.salon.email, email_verifie: !!req.salon.email_verifie_le, salon: vueSalon(req.salon) });
});

router.post('/api/comptes/verifier', quotaComptes, async (req, res) => {
  try {
    const compteId = await consommerJeton(pool, req.body?.jeton, 'verification');
    if (!compteId) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    await pool.query('UPDATE comptes SET email_verifie_le = NOW() WHERE id = $1', [compteId]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'verifier'); }
});

router.post('/api/comptes/renvoyer-verification', quotaComptes, exigerCompte, async (req, res) => {
  try {
    if (req.salon.email_verifie_le) return res.json({ ok: true, deja: true });
    const jeton = await creerJeton(pool, req.compteId, 'verification', 24 * HEURE_MS);
    emails.verification(req.salon.email, jeton);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'renvoyer-verification'); }
});

// Même réponse que l'email existe ou non : on ne sert pas d'annuaire.
router.post('/api/comptes/mot-de-passe-oublie', quotaComptes, async (req, res) => {
  const email = lireEmail(req.body?.email);
  try {
    const compte = (await pool.query('SELECT id FROM comptes WHERE email = $1', [email])).rows[0];
    if (compte) emails.reset(email, await creerJeton(pool, compte.id, 'reset', HEURE_MS));
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'mot-de-passe-oublie'); }
});

router.post('/api/comptes/reinitialiser', quotaComptes, async (req, res) => {
  const mdp = String(req.body?.mdp || '');
  if (mdp.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  try {
    const compteId = await consommerJeton(pool, req.body?.jeton, 'reset');
    if (!compteId) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    await pool.query('UPDATE comptes SET mdp_hash = $2 WHERE id = $1', [compteId, hacherMdp(mdp)]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'reinitialiser'); }
});

router.post('/api/comptes/mot-de-passe', quotaComptes, exigerCompte, async (req, res) => {
  const nouveau = String(req.body?.nouveau || '');
  if (nouveau.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  try {
    const { mdp_hash } = (await pool.query('SELECT mdp_hash FROM comptes WHERE id = $1', [req.compteId])).rows[0];
    if (!verifierMdp(String(req.body?.actuel || ''), mdp_hash)) return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
    await pool.query('UPDATE comptes SET mdp_hash = $2 WHERE id = $1', [req.compteId, hacherMdp(nouveau)]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'mot-de-passe'); }
});

module.exports = router;
