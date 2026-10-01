/* ── Emails (Resend) ──
   Un envoi raté ne fait jamais échouer la requête qui l'a déclenché : il est
   noté dans les logs. Sans RESEND_API_KEY, rien ne part.

   Mise en page « email » : tableaux et styles en ligne uniquement (Gmail,
   Outlook et Apple Mail ignorent les feuilles de style), largeur 600 px,
   images en PNG hébergées sur le site (img/email/). */
const { Resend } = require('resend');
const { deposer } = require('./boite');
const { escHtml } = require('./texte');
const { jourLisible } = require('./dates');

let resend = null;
function client() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const SITE = () => process.env.SITE_URL || 'https://trimsync.tech';
const ADMIN = () => process.env.ADMIN_EMAIL || 'felix@trimsync.tech';
const SUPPORT = 'felix@trimsync.tech';

const C = { fond: '#eef3f4', carte: '#ffffff', texte: '#1d2b2e', doux: '#5f7377', teal: '#2a9ea3', tealClair: '#e7f5f6', nuit: '#040608' };
const POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/* ── Briques ── */
const para = t => `<p style="margin:0 0 14px;font:16px/1.6 ${POLICE};color:${C.texte}">${t}</p>`;

function bouton({ url, texte }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px"><tr>
    <td style="border-radius:10px;background:${C.teal}">
      <a href="${escHtml(url)}" style="display:inline-block;padding:14px 26px;font:700 16px ${POLICE};color:#ffffff;text-decoration:none;border-radius:10px">${escHtml(texte)} →</a>
    </td></tr></table>
    <p style="margin:0 0 6px;font:12px/1.5 ${POLICE};color:${C.doux}">Le bouton ne marche pas ? Copie ce lien : <a href="${escHtml(url)}" style="color:${C.teal};word-break:break-all">${escHtml(url)}</a></p>`;
}

// Encadré de détails : [libellé, valeur (texte brut)]
function details(lignes) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:${C.tealClair};border-radius:12px">
    ${lignes.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<tr>
      <td style="padding:10px 18px;font:13px ${POLICE};color:${C.doux};width:38%;vertical-align:top">${escHtml(k)}</td>
      <td style="padding:10px 18px;font:600 15px ${POLICE};color:${C.texte};vertical-align:top">${escHtml(String(v))}</td></tr>`).join('')}
  </table>`;
}

// Étapes numérotées : [titre, texte (HTML déjà sûr)]
function etapes(liste) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px">
    ${liste.map(([titre, texte], i) => `<tr>
      <td style="width:44px;padding:10px 0;vertical-align:top">
        <div style="width:32px;height:32px;border-radius:16px;background:${C.teal};color:#fff;font:700 15px/32px ${POLICE};text-align:center">${i + 1}</div></td>
      <td style="padding:10px 0;vertical-align:top">
        <div style="font:700 15px ${POLICE};color:${C.texte};margin:4px 0 3px">${escHtml(titre)}</div>
        <div style="font:14px/1.55 ${POLICE};color:${C.doux}">${texte}</div></td></tr>`).join('')}
  </table>`;
}

// contact : ligne « Une question ? » du pied. Par défaut le support TrimSync ;
// pour les clients d'un salon, le salon lui-même (ils n'ont pas à écrire à TrimSync).
function gabarit({ apercu, surtitre, titre, corps, pourquoi, contact }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escHtml(titre)}</title></head>
<body style="margin:0;padding:0;background:${C.fond}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(apercu || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fond}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td style="border-radius:16px 16px 0 0;overflow:hidden;background:${C.nuit}">
      <a href="${SITE()}" style="display:block"><img src="${SITE()}/img/email/bandeau.png" width="600" alt="TrimSync — Ton agenda se remplit tout seul." style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px 16px 0 0"></a>
    </td></tr>
    <tr><td style="background:${C.carte};padding:34px 36px 30px">
      ${surtitre ? `<div style="font:700 12px ${POLICE};letter-spacing:.14em;text-transform:uppercase;color:${C.teal};margin:0 0 10px">${escHtml(surtitre)}</div>` : ''}
      <h1 style="margin:0 0 18px;font:800 26px/1.25 ${POLICE};color:${C.texte}">${escHtml(titre)}</h1>
      ${corps}
    </td></tr>
    <tr><td style="background:${C.nuit};border-radius:0 0 16px 16px;padding:24px 36px;text-align:center">
      <div style="font:700 15px ${POLICE};color:#f0f6f7">Trim<span style="color:#3bbfcc">Sync</span></div>
      <div style="font:13px/1.6 ${POLICE};color:#8aa3a8;margin-top:6px">Ton agenda se remplit tout seul.</div>
      <div style="font:13px/1.6 ${POLICE};margin-top:12px">
        <a href="${SITE()}" style="color:#3bbfcc;text-decoration:none">trimsync.tech</a>
        <span style="color:#3d5357">&nbsp;·&nbsp;</span>
        ${contact || `<a href="mailto:${SUPPORT}" style="color:#3bbfcc;text-decoration:none">Une question ? ${SUPPORT}</a>`}</div>
      ${pourquoi ? `<div style="font:11px/1.5 ${POLICE};color:#5d7377;margin-top:14px">${escHtml(pourquoi)}</div>` : ''}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

