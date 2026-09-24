/* ── Texte saisi par les utilisateurs ── */
function sanitizeText(s, max = 200) {
  return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, max);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const sansAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Pour comparer deux noms : « Élie  MARTIN » = « elie martin ».
function normaliserNom(s) {
  return sansAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function slugifier(s) {
  return sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'salon';
}

module.exports = { sanitizeText, escHtml, normaliserNom, slugifier };
