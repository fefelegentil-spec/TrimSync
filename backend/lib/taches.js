/* ── Tâches périodiques : fin d'essai et rappels ──
   Toutes les heures. Chaque rappel n'est envoyé qu'une fois (colonnes
   rappel_j7_le / rappel_j1_le posées dans le même UPDATE). */
const { pool } = require('./db');
const { nowParis, decaleJours } = require('./dates');
const emails = require('./emails');

// L'essai dure 7 jours : premier rappel 3 jours avant la fin (la colonne garde
// son nom d'origine, du temps où l'essai durait 30 jours et le rappel partait à J-7).
const RAPPELS = [[3, 'rappel_j7_le'], [1, 'rappel_j1_le']];

// Rappel au client la veille de son RDV, à partir de 10 h (heure de Paris) :
// une seule fois par RDV (rappel_le posé dans le même UPDATE), seulement si le
// salon l'a laissé actif et si le client a donné son email.
async function rappelsVeille(ignorerHeure = false) {
  const { date, time } = nowParis();
  if (time < '10:00' && !ignorerHeure) return;
  const r = await pool.query(
    `UPDATE rdv r SET rappel_le = NOW()
       FROM salons s, clients c
      WHERE s.id = r.salon_id AND c.id = r.client_id
        AND r.date = $1 AND r.statut = 'confirme' AND r.rappel_le IS NULL
        AND s.rappel_veille AND s.statut IN ('essai', 'actif') AND c.email <> ''
      RETURNING r.*, c.email, s.nom AS s_nom, s.slug AS s_slug, s.adresse AS s_adresse, s.telephone AS s_tel, s.options AS s_options`,
    [decaleJours(date, 1)]);
  for (const x of r.rows) {
    const masques = !!(x.s_options && x.s_options.prix_masques);
    emails.rappelVeille(x.email, {
      salon: { nom: x.s_nom, slug: x.s_slug, adresse: x.s_adresse, telephone: x.s_tel },
      rdv: { date: x.date, heure: x.heure, prestation: x.prestation_nom, prix: masques ? undefined : x.prix, duree: x.duree_min },
      jeton: x.jeton_annulation,
    });
  }
}

async function tachesDuJour() {
  await rappelsVeille();
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

module.exports = { demarrerTaches, tachesDuJour, rappelsVeille };
