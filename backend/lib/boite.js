/* ── Boîte d'envoi de test ──
   Avec TRIMSYNC_TEST=1, chaque email et chaque notification est aussi gardé
   ici, pour que les scénarios lisent un lien de vérification sans vraie
   messagerie. Hors test, rien n'est gardé. */
const boite = [];

function deposer(message) {
  if (process.env.TRIMSYNC_TEST !== '1') return;
  boite.push({ ...message, le: new Date().toISOString() });
  if (boite.length > 500) boite.shift();
}

module.exports = { boite, deposer };
