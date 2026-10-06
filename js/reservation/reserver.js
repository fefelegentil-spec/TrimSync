/* ── Page de réservation d'un salon TrimSync ──
   Le parcours de la page FCUTZ (index.html) : mêmes étapes, mêmes gestes, même
   rendu. Deux différences de fond :
   - les créneaux ne se calculent plus dans le navigateur : le serveur donne les
     jours (ouvert / libres) puis les heures d'un jour. Aucune liste de RDV ne
     sort, même anonymisée ;
   - pas de paiement en ligne, d'acompte, de fidélité ni de série : ce sont
     des fonctions du salon de Félix, pas de TrimSync (pour l'instant). */

const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? (localStorage.getItem('ts_api') || 'http://localhost:3998')
  : 'https://trimsync-production.up.railway.app';
const PARAMS = new URLSearchParams(location.search);
// /r/<slug> en ligne ; ?salon=<slug> en local.
const SLUG = (location.pathname.match(/^\/r\/([a-z0-9-]+)/) || [])[1] || PARAMS.get('salon') || '';
const CLE_RDV = 'ts_rdv_' + SLUG;
const CLE_CLIENT = 'ts_client';

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_SHORT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const DAY_NAMES = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const FULL_DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

let SALON = null;
let SERVICES = [];
let JOURS = {};          // date → { ouvert, libres } pour la prestation choisie (30 jours)
let JOURS_PRESTA = null; // prestation pour laquelle JOURS a été chargé
let HEURES = {};         // date → heures libres
let DISPO_ERREUR = false;
let selSvc = null, selDate = null, selSlot = null;
let currentStep = 1;
const _now = new Date();
let calYear = _now.getFullYear(), calMonth = _now.getMonth();

/* ── Outils (repris de FCUTZ) ── */
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const TODAY_STR = ymd(_now);
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show t-' + (type || 'gold');
  setTimeout(() => t.classList.remove('show'), 2600);
}
function fmtDay(ds) {
  if (!ds) return '—';
  const d = new Date(ds + 'T12:00:00');
  return `${FULL_DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
function prix(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('fr-FR'); }
// Montant affiché : « Sur devis » quand le salon masque ses prix (prix null).
function montant(n) { return n === null || n === undefined ? 'Sur devis' : prix(n) + ' €'; }
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
function telValide(p) { return /^0[1-9]\d{8}$/.test(p || '') || (/^\+\d{7,}$/.test(p || '')); }
function fmtTel(p) { const n = normalizePhone(p || ''); return /^0\d{9}$/.test(n) ? n.replace(/(\d{2})(?=\d)/g, '$1 ') : (p || ''); }
function rangerTel(inp) { const n = normalizePhone(inp.value); if (telValide(n)) inp.value = fmtTel(n); }

async function api(methode, chemin, corps) {
  let r;
  try {
    r = await fetch(API + chemin, { method: methode, headers: { 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
  } catch (_) { throw Object.assign(new Error('Pas de connexion. Réessaie dans un instant.'), { statut: 0 }); }
  let d = null; try { d = await r.json(); } catch (_) {}
  if (!r.ok) throw Object.assign(new Error((d && d.error) || 'Erreur inattendue'), { statut: r.status, corps: d });
  return d;
}

/* ── Salon : nom, adresse, téléphone ── */
function adresseSalon() { return [SALON.adresse, SALON.ville].filter(Boolean).join(', '); }
function openMaps() {
  if (!adresseSalon()) return;
  window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(adresseSalon()), '_blank', 'noopener');
}
/* Couleur du salon : quatre nuances dérivées d'une seule, comme l'or de FCUTZ
   (--gold et ses variantes plus claires / plus sombres, --gold-rgb pour les halos). */
function appliquerCouleur(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return;
  const rgb = m.slice(1).map(h => parseInt(h, 16));
  const mele = (vers, t) => '#' + rgb.map((c, i) => Math.round(c + (vers[i] - c) * t).toString(16).padStart(2, '0')).join('');
  const r = document.documentElement.style;
  r.setProperty('--gold', hex);
  r.setProperty('--gold-2', mele([255, 255, 255], .22));
  r.setProperty('--gold-3', mele([255, 255, 255], .55));
  r.setProperty('--gold-deep', mele([0, 0, 0], .2));
  r.setProperty('--gold-rgb', rgb.join(','));
  // L'encre posée SUR l'accent suit la couleur du salon : sombre sur une teinte
  // claire (le teal TrimSync), claire sur une teinte foncée — sinon le texte
  // du bouton principal et des créneaux sélectionnés devenait illisible.
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  r.setProperty('--ink-sur-accent', lum > 0.55 ? '#0A1418' : '#F2F6F7');
  // Fond animé : repeint tout de suite s'il tourne déjà, sinon il lira _couleurSalon au démarrage.
  window._couleurSalon = rgb;
  if (window._bgSetAccent) window._bgSetAccent(...rgb);
}

function presenterSalon() {
  const bloc = document.getElementById('salon-intro');
  const logo = SALON.logo ? `<img class="salon-logo" src="${API}/api/public/salons/${encodeURIComponent(SALON.slug)}/logo?v=${SALON.logo}" alt="${escHtml(SALON.nom)}">` : '';
  const desc = SALON.description ? `<div class="salon-desc">${escHtml(SALON.description)}</div>` : '';
  const insta = SALON.instagram ? `<a class="salon-insta" href="https://instagram.com/${encodeURIComponent(SALON.instagram)}" target="_blank" rel="noopener"><i class="ti ti-brand-instagram"></i>@${escHtml(SALON.instagram)}</a>` : '';
  const regle = SALON.annulation_h ? `<div class="salon-regle"><i class="ti ti-info-circle"></i>Annulation en ligne jusqu'à ${SALON.annulation_h} h avant</div>` : '';
  if (!logo && !desc && !insta && !regle) return;
  bloc.innerHTML = logo + `<div class="salon-intro-txt">${desc}${insta}${regle}</div>`;
  bloc.hidden = false;
}

