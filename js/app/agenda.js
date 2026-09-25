/* ── Agenda ──
   Porté du dashboard FCUTZ (renderAgenda, buildAgendaGrid, glisser-déposer,
   roue des heures, fenêtres de RDV) : même grille, mêmes gestes. Les données
   viennent de l'API TrimSync et sont traduites une fois, au chargement, dans
   la forme que ce code attendait déjà (DB.appointments, SERVICES…). Toute
   écriture part au serveur d'abord ; l'écran se redessine avec sa réponse. */

const JOURS_CLES = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

const DB = {
  appointments: [],
  clients: [],
  settings: { hours: {} },
  // Pause du jour et fermetures en plage deviennent des « indispos »,
  // les fermetures à la journée des jours bloqués.
  availability: { closedDates: [], timeBlocks: [], fermeturesPlage: [], pauses: {} },
};
let SERVICES = [];
let agView = window.innerWidth < 760 ? 'day' : 'week';
let agDate = new Date();
let rdvCharges = { du: null, au: null };

/* ── Traduction API TrimSync → forme FCUTZ ── */
const STATUT_VERS_FCUTZ = { confirme: 'confirmed', annule: 'cancelled', noshow: 'noshow' };
const STATUT_VERS_API = { confirmed: 'confirme', cancelled: 'annule', noshow: 'noshow' };

function versAppt(r) {
  return {
    id: r.id, date: r.date, time: r.heure, duration: r.duree_min,
    service: r.prestation_nom, prestationId: r.prestation_id, price: r.prix,
    clientId: r.client_id, clientName: r.client_nom, phone: r.telephone,
    status: STATUT_VERS_FCUTZ[r.statut] || r.statut, note: r.note || '', source: r.source,
  };
}
function remplacerAppt(r) {
  const a = versAppt(r);
  const i = DB.appointments.findIndex(x => x.id === a.id);
  if (i >= 0) DB.appointments[i] = a; else DB.appointments.push(a);
}

async function chargerReglages() {
  const [p, h] = await Promise.all([api('GET', '/api/prestations'), api('GET', '/api/horaires')]);
  SERVICES = p.prestations.filter(s => s.actif).map(s => ({ id: s.id, name: s.nom, price: s.prix, duration: s.duree_min }));
  DB.settings.hours = {};
  DB.availability.pauses = {};
  h.semaine.forEach(j => {
    DB.settings.hours[JOURS_CLES[j.jour]] = { open: true, start: j.ouverture, end: j.fermeture };
    if (j.pause_debut) DB.availability.pauses[j.jour] = { start: j.pause_debut, end: j.pause_fin };
  });
  DB.availability.closedDates = h.fermetures.filter(f => !f.debut).map(f => ({ id: f.id, date: f.date, motif: f.motif }));
  DB.availability.fermeturesPlage = h.fermetures.filter(f => f.debut)
    .map(f => ({ id: f.id, date: f.date, start: f.debut, end: f.fin, reason: f.motif || 'Indisponible', buffer: 0 }));
}

async function chargerClients() {
  const r = await api('GET', '/api/clients');
  DB.clients = r.clients;
}

// Les RDV se chargent par période affichée (± une semaine autour).
async function chargerRdv(du, au) {
  const r = await api('GET', `/api/rdv?du=${du}&au=${au}`);
  DB.appointments = r.rdv.map(versAppt);
  rdvCharges = { du, au };
}

/* ── Outils de l'agenda (repris du dashboard FCUTZ) ── */
function dayKeyFromDate(d) { return JOURS_CLES[(d instanceof Date ? d : new Date(d + 'T12:00:00')).getDay()]; }
function getDayHours(dayKey) { return DB.settings.hours[dayKey] || null; }
function getOpenException() { return null; } // pas d'ouverture exceptionnelle dans TrimSync pour l'instant

