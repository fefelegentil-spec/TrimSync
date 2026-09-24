/* ── Ce qu'un salon est, vu de l'extérieur ── */
const { nowParis } = require('./dates');

const SITE = () => process.env.SITE_URL || 'https://trimsync.tech';
const PRIX_PLANS = { starter: 59, pro: 79, max: 99 };

// Un essai dépassé est expiré dès le lendemain, sans attendre la tâche du jour.
function statutEffectif(salon, aujourdhui = nowParis().date) {
  if (salon.statut === 'essai' && salon.essai_fin < aujourdhui) return 'expire';
  return salon.statut;
}

function reservable(salon) {
  const s = statutEffectif(salon);
  return s === 'essai' || s === 'actif';
}

function joursRestants(salon, aujourdhui = nowParis().date) {
  const ms = new Date(salon.essai_fin + 'T12:00:00Z') - new Date(aujourdhui + 'T12:00:00Z');
  return Math.max(0, Math.round(ms / 86400000));
}

function vueSalon(salon) {
  const statut = statutEffectif(salon);
  return {
    id: salon.id,
    slug: salon.slug,
    nom: salon.nom,
    ville: salon.ville,
    telephone: salon.telephone,
    adresse: salon.adresse,
    statut,
    essai_fin: salon.essai_fin,
    jours_essai_restants: statut === 'essai' ? joursRestants(salon) : null,
    plan: salon.plan,
    bot_statut: salon.bot_statut,
    lien_public: `${SITE()}/r/${salon.slug}`,
  };
}

module.exports = { statutEffectif, reservable, vueSalon, PRIX_PLANS };