function habillerSalon() {
  document.title = `${SALON.nom} — Réservation en ligne`;
  appliquerCouleur(SALON.couleur);
  presenterSalon();
  const splash = document.getElementById('splash-name');
  if (splash) {
    splash.style.setProperty('--lettres', Math.max(5, SALON.nom.length));
    splash.innerHTML = [...SALON.nom.toUpperCase()]
      .map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : escHtml(c)}</span>`).join('')
      + `<div class="splash-reflet">${escHtml(SALON.nom.toUpperCase())}</div>`;
  }
  const nom = document.getElementById('h-name');
  nom.textContent = SALON.nom.toUpperCase();
  // Monogramme : initiales des deux premiers mots, sur la tuile du header et
  // du splash — la marque visuelle TrimSync qui remplace le mot-logo FCUTZ.
  const mono = SALON.nom.trim().split(/\s+/).slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('');
  document.querySelectorAll('#h-mark, #splash-mark').forEach(e => { e.textContent = mono; });
  const cote = document.getElementById('h-side');
  const liens = [];
  if (adresseSalon()) liens.push(`<a class="h-ico" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresseSalon())}" target="_blank" rel="noopener" title="${escHtml(adresseSalon())}" aria-label="${escHtml(adresseSalon())}"><i class="ti ti-map-pin"></i></a>`);
  if (SALON.telephone) liens.push(`<a class="h-ico" href="tel:${escHtml(SALON.telephone)}" title="${escHtml(fmtTel(SALON.telephone))}" aria-label="Appeler le salon"><i class="ti ti-phone"></i></a>`);
  cote.insertAdjacentHTML('afterbegin', liens.join(''));
  document.querySelectorAll('.js-nom').forEach(e => { e.textContent = SALON.nom; });
  document.querySelectorAll('.js-adresse').forEach(e => { e.textContent = adresseSalon(); });
  document.querySelectorAll('.js-maps, #mr-adresse').forEach(e => { e.hidden = !adresseSalon(); });
  document.querySelectorAll('.js-tel').forEach(e => { if (SALON.telephone) { e.href = 'tel:' + SALON.telephone; e.hidden = false; } else e.hidden = true; });
}