function tbFromMin(min) {
  const m = Math.max(0, Math.round(min));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function tbRange(b) { return { start: toMin(b.start), end: toMin(b.end) }; }
function tbLabel(b) { return `${b.start} – ${b.end}`; }
function tbIcone(motif) {
  const m = (motif || '').toLowerCase();
  if (/pause|repas|d[ée]jeuner|caf[ée]/.test(m)) return 'ti-coffee';
  if (/course|marché|marche|magasin/.test(m)) return 'ti-shopping-bag';
  if (/rendez|perso|m[ée]decin|dentiste/.test(m)) return 'ti-user';
  return 'ti-clock-off';
}
function getTimeBlocks(date) {
  const pause = DB.availability.pauses[new Date(date + 'T12:00:00').getDay()];
  const blocs = DB.availability.fermeturesPlage.filter(b => b.date === date);
  return pause ? [{ date, start: pause.start, end: pause.end, reason: 'Pause', buffer: 0, pause: true }, ...blocs] : blocs;
}
function isTimeBlocked(date, time, dur) {
  const s = toMin(time), e = s + (parseInt(dur) || 30);
  return getTimeBlocks(date).some(b => { const r = tbRange(b); return s < r.end && e > r.start; });
}

function svcClassFor(s) {
  if (!s) return 'svc-default';
  const sl = s.toLowerCase();
  if (sl.includes('transformation') || sl.includes('transfo')) return 'svc-transfo';
  if (sl.includes('barbe')) return 'svc-barbe';
  if (sl.includes('design') || sl.includes('trait')) return 'svc-design';
  if (sl.includes('premium')) return 'svc-premium';
  if (sl.includes('coupe') || sl.includes('dégradé') || sl.includes('degrade')) return 'svc-coupe';
  return 'svc-default';
}
const CLS_LABELS = { 'svc-coupe': 'Coupe', 'svc-premium': 'Premium', 'svc-transfo': 'Transformation', 'svc-barbe': 'Barbe', 'svc-design': 'Design', 'svc-default': 'Autre' };
const clsColor = cls => `var(--${cls === 'svc-default' ? 'marble-3' : cls})`;

function widestOpenRange() {
  let start = 24, end = 0;
  Object.values(DB.settings.hours).forEach(h => {
    if (!h || !h.open) return;
    start = Math.min(start, Math.floor(toMin(h.start) / 60));
    end = Math.max(end, Math.ceil(toMin(h.end) / 60));
  });
  if (start >= end) return { start: 8, end: 20 };
  return { start, end: end - 1 };
}

function hasConflict(date, time, dur, excludeId) {
  const s = toMin(time), e = s + dur;
  return DB.appointments.some(a => {
    if (a.id === excludeId || a.date !== date) return false;
    if (a.status === 'cancelled' || a.status === 'noshow') return false;
    const as = toMin(a.time);
    return s < as + (a.duration || 30) && e > as;
  });
}

/* ── Rendu ── */
function lundiDe(d) { const x = new Date(d); x.setDate(x.getDate() - (x.getDay() === 0 ? 6 : x.getDay() - 1)); return x; }
function joursAffiches() {
  if (agView === 'day') return [new Date(agDate)];
  const lundi = lundiDe(agDate);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(lundi); d.setDate(d.getDate() + i); return d; });
}

async function renderAgenda() {
  const jours = joursAffiches();
  const du = ymd(jours[0]), au = ymd(jours[jours.length - 1]);
  // Premier affichage : réglages et clients ; ensuite, seulement les RDV de la période.
  try {
    if (!SERVICES.length) await Promise.all([chargerReglages(), chargerClients()]);
    if (!rdvCharges.du || du < rdvCharges.du || au > rdvCharges.au) {
      const lundi = lundiDe(jours[0]);
      const debut = new Date(lundi); debut.setDate(debut.getDate() - 7);
      const fin = new Date(lundi); fin.setDate(fin.getDate() + 13);
      await chargerRdv(ymd(debut), ymd(fin));
    }
  } catch (e) {
    toast(messageErreur(e), 'danger');
    return;
  }
  const leg = document.getElementById('ag-legend');
  const vues = new Set(SERVICES.map(s => svcClassFor(s.name)));
  leg.innerHTML = [...vues].map(cls =>
    `<div class="ag-leg-item"><span class="ag-leg-swatch" style="background:${clsColor(cls)}"></span>${CLS_LABELS[cls] || cls}</div>`).join('');
  document.getElementById('ag-tab-day').classList.toggle('active', agView === 'day');
  document.getElementById('ag-tab-week').classList.toggle('active', agView === 'week');
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const nomsJours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  document.getElementById('ag-cur-label').textContent = agView === 'day'
    ? `${nomsJours[agDate.getDay()]} ${agDate.getDate()} ${mois[agDate.getMonth()]} ${agDate.getFullYear()}`
    : `${jours[0].getDate()} – ${jours[6].getDate()} ${mois[jours[6].getMonth()]} ${jours[6].getFullYear()}`;
  const plage = widestOpenRange();
  // +2 h après la fermeture : zone grisée pour caser un client en plus.
  buildAgendaGrid(jours, plage.start, Math.min(23, plage.end + 2));
}
function agSetView(v) { agView = v; renderAgenda(); }
function agToday() { agDate = new Date(); renderAgenda(); }
function agPrev() { const d = new Date(agDate); d.setDate(d.getDate() - (agView === 'day' ? 1 : 7)); agDate = d; renderAgenda(); }
function agNext() { const d = new Date(agDate); d.setDate(d.getDate() + (agView === 'day' ? 1 : 7)); agDate = d; renderAgenda(); }
function agOpenDay(dStr) { agDate = new Date(dStr + 'T12:00:00'); agView = 'day'; renderAgenda(); }

