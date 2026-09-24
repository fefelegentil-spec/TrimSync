/* ── Mots de passe et sessions ──
   Jeton de session = charge JSON signée HMAC (TRIMSYNC_SECRET), 30 jours.
   Le salon d'une requête est relu en base à partir du compte : jamais pris
   dans le corps, l'URL ou le jeton lui-même. */
const crypto = require('crypto');
const { pool } = require('./db');
const { statutEffectif } = require('./salon');
const { erreurServeur } = require('./http');

function hacherMdp(mdp) {
  const sel = crypto.randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${crypto.scryptSync(String(mdp), sel, 64).toString('hex')}`;
}

function verifierMdp(mdp, stocke) {
  const [, selHex, hashHex] = String(stocke || '').split('$');
  if (!selHex || !hashHex) return false;
  const calcule = crypto.scryptSync(String(mdp), Buffer.from(selHex, 'hex'), 64);
  const attendu = Buffer.from(hashHex, 'hex');
  return calcule.length === attendu.length && crypto.timingSafeEqual(calcule, attendu);
}

function secret() {
  if (!process.env.TRIMSYNC_SECRET) throw new Error('TRIMSYNC_SECRET manquant');
  return process.env.TRIMSYNC_SECRET;
}

function signer(charge) {
  const corps = Buffer.from(JSON.stringify(charge)).toString('base64url');
  return corps + '.' + crypto.createHmac('sha256', secret()).update(corps).digest('base64url');
}

function lireJeton(jeton) {
  const [corps, signature] = String(jeton || '').split('.');
  if (!corps || !signature) return null;
  const attendue = crypto.createHmac('sha256', secret()).update(corps).digest('base64url');
  if (signature.length !== attendue.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(attendue))) return null;
  try {
    const charge = JSON.parse(Buffer.from(corps, 'base64url').toString());
    return charge.exp > Date.now() ? charge : null;
  } catch { return null; }
}

const TRENTE_JOURS = 30 * 24 * 3600 * 1000;
const jetonCompte = compte => signer({ t: 'compte', c: compte.id, exp: Date.now() + TRENTE_JOURS });
const jetonAdmin = () => signer({ t: 'admin', exp: Date.now() + 12 * 3600 * 1000 });
const porteur = req => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };

async function exigerCompte(req, res, next) {
  let charge;
  try { charge = lireJeton(porteur(req)); } catch (e) { return erreurServeur(res, e, 'exigerCompte'); }
  if (!charge || charge.t !== 'compte') return res.status(401).json({ error: 'Connexion requise' });
  try {
    const r = await pool.query(
      `SELECT s.*, c.email, c.email_verifie_le FROM comptes c JOIN salons s ON s.id = c.salon_id WHERE c.id = $1`,
      [charge.c]);
    if (!r.rowCount) return res.status(401).json({ error: 'Compte introuvable' });
    req.compteId = charge.c;
    req.salon = r.rows[0];
    req.salonId = r.rows[0].id;
    next();
  } catch (e) { erreurServeur(res, e, 'exigerCompte'); }
}

function exigerAdmin(req, res, next) {
  let charge;
  try { charge = lireJeton(porteur(req)); } catch (e) { return erreurServeur(res, e, 'exigerAdmin'); }
  if (!charge || charge.t !== 'admin') return res.status(401).json({ error: 'Accès réservé' });
  next();
}

// Après l'essai : on lit tout, on n'écrit plus rien.
function exigerEcriture(req, res, next) {
  const statut = statutEffectif(req.salon);
  if (statut === 'expire' || statut === 'suspendu') {
    return res.status(402).json({ error: 'Ton essai est terminé : choisis un plan pour continuer.', statut });
  }
  next();
}

module.exports = { hacherMdp, verifierMdp, jetonCompte, jetonAdmin, exigerCompte, exigerAdmin, exigerEcriture };
