/* ── Paiements Stripe → statut du salon ──
   Le pro paie par un lien de paiement Stripe ouvert depuis son dashboard, avec
   client_reference_id = id du salon. Stripe prévient ici (webhook) :
   - checkout.session.completed      → salon « actif » avec son plan ;
   - customer.subscription.deleted   → salon « expiré » (lecture seule, rien n'est effacé) ;
   - invoice.payment_failed          → Félix est prévenu, Stripe relance tout seul.
   Signature vérifiée à la main (HMAC-SHA256 sur le corps brut), sans le SDK.
   Sans STRIPE_WEBHOOK_SECRET, la route répond 503 et rien d'autre ne change. */
const crypto = require('crypto');
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const emails = require('../lib/emails');
const { notifierSalon } = require('../lib/push');

const router = express.Router();
const TOLERANCE_S = 300;
// Montants mensuels (centimes) → plan. Grille du 01/10/2026 : Essentiel 19 €,
// Pro 49 € (+ bot), Max 89 € (+ bot avancé). Les anciens montants (59 € Starter,
// 79 € Pro, 99 € Max) restent reconnus pour un lien déjà ouvert chez un client.
// Les liens avec frais de mise en place (100 €) facturent en plus une ligne
// unique : on la retire avant de lire le plan.
const PLAN_PAR_MONTANT = { 1900: 'essentiel', 4900: 'pro', 8900: 'max', 5900: 'starter', 7900: 'pro', 9900: 'max' };
const FRAIS_MISE_EN_PLACE = 10000;

function signatureValide(brut, entete, secret) {
  const parts = Object.fromEntries(String(entete || '').split(',').map(p => p.split('=')).filter(p => p.length === 2)
    .map(([k, v]) => [k, v]));
  const signatures = String(entete || '').split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  const t = Number(parts.t);
  if (!t || !signatures.length || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  const attendu = crypto.createHmac('sha256', secret).update(`${t}.${brut}`).digest('hex');
  return signatures.some(s => /^[0-9a-f]{64}$/.test(s)
    && crypto.timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(attendu, 'hex')));
}

function planDuMontant(total) {
  if (PLAN_PAR_MONTANT[total]) return PLAN_PAR_MONTANT[total];
  return PLAN_PAR_MONTANT[total - FRAIS_MISE_EN_PLACE] || null;
}

async function salonDuPaiement(session) {
  const ref = String(session.client_reference_id || '');
  if (ref) {
    const r = await pool.query('SELECT id, nom FROM salons WHERE id = $1', [ref]);
    if (r.rowCount) return r.rows[0];
  }
  // Payé depuis la page d'accueil, sans passer par le dashboard : on retrouve le compte par l'email.
  const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
  if (!email) return null;
  const r = await pool.query('SELECT s.id, s.nom FROM comptes c JOIN salons s ON s.id = c.salon_id WHERE c.email = $1', [email]);
  return r.rows[0] || null;
}

async function paiementRecu(session) {
  const plan = planDuMontant(session.amount_total);
  const salon = await salonDuPaiement(session);
  const client = session.customer_details?.email || session.customer_email || '';
  if (!salon || !plan) {
    emails.alerteAdmin('Paiement Stripe à rattacher à la main', {
      Montant: (session.amount_total / 100) + ' €', Email: client, Référence: session.client_reference_id || '—',
      Raison: !salon ? 'aucun salon trouvé' : 'montant inconnu', Session: session.id,
    });
    return;
  }
  await pool.query(
    `UPDATE salons SET statut = 'actif', plan = $2, stripe_client = COALESCE($3, stripe_client),
       stripe_abonnement = COALESCE($4, stripe_abonnement) WHERE id = $1`,
    [salon.id, plan, session.customer || null, session.subscription || null]);
  emails.alerteAdmin(`Nouveau client payant : ${salon.nom}`, { Plan: plan, Montant: (session.amount_total / 100) + ' €', Email: client });
  const compte = (await pool.query('SELECT c.email, s.nom, s.slug FROM comptes c JOIN salons s ON s.id = c.salon_id WHERE s.id = $1', [salon.id])).rows[0];
  if (compte) emails.abonnementActive(compte.email, compte, plan);
  notifierSalon(salon.id, { type: 'abonnement', titre: 'Abonnement activé', corps: 'Merci ! Ton salon TrimSync est actif.' });
}