function buildAgendaGrid(days, start, end) {
  const today = TODAY();
  const dayNames = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  // La grille s'étend si un RDV ou une indispo déborde des horaires.
  days.forEach(d => {
    const dStr = ymd(d);
    DB.appointments.forEach(a => {
      if (a.date !== dStr || a.status === 'cancelled') return;
      const [h, m] = a.time.split(':').map(Number);
      start = Math.min(start, h);
      end = Math.max(end, Math.ceil((h * 60 + m + (a.duration || 30)) / 60) - 1);
    });
    getTimeBlocks(dStr).forEach(b => {
      const r = tbRange(b);
      start = Math.min(start, Math.floor(r.start / 60));
      end = Math.max(end, Math.ceil(r.end / 60) - 1);
    });
  });
  let html = `<div class="ag-grid ag-view-${agView}"><div class="ag-time-col"><div class="ag-time-h"></div>`;
  for (let h = start; h <= end; h++) html += `<div class="ag-time-cell">${String(h).padStart(2, '0')}h</div>`;
  html += '<div class="ag-time-pied"></div></div><div class="ag-days-wrap">';
  days.forEach(d => {
    const dStr = ymd(d);
    const isToday = dStr === today;
    const dn = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const dayHours = getDayHours(dayKeyFromDate(d));
    const fermetureJour = DB.availability.closedDates.find(cd => cd.date === dStr);
    const isClosed = !!fermetureJour || !dayHours;
    const openMin = !isClosed ? toMin(dayHours.start) : null;
    const closeMin = !isClosed ? toMin(dayHours.end) : null;
    // En tête de colonne : clients du jour à gauche, ce que la journée rapporte à droite.
    const rdvJour = DB.appointments.filter(a => a.date === dStr && a.status !== 'cancelled' && a.status !== 'noshow');
    const caJour = rdvJour.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
    const gauche = `<span class="ag-day-nb${rdvJour.length ? '' : ' vide'}" title="${rdvJour.length} client${rdvJour.length > 1 ? 's' : ''} ce jour"><i class="ti ti-user"></i>${rdvJour.length || '—'}</span>`;
    const droite = `<span class="ag-day-ca${caJour ? '' : ' vide'}" title="Chiffre d'affaires prévu ce jour">${caJour ? fmtMoney(caJour) : '—'}</span>`;
    let colCls = isToday ? ' today-col' : '';
    if (isClosed) colCls += ' ag-day-closed';
    html += `<div class="ag-day-col${colCls}" data-date="${dStr}">`;
    const label = `<span class="ag-day-label"><span class="ag-day-date">${dayNames[dn]}<span class="num">${d.getDate()}</span></span></span>`;
    const action = agView === 'week' ? `onclick="agOpenDay('${dStr}')" title="Voir ce jour"` : '';
    html += `<div class="ag-day-h ${isToday ? 'today' : ''}" ${action}>${gauche}${label}${droite}</div>`;
    for (let h = start; h <= end; h++) {
      for (const mn of [0, 15, 30, 45]) {
        const t = h * 60 + mn;
        const off = isClosed || t < openMin || t >= closeMin;
        html += `<div class="ag-hour ag-half${(mn === 15 || mn === 45) ? ' ag-half-30' : ''}${off ? ' ag-off' : ''}" data-hour="${h}" data-min="${mn}" onclick="quickCreateRdv('${dStr}','${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}')"></div>`;
      }
    }
    getTimeBlocks(dStr).forEach(b => {
      const gridStart = start * 60, gridEnd = (end + 1) * 60;
      const r = tbRange(b);
      if (r.end <= gridStart || r.start >= gridEnd) return;
      const haut = Math.max(r.start, gridStart) - gridStart;
      const hauteur = Math.max(20, Math.min(r.end, gridEnd) - Math.max(r.start, gridStart) - 2);
      html += `<div class="ag-block-reel" style="top:calc(${haut}px + var(--ag-header-h));height:${hauteur}px" title="${esc(tbLabel(b))}">`
        + `<i class="ti ${tbIcone(b.reason)}"></i><span class="ag-block-h">${esc(b.start)}</span><span>${esc(b.reason)}</span></div>`;
    });
    DB.appointments.filter(a => a.date === dStr && a.status !== 'cancelled').forEach(a => {
      const [h, m] = a.time.split(':').map(Number);
      if (h < start || h > end) return;
      const top = `calc(${(h - start) * 60 + m}px + var(--ag-header-h))`;
      const height = Math.max(28, ((a.duration || 30) / 60) * 60 - 4);
      const absent = a.status === 'noshow'
        ? '<span class="ag-appt-pay unpaid"><i class="ti ti-user-x"></i><span class="lbl">Absent</span></span>' : '';
      html += `<div class="ag-appt ${svcClassFor(a.service)}${height < 44 ? ' ag-appt-compact' : ''}" data-id="${a.id}" draggable="true" style="top:${top};height:${height}px" onclick="event.stopPropagation();openEditRdv('${a.id}')">
        <div class="ag-appt-row"><span class="ag-appt-time">${a.time}</span><span class="ag-appt-name">${esc(a.clientName || 'Client')}</span>${absent}</div>
        <div class="ag-appt-svc">${esc(a.service || '')}</div>
      </div>`;
    });
    if (isToday) {
      const now = new Date();
      if (now.getHours() >= start && now.getHours() <= end) {
        html += `<div class="ag-now-line" style="top:calc(${(now.getHours() - start) * 60 + now.getMinutes()}px + var(--ag-header-h))"></div>`;
      }
    }
    html += `<div class="ag-day-pied" onclick="event.stopPropagation();gererJour('${dStr}')" title="Gérer ce jour"><i class="ti ti-settings-2"></i><span class="lbl">Gérer</span></div>`;
    if (isClosed && agView === 'week') {
      html += `<div class="ag-closed-overlay" onclick="gererJour('${dStr}')"><span class="ag-closed-label">${fermetureJour ? 'Bloqué' : 'Fermé'}</span></div>`;
    }
    html += '</div>';
  });
  html += '</div></div>';
  document.getElementById('ag-container').innerHTML = html;
  initAgendaDnD();
}

