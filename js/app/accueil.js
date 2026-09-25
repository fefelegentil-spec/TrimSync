/* ── Accueil ──
   Ce qu'un barbier regarde en arrivant : la mise en route tant qu'elle n'est
   pas finie, le prochain client, la journée, la liste d'attente. */

const ETAPES_CLE = () => 'ts_etapes_' + (SESSION ? SESSION.salon.id : '');
function etapesFaites() { try { return JSON.parse(localStorage.getItem(ETAPES_CLE()) || '{}'); } catch (_) { return {}; } }
function marquerEtape(nom) {
  try { localStorage.setItem(ETAPES_CLE(), JSON.stringify({ ...etapesFaites(), [nom]: true })); } catch (_) {}
}

async function renderAccueil() {
  const page = document.getElementById('page-dashboard');
  const auj = TODAY();
  const dans6 = ymd(new Date(Date.now() + 6 * 86400000));
  let rdv, attente;
  try {
    [rdv, attente] = await Promise.all([
      api('GET', `/api/rdv?du=${auj}&au=${dans6}`).then(r => r.rdv.filter(x => x.statut === 'confirme')),
      api('GET', '/api/attente').then(r => r.attente),
      chargerClients(),
    ]);
  } catch (e) { toast(messageErreur(e), 'danger'); return; }
  const maintenant = NOW_HHMM();
  const duJour = rdv.filter(r => r.date === auj);
  const prochain = rdv.find(r => r.date > auj || r.heure >= maintenant);
  const caJour = duJour.reduce((s, r) => s + r.prix, 0);
  const caSemaine = rdv.reduce((s, r) => s + r.prix, 0);

  const faites = etapesFaites();
  const etapes = [
    ['Confirme ton adresse email', SESSION.email_verifie, "Lien reçu à l'inscription", null],
    ['Vérifie tes prestations et tes prix', faites.prestations, 'Paramètres', "nav('parametres')"],
    ['Règle tes horaires', faites.horaires, 'Disponibilités', "nav('disponibilites')"],
    ['Mets ton lien dans ta bio Instagram', faites.lien, 'Copier le lien', 'copierLienAccueil()'],
  ];
  const miseEnRoute = etapes.every(e => e[1]) ? '' : `<div class="card ts-carte ts-mise-en-route">
    <div class="card-h"><div><div class="card-title">Mise en route</div><div class="card-sub">Quatre étapes et ta page de réservation tourne toute seule.</div></div></div>
    ${etapes.map(([t, ok, lien, action]) => `<div class="ts-etape${ok ? ' faite' : ''}">
      <i class="ti ${ok ? 'ti-circle-check' : 'ti-circle'}"></i><span>${t}</span>
      ${!ok && action ? `<button class="btn btn-ghost btn-sm" onclick="${action}">${lien}</button>` : `<em>${ok ? '' : lien}</em>`}
    </div>`).join('')}
  </div>`;

  const carteProchain = prochain ? `<div class="card ts-carte ts-prochain">
      <div class="card-sub">Prochain client · ${prochain.date === auj ? "aujourd'hui" : esc(dateLongue(prochain.date))} à ${prochain.heure}</div>
      <div class="ts-prochain-nom">${esc(prochain.client_nom)}</div>
      <div class="ts-texte">${esc(prochain.prestation_nom)} · ${fmtMoney(prochain.prix)}${prochain.note ? ' · ' + esc(prochain.note) : ''}</div>
      ${prochain.telephone ? `<div class="ts-boutons"><a class="btn btn-out" href="tel:${esc(prochain.telephone)}"><i class="ti ti-phone"></i>Appeler</a>
        <a class="btn btn-out" href="sms:${esc(prochain.telephone)}"><i class="ti ti-message"></i>SMS</a></div>` : ''}
    </div>`
    : `<div class="card ts-carte ts-prochain"><div class="card-sub">Prochain client</div><div class="ts-texte">Plus aucun rendez-vous à venir sur les 7 prochains jours. Partage ton lien de réservation pour remplir ta semaine.</div></div>`;

  const kpi = (label, valeur, icone) => `<div class="kpi-card"><i class="ti ${icone} kpi-icon"></i><div class="kpi-label">${label}</div><div class="kpi-value">${valeur}</div></div>`;
  const journee = duJour.length
    ? duJour.map(r => `<div class="ts-ligne${r.heure < maintenant ? ' passe' : ''}" onclick="nav('agenda')">
        <i class="ti ti-clock"></i><div class="ts-ligne-txt"><strong>${r.heure} · ${esc(r.client_nom)}</strong><span>${esc(r.prestation_nom)} · ${fmtMoney(r.prix)}</span></div></div>`).join('')
    : '<div class="ts-vide">Personne aujourd\'hui.</div>';
  const listeAttente = attente.length ? `<div class="card ts-carte">
      <div class="card-h"><div><div class="card-title">Liste d'attente</div><div class="card-sub">Des clients attendent une place. Préviens-les quand un créneau se libère.</div></div></div>
      ${attente.map(a => `<div class="ts-ligne${a.prevenu_le ? ' barre' : ''}">
        <i class="ti ti-hourglass"></i><div class="ts-ligne-txt"><strong>${esc(a.nom)} · ${esc(dateLongue(a.date))}</strong><span>${esc(a.telephone)}</span></div>
        <a class="btn btn-ghost btn-sm" href="sms:${esc(a.telephone)}" aria-label="SMS"><i class="ti ti-message"></i></a>
        <button class="btn btn-ghost btn-sm" onclick="marquerPrevenu('${esc(a.id)}', ${!a.prevenu_le})">${a.prevenu_le ? 'Annuler' : 'Prévenu'}</button>
      </div>`).join('')}
    </div>` : '';

  page.innerHTML = miseEnRoute + carteProchain
    + `<div class="kpi-grid">${kpi("RDV aujourd'hui", duJour.length, 'ti-calendar')}${kpi("Prévu aujourd'hui", fmtMoney(caJour), 'ti-cash')}${kpi('RDV sur 7 jours', rdv.length, 'ti-calendar-week')}${kpi('Prévu sur 7 jours', fmtMoney(caSemaine), 'ti-trending-up')}</div>`
    + `<div class="card ts-carte"><div class="card-h"><div class="card-title">Aujourd'hui</div>
         <button class="btn btn-ghost btn-sm" onclick="nav('agenda')">Agenda <i class="ti ti-arrow-right"></i></button></div>${journee}</div>`
    + listeAttente;
}

async function copierLienAccueil() {
  try { await navigator.clipboard.writeText(SESSION.salon.lien_public); toast('Lien copié : colle-le dans ta bio Instagram ✓', 'success'); }
  catch (_) { toast(SESSION.salon.lien_public, ''); }
  marquerEtape('lien');
  renderAccueil();
}

async function marquerPrevenu(id, prevenu) {
  try { await api('PATCH', '/api/attente/' + id, { prevenu }); renderAccueil(); }
  catch (e) { toast(messageErreur(e), 'danger'); }
}

PAGES.dashboard = { titre: 'Accueil', sous: '', rendu: renderAccueil };