async function envoyer({ a, sujet, html, type, extra = {}, repondreA = SUPPORT }) {
  deposer({ canal: 'email', a, sujet, type, ...extra });
  const r = client();
  if (!r) { console.log(`[email non envoyé : pas de RESEND_API_KEY] ${type} → ${a}`); return; }
  try {
    await r.emails.send({ from: 'TrimSync <noreply@trimsync.tech>', to: a, subject: sujet, html, ...(repondreA ? { reply_to: repondreA } : {}) });
  } catch (e) {
    console.error(`[email] ${type} → ${a} :`, e.message);
  }
}

/* ── Emails du pro ── */

// Bienvenue + confirmation d'adresse, avec la marche à suivre pour démarrer.
function verification(a, jeton, salon = {}) {
  const url = `${SITE()}/app?verifier=${jeton}`;
  const lien = salon.slug ? `${SITE()}/r/${salon.slug}` : '';
  return envoyer({ a, type: 'verification', extra: { jeton }, sujet: 'Bienvenue sur TrimSync — confirme ton adresse',
    html: gabarit({
      apercu: 'Ton salon est en ligne. Confirme ton adresse et termine ta mise en route.',
      surtitre: 'Bienvenue',
      titre: salon.nom ? `${salon.nom} est en ligne` : 'Bienvenue sur TrimSync',
      corps: para('Ton essai gratuit de <strong>7 jours</strong> commence maintenant, sans carte bancaire. Confirme ton adresse email pour sécuriser ton compte :')
        + bouton({ url, texte: 'Confirmer mon email' })
        + `<div style="height:22px"></div>`
        + para('<strong>Ensuite, trois étapes et tes clients réservent tout seuls :</strong>')
        + etapes([
          ['Vérifie tes prestations et tes prix', 'Ton catalogue de départ est déjà prêt : ajuste-le à ta carte.'],
          ['Règle tes horaires', 'Jours d\'ouverture et heures : seuls tes créneaux libres sont proposés.'],
          ['Mets ton lien dans ta bio Instagram', lien
            ? `Ta page de réservation : <a href="${escHtml(lien)}" style="color:${C.teal};font-weight:600">${escHtml(lien.replace(/^https:\/\//, ''))}</a>`
            : 'Tu le trouves dans ton dashboard, bouton « Copier le lien ».'],
        ]),
      pourquoi: 'Tu reçois cet email parce que tu viens de créer un compte TrimSync.',
    }) });
}

function reset(a, jeton) {
  const url = `${SITE()}/app?reset=${jeton}`;
  return envoyer({ a, type: 'reset', extra: { jeton }, sujet: 'Ton nouveau mot de passe TrimSync',
    html: gabarit({
      apercu: 'Choisis un nouveau mot de passe (lien valable une heure).',
      surtitre: 'Mot de passe',
      titre: 'Choisis un nouveau mot de passe',
      corps: para('Tu as demandé à changer ton mot de passe. Le lien ci-dessous est valable <strong>une heure</strong>.')
        + bouton({ url, texte: 'Choisir un mot de passe' })
        + `<div style="height:14px"></div>`
        + para(`<span style="color:${C.doux};font-size:14px">Tu n'as rien demandé ? Ignore cet email : ton mot de passe actuel reste valable.</span>`),
      pourquoi: 'Tu reçois cet email suite à une demande de nouveau mot de passe sur trimsync.tech.',
    }) });
}

function rappelEssai(a, salon, jours) {
  const quand = jours === 1 ? 'demain' : `dans ${jours} jours`;
  return envoyer({ a, type: 'rappel-essai', extra: { jours }, sujet: `Ton essai TrimSync se termine ${quand}`,
    html: gabarit({
      apercu: `Choisis ton offre pour que ta page de réservation reste ouverte.`,
      surtitre: 'Ton essai',
      titre: `Ton essai se termine ${quand}`,
      corps: para(`Après le <strong>${escHtml(jourLisible(salon.essai_fin))}</strong>, ta page de réservation n'acceptera plus de rendez-vous et ton agenda passera en lecture seule. <strong>Rien n'est effacé</strong> : il suffit de choisir une offre pour tout rouvrir.`)
        + details([['Essentiel · 19 €/mois', 'Page de réservation, agenda, clients, rappels, acompte'], ['Pro · 49 €/mois', "Tout l'Essentiel + le bot Instagram qui réserve dans tes DM"], ['Max · 89 €/mois', 'Tout le Pro + bot à ton style, stories auto, support direct']])
        + para('Sans engagement, mise en place offerte. Tu choisis depuis ton dashboard, en deux clics :')
        + bouton({ url: `${SITE()}/app`, texte: 'Choisir mon offre' }),
      pourquoi: `Tu reçois cet email parce que l'essai gratuit de ${salon.nom || 'ton salon'} arrive à son terme.`,
    }) });
}

