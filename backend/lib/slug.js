const { slugifier } = require('./texte');

// Premier slug libre : « barber-lyon », puis « barber-lyon-2 »…
async function slugLibre(q, base, ignorerSalonId = '') {
  const racine = slugifier(base);
  for (let i = 1; i < 1000; i++) {
    const essai = i === 1 ? racine : `${racine}-${i}`;
    const r = await q.query('SELECT 1 FROM salons WHERE slug = $1 AND id <> $2', [essai, ignorerSalonId]);
    if (!r.rowCount) return essai;
  }
  throw new Error('Aucun slug libre pour ' + racine);
}

module.exports = { slugLibre };
