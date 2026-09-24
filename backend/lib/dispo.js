/* ── Moteur de créneaux ──
   Fonction pure : ni base ni horloge. Toute règle de disponibilité vit ici,
   la page publique et le futur bot l'appellent au lieu d'en avoir une à eux. */
const PAS_MIN = 15;

const enMinutes = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const enHeure = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const jourSemaine = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();

// Seuls les RDV confirmés occupent l'agenda : annulé et no-show libèrent.
const occupants = (rdv, date) => rdv.filter(r => r.date === date && r.statut === 'confirme');

function creneaux({ horaires, fermetures, rdv, duree, date, maintenant }) {
  const h = horaires.find(x => x.jour === jourSemaine(date));
  if (!h) return [];
  const duJour = fermetures.filter(f => f.date === date);
  if (duJour.some(f => !f.debut)) return [];
  const bloque = [
    ...(h.pause_debut && h.pause_fin ? [[enMinutes(h.pause_debut), enMinutes(h.pause_fin)]] : []),
    ...duJour.map(f => [enMinutes(f.debut), enMinutes(f.fin)]),
    ...occupants(rdv, date).map(r => [enMinutes(r.heure), enMinutes(r.heure) + r.duree_min]),
  ];
  const libres = [];
  for (let t = enMinutes(h.ouverture); t + duree <= enMinutes(h.fermeture); t += PAS_MIN) {
    const heure = enHeure(t);
    if (maintenant && (date < maintenant.date || (date === maintenant.date && heure <= maintenant.time))) continue;
    if (bloque.some(([debut, fin]) => t < fin && t + duree > debut)) continue;
    libres.push(heure);
  }
  return libres;
}

function chevauche(rdv, date, heure, duree, ignorerId) {
  const t = enMinutes(heure);
  return occupants(rdv, date).some(r =>
    r.id !== ignorerId && t < enMinutes(r.heure) + r.duree_min && t + duree > enMinutes(r.heure));
}

module.exports = { creneaux, chevauche, PAS_MIN };
