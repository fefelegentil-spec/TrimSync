/* ── Dates en heure de Paris ──
   Le serveur tourne en UTC : « +2 h » n'est vrai que la moitié de l'année. */
function nowParis(d = new Date()) {
  const f = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const p = {};
  for (const { type, value } of f) p[type] = value;
  const heure = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${heure}:${p.minute}` };
}

// Une heure qui commence maintenant compte comme passée.
function creneauPasse(date, heure, maintenant = nowParis()) {
  return date < maintenant.date || (date === maintenant.date && String(heure) <= maintenant.time);
}

// Arithmétique à midi UTC : insensible aux changements d'heure.
function decaleJours(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function estDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function estHeure(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
}

function jourLisible(ymd) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

module.exports = { nowParis, creneauPasse, decaleJours, estDate, estHeure, jourLisible };
