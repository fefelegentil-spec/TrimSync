/* ── Réponses d'erreur et quotas anti-abus ── */
function erreurServeur(res, e, contexte = '') {
  console.error('❌', contexte || 'erreur serveur', ':', e && e.stack ? e.stack : e);
  const detail = process.env.NODE_ENV === 'production' ? undefined : (e && e.message);
  return res.status(500).json({ error: 'Erreur serveur', ...(detail ? { detail } : {}) });
}

function ipDe(req) {
  return req.ip || req.socket?.remoteAddress || 'inconnue';
}

// Un seau par usage : dans FCUTZ, lectures et annulations partageaient le même,
// et quelques ouvertures du site suffisaient à bloquer l'annulation.
// QUOTA_FACTEUR élargit tous les seaux (tests).
function quota(max, fenetreMs) {
  const plafond = max * (Number(process.env.QUOTA_FACTEUR) || 1);
  const seaux = new Map();
  return (req, res, next) => {
    const maintenant = Date.now();
    if (seaux.size > 5000) {
      for (const [cle, s] of seaux) if (maintenant - s.debut > fenetreMs) seaux.delete(cle);
    }
    const ip = ipDe(req);
    let s = seaux.get(ip);
    if (!s || maintenant - s.debut > fenetreMs) { s = { n: 0, debut: maintenant }; seaux.set(ip, s); }
    if (++s.n > plafond) return res.status(429).json({ error: 'Trop de demandes, réessaie dans quelques minutes.' });
    next();
  };
}

module.exports = { erreurServeur, ipDe, quota };
