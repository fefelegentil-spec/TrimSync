// Tout ce que le moteur de créneaux doit savoir d'un salon sur une période.
async function contexteDispo(q, salonId, du, au) {
  const [horaires, fermetures, rdv] = await Promise.all([
    q.query('SELECT jour, ouverture, fermeture, pause_debut, pause_fin FROM horaires WHERE salon_id = $1', [salonId]),
    q.query('SELECT date, debut, fin FROM fermetures WHERE salon_id = $1 AND date BETWEEN $2 AND $3', [salonId, du, au]),
    q.query(`SELECT id, date, heure, duree_min, statut FROM rdv
              WHERE salon_id = $1 AND date BETWEEN $2 AND $3 AND statut = 'confirme'`, [salonId, du, au]),
  ]);
  return { horaires: horaires.rows, fermetures: fermetures.rows, rdv: rdv.rows };
}

module.exports = { contexteDispo };