/* ── Prestations ── */
function renderServices() {
  const list = document.getElementById('svc-list');
  if (!list.children.length) {
    list.innerHTML = SERVICES.map(s => `
      <button class="svc" data-id="${escHtml(s.id)}" onclick="selectSvc('${escHtml(s.id)}')" aria-pressed="false">
        <div class="svc-img-wrap ts-sans-image"><i class="ti ${iconePresta(s.nom)}"></i></div>
        <div class="svc-body">
          <div class="svc-name">${escHtml(s.nom)}</div>
          ${s.description ? `<div class="svc-desc">${escHtml(s.description)}</div>` : ''}
          <div class="svc-dur"><i class="ti ti-clock"></i>${s.duree_min} min</div>
        </div>
        <div class="svc-side">
          <div class="svc-price">${montant(s.prix)}</div>
          <div class="svc-check"><i class="ti ti-check"></i></div>
        </div>
      </button>`).join('');
  }
  list.querySelectorAll('.svc').forEach(btn => { const on = btn.dataset.id === selSvc?.id; btn.classList.toggle('sel', on); btn.setAttribute('aria-pressed', on); });
}
function iconePresta(nom) {
  const n = (nom || '').toLowerCase();
  if (n.includes('barbe')) return 'ti-razor';
  if (n.includes('enfant')) return 'ti-mood-kid';
  if (/ongle|gel|semi|remplissage|manucure|p[ée]dicure|nail/.test(n)) return 'ti-hand-finger';
  if (/cil|sourcil/.test(n)) return 'ti-eye';
  if (/soin|visage|[ée]pil|massage/.test(n)) return 'ti-sparkles';
  if (n.includes('design') || n.includes('trait')) return 'ti-brush';
  if (/coupe|coiff|brushing|couleur|m[èe]che/.test(n)) return 'ti-scissors';
  return 'ti-calendar-event';
}
function selectSvc(id) {
  selSvc = SERVICES.find(s => s.id === id) || SERVICES[0];
  renderServices();
}

