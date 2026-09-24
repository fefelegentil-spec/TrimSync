const { pool } = require('./db');
const { notifierSalon } = require('./push');
const { nowParis, jourLisible } = require('./dates');

// Une place se libère un jour où des gens attendent : le barbier les prévient
// lui-même (pas de SMS dans ce périmètre).
async function signalerPlaceLibre(salonId, date) {
  if (date < nowParis().date) return;
  try {
    const n = (await pool.query(
      'SELECT COUNT(*) AS n FROM attente WHERE salon_id = $1 AND date = $2 AND prevenu_le IS NULL', [salonId, date])).rows[0].n;
    if (!n) return;
    notifierSalon(salonId, {
      type: 'place-libre',
      titre: 'Une place se libère',
      corps: `${jourLisible(date)} : ${n} personne${n > 1 ? 's' : ''} en liste d'attente`,
    });
  } catch (e) { console.error('[place-libre]', e.message); }
}

module.exports = { signalerPlaceLibre };