function abonnementActive(a, salon, plan) {
  const nomPlan = { essentiel: 'Essentiel', pro: 'Pro', max: 'Max', starter: 'Starter' }[plan] || plan;
  return envoyer({ a, type: 'abonnement-active', sujet: `Merci ! ${salon.nom} est actif sur TrimSync`,
    html: gabarit({
      apercu: 'Ton abonnement est actif. Ta page de réservation reste ouverte.',
      surtitre: 'Abonnement',
      titre: 'Merci, ton salon est actif',
      corps: para(`Ton paiement est bien reçu : <strong>${escHtml(salon.nom)}</strong> passe en offre <strong>${escHtml(nomPlan)}</strong>. Ta page de réservation reste ouverte sans interruption.`)
        + details([['Offre', nomPlan], ['Salon', salon.nom], ['Page de réservation', salon.slug ? `trimsync.tech/r/${salon.slug}` : '']])
        + para('Tes factures et ton moyen de paiement se gèrent depuis les emails de Stripe. Pour résilier, réponds simplement à cet email.')
        + bouton({ url: `${SITE()}/app`, texte: 'Ouvrir mon dashboard' }),
      pourquoi: 'Tu reçois cet email suite à ton paiement sur TrimSync.',
    }) });
}

/* ── Emails du client final ──
   Le pied renvoie vers le salon, jamais vers TrimSync ; pas d'adresse de réponse. */
function contactSalon(salon) {
  return salon.telephone
    ? `<a href="tel:${escHtml(String(salon.telephone).replace(/\s/g, ''))}" style="color:#3bbfcc;text-decoration:none">Une question ? Appelle ${escHtml(salon.nom)} au ${escHtml(salon.telephone)}</a>`
    : `<span style="color:#8aa3a8">Une question ? Contacte directement ${escHtml(salon.nom)}.</span>`;
}
function detailsRdv(salon, rdv) {
  return details([
    ['Quand', `${jourLisible(rdv.date)} à ${rdv.heure}`],
    ['Prestation', rdv.prestation],
    ['Durée', rdv.duree ? `${rdv.duree} min` : ''],
    ['Prix', rdv.prix !== undefined && rdv.prix !== null ? `${Math.round(rdv.prix)} €` : ''],
    ['Acompte', rdv.acompte ? `${Math.round(rdv.acompte)} € — à régler avec le bouton ci-dessous` : ''],
    ['Adresse', salon.adresse],
    ['Téléphone', salon.telephone],
  ]);
}

// Salon qui valide ses RDV : la demande est enregistrée, le salon confirme ensuite.
function demandeRecue(a, { salon, rdv, jeton }) {
  const lien = `${SITE()}/r/${salon.slug}?annuler=${jeton}`;
  return envoyer({ a, type: 'demande-client', repondreA: null, sujet: `Demande envoyée : ${salon.nom}, ${jourLisible(rdv.date)} à ${rdv.heure}`,
    html: gabarit({
      apercu: `${salon.nom} te confirme ton rendez-vous très vite.`,
      surtitre: 'Demande envoyée',
      titre: 'Ta demande est bien reçue',
      corps: para(`<strong>${escHtml(salon.nom)}</strong> valide chaque rendez-vous : tu reçois un email dès que c'est confirmé. Le créneau est réservé pour toi en attendant.`)
        + detailsRdv(salon, rdv)
        + bouton({ url: lien, texte: 'Voir ou annuler ma demande' }),
      pourquoi: `Tu reçois cet email parce que tu as demandé un rendez-vous chez ${salon.nom} via TrimSync.`,
      contact: contactSalon(salon),
    }) });
}

