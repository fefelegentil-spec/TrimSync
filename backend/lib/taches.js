/* ── Tâches périodiques : fin d'essai et rappels ──
   Toutes les heures. Chaque rappel n'est envoyé qu'une fois (colonnes
   rappel_j7_le / rappel_j1_le posées dans le même UPDATE). */
const { pool } = require('./db');
const { nowParis, decaleJours } = require('./dates');
const emails = require('./emails');

const RAPPELS = [[7, 'rappel_j7_le'], [1, 'rappel_j1_le']];

async function tachesDuJour() {
  const auj = nowParis().date;
  await pool.query(`UPDATE salons SET statut = 'expire' WHERE statut = 'essai' AND essai_fin < $1`, [auj]);
  for (const [jours, colonne] of RAPPELS) {
    const r = await pool.query(
      `UPDATE salons s SET ${colonne} = NOW() FROM comptes c
        WHERE c.salon_id = s.id AND s.statut = 'essai' AND s.essai_fin = $1 AND s.${colonne} IS NULL
        RETURNING s.*, c.email`, [decaleJours(auj, jours)]);
    for (const salon of r.rows) emails.rappelEssai(salon.email, salon, jours);
  }
}

function demarrerTaches() {
  const tour = () => tachesDuJour().catch(e => console.error('[taches]', e.message));
  tour();
  setInterval(tour, 60 * 60 * 1000).unref();
}

module.exports = { demarrerTaches, tachesDuJour };
