/* ── Jetons à usage unique (vérification d'email, nouveau mot de passe) ──
   Seule l'empreinte est stockée : une fuite de la table ne donne aucun lien
   utilisable. */
const crypto = require('crypto');

const empreinte = brut => crypto.createHash('sha256').update(String(brut || '')).digest('hex');

async function creerJeton(q, compteId, type, dureeMs) {
  const brut = crypto.randomBytes(24).toString('hex');
  await q.query(
    `INSERT INTO jetons (hash, compte_id, type, expire_le) VALUES ($1, $2, $3, NOW() + ($4 || ' milliseconds')::interval)`,
    [empreinte(brut), compteId, type, String(dureeMs)]);
  return brut;
}

// Renvoie le compte si le jeton est bon, pas encore servi et pas expiré ; le marque servi.
async function consommerJeton(q, brut, type) {
  const r = await q.query(
    `UPDATE jetons SET utilise_le = NOW()
      WHERE hash = $1 AND type = $2 AND utilise_le IS NULL AND expire_le > NOW()
      RETURNING compte_id`, [empreinte(brut), type]);
  return r.rowCount ? r.rows[0].compte_id : null;
}

module.exports = { creerJeton, consommerJeton };
