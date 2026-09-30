/* ── Accueil ──
   Ce qu'un pro regarde en arrivant : la mise en route tant qu'elle n'est
   pas finie, le prochain client, la journée, la liste d'attente. */

const ETAPES_CLE = () => 'ts_etapes_' + (SESSION ? SESSION.salon.id : '');
function etapesFaites() { try { return JSON.parse(localStorage.getItem(ETAPES_CLE()) || '{}'); } catch (_) { return {}; } }
function marquerEtape(nom) {
  try { localStorage.setItem(ETAPES_CLE(), JSON.stringify({ ...etapesFaites(), [nom]: true })); } catch (_) {}
}

/* ── Abonnement ──
   Liens de paiement Stripe SANS frais de mise en place (offerts aux 10 premiers,
   comme l'annonce le site). client_reference_id = id du salon : le webhook
   (backend/routes/stripe.js) active le salon avec le bon plan dès le paiement. */
const LIENS_STRIPE = {
  starter: 'https://buy.stripe.com/9B6fZhe7Bd0MgiegmtgEg06',
  max: 'https://buy.stripe.com/9B614n9Rl9OA5DA9Y5gEg07',
};
function lienPaiement(plan) {
  const p = new URLSearchParams({ client_reference_id: SESSION.salon.id, prefilled_email: SESSION.email || '' });
  return `${LIENS_STRIPE[plan]}?${p}`;
}
function carteAbonnement() {
  const s = SESSION.salon;
  if (s.statut === 'actif') return '';
  // Tant que l'essai a du temps devant lui, un bandeau d'une ligne suffit ;
  // la grande carte revient à 2 jours de la fin et après.
  if (s.statut === 'essai' && s.jours_essai_restants > 2) {
    return `<div class="ts-bandeau"><i class="ti ti-sparkles"></i>
      <span><strong>Essai gratuit</strong> · ${s.jours_essai_restants} jours restants</span>
      <div class="ts-bandeau-actions"><a class="btn btn-ghost btn-sm" href="${esc(lienPaiement('max'))}" target="_blank" rel="noopener">Max · 99 €</a>
        <a class="btn btn-ghost btn-sm" href="${esc(lienPaiement('starter'))}" target="_blank" rel="noopener">Starter · 59 €</a></div></div>`;
  }
  const titre = s.statut === 'essai'
    ? `Essai gratuit : ${s.jours_essai_restants} jour${s.jours_essai_restants > 1 ? 's' : ''} restant${s.jours_essai_restants > 1 ? 's' : ''}`
    : 'Ton essai est terminé';
  const sous = s.statut === 'essai'
    ? 'Choisis ton offre quand tu veux : ton salon reste ouvert sans interruption.'
    : "Ton agenda est en lecture seule et ta page ne prend plus de réservations. Rien n'est effacé : choisis une offre pour tout rouvrir.";
  return `<div class="card ts-carte ts-abonnement">
    <div class="card-h"><div><div class="card-title">${titre}</div><div class="card-sub">${sous}</div></div></div>
    <div class="ts-offres">
      <a class="ts-offre" href="${esc(lienPaiement('max'))}" target="_blank" rel="noopener">
        <strong>Max · 99 €/mois</strong><span>Agenda, page de réservation, clients, stats. Bot Instagram sur demande.</span></a>
      <a class="ts-offre" href="${esc(lienPaiement('starter'))}" target="_blank" rel="noopener">
        <strong>Starter · 59 €/mois</strong><span>Le bot Instagram seul, avec ton outil de réservation actuel.</span></a>
    </div>
    <div class="card-sub">Sans engagement, mise en place offerte. Paiement sécurisé par Stripe ; ton salon s'active tout seul.</div>
  </div>`;
}

let DEMANDES = [];
let GRAPHE_CA = null;