/* ── Étapes (goStep de FCUTZ, sans paiement) ── */
function goStep(n) {
  if (n >= 2 && n <= 4 && !selSvc) { toast('Choisis une prestation', 'r'); return; }
  if (n >= 3 && n <= 4 && (!selDate || !selSlot)) { toast('Choisis une date et un créneau', 'r'); return; }
  if (n === 0 && !rdvRetenu()) return;
  if (n === 2) preparerCalendrier();
  if (n === 3) updateRecap('recap-3');
  if (n === 4) {
    const fn = document.getElementById('b-fname').value.trim();
    const ph = normalizePhone(document.getElementById('b-phone').value);
    if (!fn || !ph) { toast('Remplis ton prénom et téléphone', 'r'); return; }
    if (!telValide(ph)) { toast('Numéro invalide — ex : 06 12 34 56 78', 'r'); return; }
    updateRecap('recap-4');
    majQuiReserve();
    document.getElementById('pay-btn').innerHTML = texteConfirmer();
  }
  if (n === 0) remplirMonRdv();
  const enArriere = n < currentStep;
  currentStep = n;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active', 'retour'));
  const sec = document.getElementById(n === 'indispo' ? 's-indispo' : 's' + n);
  sec.classList.toggle('retour', enArriere);
  sec.classList.add('active');
  // Le consentement ne se présume pas (CNIL, CJUE Planet49) : la case revient décochée.
  const cc = document.getElementById('consent-check');
  if (cc && n !== 4) cc.checked = false;
  updatePayBtn();
  document.querySelector('.wrap').classList.toggle('at-success', n === 0 || n === 5 || n === 'indispo');
  majCta(n);
  if (n === 5) window.retirerSplash(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function infosCompletes() {
  return !!document.getElementById('b-fname').value.trim() && telValide(normalizePhone(document.getElementById('b-phone').value));
}
function apresCreneau() { goStep(infosCompletes() ? 4 : 3); }

/* ── Barre d'action fixe + stepper ──
   Le bouton principal (id pay-btn, qui porte aussi « Confirmer le RDV » à
   l'étape 4) et le stepper suivent l'étape courante ; goStep() appelle
   majCta() après avoir basculé la section. */
function majCta(n) {
  const nav = document.getElementById('stepper');
  if (nav) {
    const visible = n >= 1 && n <= 4;
    nav.hidden = !visible;
    if (visible) {
      for (let i = 1; i <= 4; i++) {
        const st = document.getElementById('st-' + i);
        st.classList.toggle('act', i === n);
        st.classList.toggle('done', i < n);
        st.querySelector('.st-n').textContent = i < n ? '✓' : i;
        const sep = document.getElementById('sep-' + i);
        if (sep) sep.classList.toggle('done', i < n);
      }
    }
  }
  const main = document.getElementById('pay-btn');
  if (!main) return;
  document.getElementById('cta-back').hidden = !(n === 2 || n === 3 || n === 4);
  if (n < 1 || n > 4) return; // écrans sans barre : le CSS la cache (.at-success)
  if (n === 2) main.disabled = !selDate || !selSlot;
  else if (n === 1 || n === 3) main.disabled = false;
  // Étape 4 : updatePayBtn() garde la main (consentement) et le libellé est
  // déjà posé par goStep() via texteConfirmer().
  if (n <= 3) main.innerHTML = 'Continuer<i class="ti ti-arrow-right"></i>';
}
function ctaSuivant() {
  if (currentStep === 1) goStep(2);
  else if (currentStep === 2) apresCreneau();
  else if (currentStep === 3) goStep(4);
  else if (currentStep === 4) processBooking();
}
function retourCta() {
  if (currentStep === 4) goStep(infosCompletes() ? 2 : 3);
  else if (currentStep === 3) goStep(2);
  else if (currentStep === 2) goStep(1);
}
// Salon qui valide ses RDV : on envoie une demande, on ne confirme pas.
function libelleConfirmer() { return SALON && SALON.validation ? 'Envoyer ma demande' : 'Confirmer le RDV'; }
// Contenu du bouton final : le montant n'y figure que s'il est affiché (pas « Sur devis »).
function texteConfirmer() {
  const libelle = `<i class="ti ti-lock"></i>${libelleConfirmer()}`;
  return selSvc && selSvc.prix !== null && selSvc.prix !== undefined ? `${libelle} — <span id="pay-amount">${montant(selSvc.prix)}</span>` : libelle;
}

function updatePayBtn() {
  // La barre n'obéit au consentement qu'à l'étape 4 : appelé pour toute
  // navigation par goStep(), il ne doit pas désactiver « Continuer » ailleurs.
  if (currentStep !== 4) return;
  const checked = document.getElementById('consent-check')?.checked;
  const btn = document.getElementById('pay-btn');
  if (!btn) return;
  btn.disabled = !checked;
  btn.style.opacity = checked ? '1' : '0.5';
  btn.style.cursor = checked ? 'pointer' : 'not-allowed';
}
function majQuiReserve() {
  const nom = (document.getElementById('b-fname').value.trim() + ' ' + document.getElementById('b-lname').value.trim()).trim();
  const ph = document.getElementById('b-phone').value.trim();
  document.getElementById('qui-4').innerHTML = '<i class="ti ti-user"></i>'
    + '<span class="qui-txt">Pour ' + escHtml(nom || '—') + (ph ? ' · ' + escHtml(fmtTel(ph)) : '') + '</span>'
    + '<button type="button" class="qui-mod" onclick="goStep(3)">Modifier</button>';
}
function updateRecap(id) {
  const el = document.getElementById(id);
  if (id === 'recap-3') {
    el.classList.add('mini');
    el.innerHTML = `<div class="recap-mini"><i class="ti ti-scissors"></i>
      <span class="rm-txt">${escHtml(selSvc.nom)} · ${escHtml(fmtDay(selDate))} · ${escHtml(selSlot)}</span>
      <span class="rm-prix">${montant(selSvc.prix)}</span></div>`;
    return;
  }
  el.classList.remove('mini');
  el.innerHTML = `
    <div class="recap-row"><span class="recap-label">Prestation</span><span class="recap-val">${escHtml(selSvc.nom)}</span></div>
    <div class="recap-row"><span class="recap-label">Créneau</span><span class="recap-val">${fmtDay(selDate)} · ${selSlot}</span></div>
    <div class="recap-row"><span class="recap-label">Durée</span><span class="recap-val">${selSvc.duree_min} min</span></div>
    <div class="recap-row"><span class="recap-label">Total</span><span class="recap-val">${montant(selSvc.prix)}</span></div>`;
}

/* ── Calendrier : jours donnés par le serveur pour la prestation choisie ── */
async function preparerCalendrier() {
  if (JOURS_PRESTA === selSvc.id) { renderCal(); return; }
  JOURS = {}; HEURES = {}; JOURS_PRESTA = null; DISPO_ERREUR = false;
  selDate = null; selSlot = null;
  document.getElementById('pay-btn').disabled = true;
  document.getElementById('slots-wrap').style.display = 'none';
  document.getElementById('s2').classList.remove('slots-on', 'vient-d-ouvrir');
  renderCal();
  try {
    const { jours } = await api('GET', `/api/public/salons/${SLUG}/jours?prestation=${encodeURIComponent(selSvc.id)}`);
    jours.forEach(j => { JOURS[j.date] = j; });
    JOURS_PRESTA = selSvc.id;
  } catch (_) { DISPO_ERREUR = true; }
  renderCal();
}
function renderCal() {
  document.getElementById('cal-month').textContent = MONTHS[calMonth].toLowerCase() + ' ' + calYear;
  const grid = document.getElementById('cal-grid');
  const entete = DAY_NAMES.map(d => `<div class="cal-dn">${d}</div>`).join('');
  if (!JOURS_PRESTA) {
    grid.innerHTML = entete + (DISPO_ERREUR
      ? `<div class="cal-panne"><i class="ti ti-calendar-question"></i><div><b>Impossible de charger les disponibilités.</b><br>Réessaie dans un instant${SALON.telephone ? ', ou appelle le salon' : ''}.</div></div>`
      : '<div class="cal-loading">Chargement des disponibilités…</div>');
    return;
  }
  let html = entete;
  const first = new Date(calYear, calMonth, 1).getDay();
  const offset = first === 0 ? 6 : first - 1;
  const days = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < offset; i++) html += '<div class="cal-d empty" aria-hidden="true"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isPast = ds < TODAY_STR;
    const j = JOURS[ds];
    // Au-delà de l'horizon de réservation, le jour est fermé comme un jour de repos.
    const isOpen = !!(j && j.ouvert);
    let cls = 'cal-d';
    if (isPast) cls += ' past';
    else if (!isOpen) cls += ' closed';
    else if (ds === TODAY_STR) cls += ' today';
    const complet = !isPast && isOpen && !j.libres;
    if (!isPast && isOpen) cls += complet ? ' complet' : ' libre';
    if (ds === selDate) cls += ' sel';
    const inerte = isPast || !isOpen;
    html += `<button type="button" class="${cls}"${inerte ? ' disabled' : ''}`
      + ` aria-label="${d} ${MONTHS[calMonth].toLowerCase()} ${calYear}${complet ? ', complet' : ''}"`
      + `${ds === selDate ? ' aria-current="date"' : ''} onclick="selectDay('${ds}',this)">${d}</button>`;
  }
  grid.innerHTML = html;
}
function calChange(dir) {
  calMonth += dir;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCal();
}
function selectDay(ds, el) {
  if (el.classList.contains('past') || el.classList.contains('closed') || el.classList.contains('empty')) return;
  selDate = ds;
  selSlot = null;
  document.getElementById('pay-btn').disabled = true;
  const prev = document.querySelector('.cal-d.sel');
  if (prev) prev.classList.remove('sel');
  el.classList.add('sel');
  document.getElementById('slots-h-d').textContent = fmtDay(ds);
  document.getElementById('slots-wrap').style.display = 'block';
  const sec2 = document.getElementById('s2');
  if (!sec2.classList.contains('slots-on')) {
    sec2.classList.add('slots-on', 'vient-d-ouvrir');
    clearTimeout(sec2._finAnim);
    sec2._finAnim = setTimeout(() => sec2.classList.remove('vient-d-ouvrir'), 1100);
  }
  renderSlots(ds);
}

