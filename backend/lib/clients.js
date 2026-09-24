/* ── Rapprochement des fiches clients ──
   Un numéro ne désigne pas une personne : le client, son frère et son père le
   partagent (leçon de FCUTZ). On ne réutilise une fiche que si le NOM et le
   NUMÉRO correspondent. */
const { uid } = require('./db');
const { telAStocker } = require('./telephone');
const { normaliserNom } = require('./texte');

async function trouverOuCreerClient(q, salonId, { nom, telephone, email = '' }) {
  const tel = telAStocker(telephone);
  if (tel) {
    const r = await q.query('SELECT id, nom FROM clients WHERE salon_id = $1 AND telephone = $2 ORDER BY created_at', [salonId, tel]);
    const meme = r.rows.find(c => normaliserNom(c.nom) === normaliserNom(nom));
    if (meme) return meme.id;
  }
  const id = uid('c');
  await q.query('INSERT INTO clients (id, salon_id, nom, telephone, email) VALUES ($1, $2, $3, $4, $5)', [id, salonId, nom, tel, email]);
  return id;
}

module.exports = { trouverOuCreerClient };