async function abonnementTermine(abonnement) {
  const r = await pool.query(
    `UPDATE salons SET statut = 'expire' WHERE stripe_abonnement = $1 AND statut = 'actif' RETURNING nom`, [abonnement.id]);
  if (r.rowCount) emails.alerteAdmin(`Abonnement résilié : ${r.rows[0].nom}`, { Abonnement: abonnement.id });
}

router.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Stripe non configuré' });
  const brut = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!signatureValide(brut, req.get('stripe-signature'), secret)) return res.status(400).json({ error: 'Signature invalide' });
  let evt;
  try { evt = JSON.parse(brut); } catch (_) { return res.status(400).json({ error: 'Corps invalide' }); }
  try {
    const o = evt.data?.object || {};
    // Une session d'acompte porte le jeton d'annulation du RDV (48 hex), pas un
    // id de salon : c'est le seul moyen de la distinguer d'un abonnement.
    const acompte = /^[0-9a-f]{48}$/.test(String(o.client_reference_id || ''));
    if (acompte && (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded')) await acompteRecu(o);
    else if (evt.type === 'checkout.session.completed') await paiementRecu(o);
    else if (evt.type === 'checkout.session.async_payment_succeeded') await paiementRecu(o);
    else if (evt.type === 'customer.subscription.deleted') await abonnementTermine(o);
    else if (acompte && evt.type === 'checkout.session.expired') await acompteExpire(o);
    else if (evt.type === 'invoice.payment_failed') {
      emails.alerteAdmin('Paiement Stripe échoué', { Client: o.customer_email || o.customer || '—', Montant: (o.amount_due / 100) + ' €' });
    }
    res.json({ recu: true });
  } catch (e) {
    console.error('[stripe]', e.message);
    res.status(500).json({ error: 'Erreur de traitement' }); // Stripe renverra l'événement
  }
});

/* ── Acomptes anti no-show ──
   Un acompte vit sur un RDV de page de réservation : le montant est demandé au
   client juste après sa réservation, via un lien de paiement Stripe unique
   (client_reference_id = jeton d'annulation du RDV — indépendant de la base).
   Le webhook coche le paiement ; l'annulation en ligne dans le délai annule
   l'acompte, le remboursement se fait ensuite à la main dans le dashboard
   Stripe (le backend n'a pas de clé secrète, et c'est volontaire). */
async function acompteRecu(session) {
  const jeton = String(session.client_reference_id || '');
  if (!/^[0-9a-f]{48}$/.test(jeton)) return;
  const rdv = (await pool.query(
    `SELECT r.id, r.acompte, r.acompte_paye_le FROM rdv r WHERE r.jeton_annulation = $1 AND r.acompte > 0`, [jeton])).rows[0];
  if (!rdv || rdv.acompte_paye_le) return;
  await transaction(async q => {
    await q.query('UPDATE rdv SET acompte_paye_le = NOW() WHERE id = $1 AND acompte_paye_le IS NULL', [rdv.id]);
    await q.query(
      `INSERT INTO acomptes (id, rdv_id, stripe_session, montant)
       SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM acomptes WHERE stripe_session = $3)`,
      [uid('ac'), rdv.id, session.id, rdv.acompte]);
  });
}

async function acompteExpire(session) {
  await pool.query(
    `UPDATE rdv SET acompte = 0 WHERE jeton_annulation = $1 AND acompte_paye_le IS NULL`,
    [String(session.client_reference_id || '')]);
}

module.exports = router;
