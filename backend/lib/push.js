/* ── Notifications push vers le téléphone du barbier ── */
const webpush = require('web-push');
const { pool } = require('./db');
const { deposer } = require('./boite');

let pret = false;
function configurer() {
  if (pret) return true;
  const { VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails('mailto:' + (process.env.ADMIN_EMAIL || 'felix@trimsync.tech'), VAPID_PUBLIC, VAPID_PRIVATE);
  pret = true;
  return true;
}

// Jamais bloquant : une notification ratée ne doit pas faire échouer une réservation.
async function notifierSalon(salonId, { type, titre, corps, url = '/app' }) {
  deposer({ canal: 'push', salonId, type, titre, corps });
  if (!configurer()) return;
  try {
    const abonnes = (await pool.query('SELECT endpoint, cles FROM push_abonnements WHERE salon_id = $1', [salonId])).rows;
    await Promise.all(abonnes.map(async a => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: a.cles }, JSON.stringify({ title: titre, body: corps, url }));
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await pool.query('DELETE FROM push_abonnements WHERE endpoint = $1', [a.endpoint]);
        } else {
          console.error('[push]', e.statusCode || '', e.message);
        }
      }
    }));
  } catch (e) { console.error('[push]', e.message); }
}

module.exports = { notifierSalon };
