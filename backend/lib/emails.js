/* ── Emails (Resend) ──
   Un envoi raté ne fait jamais échouer la requête qui l'a déclenché : il est
   noté dans les logs. Sans RESEND_API_KEY, rien ne part. */
const { Resend } = require('resend');
const { deposer } = require('./boite');
const { escHtml } = require('./texte');

let resend = null;
function client() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const SITE = () => process.env.SITE_URL || 'https://trimsync.tech';
const ADMIN = () => process.env.ADMIN_EMAIL || 'felix@trimsync.tech';

function gabarit(titre, paragraphes, bouton) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#222">
    <h2 style="color:#2a9ea3;margin:0 0 16px">${escHtml(titre)}</h2>
    ${paragraphes.map(p => `<p style="line-height:1.6;margin:0 0 12px">${p}</p>`).join('')}
    ${bouton ? `<p style="margin:24px 0"><a href="${escHtml(bouton.url)}" style="background:#2a9ea3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escHtml(bouton.texte)}</a></p>` : ''}
    <p style="color:#999;font-size:12px;margin-top:32px">TrimSync — ta chaise se remplit toute seule.</p>
  </div>`;
}

async function envoyer({ a, sujet, html, type, extra = {} }) {
  deposer({ canal: 'email', a, sujet, type, ...extra });
  const r = client();
  if (!r) { console.log(`[email non envoyé : pas de RESEND_API_KEY] ${type} → ${a}`); return; }
  try {
    await r.emails.send({ from: 'TrimSync <noreply@trimsync.tech>', to: a, subject: sujet, html });
  } catch (e) {
    console.error(`[email] ${type} → ${a} :`, e.message);
  }
}

function verification(a, jeton) {
  const url = `${SITE()}/app?verifier=${jeton}`;
  return envoyer({ a, type: 'verification', extra: { jeton }, sujet: 'Confirme ton adresse email',
    html: gabarit('Bienvenue sur TrimSync', ['Confirme ton adresse pour que je puisse te joindre au moment de brancher ton bot Instagram.'], { url, texte: 'Confirmer mon email' }) });
}

function reset(a, jeton) {
  const url = `${SITE()}/app?reset=${jeton}`;
  return envoyer({ a, type: 'reset', extra: { jeton }, sujet: 'Nouveau mot de passe',
    html: gabarit('Choisis un nouveau mot de passe', ['Ce lien est valable une heure. Si tu n’as rien demandé, ignore cet email.'], { url, texte: 'Choisir un mot de passe' }) });
}

function rappelEssai(a, salon, jours) {
  const quand = jours === 1 ? 'demain' : `dans ${jours} jours`;
  return envoyer({ a, type: 'rappel-essai', extra: { jours }, sujet: `Ton essai TrimSync se termine ${quand}`,
    html: gabarit(`Ton essai se termine ${quand}`, [
      `Après le ${escHtml(salon.essai_fin)}, ta page de réservation n’acceptera plus de rendez-vous et ton dashboard passera en lecture seule. Rien n’est supprimé.`,
      'Réponds à cet email pour choisir ton plan.',
    ], { url: `${SITE()}/app`, texte: 'Ouvrir mon dashboard' }) });
}

function alerteAdmin(sujet, champs) {
  const lignes = Object.entries(champs).map(([k, v]) => `<strong>${escHtml(k)} :</strong> ${escHtml(v || '—')}`);
  return envoyer({ a: ADMIN(), type: 'alerte-admin', sujet: `[TrimSync] ${sujet}`, html: gabarit(sujet, lignes) });
}

module.exports = { client, verification, reset, rappelEssai, alerteAdmin };