function refusClient(a, { salon, rdv }) {
  return envoyer({ a, type: 'refus-client', repondreA: null, sujet: `${salon.nom} ne peut pas te recevoir ${jourLisible(rdv.date)} à ${rdv.heure}`,
    html: gabarit({
      apercu: 'Choisis un autre créneau en un clic.',
      surtitre: 'Rendez-vous',
      titre: 'Ce créneau n\'est pas possible',
      corps: para(`<strong>${escHtml(salon.nom)}</strong> ne peut pas te recevoir ${escHtml(jourLisible(rdv.date))} à ${escHtml(rdv.heure)} pour ${escHtml(rdv.prestation)}. Choisis un autre moment, ça ne prend qu'une minute :`)
        + bouton({ url: `${SITE()}/r/${salon.slug}`, texte: 'Choisir un autre créneau' }),
      pourquoi: `Tu reçois cet email parce que tu as demandé un rendez-vous chez ${salon.nom} via TrimSync.`,
      contact: contactSalon(salon),
    }) });
}

function rappelVeille(a, { salon, rdv, jeton }) {
  const lien = `${SITE()}/r/${salon.slug}?annuler=${jeton}`;
  return envoyer({ a, type: 'rappel-client', repondreA: null, sujet: `Rappel : ${salon.nom} demain à ${rdv.heure}`,
    html: gabarit({
      apercu: `${rdv.prestation} · demain à ${rdv.heure}`,
      surtitre: 'Rappel',
      titre: `À demain, ${rdv.heure} !`,
      corps: para(`Petit rappel de ton rendez-vous chez <strong>${escHtml(salon.nom)}</strong>.`)
        + detailsRdv(salon, rdv)
        + para('Un empêchement ? Préviens en annulant, ta place ira à quelqu\'un d\'autre :')
        + bouton({ url: lien, texte: 'Voir ou annuler mon rendez-vous' }),
      pourquoi: `Tu reçois cet email parce que tu as un rendez-vous chez ${salon.nom}.`,
      contact: contactSalon(salon),
    }) });
}

// Confirmation de rendez-vous, avec le lien pour l'annuler.
function confirmationClient(a, { salon, rdv, jeton, acompte }) {
  const lien = `${SITE()}/r/${salon.slug}?annuler=${jeton}`;
  const tel = contactSalon(salon);
  return envoyer({ a, type: 'confirmation-client', repondreA: null, sujet: `C'est réservé : ${salon.nom}, ${jourLisible(rdv.date)} à ${rdv.heure}`,
    html: gabarit({
      apercu: `${rdv.prestation} · ${jourLisible(rdv.date)} à ${rdv.heure}`,
      surtitre: 'Rendez-vous confirmé',
      titre: `À ${jourLisible(rdv.date)} !`,
      corps: para(`Ton rendez-vous chez <strong>${escHtml(salon.nom)}</strong> est bien réservé.`)
        + detailsRdv(salon, rdv)
        + (acompte && acompte.url
          ? para(`Pour garder ton créneau, règle l'acompte de <strong>${Math.round(acompte.montant)} €</strong> maintenant — c'est ce qui sécurise ta place :`)
            + bouton({ url: acompte.url, texte: `Payer l'acompte de ${Math.round(acompte.montant)} €` })
          : '')
        + para('Un empêchement ? Annule en un clic pour libérer ta place à quelqu\'un d\'autre :')
        + bouton({ url: lien, texte: 'Voir ou annuler mon rendez-vous' }),
      pourquoi: `Tu reçois cet email parce que tu as réservé chez ${salon.nom} via TrimSync.`,
      contact: tel,
    }) });
}

/* ── Alertes pour Félix ── */
// Acomptes d'annulations : à rembourser à la main dans le dashboard Stripe.
function acomptesARembourser(lignes) {
  return envoyer({ a: ADMIN(), type: 'acomptes', sujet: `[TrimSync] ${lignes.length} acompte${lignes.length > 1 ? 's' : ''} à rembourser`,
    html: gabarit({
      apercu: 'Des rendez-vous annulés ont un acompte payé : à rembourser dans le dashboard Stripe.',
      surtitre: 'Acomptes',
      titre: 'Acomptes à rembourser',
      corps: details(lignes.map(l => [l.salon, `${l.montant} € — session ${l.session}`]))
        + bouton({ url: 'https://dashboard.stripe.com/payments', texte: 'Ouvrir le dashboard Stripe' }),
      pourquoi: 'Le remboursement des acomptes des annulations en ligne se fait à la main dans le dashboard Stripe.',
    }) });
}
function alerteAdmin(sujet, champs) {
  return envoyer({ a: ADMIN(), type: 'alerte-admin', sujet: `[TrimSync] ${sujet}`,
    html: gabarit({ apercu: sujet, surtitre: 'Back-office', titre: sujet,
      corps: details(Object.entries(champs).map(([k, v]) => [k, v || '—'])) + bouton({ url: `${SITE()}/admin`, texte: 'Ouvrir le back-office' }) }) });
}

module.exports = { client, verification, reset, rappelEssai, abonnementActive, confirmationClient, demandeRecue, refusClient, rappelVeille, alerteAdmin, acomptesARembourser, gabarit };