/* ── Créneaux du jour, calculés par le serveur ── */
async function renderSlots(ds) {
  const grid = document.getElementById('slots');
  const zone = document.getElementById('slots-zone');
  zone.classList.remove('full', 'partial');
  if (!HEURES[ds]) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:18px;color:var(--text-3);font-size:12.5px">Chargement…</div>';
    try {
      HEURES[ds] = (await api('GET', `/api/public/salons/${SLUG}/dispo?prestation=${encodeURIComponent(selSvc.id)}&date=${ds}`)).heures;
    } catch (e) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:18px;color:var(--text-3);font-size:12.5px">${escHtml(e.message)}</div>`;
      return;
    }
  }
  if (selDate !== ds) return; // le client a changé de jour pendant le chargement
  const heures = HEURES[ds];
  zone.classList.toggle('full', !heures.length);
  refreshWaitlistBtn(ds);
  grid.innerHTML = heures.map((s, i) => {
    const isSel = s === selSlot;
    return `<button type="button" class="slot${isSel ? ' sel' : ''}" style="--i:${i}"${isSel ? ' aria-pressed="true"' : ''} onclick="selectSlot(this,'${s}')">${s}</button>`;
  }).join('');
}
function selectSlot(el, t) {
  const prev = document.querySelector('.slot.sel');
  if (prev) { prev.classList.remove('sel'); prev.removeAttribute('aria-pressed'); }
  el.classList.add('sel');
  el.setAttribute('aria-pressed', 'true');
  selSlot = t;
  document.getElementById('pay-btn').disabled = false;
}

