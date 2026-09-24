const test = require('node:test');
const assert = require('node:assert/strict');
const { creneaux, chevauche } = require('./dispo');

// 2026-10-06 est un mardi (jour 2).
const MARDI = '2026-10-06';
const H = [{ jour: 2, ouverture: '09:00', fermeture: '10:00', pause_debut: null, pause_fin: null }];
const base = { horaires: H, fermetures: [], rdv: [], duree: 30, date: MARDI, maintenant: null };

test('jour sans horaires : aucun créneau', () => {
  assert.deepEqual(creneaux({ ...base, date: '2026-10-05' }), []);
});

test('pas de 15 min, la prestation doit tenir avant la fermeture', () => {
  assert.deepEqual(creneaux(base), ['09:00', '09:15', '09:30']);
});

test('une prestation plus longue finit plus tôt', () => {
  assert.deepEqual(creneaux({ ...base, duree: 45 }), ['09:00', '09:15']);
});

test('la pause est exclue, bord à bord autorisé', () => {
  const h = [{ jour: 2, ouverture: '09:00', fermeture: '11:00', pause_debut: '09:30', pause_fin: '10:00' }];
  assert.deepEqual(creneaux({ ...base, horaires: h }), ['09:00', '10:00', '10:15', '10:30']);
});

test('fermeture à la journée', () => {
  assert.deepEqual(creneaux({ ...base, fermetures: [{ date: MARDI, debut: null, fin: null }] }), []);
});

test('fermeture en plage', () => {
  const f = [{ date: MARDI, debut: '09:15', fin: '09:30' }];
  assert.deepEqual(creneaux({ ...base, fermetures: f }), ['09:30']);
});

test("une fermeture d'un autre jour ne compte pas", () => {
  assert.deepEqual(creneaux({ ...base, fermetures: [{ date: '2026-10-07', debut: null, fin: null }] }).length, 3);
});

test('un rdv confirmé bloque, annulé et no-show libèrent', () => {
  const rdv = s => [{ id: 'r1', date: MARDI, heure: '09:00', duree_min: 30, statut: s }];
  assert.deepEqual(creneaux({ ...base, rdv: rdv('confirme') }), ['09:30']);
  assert.deepEqual(creneaux({ ...base, rdv: rdv('annule') }).length, 3);
  assert.deepEqual(creneaux({ ...base, rdv: rdv('noshow') }).length, 3);
});

test('une heure déjà arrivée ne se propose plus', () => {
  assert.deepEqual(creneaux({ ...base, maintenant: { date: MARDI, time: '09:15' } }), ['09:30']);
  assert.deepEqual(creneaux({ ...base, maintenant: { date: '2026-10-07', time: '08:00' } }), []);
});

test('chevauche : ignore le rdv lui-même et les annulés', () => {
  const rdv = [
    { id: 'r1', date: MARDI, heure: '09:00', duree_min: 30, statut: 'confirme' },
    { id: 'r2', date: MARDI, heure: '10:00', duree_min: 30, statut: 'annule' },
  ];
  assert.equal(chevauche(rdv, MARDI, '09:15', 30), true);
  assert.equal(chevauche(rdv, MARDI, '09:30', 30), false);
  assert.equal(chevauche(rdv, MARDI, '09:15', 30, 'r1'), false);
  assert.equal(chevauche(rdv, MARDI, '10:00', 30), false);
});