/* ── Fermer / rouvrir un jour ── */
async function gererJour(dStr) {
  const fermeture = DB.availability.closedDates.find(cd => cd.date === dStr);
  const libelle = new Date(dStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  try {
    if (fermeture) {
      if (!await confirmer(`Rouvrir le ${libelle} ? Ta page de réservation le proposera de nouveau.`)) return;
      await api('DELETE', '/api/fermetures/' + fermeture.id);
      toast('Jour rouvert ✓', 'success');
    } else {
      if (!getDayHours(dayKeyFromDate(dStr))) { toast('Ce jour est fermé dans tes horaires habituels.', 'warning'); return; }
      if (!await confirmer(`Bloquer le ${libelle} ? Plus personne ne pourra réserver ce jour-là. Les RDV déjà pris restent.`)) return;
      await api('POST', '/api/fermetures', { date: dStr, motif: 'Jour bloqué' });
      toast('Jour bloqué ✓', 'success');
    }
    await chargerReglages();
    renderAgenda();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

/* ── Glisser-déposer (souris et appui long), repris du dashboard FCUTZ ── */
async function deplacerRdv(appt, newDate, newTime) {
  if (appt.date === newDate && appt.time === newTime) { renderAgenda(); return; }
  const [y, m, j] = newDate.split('-');
  if (!await confirmer(`Déplacer le RDV de ${appt.clientName || 'Client'} au ${j}/${m}/${y} à ${newTime} ?`)) { renderAgenda(); return; }
  try {
    let forcer = false;
    if (hasConflict(newDate, newTime, appt.duration || 30, appt.id)) {
      if (!await confirmer('Ce créneau chevauche un autre RDV. Déplacer quand même ?')) { renderAgenda(); return; }
      forcer = true;
    }
    const r = await api('PATCH', '/api/rdv/' + appt.id, { date: newDate, heure: newTime, forcer });
    remplacerAppt(r.rdv);
    toast('RDV déplacé ✓', 'success');
  } catch (e) { toast(messageErreur(e), 'danger'); }
  renderAgenda();
}

function initAgendaDnD() {
  let dragId = null, dragGhost = null;
  const retirerFantome = () => {
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
    document.querySelectorAll('.ag-hour.drag-over').forEach(h => h.classList.remove('drag-over'));
  };
  const heureDe = cell => String(cell.dataset.hour).padStart(2, '0') + ':' + String(cell.dataset.min || '0').padStart(2, '0');
  document.querySelectorAll('.ag-appt[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => { dragId = el.dataset.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); retirerFantome(); });
  });
  document.querySelectorAll('.ag-hour').forEach(cell => {
    cell.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const appt = dragId && DB.appointments.find(a => a.id === dragId);
      if (!appt) return;
      retirerFantome();
      const col = cell.closest('.ag-day-col');
      dragGhost = document.createElement('div');
      dragGhost.className = 'ag-appt ag-drag-ghost ' + svcClassFor(appt.service);
      dragGhost.style.cssText = `top:${cell.offsetTop}px;height:${Math.max(28, (appt.duration || 30) - 4)}px;pointer-events:none;`;
      dragGhost.innerHTML = `<div class="ag-appt-time">${heureDe(cell)}</div><div class="ag-appt-name">${esc(appt.clientName || 'Client')}</div>`;
      col.appendChild(dragGhost);
    });
    cell.addEventListener('dragleave', e => { if (!e.relatedTarget || !e.relatedTarget.closest('.ag-day-col')) retirerFantome(); });
    cell.addEventListener('drop', e => {
      e.preventDefault();
      retirerFantome();
      const appt = dragId && DB.appointments.find(a => a.id === dragId);
      dragId = null;
      if (appt) deplacerRdv(appt, cell.closest('.ag-day-col').dataset.date, heureDe(cell));
    });
  });
  // Mobile : appui long (350 ms) pour déplacer ; un glissé immédiat reste un défilement.
  let touchId = null, touchClone = null, touchOrigin = null, touchTimer = null, touchXY = null, touchDrag = false;
  const annuler = () => {
    clearTimeout(touchTimer); touchTimer = null;
    if (touchOrigin) touchOrigin.style.opacity = '';
    if (touchClone) { touchClone.remove(); touchClone = null; }
    document.querySelectorAll('.ag-hour.drag-over').forEach(h => h.classList.remove('drag-over'));
    touchId = null; touchOrigin = null; touchDrag = false;
  };
  document.querySelectorAll('.ag-appt[draggable]').forEach(el => {
    el.addEventListener('touchstart', e => {
      const t = e.touches[0];
      touchXY = { x: t.clientX, y: t.clientY };
      touchOrigin = el; touchDrag = false;
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => {
        touchDrag = true;
        touchId = el.dataset.id;
        const r = el.getBoundingClientRect();
        touchClone = el.cloneNode(true);
        Object.assign(touchClone.style, { position: 'fixed', top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px', opacity: '.85', zIndex: '9999', pointerEvents: 'none', border: '2px solid var(--gold-0)', borderRadius: '8px' });
        document.body.appendChild(touchClone);
        el.style.opacity = '.25';
        if (navigator.vibrate) navigator.vibrate(30);
      }, 350);
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (!touchDrag) {
        if (touchXY && Math.hypot(t.clientX - touchXY.x, t.clientY - touchXY.y) > 8) { clearTimeout(touchTimer); touchTimer = null; }
        return;
      }
      e.preventDefault();
      touchClone.style.top = (t.clientY - 24) + 'px';
      touchClone.style.left = (t.clientX - touchClone.offsetWidth / 2) + 'px';
      const scroller = [document.querySelector('.main'), document.body, document.scrollingElement].find(x => x && x.scrollHeight > x.clientHeight + 4);
      if (scroller) {
        if (t.clientY < 140) scroller.scrollBy(0, -14);
        else if (t.clientY > window.innerHeight - 120) scroller.scrollBy(0, 14);
      }
      document.querySelectorAll('.ag-hour.drag-over').forEach(h => h.classList.remove('drag-over'));
      const sous = document.elementFromPoint(t.clientX, t.clientY);
      if (sous && sous.closest('.ag-hour')) sous.closest('.ag-hour').classList.add('drag-over');
    }, { passive: false });
    el.addEventListener('touchend', e => {
      clearTimeout(touchTimer); touchTimer = null;
      if (!touchDrag) { touchOrigin = null; return; }
      const t = e.changedTouches[0];
      const id = touchId;
      annuler();
      const sous = document.elementFromPoint(t.clientX, t.clientY);
      const cell = sous && sous.closest('.ag-hour');
      const appt = id && DB.appointments.find(a => a.id === id);
      if (cell && appt) deplacerRdv(appt, cell.closest('.ag-day-col').dataset.date, heureDe(cell));
      else renderAgenda();
    });
    el.addEventListener('touchcancel', annuler);
  });
}

/* ── Roue des heures (reprise telle quelle du dashboard FCUTZ) ── */
const HEURE_DEB = 7, HEURE_FIN = 23;
const ROUE_CRAN = 38;
const ROUE_ONCHANGE = {
  'rdv-time': () => rdvCheckConflict(),
  'rdv-edit-time': () => rdvEditCheckConflict(),
};
function cransHeures(valeur) {
  const crans = [];
  for (let h = HEURE_DEB; h < HEURE_FIN; h++) for (let m = 0; m < 60; m += 15) crans.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  if (valeur && !crans.includes(valeur)) { crans.push(valeur); crans.sort(); }
  return crans;
}
function remplirHeures(id, valeur) {
  const piste = document.getElementById(id + '-piste');
  if (!piste || !document.getElementById(id)) return;
  const crans = cransHeures(valeur);
  piste.innerHTML = crans.map(t => `<div class="roue-cran" data-t="${t}">${t}</div>`).join('');
  majHeure(id, valeur || '', false);
  const roue = document.getElementById(id + '-roue');
  if (!roue) return;
  const idx = crans.indexOf(valeur);
  roue.scrollTop = idx >= 0 ? idx * ROUE_CRAN : 0;
  if (!roue.dataset.lie) {
    roue.dataset.lie = '1';
    let t;
    roue.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const el = piste.children[Math.round(roue.scrollTop / ROUE_CRAN)];
        if (el) majHeure(id, el.dataset.t, true);
      }, 90);
    }, { passive: true });
  }
}
function majHeure(id, valeur, prevenir) {
  const champ = document.getElementById(id);
  const txt = document.getElementById(id + '-txt');
  const piste = document.getElementById(id + '-piste');
  const avant = champ.value;
  champ.value = valeur;
  if (txt) txt.textContent = valeur || '—';
  if (piste) [...piste.children].forEach(el => el.classList.toggle('sel', el.dataset.t === valeur));
  if (prevenir && valeur !== avant && ROUE_ONCHANGE[id]) ROUE_ONCHANGE[id]();
}
function basculerRoue(id) {
  const wrap = document.getElementById(id + '-wrap');
  const btn = document.getElementById(id + '-btn');
  if (!wrap) return;
  const ouvre = wrap.hidden;
  document.querySelectorAll('.roue-wrap').forEach(w => { w.hidden = true; });
  document.querySelectorAll('.heure-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
  wrap.hidden = !ouvre;
  if (btn) btn.setAttribute('aria-expanded', String(ouvre));
  if (ouvre) {
    const roue = document.getElementById(id + '-roue');
    const sel = document.querySelector('#' + id + '-piste .roue-cran.sel');
    if (roue && sel) roue.scrollTop = [...sel.parentElement.children].indexOf(sel) * ROUE_CRAN;
  }
}

/* ── Fenêtre « Nouveau RDV » ── */
function prestationChoisie(selId) {
  return SERVICES.find(s => s.id === document.getElementById(selId).value) || null;
}
function populateServiceSelect(selId) {
  document.getElementById(selId).innerHTML = SERVICES.map(s =>
    `<option value="${esc(s.id)}">${esc(s.name)} · ${s.price} €</option>`).join('');
}
function quickCreateRdv(date, time) {
  resetRdvModal();
  document.getElementById('rdv-date').value = date;
  remplirHeures('rdv-time', time);
  openModal('modal-rdv-new');
}
function resetRdvModal() {
  ['rdv-date', 'rdv-client', 'rdv-phone', 'rdv-note'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('rdv-time').value = '';
  document.getElementById('rdv-client-id').value = '';
  document.getElementById('rdv-client-suggestions').style.display = 'none';
  document.getElementById('rdv-conflict').classList.add('hidden');
}
A_L_OUVERTURE['modal-rdv-new'] = async () => {
  if (!SERVICES.length) { try { await chargerReglages(); } catch (e) { toast(messageErreur(e), 'danger'); } }
  if (!SERVICES.length) { toast("Ajoute d'abord une prestation.", 'warning'); closeModal('modal-rdv-new'); return; }
  populateServiceSelect('rdv-service');
  if (!document.getElementById('rdv-date').value) proposeNextRdvSlot();
  else if (!document.getElementById('rdv-time').value) rdvAutoFillTime();
  rdvCheckConflict();
};

// Premier créneau libre du jour choisi, par pas de 15 min ; au-delà de la
// fermeture si la journée est pleine (un client en plus reste possible).
function rdvAutoFillTime(quiet) {
  const date = document.getElementById('rdv-date').value;
  if (!date) return false;
  const p = prestationChoisie('rdv-service');
  const dur = p ? p.duration : 30;
  const hours = getDayHours(dayKeyFromDate(date));
  if (!hours || DB.availability.closedDates.some(cd => cd.date === date)) {
    remplirHeures('rdv-time', '');
    if (!quiet) toast('Jour fermé : choisis une autre date', 'warning');
    return false;
  }
  let cursor = toMin(hours.start);
  if (date === TODAY()) cursor = Math.max(cursor, toMin(NOW_HHMM()));
  if (cursor % 15) cursor += 15 - cursor % 15;
  for (; cursor + dur <= 24 * 60; cursor += 15) {
    const candidat = tbFromMin(cursor);
    if (!hasConflict(date, candidat, dur, null) && !isTimeBlocked(date, candidat, dur)) {
      remplirHeures('rdv-time', candidat);
      rdvCheckConflict();
      return true;
    }
  }
  remplirHeures('rdv-time', '');
  if (!quiet) toast('Aucun créneau libre ce jour-là', 'warning');
  return false;
}
function proposeNextRdvSlot() {
  const d = new Date();
  for (let i = 0; i < 30; i++, d.setDate(d.getDate() + 1)) {
    const dStr = ymd(d);
    if (getDayHours(dayKeyFromDate(d)) && !DB.availability.closedDates.some(cd => cd.date === dStr)) {
      document.getElementById('rdv-date').value = dStr;
      if (rdvAutoFillTime(true)) return true;
    }
  }
  document.getElementById('rdv-date').value = '';
  return false;
}
function libelleConflit(date, time, dur, id) {
  if (hasConflict(date, time, dur, id)) return 'Ce créneau chevauche un autre RDV';
  const s = toMin(time), e = s + dur;
  const b = getTimeBlocks(date).find(x => { const r = tbRange(x); return s < r.end && e > r.start; });
  return b ? `${b.reason} de ${b.start} à ${b.end}` : '';
}
function rdvCheckConflict() {
  const date = document.getElementById('rdv-date').value, time = document.getElementById('rdv-time').value;
  const p = prestationChoisie('rdv-service');
  const txt = date && time && p ? libelleConflit(date, time, p.duration, null) : '';
  document.getElementById('rdv-conflict-txt').textContent = txt;
  document.getElementById('rdv-conflict').classList.toggle('hidden', !txt);
}

/* Recherche de client : une fiche existante ou un nouveau nom. */
function filterClientsForRdv() {
  document.getElementById('rdv-client-id').value = '';
  const q = document.getElementById('rdv-client').value.trim().toLowerCase();
  const box = document.getElementById('rdv-client-suggestions');
  const trouves = q ? DB.clients.filter(c => c.nom.toLowerCase().includes(q) || (c.telephone || '').includes(q)).slice(0, 5) : [];
  if (!trouves.length) { box.style.display = 'none'; return; }
  box.innerHTML = trouves.map(c => `<div class="autocomplete-item" onclick="selectClientForRdv('${esc(c.id)}')">
      <span class="ac-nom">${esc(c.nom)}</span><span class="ac-visites">${c.visites} visite${c.visites !== 1 ? 's' : ''}</span></div>`).join('');
  box.style.display = 'block';
}
function selectClientForRdv(id) {
  const c = DB.clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('rdv-client').value = c.nom;
  document.getElementById('rdv-client-id').value = c.id;
  document.getElementById('rdv-phone').value = c.telephone || '';
  document.getElementById('rdv-client-suggestions').style.display = 'none';
}
document.addEventListener('click', e => {
  const box = document.getElementById('rdv-client-suggestions');
  if (box && !box.contains(e.target) && e.target.id !== 'rdv-client') box.style.display = 'none';
});

async function saveNewRdv() {
  const date = document.getElementById('rdv-date').value;
  const time = document.getElementById('rdv-time').value;
  const p = prestationChoisie('rdv-service');
  const nom = document.getElementById('rdv-client').value.trim();
  const clientId = document.getElementById('rdv-client-id').value;
  if (!date || !time || !p) { toast('Date, heure et prestation requises', 'danger'); return; }
  if (!nom) { toast('Indique le nom du client', 'danger'); return; }
  let forcer = false;
  if (hasConflict(date, time, p.duration, null)) {
    if (!await confirmer('Ce créneau chevauche un autre RDV. Le créer quand même ?')) return;
    forcer = true;
  }
  try {
    const corps = { prestation_id: p.id, date, heure: time, note: document.getElementById('rdv-note').value.trim(), forcer };
    if (clientId) corps.client_id = clientId;
    else Object.assign(corps, { client_nom: nom, telephone: document.getElementById('rdv-phone').value.trim() });
    const r = await api('POST', '/api/rdv', corps);
    remplacerAppt(r.rdv);
    if (!clientId) chargerClients().catch(() => {});
    toast('Rendez-vous créé ✓', 'success');
    closeModal('modal-rdv-new');
    renderAgenda();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

/* ── Fenêtre « Modifier le RDV » ── */
function openEditRdv(id) {
  const a = DB.appointments.find(x => x.id === id);
  if (!a) return;
  document.getElementById('rdv-edit-id').value = a.id;
  document.getElementById('rdv-edit-client').value = a.clientName || '';
  document.getElementById('rdv-edit-date').value = a.date;
  remplirHeures('rdv-edit-time', a.time);
  populateServiceSelect('rdv-edit-service');
  // Une prestation désactivée depuis reste proposée pour ce RDV.
  const sel = document.getElementById('rdv-edit-service');
  if (!SERVICES.some(s => s.id === a.prestationId)) {
    sel.insertAdjacentHTML('afterbegin', `<option value="${esc(a.prestationId || '')}">${esc(a.service)} · ${a.price} €</option>`);
  }
  sel.value = a.prestationId || '';
  document.getElementById('rdv-edit-status').value = a.status;
  document.getElementById('rdv-edit-note').value = a.note || '';
  document.getElementById('rdv-edit-conflict').classList.add('hidden');
  const contact = document.getElementById('rdv-edit-contact');
  if (a.phone) {
    document.getElementById('rdv-edit-call').href = 'tel:' + a.phone;
    document.getElementById('rdv-edit-sms').href = 'sms:' + a.phone;
    contact.classList.remove('hidden');
  } else contact.classList.add('hidden');
  const source = document.getElementById('rdv-edit-source');
  source.textContent = a.source === 'site' ? 'Réservé sur ta page' : '';
  source.hidden = a.source !== 'site';
  openModal('modal-rdv-edit');
}
function dureeEdit() {
  const id = document.getElementById('rdv-edit-id').value;
  const p = prestationChoisie('rdv-edit-service');
  return p ? p.duration : (DB.appointments.find(a => a.id === id) || {}).duration || 30;
}
function rdvEditCheckConflict() {
  const date = document.getElementById('rdv-edit-date').value, time = document.getElementById('rdv-edit-time').value;
  if (!date || !time) return;
  const txt = libelleConflit(date, time, dureeEdit(), document.getElementById('rdv-edit-id').value);
  document.getElementById('rdv-edit-conflict-txt').textContent = txt;
  document.getElementById('rdv-edit-conflict').classList.toggle('hidden', !txt);
}
async function saveEditRdv() {
  const id = document.getElementById('rdv-edit-id').value;
  const a = DB.appointments.find(x => x.id === id);
  if (!a) return;
  const date = document.getElementById('rdv-edit-date').value;
  const time = document.getElementById('rdv-edit-time').value;
  const status = document.getElementById('rdv-edit-status').value;
  let forcer = false;
  if (status === 'confirmed' && hasConflict(date, time, dureeEdit(), id)) {
    if (!await confirmer('Ce créneau chevauche un autre RDV. Enregistrer quand même ?')) return;
    forcer = true;
  }
  try {
    const r = await api('PATCH', '/api/rdv/' + id, {
      date, heure: time, statut: STATUT_VERS_API[status], forcer,
      prestation_id: document.getElementById('rdv-edit-service').value || undefined,
      client_nom: document.getElementById('rdv-edit-client').value.trim() || undefined,
      note: document.getElementById('rdv-edit-note').value.trim(),
    });
    remplacerAppt(r.rdv);
    toast('RDV mis à jour ✓', 'success');
    closeModal('modal-rdv-edit');
    renderAgenda();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}
async function annulerRdv() {
  const id = document.getElementById('rdv-edit-id').value;
  if (!await confirmer('Annuler ce rendez-vous ? Le créneau se libère sur ta page de réservation.')) return;
  try {
    const r = await api('PATCH', '/api/rdv/' + id, { statut: 'annule' });
    remplacerAppt(r.rdv);
    toast('RDV annulé', 'success');
    closeModal('modal-rdv-edit');
    renderAgenda();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}
