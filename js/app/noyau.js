/* ── TrimSync : noyau de l'app barbier ──
   Session, appels à l'API, navigation, fenêtres et messages. Les pages
   (agenda.js…) ne parlent au serveur que par api(). Contrairement au
   dashboard FCUTZ, rien n'est gardé dans localStorage à part le jeton : deux
   salons peuvent se connecter l'un après l'autre sur le même téléphone, et
   aucun ne doit voir ce que l'autre a laissé en cache. */

const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? (localStorage.getItem('ts_api') || 'http://localhost:3998')
  : 'https://trimsync-production.up.railway.app';
const CLE_JETON = 'ts_jeton';

let SESSION = null; // { email, email_verifie, salon }

/* ── Petits outils (repris du dashboard FCUTZ) ── */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = () => ymd(new Date());
const NOW_HHMM = () => new Date().toTimeString().slice(0, 5);
function toMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function fmtMoney(n) { return Math.ceil(parseFloat(n) || 0).toLocaleString('fr-FR') + ' €'; }

/* ── Appels à l'API ── */
class ErreurApi extends Error {
  constructor(statut, corps) {
    super((corps && corps.error) || 'Erreur réseau');
    this.statut = statut;
    this.corps = corps || {};
  }
}

async function api(methode, chemin, corps) {
  const jeton = localStorage.getItem(CLE_JETON);
  let r;
  try {
    r = await fetch(API + chemin, {
      method: methode,
      headers: { 'content-type': 'application/json', ...(jeton ? { authorization: 'Bearer ' + jeton } : {}) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch (e) {
    throw new ErreurApi(0, { error: 'Pas de connexion au serveur, réessaie dans un instant.' });
  }
  let d = null;
  try { d = await r.json(); } catch (_) {}
  if (r.status === 401 && jeton) { deconnecter(); throw new ErreurApi(401, { error: 'Session expirée, reconnecte-toi.' }); }
  if (!r.ok) throw new ErreurApi(r.status, d);
  return d;
}

// Message à montrer pour une erreur d'API ; l'essai terminé a le sien.
function messageErreur(e) {
  if (e && e.statut === 402) return 'Ton essai est terminé : ton agenda est en lecture seule. Réponds à mon email pour choisir ton plan.';
  return (e && e.message) || 'Erreur inattendue';
}

/* ── Toasts, confirmations, fenêtres (repris du dashboard FCUTZ) ── */
function toast(msg, type) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('dismiss'); setTimeout(() => el.remove(), 220); }, 3000);
}

function showConfirm(msg, onOk, onCancel) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `<div style="background:var(--ink-2);border:1px solid rgba(var(--accent-rgb),.18);border-radius:16px;padding:24px 20px;max-width:320px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.6)">
    <p style="margin:0 0 20px;color:var(--marble-0);font-size:15px;line-height:1.5">${esc(msg)}</p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button data-r="non" style="padding:9px 18px;border-radius:10px;border:1px solid rgba(var(--accent-rgb),.18);background:transparent;color:var(--marble-0);cursor:pointer;font-size:14px">Annuler</button>
      <button data-r="oui" style="padding:9px 18px;border-radius:10px;border:none;background:var(--gold-0);color:#000;cursor:pointer;font-size:14px;font-weight:700">Confirmer</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const fermer = () => overlay.remove();
  overlay.querySelector('[data-r="oui"]').onclick = () => { fermer(); onOk && onOk(); };
  overlay.querySelector('[data-r="non"]').onclick = () => { fermer(); onCancel && onCancel(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) { fermer(); onCancel && onCancel(); } });
}
const confirmer = msg => new Promise(ok => showConfirm(msg, () => ok(true), () => ok(false)));

// Chaque page peut réagir à l'ouverture d'une de ses fenêtres.
const A_L_OUVERTURE = {};
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  if (A_L_OUVERTURE[id]) A_L_OUVERTURE[id]();
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

/* ── Navigation ── */
const PAGES = {
  agenda: { titre: 'Agenda', sous: 'Visualise et organise tes créneaux', rendu: () => renderAgenda() },
};
function nav(id) {
  if (!PAGES[id]) return;
  document.querySelectorAll('.modal-bg').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.toggle('active', t.dataset.page === id));
  document.getElementById('topbar-title').textContent = PAGES[id].titre;
  document.getElementById('topbar-sub').textContent = PAGES[id].sous;
  if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
  PAGES[id].rendu();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const burger = document.getElementById('burger');
  const bd = document.getElementById('sidebar-backdrop');
  const ouvert = sidebar.classList.toggle('open');
  burger.classList.toggle('is-open', ouvert);
  if (!bd) return;
  if (ouvert) {
    bd.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => bd.classList.add('visible')));
  } else {
    bd.classList.remove('visible');
    setTimeout(() => { bd.style.display = 'none'; }, 380);
  }
}

/* ── Session ── */
function afficherSalon() {
  const s = SESSION.salon;
  document.getElementById('barber-name').textContent = s.nom;
  document.getElementById('barber-initials').textContent =
    s.nom.split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join('').toUpperCase() || 'TS';
  const essai = document.getElementById('essai-pastille');
  if (s.statut === 'essai') {
    essai.textContent = `Essai gratuit : ${s.jours_essai_restants} jour${s.jours_essai_restants > 1 ? 's' : ''} restant${s.jours_essai_restants > 1 ? 's' : ''}`;
    essai.className = 'essai-pastille' + (s.jours_essai_restants <= 7 ? ' alerte' : '');
    essai.hidden = false;
  } else if (s.statut === 'expire' || s.statut === 'suspendu') {
    essai.textContent = 'Essai terminé : agenda en lecture seule';
    essai.className = 'essai-pastille alerte';
    essai.hidden = false;
  } else {
    essai.hidden = true;
  }
}

async function ouvrirSession() {
  SESSION = await api('GET', '/api/moi');
  document.body.classList.remove('hors-session');
  window.scrollTo(0, 0);
  afficherSalon();
  nav('agenda');
}

function deconnecter() {
  localStorage.removeItem(CLE_JETON);
  SESSION = null;
  document.body.classList.add('hors-session');
  cxOnglet('connexion');
}

/* ── Écran de connexion / inscription ── */
function cxOnglet(nom) {
  document.querySelectorAll('.cx-onglets .tab').forEach(t => t.classList.toggle('active', t.dataset.onglet === nom));
  document.querySelectorAll('.cx-form').forEach(f => { f.hidden = f.dataset.onglet !== nom; });
  document.querySelectorAll('.cx-erreur').forEach(e => { e.textContent = ''; });
}

function valeur(id) { return (document.getElementById(id).value || '').trim(); }

async function cxConnexion(e) {
  e.preventDefault();
  const err = document.getElementById('cx-erreur-connexion');
  err.textContent = '';
  try {
    const r = await api('POST', '/api/comptes/connexion', { email: valeur('cx-email'), mdp: document.getElementById('cx-mdp').value });
    localStorage.setItem(CLE_JETON, r.jeton);
    await ouvrirSession();
  } catch (x) { err.textContent = messageErreur(x); }
}

async function cxInscription(e) {
  e.preventDefault();
  const err = document.getElementById('cx-erreur-inscription');
  err.textContent = '';
  try {
    const r = await api('POST', '/api/comptes/inscription', {
      email: valeur('cx-i-email'), mdp: document.getElementById('cx-i-mdp').value,
      salon: valeur('cx-i-salon'), ville: valeur('cx-i-ville'), telephone: valeur('cx-i-tel'),
      consentement: document.getElementById('cx-i-consent').checked,
    });
    localStorage.setItem(CLE_JETON, r.jeton);
    await ouvrirSession();
    toast('Bienvenue ! Ton salon est prêt, 30 jours offerts.', 'success');
  } catch (x) { err.textContent = messageErreur(x); }
}

async function cxOubli() {
  const email = valeur('cx-email');
  const err = document.getElementById('cx-erreur-connexion');
  if (!email) { err.textContent = "Écris d'abord ton email ci-dessus."; return; }
  try {
    await api('POST', '/api/comptes/mot-de-passe-oublie', { email });
    err.textContent = '';
    toast('Si ce compte existe, un lien vient de partir par email.', 'success');
  } catch (x) { err.textContent = messageErreur(x); }
}

// Liens reçus par email : /app?verifier=… ou /app?reset=…
async function traiterLienEmail() {
  const p = new URLSearchParams(location.search);
  const nettoyer = () => history.replaceState(null, '', location.pathname);
  if (p.get('verifier')) {
    try { await api('POST', '/api/comptes/verifier', { jeton: p.get('verifier') }); toast('Adresse email confirmée ✓', 'success'); }
    catch (x) { toast(messageErreur(x), 'danger'); }
    nettoyer();
  } else if (p.get('reset')) {
    const mdp = prompt('Choisis un nouveau mot de passe (8 caractères minimum) :');
    if (mdp) {
      try { await api('POST', '/api/comptes/reinitialiser', { jeton: p.get('reset'), mdp }); toast('Mot de passe changé, connecte-toi.', 'success'); }
      catch (x) { toast(messageErreur(x), 'danger'); }
    }
    nettoyer();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  cxOnglet(location.hash === '#inscription' ? 'inscription' : 'connexion');
  await traiterLienEmail();
  if (!localStorage.getItem(CLE_JETON)) return;
  try { await ouvrirSession(); } catch (x) { if (x.statut !== 401) toast(messageErreur(x), 'danger'); }
});