/* ── Liste d'attente : nom et numéro, pas de notification (le barbier prévient) ── */
const CLE_ATTENTE = 'ts_attente_' + SLUG;
function attenteRejointe(ds) { try { return (JSON.parse(localStorage.getItem(CLE_ATTENTE)) || []).includes(ds); } catch (_) { return false; } }
function refreshWaitlistBtn(ds) {
  const btn = document.getElementById('waitlist-btn');
  if (!btn) return;
  const ok = attenteRejointe(ds);
  btn.disabled = ok;
  btn.style.opacity = ok ? '.7' : '1';
  btn.innerHTML = ok ? '<i class="ti ti-bell-check"></i>Tu seras prévenu si une place se libère ✓' : '<i class="ti ti-bell-plus"></i>Me prévenir si une place se libère';
}
async function joinWaitlist() {
  const ds = selDate;
  if (!ds) return;
  const client = clientRetenu();
  const nom = client.nom || (prompt('Ton prénom et ton nom :') || '').trim();
  if (!nom) return;
  const tel = client.telephone || (prompt('Ton numéro de téléphone :') || '').trim();
  if (!telValide(normalizePhone(tel))) { toast('Numéro invalide — ex : 06 12 34 56 78', 'r'); return; }
  if (!confirm(`J'accepte que ${SALON.nom} garde mon nom et mon numéro pour me prévenir si une place se libère.`)) return;
  try {
    await api('POST', `/api/public/salons/${SLUG}/attente`, { date: ds, nom, telephone: tel, consentement: true });
    try {
      const arr = JSON.parse(localStorage.getItem(CLE_ATTENTE)) || [];
      if (!arr.includes(ds)) arr.push(ds);
      localStorage.setItem(CLE_ATTENTE, JSON.stringify(arr));
    } catch (_) {}
    refreshWaitlistBtn(ds);
    toast("C'est noté — tu seras prévenu si une place se libère ✓", 'gold');
  } catch (e) { toast(e.message, 'r'); }
}

/* ── Réservation ── */
function clientRetenu() { try { return JSON.parse(localStorage.getItem(CLE_CLIENT)) || {}; } catch (_) { return {}; } }
function rdvRetenu() { try { return JSON.parse(localStorage.getItem(CLE_RDV)) || null; } catch (_) { return null; } }

async function processBooking() {
  const btn = document.getElementById('pay-btn');
  if (!document.getElementById('consent-check').checked) return;
  const fname = document.getElementById('b-fname').value.trim();
  const lname = document.getElementById('b-lname').value.trim();
  const telephone = document.getElementById('b-phone').value.trim();
  const email = document.getElementById('b-email').value.trim();
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2"></i>Réservation…';
  try {
    const r = await api('POST', `/api/public/salons/${SLUG}/reserver`, {
      prestation_id: selSvc.id, date: selDate, heure: selSlot,
      nom: (fname + ' ' + lname).trim(), telephone, email, consentement: true,
    });
    try {
      localStorage.setItem(CLE_CLIENT, JSON.stringify({ fname, lname, telephone, email, nom: (fname + ' ' + lname).trim() }));
      localStorage.setItem(CLE_RDV, JSON.stringify({ ...r.rdv, duree: selSvc.duree_min, jeton: r.annulation, prenom: fname }));
    } catch (_) {}
    showSuccess(r);
  } catch (e) {
    toast(e.message, 'r');
    // Créneau pris entre-temps : on revient sur la journée, à jour.
    if (e.statut === 409) { delete HEURES[selDate]; selSlot = null; goStep(2); renderSlots(selDate); }
  } finally {
    btn.innerHTML = texteConfirmer();
    updatePayBtn();
  }
}

