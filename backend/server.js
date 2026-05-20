/* ── TrimSync Backend — Express + Resend ── */
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { Resend } = require('resend');

const app    = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT   = process.env.PORT || 3001;
const ADMIN  = process.env.ADMIN_EMAIL || 'felix@trimsync.tech';

app.use(cors());
app.use(express.json());

/* ── Santé ── */
app.get('/', (_req, res) => res.json({ ok: true, service: 'trimsync-backend' }));

/* ── POST /api/devis ──
   Corps attendu :
   {
     nom:       string   — nom du barbier / gérant
     email:     string   — email de contact
     barbershop: string  — nom du salon
     ville:     string   — ville
     plan:      string   — "starter" | "pro" | "max"
     message:   string   — message libre (optionnel)
   }
*/
app.post('/api/devis', async (req, res) => {
  const { nom, email, barbershop, ville, plan, message } = req.body;

  /* Validation minimale */
  if (!nom || !email || !barbershop || !plan) {
    return res.status(400).json({ ok: false, error: 'Champs requis manquants (nom, email, barbershop, plan).' });
  }

  const planLabel = { starter: 'Starter — 29 €/mois', pro: 'Pro — 59 €/mois', max: 'Max — 99 €/mois' }[plan] || plan;
  const dateStr   = new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' });

  try {
    /* 1 — Notification admin */
    await resend.emails.send({
      from: 'TrimSync <noreply@trimsync.tech>',
      to:   ADMIN,
      subject: `[TrimSync] Nouveau devis — ${barbershop} (${plan})`,
      html: `
        <h2 style="font-family:sans-serif;color:#3bbfcc">Nouvelle demande de devis</h2>
        <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:500px">
          <tr><td style="padding:6px 12px;font-weight:600;color:#555">Nom</td><td style="padding:6px 12px">${escHtml(nom)}</td></tr>
          <tr style="background:#f8f8f8"><td style="padding:6px 12px;font-weight:600;color:#555">Email</td><td style="padding:6px 12px"><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#555">Salon</td><td style="padding:6px 12px">${escHtml(barbershop)}</td></tr>
          <tr style="background:#f8f8f8"><td style="padding:6px 12px;font-weight:600;color:#555">Ville</td><td style="padding:6px 12px">${escHtml(ville || '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#555">Plan</td><td style="padding:6px 12px"><strong>${escHtml(planLabel)}</strong></td></tr>
          ${message ? `<tr style="background:#f8f8f8"><td style="padding:6px 12px;font-weight:600;color:#555;vertical-align:top">Message</td><td style="padding:6px 12px;white-space:pre-wrap">${escHtml(message)}</td></tr>` : ''}
        </table>
        <p style="font-family:sans-serif;color:#888;font-size:12px;margin-top:24px">${dateStr}</p>
      `,
    });

    /* 2 — Confirmation client */
    await resend.emails.send({
      from: 'TrimSync <noreply@trimsync.tech>',
      to:   email,
      subject: `Votre demande TrimSync a bien été reçue, ${nom.split(' ')[0]} !`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#3bbfcc;margin-bottom:8px">Merci ${escHtml(nom.split(' ')[0])} !</h2>
          <p style="color:#333;line-height:1.6">
            Votre demande de devis pour le plan <strong>${escHtml(planLabel)}</strong>
            a bien été reçue. Notre équipe vous contactera sous 24 h à cette adresse.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#666;font-size:14px;line-height:1.6">
            <strong>Salon :</strong> ${escHtml(barbershop)}<br>
            <strong>Ville :</strong> ${escHtml(ville || '—')}<br>
            <strong>Plan choisi :</strong> ${escHtml(planLabel)}
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#999;font-size:12px">TrimSync — Réservation Instagram pour barbiers</p>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[/api/devis] Erreur Resend :', err);
    res.status(500).json({ ok: false, error: 'Échec de l\'envoi email.' });
  }
});

/* ── POST /api/chat ──
   Proxy sécurisé vers l'API Claude — la clé reste côté serveur.
   Corps attendu : { system: string, messages: [{role, content}] }
*/
app.post('/api/chat', async (req, res) => {
  const { system, messages } = req.body;
  if (!system || !Array.isArray(messages)) {
    return res.status(400).json({ ok: false, error: 'Champs system et messages requis.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: 'API non configurée.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system,
        messages: messages.slice(-10),
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[/api/chat] Erreur Claude :', data);
      return res.status(upstream.status).json({ ok: false, error: data.error?.message || 'Erreur API.' });
    }

    const text = data.content?.find(b => b.type === 'text')?.text;
    res.json({ ok: true, text });
  } catch (err) {
    console.error('[/api/chat] Erreur réseau :', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

/* ── Échappement HTML (anti-XSS dans les emails) ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.listen(PORT, () => console.log(`TrimSync backend — port ${PORT}`));
