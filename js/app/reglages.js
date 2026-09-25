/* ── Disponibilités et Paramètres ──
   Horaires, fermetures, prestations, infos du salon, bot, compte. Chaque
   carte relit le serveur après une écriture : ce qui s'affiche est ce qui est
   enregistré, jamais une supposition. */

const JOURS_ORDRE = [1, 2, 3, 4, 5, 6, 0];
const JOURS_NOMS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function carte(titre, sous, corps, id = '') {
  return `<div class="card ts-carte"${id ? ` id="${id}"` : ''}><div class="card-h"><div><div class="card-title">${titre}</div>${sous ? `<div class="card-sub">${sous}</div>` : ''}</div></div>${corps}</div>`;
}

/* ════════ DISPONIBILITÉS ════════ */
let HORAIRES_BRUTS = { semaine: [], fermetures: [] };

async function renderDisponibilites() {
  const page = document.getElementById('page-disponibilites');
  try { HORAIRES_BRUTS = await api('GET', '/api/horaires'); }
  catch (e) { toast(messageErreur(e), 'danger'); return; }
  marquerEtape('horaires');
  const parJour = Object.fromEntries(HORAIRES_BRUTS.semaine.map(j => [j.jour, j]));
  const lignes = JOURS_ORDRE.map(jour => {
    const j = parJour[jour];
    const ouvert = !!j;
    return `<div class="ts-jour${ouvert ? '' : ' ferme'}" data-jour="${jour}">
      <div class="ts-jour-nom">${JOURS_NOMS[jour]}</div>
      <label class="switch"><input type="checkbox" ${ouvert ? 'checked' : ''} onchange="basculerJour(this)"><span class="slider"></span></label>
      <div class="ts-jour-heures">
        <input class="input" type="time" step="900" data-champ="ouverture" value="${j ? j.ouverture : '09:00'}" ${ouvert ? '' : 'disabled'} aria-label="Ouverture">
        <span class="ts-a">à</span>
        <input class="input" type="time" step="900" data-champ="fermeture" value="${j ? j.fermeture : '19:00'}" ${ouvert ? '' : 'disabled'} aria-label="Fermeture">
      </div>
      <div class="ts-jour-pause">
        <span class="ts-a"><i class="ti ti-coffee"></i> pause</span>
        <input class="input" type="time" step="900" data-champ="pause_debut" value="${j && j.pause_debut ? j.pause_debut : ''}" ${ouvert ? '' : 'disabled'} aria-label="Début de pause">
        <span class="ts-a">à</span>
        <input class="input" type="time" step="900" data-champ="pause_fin" value="${j && j.pause_fin ? j.pause_fin : ''}" ${ouvert ? '' : 'disabled'} aria-label="Fin de pause">
      </div>
    </div>`;
  }).join('');
  const fermetures = HORAIRES_BRUTS.fermetures.length
    ? HORAIRES_BRUTS.fermetures.map(f => `<div class="ts-ligne">
        <i class="ti ${f.debut ? 'ti-clock-off' : 'ti-calendar-off'}"></i>
        <div class="ts-ligne-txt"><strong>${esc(dateLongue(f.date))}</strong>
          <span>${f.debut ? `de ${f.debut} à ${f.fin}` : 'toute la journée'}${f.motif ? ' · ' + esc(f.motif) : ''}</span></div>
        <button class="btn btn-ghost btn-sm" onclick="supprimerFermeture('${esc(f.id)}')" aria-label="Supprimer"><i class="ti ti-trash"></i></button>
      </div>`).join('')
    : '<div class="ts-vide">Aucune fermeture à venir.</div>';
  page.innerHTML =
    carte('Horaires de la semaine', 'Ta page de réservation ne propose que ces heures. La pause est facultative.',
      `<div class="ts-jours">${lignes}</div>
       <button class="btn btn-gold" onclick="enregistrerHoraires()"><i class="ti ti-check"></i>Enregistrer les horaires</button>`)
    + carte('Fermetures et créneaux bloqués', 'Vacances, jour férié, rendez-vous perso : plus personne ne peut réserver à ces moments-là. Les RDV déjà pris restent.',
      `<div class="ts-form-ligne">
         <input class="input" type="date" id="ferm-date" min="${TODAY()}" aria-label="Date">
         <label class="ts-coche"><input type="checkbox" id="ferm-journee" checked onchange="document.getElementById('ferm-plage').hidden=this.checked"> Toute la journée</label>
       </div>
       <div class="ts-form-ligne" id="ferm-plage" hidden>
         <input class="input" type="time" step="900" id="ferm-debut" aria-label="Début"><span class="ts-a">à</span>
         <input class="input" type="time" step="900" id="ferm-fin" aria-label="Fin">
       </div>
       <div class="ts-form-ligne">
         <input class="input" type="text" id="ferm-motif" maxlength="120" placeholder="Motif (facultatif) — congés, médecin…">
         <button class="btn btn-out" onclick="ajouterFermeture()"><i class="ti ti-plus"></i>Ajouter</button>
       </div>
       <div class="ts-liste">${fermetures}</div>`);
}