function showSuccess(r) {
  // Le créneau pris disparaît aussitôt pour une réservation dans la foulée.
  if (HEURES[selDate]) HEURES[selDate] = HEURES[selDate].filter(h => h !== selSlot);
  const aRegler = r.rdv.prix === null ? '' : `<br><span style="color:var(--accent);font-weight:700">${montant(r.rdv.prix)}</span> à régler sur place.`;
  const acompte = r.acompte && r.acompte.montant > 0 ? r.acompte : null;
  document.getElementById('success-msg').innerHTML = r.rdv.statut === 'en_attente'
    ? `Demande envoyée ! <strong>${escHtml(SALON.nom)}</strong> valide chaque rendez-vous : tu reçois une confirmation par email très vite. Ton créneau est gardé en attendant.`
    : `Ton RDV est confirmé.${aRegler}`;
  // Acompte anti no-show : le paiement se fait ici, tout de suite, pendant que
  // l'écran de confirmation est sous les yeux (l'email propose le même bouton).
  if (acompte && !r.rdv.acompte_paye) {
    document.getElementById('success-acompte').innerHTML =
      `<div class="acompte-bloc"><div class="acompte-titre"><i class="ti ti-shield-check"></i>Acompte à régler pour garder ton créneau</div>
        <a class="btn btn-gold" href="${escHtml(acompte.url)}" target="_blank" rel="noopener"><i class="ti ti-credit-card"></i>Payer l'acompte de ${montant(acompte.montant)}</a>
        <p class="acompte-sub">Remboursé si tu annules jusqu'à ${SALON.annulation_h ? SALON.annulation_h + ' h avant' : "l'heure du RDV"}. Lien aussi envoyé par email.</p></div>`;
  }
  document.getElementById('success-recap').innerHTML = `
    <div class="success-recap-item"><i class="ti ti-calendar-event"></i>${fmtDay(r.rdv.date)}</div>
    <div class="success-recap-item"><i class="ti ti-clock"></i>${r.rdv.heure}</div>
    <div class="success-recap-item"><i class="ti ti-scissors"></i>${escHtml(r.rdv.prestation)}</div>
    ${r.rdv.prix === null ? '' : `<div class="success-recap-item"><i class="ti ti-currency-euro"></i>${montant(r.rdv.prix)}</div>`}
    ${adresseSalon() ? `<div class="success-recap-item recap-map" role="link" tabindex="0" onclick="openMaps()"><i class="ti ti-map-pin"></i><span>${escHtml(adresseSalon())}<span class="rm-go">Ouvrir dans Google Maps</span></span></div>` : ''}`;
  document.getElementById('cancel-rdv-btn').style.display = '';
  document.getElementById('cancel-confirm-msg').style.display = 'none';
  document.getElementById('h-account').hidden = false;
  goStep(5);
  if (navigator.vibrate) try { navigator.vibrate([18, 60, 28]); } catch (_) {}
}

function addToCalendar() {
  const b = rdvRetenu();
  if (!b) return;
  const [yr, mo, dy] = b.date.split('-').map(Number);
  const [hh, mm] = b.heure.split(':').map(Number);
  const start = new Date(yr, mo - 1, dy, hh, mm, 0);
  const end = new Date(start.getTime() + (b.duree || 30) * 60000);
  const fmt = dt => dt.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  window.open('https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent(`${SALON.nom} — ${b.prestation}`)
    + '&dates=' + fmt(start) + '/' + fmt(end)
    + '&location=' + encodeURIComponent(adresseSalon())
    + '&details=' + encodeURIComponent('Annuler : ' + lienAnnulation(b.jeton)), '_blank', 'noopener');
}
function lienAnnulation(jeton) {
  const base = location.pathname.startsWith('/r/') ? `${location.origin}/r/${SLUG}?` : `${location.origin}${location.pathname}?salon=${SLUG}&`;
  return base + 'annuler=' + jeton;
}

/* ── Mon rendez-vous (dernier pris ici, ou ouvert par le lien d'annulation) ── */
function remplirMonRdv() {
  const b = rdvRetenu();
  if (!b) return;
  document.getElementById('mr-name').textContent = b.prenom ? `Bonjour ${b.prenom}` : 'Bonjour';
  document.getElementById('mr-service').textContent = b.prestation;
  document.getElementById('mr-date').textContent = fmtDay(b.date);
  document.getElementById('mr-time').textContent = b.heure;
  document.getElementById('mr-price').textContent = montant(b.prix);
  const annule = b.statut === 'annule';
  const passe = !b.annulable && b.statut === 'confirme';
  document.getElementById('mr-actions').style.display = annule ? 'none' : '';
  document.getElementById('cancel-confirm-msg-0').style.display = annule ? '' : 'none';
  document.getElementById('cancel-rdv-btn-0').style.display = passe ? 'none' : '';
}

