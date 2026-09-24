/* ── Numéros de téléphone ──
   Copie de normalizePhone() de FCUTZ : même règle partout, sinon deux fiches
   ne se rapprochent plus. Ce qui n'est ni un numéro français ni un numéro
   étranger complet n'est jamais réécrit. */
function normalizePhone(p) {
  if (!p) return '';
  const brut = String(p).trim();
  const international = /^(\+|00\d)/.test(brut);
  let d = brut.replace(/\D+/g, '');
  if (!d) return '';
  if (d.startsWith('0033')) d = d.slice(4);
  else if (d.startsWith('33') && d.length > 10) d = d.slice(2);
  if (d.length > 10 && /^0+0[1-9]\d{8}$/.test(d)) d = d.slice(d.length - 10);
  if (d.length === 9 && d[0] !== '0') d = '0' + d;
  if (/^0[1-9]\d{8}$/.test(d)) return d;
  if (international && d.length > 6) return '+' + d.replace(/^00/, '');
  return d;
}

function telValide(p) { return /^0[1-9]\d{8}$/.test(p || ''); }

// Forme normalisée si elle est composable, texte saisi sinon.
function telAStocker(p) {
  const n = normalizePhone(p || '');
  return (telValide(n) || (n[0] === '+' && n.length >= 8)) ? n : String(p || '').trim();
}

function telComposable(p) {
  const n = normalizePhone(p || '');
  return telValide(n) || (n[0] === '+' && n.length >= 8);
}

module.exports = { normalizePhone, telValide, telAStocker, telComposable };