function dateLongue(ymdStr) {
  return new Date(ymdStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function basculerJour(caseACocher) {
  const ligne = caseACocher.closest('.ts-jour');
  ligne.classList.toggle('ferme', !caseACocher.checked);
  ligne.querySelectorAll('input[type=time]').forEach(i => { i.disabled = !caseACocher.checked; });
}

async function enregistrerHoraires() {
  const semaine = [...document.querySelectorAll('.ts-jour')]
    .filter(l => l.querySelector('input[type=checkbox]').checked)
    .map(l => {
      const v = c => l.querySelector(`[data-champ="${c}"]`).value;
      const jour = { jour: Number(l.dataset.jour), ouverture: v('ouverture'), fermeture: v('fermeture') };
      if (v('pause_debut') || v('pause_fin')) Object.assign(jour, { pause_debut: v('pause_debut'), pause_fin: v('pause_fin') });
      return jour;
    });
  try {
    await api('PUT', '/api/horaires', { semaine });
    await chargerReglages();
    toast('Horaires enregistrés ✓', 'success');
    renderDisponibilites();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

async function ajouterFermeture() {
  const date = document.getElementById('ferm-date').value;
  if (!date) { toast('Choisis une date', 'warning'); return; }
  const corps = { date, motif: document.getElementById('ferm-motif').value.trim() };
  if (!document.getElementById('ferm-journee').checked) {
    corps.debut = document.getElementById('ferm-debut').value;
    corps.fin = document.getElementById('ferm-fin').value;
  }
  try {
    await api('POST', '/api/fermetures', corps);
    await chargerReglages();
    toast('Fermeture ajoutée ✓', 'success');
    renderDisponibilites();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

async function supprimerFermeture(id) {
  if (!await confirmer('Supprimer cette fermeture ? Ta page de réservation proposera de nouveau ces créneaux.')) return;
  try {
    await api('DELETE', '/api/fermetures/' + id);
    await chargerReglages();
    renderDisponibilites();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

/* ════════ PARAMÈTRES ════════ */
async function renderParametres() {
  const page = document.getElementById('page-parametres');
  let prestations;
  try {
    [SESSION, prestations] = await Promise.all([api('GET', '/api/moi'), api('GET', '/api/prestations').then(r => r.prestations)]);
    afficherSalon();
  } catch (e) { toast(messageErreur(e), 'danger'); return; }
  marquerEtape('prestations');
  const s = SESSION.salon;
  const lignesPresta = prestations.map((p, i) => `<div class="ts-presta${p.actif ? '' : ' inactive'}" data-id="${esc(p.id)}">
      <div class="ts-presta-ordre">
        <button class="btn btn-ghost btn-sm" onclick="deplacerPresta(${i}, -1)" ${i === 0 ? 'disabled' : ''} aria-label="Monter"><i class="ti ti-chevron-up"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="deplacerPresta(${i}, 1)" ${i === prestations.length - 1 ? 'disabled' : ''} aria-label="Descendre"><i class="ti ti-chevron-down"></i></button>
      </div>
      <input class="input ts-presta-nom" data-champ="nom" value="${esc(p.nom)}" maxlength="60" aria-label="Nom" onchange="modifierPresta('${esc(p.id)}', this)">
      <label class="ts-unite"><input class="input" type="number" data-champ="duree_min" value="${p.duree_min}" min="5" max="480" step="5" aria-label="Durée" onchange="modifierPresta('${esc(p.id)}', this)"><span>min</span></label>
      <label class="ts-unite"><input class="input" type="number" data-champ="prix" value="${p.prix}" min="0" step="0.5" aria-label="Prix" onchange="modifierPresta('${esc(p.id)}', this)"><span>€</span></label>
      <label class="switch" title="${p.actif ? 'Proposée sur ta page' : 'Masquée'}"><input type="checkbox" data-champ="actif" ${p.actif ? 'checked' : ''} onchange="modifierPresta('${esc(p.id)}', this)"><span class="slider"></span></label>
    </div>`).join('');
  window._ordrePrestas = prestations.map(p => p.id);
  const bot = {
    inactif: SESSION.email_verifie
      ? `<p class="ts-texte">Le bot répond à tes DM Instagram et pose les rendez-vous dans cet agenda, 24 h/24. Je le branche avec toi lors d'un appel de mise en route.</p>
         <button class="btn btn-gold" onclick="demanderBot()"><i class="ti ti-brand-instagram"></i>Activer le bot Instagram</button>`
      : `<p class="ts-texte">Confirme d'abord ton adresse email (lien reçu à l'inscription), pour que je puisse te joindre.</p>
         <button class="btn btn-out" onclick="renvoyerVerification()"><i class="ti ti-mail"></i>Renvoyer l'email de confirmation</button>`,
    demande: '<p class="ts-texte"><i class="ti ti-circle-check"></i> Demande envoyée : je t\'appelle pour la mise en route.</p>',
    actif: '<p class="ts-texte"><i class="ti ti-circle-check"></i> Ton bot Instagram est actif.</p>',
  }[s.bot_statut];
  const abonnement = s.statut === 'essai'
    ? `Essai gratuit jusqu'au <strong>${esc(dateLongue(s.essai_fin))}</strong> (${s.jours_essai_restants} jour${s.jours_essai_restants > 1 ? 's' : ''}).`
    : s.statut === 'actif' ? `Plan <strong>${esc((s.plan || '').toUpperCase())}</strong> actif.`
    : 'Ton essai est terminé : ton agenda est en lecture seule et ta page ne prend plus de réservations. Rien n\'est supprimé.';
  page.innerHTML =
    carte('Ta page de réservation', 'Mets ce lien dans ta bio Instagram : tes clients réservent seuls, 24 h/24.',
      `<div class="ts-lien"><a href="${esc(s.lien_public)}" target="_blank" rel="noopener">${esc(s.lien_public.replace(/^https:\/\//, ''))}</a>
         <button class="btn btn-out btn-sm" onclick="copierLien()"><i class="ti ti-copy"></i>Copier</button></div>
       <div class="ts-form-ligne"><span class="ts-a">trimsync.tech/r/</span><input class="input" id="par-slug" value="${esc(s.slug)}" maxlength="50" aria-label="Adresse de ta page">
         <button class="btn btn-ghost btn-sm" onclick="enregistrerSalon(['slug'])">Changer</button></div>`)
    + carte('Ton salon', 'Affiché en haut de ta page de réservation.',
      `<div class="ts-grille2">
         <input class="input" id="par-nom" value="${esc(s.nom)}" maxlength="80" placeholder="Nom du salon" aria-label="Nom du salon">
         <input class="input" id="par-ville" value="${esc(s.ville)}" maxlength="60" placeholder="Ville" aria-label="Ville">
         <input class="input" id="par-adresse" value="${esc(s.adresse)}" maxlength="160" placeholder="Adresse" aria-label="Adresse">
         <input class="input" id="par-telephone" value="${esc(s.telephone)}" type="tel" placeholder="Téléphone" aria-label="Téléphone">
       </div>
       <button class="btn btn-gold" onclick="enregistrerSalon(['nom','ville','adresse','telephone'])"><i class="ti ti-check"></i>Enregistrer</button>`)
    + carte('Prestations', 'Nom, durée et prix. L\'interrupteur masque une prestation de ta page sans l\'effacer. Enregistré à chaque changement.',
      `<div class="ts-prestas">${lignesPresta}</div>
       <div class="ts-form-ligne ts-presta-ajout">
         <input class="input" id="np-nom" maxlength="60" placeholder="Nouvelle prestation">
         <label class="ts-unite"><input class="input" id="np-duree" type="number" value="30" min="5" max="480" step="5" aria-label="Durée"><span>min</span></label>
         <label class="ts-unite"><input class="input" id="np-prix" type="number" value="20" min="0" step="0.5" aria-label="Prix"><span>€</span></label>
         <button class="btn btn-out" onclick="ajouterPresta()"><i class="ti ti-plus"></i>Ajouter</button>
       </div>`)
    + carte('Bot Instagram', '', bot)
    + carte('Abonnement', '', `<p class="ts-texte">${abonnement}</p>
       <a class="btn btn-out" href="/trimsync-booking.html" target="_blank" rel="noopener"><i class="ti ti-calendar-event"></i>Parler de mon plan avec Félix</a>`)
    + carte('Compte', esc(SESSION.email),
      `<div class="ts-grille2">
         <input class="input" id="mdp-actuel" type="password" autocomplete="current-password" placeholder="Mot de passe actuel">
         <input class="input" id="mdp-nouveau" type="password" autocomplete="new-password" minlength="8" placeholder="Nouveau mot de passe">
       </div>
       <div class="ts-boutons">
         <button class="btn btn-out" onclick="changerMdp()"><i class="ti ti-lock"></i>Changer le mot de passe</button>
         <button class="btn btn-ghost" onclick="deconnecter()"><i class="ti ti-logout"></i>Se déconnecter</button>
       </div>
       <details class="ts-danger"><summary>Supprimer mon compte</summary>
         <p class="ts-texte">Tout est effacé : salon, agenda, clients, page de réservation. C'est définitif. Recopie le nom de ton salon pour confirmer.</p>
         <div class="ts-form-ligne"><input class="input" id="suppr-nom" placeholder="${esc(s.nom)}">
           <button class="btn btn-danger" onclick="supprimerCompte()"><i class="ti ti-trash"></i>Supprimer</button></div>
       </details>`);
}

async function enregistrerSalon(champs) {
  const corps = {};
  champs.forEach(c => { corps[c] = document.getElementById('par-' + c).value.trim(); });
  try {
    await api('PATCH', '/api/salon', corps);
    toast('Enregistré ✓', 'success');
    renderParametres();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

async function copierLien() {
  marquerEtape('lien');
  try { await navigator.clipboard.writeText(SESSION.salon.lien_public); toast('Lien copié ✓', 'success'); }
  catch (_) { toast(SESSION.salon.lien_public, ''); }
}

async function modifierPresta(id, champ) {
  const nom = champ.dataset.champ;
  const valeur = nom === 'actif' ? champ.checked : nom === 'nom' ? champ.value : Number(champ.value);
  try {
    await api('PATCH', '/api/prestations/' + id, { [nom]: valeur });
    SERVICES = [];                        // l'agenda relira le catalogue
    toast('Prestation enregistrée ✓', 'success');
    if (nom === 'actif') renderParametres();
  } catch (e) { toast(messageErreur(e), 'danger'); renderParametres(); }
}

async function deplacerPresta(i, sens) {
  const ids = [...window._ordrePrestas];
  [ids[i], ids[i + sens]] = [ids[i + sens], ids[i]];
  try { await api('PUT', '/api/prestations/ordre', { ids }); SERVICES = []; renderParametres(); }
  catch (e) { toast(messageErreur(e), 'danger'); }
}

async function ajouterPresta() {
  const nom = document.getElementById('np-nom').value.trim();
  if (!nom) { toast('Donne un nom à la prestation', 'warning'); return; }
  try {
    await api('POST', '/api/prestations', { nom, duree_min: Number(document.getElementById('np-duree').value), prix: Number(document.getElementById('np-prix').value) });
    SERVICES = [];
    toast('Prestation ajoutée ✓', 'success');
    renderParametres();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

async function demanderBot() {
  try { await api('POST', '/api/salon/demande-bot'); toast('Demande envoyée, je te rappelle ✓', 'success'); renderParametres(); }
  catch (e) { toast(messageErreur(e), 'danger'); }
}

async function renvoyerVerification() {
  try { await api('POST', '/api/comptes/renvoyer-verification'); toast('Email renvoyé, regarde ta boîte (et les spams).', 'success'); }
  catch (e) { toast(messageErreur(e), 'danger'); }
}

async function changerMdp() {
  try {
    await api('POST', '/api/comptes/mot-de-passe', { actuel: document.getElementById('mdp-actuel').value, nouveau: document.getElementById('mdp-nouveau').value });
    toast('Mot de passe changé ✓', 'success');
    renderParametres();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

async function supprimerCompte() {
  const nom = document.getElementById('suppr-nom').value.trim();
  if (!await confirmer('Dernière vérification : tout effacer, définitivement ?')) return;
  try {
    await api('DELETE', '/api/salon', { confirmation: nom });
    deconnecter();
    toast('Ton compte a été supprimé.', '');
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

PAGES.disponibilites = { titre: 'Disponibilités', sous: 'Horaires et fermetures', rendu: renderDisponibilites };
PAGES.parametres = { titre: 'Paramètres', sous: 'Ta page, tes prestations, ton compte', rendu: renderParametres };