function cancelBooking(sfx) {
  const b = rdvRetenu();
  if (!b) return;
  document.getElementById('cancel-dialog-text-' + sfx).textContent = 'Annuler ton RDV du ' + fmtDay(b.date) + ' à ' + b.heure + ' ?';
  document.getElementById(sfx === '0' ? 'cancel-rdv-btn-0' : 'cancel-rdv-btn').style.display = 'none';
  document.getElementById('cancel-dialog-' + sfx).style.display = '';
}
function hideCancelDialog(sfx) {
  document.getElementById('cancel-dialog-' + sfx).style.display = 'none';
  document.getElementById(sfx === '0' ? 'cancel-rdv-btn-0' : 'cancel-rdv-btn').style.display = '';
}
async function doCancel(sfx) {
  const b = rdvRetenu();
  const btn = document.getElementById('cancel-yes-btn-' + sfx);
  if (!b) return;
  btn.disabled = true;
  try {
    await api('POST', '/api/public/annuler', { jeton: b.jeton });
    localStorage.setItem(CLE_RDV, JSON.stringify({ ...b, statut: 'annule' }));
    delete HEURES[b.date];
    document.getElementById('cancel-dialog-' + sfx).style.display = 'none';
    if (sfx === '0') remplirMonRdv();
    else document.getElementById('cancel-confirm-msg').style.display = '';
    toast('Ton rendez-vous est annulé', 'gold');
  } catch (e) {
    toast(e.message, 'r');
    hideCancelDialog(sfx);
  } finally { btn.disabled = false; }
}

function startNewBooking() {
  selSlot = null;
  goStep(1);
}
function resetBooking() {
  selSvc = SERVICES[0];
  selDate = null; selSlot = null;
  document.getElementById('pay-btn').disabled = true;
  document.getElementById('slots-wrap').style.display = 'none';
  document.getElementById('s2').classList.remove('slots-on', 'vient-d-ouvrir');
  renderServices();
  goStep(1);
}

function indispo(titre, texte, appeler) {
  document.getElementById('indispo-titre').textContent = titre;
  document.getElementById('indispo-txt').textContent = texte;
  document.querySelectorAll('#s-indispo .js-tel').forEach(e => { e.hidden = !appeler || !SALON || !SALON.telephone; });
  goStep('indispo');
}

/* ── Démarrage ── */
async function init() {
  if (!SLUG) { indispo('Lien incomplet', 'Ce lien de réservation ne désigne aucun salon.'); window.retirerSplash(true); return; }
  try {
    SALON = await api('GET', `/api/public/salons/${SLUG}`);
  } catch (e) {
    indispo(e.statut === 404 ? 'Salon introuvable' : 'Oups', e.statut === 404 ? 'Vérifie le lien : aucun salon ne porte cette adresse.' : e.message);
    window.retirerSplash(true);
    return;
  }
  SERVICES = SALON.prestations;
  selSvc = SERVICES[0] || null;
  habillerSalon();
  // Coordonnées retenues d'une réservation précédente : l'étape Infos se saute.
  const c = clientRetenu();
  ['fname', 'lname', 'email'].forEach(k => { if (c[k]) document.getElementById('b-' + k).value = c[k]; });
  if (c.telephone) document.getElementById('b-phone').value = c.telephone;
  if (rdvRetenu()) document.getElementById('h-account').hidden = false;

  const jeton = PARAMS.get('annuler');
  if (jeton) {
    try {
      const { rdv } = await api('GET', `/api/public/rdv/${encodeURIComponent(jeton)}`);
      const prec = rdvRetenu() || {};
      localStorage.setItem(CLE_RDV, JSON.stringify({ ...rdv, jeton, prenom: prec.jeton === jeton ? prec.prenom : '' }));
      document.getElementById('h-account').hidden = false;
      goStep(0);
    } catch (e) { toast(e.message, 'r'); }
  } else if (!SALON.reservable) {
    indispo('Réservation fermée', 'La réservation en ligne est fermée pour le moment.', true);
  } else if (!SERVICES.length) {
    indispo('Bientôt', "Aucune prestation n'est encore proposée en ligne.", true);
  } else {
    renderServices();
    majCta(1);
  }
  // Le nom se pose, le reflet passe, puis la page monte (même tempo que FCUTZ).
  setTimeout(() => {
    const revele = window._splashRevele || Date.now();
    setTimeout(() => window.retirerSplash(), Math.max(0, 1400 - (Date.now() - revele)));
  }, 600);
}

init();