/* ── Calculs de l'accueil (sur les RDV confirmés) ── */
const somme = liste => liste.reduce((s, r) => s + (Number(r.prix) || 0), 0);
// Sans point de comparaison (0 la veille ou le mois dernier), l'écart brut
// (« +4 vs hier », « +115 € vs hier ») : un pourcentage n'aurait pas de sens.
function tendance(actuel, avant, suffixe, unite = '') {
  if (!avant && !actuel) return '<div class="kpi-trend flat">—</div>';
  if (!avant) return `<div class="kpi-trend up"><i class="ti ti-arrow-up"></i> +${Math.round(actuel).toLocaleString('fr-FR')}${unite} ${suffixe}</div>`;
  const pct = Math.round((actuel - avant) / avant * 100);
  const sens = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const fleche = pct > 0 ? 'ti-arrow-up' : pct < 0 ? 'ti-arrow-down' : 'ti-minus';
  return `<div class="kpi-trend ${sens}"><i class="ti ${fleche}"></i> ${pct > 0 ? '+' : ''}${pct} % ${suffixe}</div>`;
}
// Couleur stable par prestation (pastilles de l'agenda du jour).
const TEINTES_PRESTA = ['#60C4C8', '#4A9AC8', '#8A4AC8', '#4ABA6A', '#C8892A', '#E75A8C', '#B39DDB', '#FF8A65'];
function teintePresta(nom) {
  let h = 0;
  for (const c of String(nom || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES_PRESTA[h % TEINTES_PRESTA.length];
}
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

async function renderAccueil() {
  const page = document.getElementById('page-dashboard');
  const auj = TODAY();
  const d = new Date(auj + 'T12:00:00');
  const debutMois = auj.slice(0, 8) + '01';
  const precedent = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
  const debutMoisPrec = ymd(precedent);
  // Même date le mois dernier (bornée au dernier jour de ce mois-là).
  const finMoisPrec = ymd(new Date(d.getFullYear(), d.getMonth(), 0, 12));
  const memeJourPrec = ymd(new Date(precedent.getFullYear(), precedent.getMonth(), Math.min(d.getDate(), Number(finMoisPrec.slice(8))), 12));
  const hier = ymd(new Date(d.getTime() - 86400000));
  const il30 = ymd(new Date(d.getTime() - 30 * 86400000));
  const il14 = ymd(new Date(d.getTime() - 13 * 86400000));
  const dans60 = ymd(new Date(d.getTime() + 60 * 86400000));
  const du = debutMoisPrec < il30 ? debutMoisPrec : il30;

  let tous, attente;
  try {
    [tous, attente] = await Promise.all([
      api('GET', `/api/rdv?du=${du}&au=${dans60}`).then(r => r.rdv),
      api('GET', '/api/attente').then(r => r.attente),
      chargerClients(),
    ]);
  } catch (e) { toast(messageErreur(e), 'danger'); return; }
  DEMANDES = tous.filter(x => x.statut === 'en_attente' && x.date >= auj);
  const rdv = tous.filter(x => x.statut === 'confirme');
  const maintenant = NOW_HHMM();
  const duJour = rdv.filter(r => r.date === auj);
  const deHier = rdv.filter(r => r.date === hier);
  const duMois = rdv.filter(r => r.date >= debutMois && r.date.slice(0, 7) === auj.slice(0, 7));
  const moisADate = duMois.filter(r => r.date <= auj);
  const moisPrecADate = rdv.filter(r => r.date >= debutMoisPrec && r.date <= memeJourPrec);
  const prochain = rdv.find(r => r.date > auj || (r.date === auj && r.heure >= maintenant));
  const s = SESSION.salon;

  // ── Cartes d'action (en tête, seulement quand elles ont quelque chose à dire)
  const faites = etapesFaites();
  const etapes = [
    ['Confirme ton adresse email', SESSION.email_verifie, "Lien reçu à l'inscription", null],
    ['Vérifie tes prestations et tes prix', faites.prestations || s.mise_en_route, 'Paramètres', "nav('parametres')"],
    ['Règle tes horaires', faites.horaires || s.mise_en_route, 'Disponibilités', "nav('disponibilites')"],
    ['Mets ton lien dans ta bio Instagram', faites.lien || s.mise_en_route, 'Copier le lien', 'copierLienAccueil()'],
  ];
  const restantes = etapes.filter(e => !e[1]);
  const miseEnRoute = !restantes.length ? '' : (restantes.length === 1 && restantes[0] === etapes[0])
    ? `<div class="ts-bandeau"><i class="ti ti-mail"></i><span>Confirme ton adresse email : clique sur le lien reçu à l'inscription.</span>
        <div class="ts-bandeau-actions"><button class="btn btn-ghost btn-sm" onclick="renvoyerVerification()">Renvoyer l'email</button></div></div>`
    : `<div class="card ts-carte ts-mise-en-route">
    <div class="card-h"><div><div class="card-title">Mise en route</div><div class="card-sub">${(n => n > 1 ? `Encore ${n} étapes` : "Plus qu'une étape")(etapes.filter(e => !e[1]).length)} et ta page de réservation tourne toute seule.</div></div></div>
    ${etapes.map(([t, ok, lien, action]) => `<div class="ts-etape${ok ? ' faite' : ''}">
      <i class="ti ${ok ? 'ti-circle-check' : 'ti-circle'}"></i><span>${t}</span>
      ${!ok && action ? `<button class="btn btn-ghost btn-sm" onclick="${action}">${lien}</button>` : `<em>${ok ? '' : lien}</em>`}
    </div>`).join('')}
  </div>`;
  const notifs = await carteNotifications();
  const demandes = DEMANDES.length ? `<div class="card ts-carte ts-demandes">
      <div class="card-h"><div><div class="card-title"><i class="ti ti-hourglass"></i> ${DEMANDES.length} demande${DEMANDES.length > 1 ? 's' : ''} à valider</div>
        <div class="card-sub">Le créneau est gardé. Accepte ou refuse : le client est prévenu par email.</div></div></div>
      ${DEMANDES.map(x => `<div class="ts-ligne">
        <i class="ti ti-calendar-event"></i><div class="ts-ligne-txt"><strong>${esc(dateLongue(x.date))} à ${x.heure} · ${esc(x.client_nom)}</strong><span>${esc(x.prestation_nom)}${x.telephone ? ' · ' + esc(x.telephone) : ''}</span></div>
        <button class="btn btn-gold btn-sm" onclick="validerRdv('${esc(x.id)}', true)">Accepter</button>
        <button class="btn btn-ghost btn-sm" onclick="validerRdv('${esc(x.id)}', false)">Refuser</button>
      </div>`).join('')}
    </div>` : '';

  // ── Indicateurs
  const kpi = (label, valeur, icone, trend) => `<div class="kpi-card"><i class="ti ${icone} kpi-icon"></i><div class="kpi-label">${label}</div><div class="kpi-value">${valeur}</div>${trend}</div>`;
  const euros = n => `${Math.round(n).toLocaleString('fr-FR')}<span class="unit">€</span>`;
  const kpis = `<div class="kpi-grid ts-kpis">
    ${kpi("RDV aujourd'hui", duJour.length, 'ti-calendar-check', tendance(duJour.length, deHier.length, 'vs hier'))}
    ${kpi("Chiffre aujourd'hui", euros(somme(duJour)), 'ti-coin', tendance(somme(duJour), somme(deHier), 'vs hier', ' €'))}
    ${kpi('RDV ce mois', duMois.length, 'ti-calendar-stats', tendance(moisADate.length, moisPrecADate.length, 'vs mois dernier'))}
    ${kpi('Chiffre ce mois', euros(somme(duMois)), 'ti-trending-up', tendance(somme(moisADate), somme(moisPrecADate), 'vs mois dernier', ' €'))}
  </div>`;

  // ── Agenda du jour
  const journee = duJour.length
    ? duJour.map(r => `<div class="rdv-item${r.heure < maintenant ? ' passe' : ''}" onclick="nav('agenda')">
        <span class="rdv-time">${r.heure}</span><span class="rdv-dot" style="background:${teintePresta(r.prestation_nom)}"></span>
        <div class="rdv-info"><div class="rdv-name">${esc(r.client_nom)}</div><div class="rdv-svc">${esc(r.prestation_nom)}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
        <span class="rdv-price">${Math.round(r.prix)} €</span></div>`).join('')
    : `<div class="ts-vide">Personne aujourd'hui. <a href="#" onclick="event.preventDefault();copierLienAccueil()">Partage ton lien</a> pour remplir ta semaine.</div>`;
  const agendaDuJour = `<div class="card ts-carte">
    <div class="card-h"><div><div class="card-title">Agenda du jour</div><div class="card-sub">${esc(dateLongue(auj))}</div></div>
      <span class="card-link" onclick="nav('agenda')">Voir tout →</span></div>${journee}</div>`;

  // ── Prochain RDV
  const initiales = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join('').toUpperCase();
  const dansCombien = r => {
    if (r.date !== auj) return r.date === ymd(new Date(d.getTime() + 86400000)) ? `Demain à ${r.heure}` : `${dateLongue(r.date)} à ${r.heure}`;
    const [h, m] = r.heure.split(':').map(Number), [hn, mn] = maintenant.split(':').map(Number);
    const min = h * 60 + m - (hn * 60 + mn);
    return min < 60 ? `Dans ${min} min` : `Aujourd'hui à ${r.heure}`;
  };
  const carteProchain = `<div class="card ts-carte ts-prochain">
    <div class="card-h"><div class="card-title">Prochain RDV</div></div>
    ${prochain ? `<div class="ts-prochain-ligne">
        <div class="client-avatar" style="background:linear-gradient(135deg, ${teintePresta(prochain.prestation_nom)}, rgba(var(--accent-rgb), .6))">${esc(initiales(prochain.client_nom))}</div>
        <div><div class="ts-prochain-nom">${esc(prochain.client_nom)}</div>
          <div class="rdv-svc">${esc(prochain.prestation_nom)} · ${Math.round(prochain.prix)} €</div>
          <div class="ts-dans">${esc(dansCombien(prochain))}</div></div></div>
      ${prochain.telephone ? `<div class="ts-boutons"><a class="btn btn-out btn-sm" href="tel:${esc(prochain.telephone)}"><i class="ti ti-phone"></i>Appeler</a>
        <a class="btn btn-out btn-sm" href="sms:${esc(prochain.telephone)}"><i class="ti ti-message"></i>SMS</a></div>` : ''}`
      : '<div class="ts-texte">Aucun rendez-vous à venir. Partage ton lien de réservation pour remplir ta semaine.</div>'}
  </div>`;

  // ── Top prestations (30 derniers jours et à venir)
  const compte = {};
  rdv.filter(r => r.date >= il30).forEach(r => { compte[r.prestation_nom] = (compte[r.prestation_nom] || 0) + 1; });
  const top = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topPrestas = `<div class="card ts-carte">
    <div class="card-h"><div><div class="card-title">Top prestations</div><div class="card-sub">30 derniers jours</div></div></div>
    ${top.length ? top.map(([nom, n]) => `<div class="presta-item">
        <div class="presta-header"><span class="presta-name">${esc(nom)}</span><span class="presta-count">${n} RDV</span></div>
        <div class="presta-bar"><div class="presta-fill" style="width:${Math.round(n / top[0][1] * 100)}%"></div></div></div>`).join('')
      : '<div class="ts-vide">Tes prestations les plus demandées apparaîtront ici.</div>'}
  </div>`;

  // ── Chiffre des 14 derniers jours + objectif du mois
  const jours14 = Array.from({ length: 14 }, (_, i) => ymd(new Date(new Date(il14 + 'T12:00:00').getTime() + i * 86400000)));
  const parJour = jours14.map(j => somme(rdv.filter(r => r.date === j)));
  const carteCA = `<div class="card ts-carte">
    <div class="card-h"><div><div class="card-title">Chiffre d'affaires</div><div class="card-sub">14 derniers jours · ${Math.round(parJour.reduce((a, b) => a + b, 0)).toLocaleString('fr-FR')} €</div></div></div>
    <div class="chart-wrap"><canvas id="graphe-ca" aria-label="Chiffre d'affaires des 14 derniers jours"></canvas></div></div>`;

  const objectif = s.objectif_mensuel || 0;
  const caMois = somme(duMois);
  const joursDansMois = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const projection = moisADate.length ? Math.round(somme(moisADate) / d.getDate() * joursDansMois) : 0;
  const passes = rdv.filter(r => r.date >= il30 && r.date <= auj);
  const parJourSemaine = {}, parHeure = {};
  passes.forEach(r => {
    const j = new Date(r.date + 'T12:00:00').getDay();
    parJourSemaine[j] = (parJourSemaine[j] || 0) + (Number(r.prix) || 0);
    const h = Number(r.heure.slice(0, 2));
    parHeure[h] = (parHeure[h] || 0) + 1;
  });
  const meilleurJour = Object.entries(parJourSemaine).sort((a, b) => b[1] - a[1])[0];
  const heurePointe = Object.entries(parHeure).sort((a, b) => b[1] - a[1])[0];
  const panier = passes.length ? Math.round(somme(passes) / passes.length) : 0;
  const pct = objectif ? Math.min(100, Math.round(caMois / objectif * 1000) / 10) : 0;
  const carteObjectif = `<div class="card ts-carte ts-objectif">
    <div class="card-h"><div class="card-title">Objectif du mois</div><span class="card-link" onclick="modifierObjectif()">${objectif ? 'Modifier' : 'Fixer'}</span></div>
    <div class="ts-objectif-valeur">${Math.round(caMois).toLocaleString('fr-FR')}<span>€</span></div>
    <div class="ts-objectif-sur">${objectif ? `sur ${objectif.toLocaleString('fr-FR')} € d'objectif` : 'réservés ce mois-ci'}</div>
    ${objectif ? `<div class="ts-jauge"><div style="width:${pct}%"></div></div>
      <div class="ts-objectif-sur">${pct.toLocaleString('fr-FR')} %${projection ? ` · projection : ${projection.toLocaleString('fr-FR')} € d'ici la fin du mois` : ''}</div>`
      : '<div class="ts-objectif-sur"><a href="#" onclick="event.preventDefault();modifierObjectif()">Fixe-toi un objectif</a> pour suivre ta progression.</div>'}
    <div class="stat-row"><span class="stat-label">Meilleur jour</span><span class="stat-val">${meilleurJour ? JOURS_LONGS[meilleurJour[0]] : '—'}</span></div>
    <div class="stat-row"><span class="stat-label">Heure de pointe</span><span class="stat-val">${heurePointe ? `${heurePointe[0]} h – ${Number(heurePointe[0]) + 1} h` : '—'}</span></div>
    <div class="stat-row"><span class="stat-label">Panier moyen</span><span class="stat-val">${panier ? panier + ' €' : '—'}</span></div>
  </div>`;

  const listeAttente = attente.length ? `<div class="card ts-carte">
      <div class="card-h"><div><div class="card-title">Liste d'attente</div><div class="card-sub">Des clients attendent une place. Préviens-les quand un créneau se libère.</div></div></div>
      ${attente.map(a => `<div class="ts-ligne${a.prevenu_le ? ' barre' : ''}">
        <i class="ti ti-hourglass"></i><div class="ts-ligne-txt"><strong>${esc(a.nom)} · ${esc(dateLongue(a.date))}</strong><span>${esc(a.telephone)}</span></div>
        <a class="btn btn-ghost btn-sm" href="sms:${esc(a.telephone)}" aria-label="SMS"><i class="ti ti-message"></i></a>
        <button class="btn btn-ghost btn-sm" onclick="marquerPrevenu('${esc(a.id)}', ${!a.prevenu_le})">${a.prevenu_le ? 'Annuler' : 'Prévenu'}</button>
      </div>`).join('')}
    </div>` : '';

  page.innerHTML = demandes + carteAbonnement() + notifs + miseEnRoute + kpis
    + `<div class="ts-grille-accueil">${agendaDuJour}<div class="ts-colonne">${carteProchain}${topPrestas}</div></div>`
    + `<div class="ts-grille-accueil ts-grille-egale">${carteCA}${carteObjectif}</div>`
    + listeAttente;
  dessinerGrapheCA(jours14, parJour);
}

// Courbe du chiffre (Chart.js, chargé en différé : si absent, la carte garde son total).
function dessinerGrapheCA(jours, valeurs) {
  const canvas = document.getElementById('graphe-ca');
  if (!canvas || typeof Chart === 'undefined') return;
  if (GRAPHE_CA) GRAPHE_CA.destroy();
  const teinte = getComputedStyle(document.documentElement).getPropertyValue('--gold-0').trim() || '#60C4C8';
  Chart.defaults.color = '#8A857E';
  GRAPHE_CA = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: jours.map(j => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })),
      datasets: [{ data: valeurs, borderColor: teinte, borderWidth: 2, backgroundColor: teinte + '26', fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: teinte }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => Math.round(c.parsed.y) + ' €' } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.04)' }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
        y: { grid: { color: 'rgba(255,255,255,.04)' }, border: { display: false }, beginAtZero: true, ticks: { callback: v => v + '€' } },
      },
    },
  });
}

async function modifierObjectif() {
  const actuel = SESSION.salon.objectif_mensuel || '';
  const saisie = prompt('Ton objectif de chiffre pour le mois (en €) :', actuel);
  if (saisie === null) return;
  const objectif = Math.round(Number(String(saisie).replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
  try {
    const r = await api('PATCH', '/api/salon', { objectif_mensuel: objectif });
    SESSION.salon = r.salon;
    toast('Objectif enregistré ✓', 'success');
    renderAccueil();
  } catch (e) { toast(messageErreur(e), 'danger'); }
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
