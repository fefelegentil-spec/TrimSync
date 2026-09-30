/* ── Profil du salon, demande de bot, suppression du compte ── */
const express = require('express');
const { pool } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { vueSalon } = require('../lib/salon');
const { sanitizeText, slugifier } = require('../lib/texte');
const { telAStocker } = require('../lib/telephone');
const { erreurServeur } = require('../lib/http');
const emails = require('../lib/emails');

const router = express.Router();

router.get('/api/salon', exigerCompte, (req, res) => res.json({ salon: vueSalon(req.salon) }));

router.patch('/api/salon', exigerCompte, async (req, res) => {
  const b = req.body || {};
  const champs = {};
  if (b.nom !== undefined) {
    const nom = sanitizeText(b.nom, 80);
    if (!nom) return res.status(400).json({ error: 'Le nom du salon est obligatoire' });
    champs.nom = nom;
  }
  if (b.ville !== undefined) champs.ville = sanitizeText(b.ville, 60);
  if (b.adresse !== undefined) champs.adresse = sanitizeText(b.adresse, 160);
  if (b.telephone !== undefined) champs.telephone = telAStocker(sanitizeText(b.telephone, 30));
  if (b.description !== undefined) champs.description = sanitizeText(b.description, 300);
  if (b.instagram !== undefined) {
    // « @nom », « nom » ou l'adresse du profil : on ne garde que le pseudo.
    const pseudo = String(b.instagram || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
    if (pseudo && !/^[A-Za-z0-9._]{1,30}$/.test(pseudo)) return res.status(400).json({ error: 'Pseudo Instagram invalide' });
    champs.instagram = pseudo;
  }
  // Valeurs proposées par le dashboard : rien d'autre n'est accepté.
  if (b.delai_min_h !== undefined) {
    if (![0, 1, 2, 3, 6, 12, 24, 48].includes(Number(b.delai_min_h))) return res.status(400).json({ error: 'Délai de réservation invalide' });
    champs.delai_min_h = Number(b.delai_min_h);
  }
  if (b.annulation_h !== undefined) {
    if (![0, 2, 6, 12, 24, 48].includes(Number(b.annulation_h))) return res.status(400).json({ error: "Délai d'annulation invalide" });
    champs.annulation_h = Number(b.annulation_h);
  }
  if (b.rappel_veille !== undefined) champs.rappel_veille = !!b.rappel_veille;
  if (b.couleur !== undefined) {
    const c = String(b.couleur || '').trim().toLowerCase();
    if (c && !/^#[0-9a-f]{6}$/.test(c)) return res.status(400).json({ error: 'Couleur invalide' });
    champs.couleur = c;
  }
  try {
    if (b.slug !== undefined) {
      if (!String(b.slug).trim()) return res.status(400).json({ error: 'Adresse de page vide' });
      const slug = slugifier(b.slug);
      if (slug.length < 3) return res.status(400).json({ error: 'Adresse de page trop courte' });
      const pris = await pool.query('SELECT 1 FROM salons WHERE slug = $1 AND id <> $2', [slug, req.salonId]);
      if (pris.rowCount) return res.status(409).json({ error: 'Cette adresse est déjà prise' });
      champs.slug = slug;
    }
    const cles = Object.keys(champs); // clés fixées ci-dessus : jamais issues de la requête
    if (!cles.length) return res.json({ salon: vueSalon(req.salon) });
    const r = await pool.query(
      `UPDATE salons SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.salonId, ...cles.map(k => champs[k])]);
    res.json({ salon: vueSalon(r.rows[0]) });
  } catch (e) {
    if (e.constraint === 'salons_slug_key') return res.status(409).json({ error: 'Cette adresse est déjà prise' });
    erreurServeur(res, e, 'salon/modifier');
  }
});

/* ── Logo de la page de réservation ──
   Redimensionné par le navigateur avant l'envoi (carré, ~320 px) : le corps
   JSON reste sous la limite de 100 Ko du serveur. */
const TYPES_LOGO = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };
router.put('/api/salon/logo', exigerCompte, exigerEcriture, async (req, res) => {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image || ''));
  if (!m || !TYPES_LOGO[m[1]]) return res.status(400).json({ error: 'Image invalide (PNG, JPEG ou WebP)' });
  const image = Buffer.from(m[2], 'base64');
  if (image.length > 90 * 1024) return res.status(413).json({ error: 'Image trop lourde' });
  try {
    await pool.query(
      `INSERT INTO salon_logos (salon_id, type, image) VALUES ($1, $2, $3)
       ON CONFLICT (salon_id) DO UPDATE SET type = $2, image = $3`, [req.salonId, m[1], image]);
    const r = await pool.query('UPDATE salons SET logo_maj = NOW() WHERE id = $1 RETURNING *', [req.salonId]);
    res.json({ salon: vueSalon(r.rows[0]) });
  } catch (e) { erreurServeur(res, e, 'salon/logo'); }
});

router.delete('/api/salon/logo', exigerCompte, exigerEcriture, async (req, res) => {
  try {
    await pool.query('DELETE FROM salon_logos WHERE salon_id = $1', [req.salonId]);
    const r = await pool.query('UPDATE salons SET logo_maj = NULL WHERE id = $1 RETURNING *', [req.salonId]);
    res.json({ salon: vueSalon(r.rows[0]) });
  } catch (e) { erreurServeur(res, e, 'salon/logo-suppr'); }
});

// Fin du parcours de mise en route : refusée tant que la page de réservation
// n'a rien à proposer (aucune prestation active ou aucun jour ouvert).
router.post('/api/salon/mise-en-route', exigerCompte, async (req, res) => {
  try {
    const [presta, jours] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM prestations WHERE salon_id = $1 AND actif', [req.salonId]),
      pool.query('SELECT COUNT(*)::int AS n FROM horaires WHERE salon_id = $1', [req.salonId]),
    ]);
    if (!presta.rows[0].n) return res.status(400).json({ error: 'Ajoute au moins une prestation' });
    if (!jours.rows[0].n) return res.status(400).json({ error: 'Ouvre au moins un jour dans la semaine' });
    const r = await pool.query('UPDATE salons SET mise_en_route_le = COALESCE(mise_en_route_le, NOW()) WHERE id = $1 RETURNING *', [req.salonId]);
    res.json({ salon: vueSalon(r.rows[0]) });
  } catch (e) { erreurServeur(res, e, 'salon/mise-en-route'); }
});

// Félix ne doit pas appeler une adresse bidon : email vérifié d'abord.
router.post('/api/salon/demande-bot', exigerCompte, async (req, res) => {
  if (!req.salon.email_verifie_le) {
    return res.status(403).json({ error: "Confirme d'abord ton adresse email (lien reçu à l'inscription)." });
  }
  if (req.salon.bot_statut !== 'inactif') return res.json({ bot_statut: req.salon.bot_statut });
  try {
    await pool.query(`UPDATE salons SET bot_statut = 'demande' WHERE id = $1`, [req.salonId]);
    emails.alerteAdmin(`Demande de bot : ${req.salon.nom}`, {
      Salon: req.salon.nom, Ville: req.salon.ville, Email: req.salon.email, Téléphone: req.salon.telephone,
    });
    res.json({ bot_statut: 'demande' });
  } catch (e) { erreurServeur(res, e, 'demande-bot'); }
});

// Irréversible : tout part avec le salon (ON DELETE CASCADE).
router.delete('/api/salon', exigerCompte, async (req, res) => {
  if (String(req.body?.confirmation || '').trim() !== req.salon.nom) {
    return res.status(400).json({ error: 'Recopie exactement le nom du salon pour confirmer' });
  }
  try {
    await pool.query('DELETE FROM salons WHERE id = $1', [req.salonId]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'salon/supprimer'); }
});

module.exports = router;
