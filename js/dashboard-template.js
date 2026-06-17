/* ═══════════════════════════════════════════════════════════
   TRIMSYNC DASHBOARD TEMPLATE — Logic v1.0
   Basé sur FCUTZ Dashboard v2.1 — adapté multi-tenant
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─── CONFIG TRIMSYNC ────────────────────────────────────────
const APP_VERSION = '1.0.0';
// URL du backend TrimSync (Railway séparé de FCUTZ)
const BACKEND_URL = 'https://trimsync-backend.up.railway.app';
const DB_KEY      = 'trimsync_db_v1';
const SESSION_KEY = 'trimsync_session';

// ─── CONFIG SUPABASE ────────────────────────────────────────
// Pour le déploiement : injecter ces valeurs via window.__TRIMSYNC_*
const SUPABASE_URL      = window.__TRIMSYNC_SUPABASE_URL  || 'https://bmjklldadhquuseokqvw.supabase.co';
const SUPABASE_ANON_KEY = window.__TRIMSYNC_SUPABASE_ANON || 'sb_publishable_78xHFEipuoaSkV3MGEMYKQ_txvR8BQB';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── ÉTAT AUTH ──────────────────────────────────────────────
let _currentUser   = null; // objet Supabase User
let _salonId       = null; // UUID du salon lié au user
let _salonPlan     = 'starter'; // 'starter' | 'pro' | 'max'
let _supabaseToken = null; // JWT envoyé dans Authorization

// ─── HELPERS AUTH ───────────────────────────────────────────
function isUnlocked(){ return !!_currentUser; }
function unlock(){}   // no-op — remplacé par doLogin()

/* Connexion email/password Supabase — appelée par le bouton du modal-login */
async function doLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-password').value;
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>Connexion…';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });
  if(error){
    errEl.textContent = error.message === 'Invalid login credentials'
      ? 'Email ou mot de passe incorrect.' : error.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i>Se connecter';
    return;
  }
  await _bootAfterAuth(data.session);
}

/* Démarrage de l'app après connexion ou restauration de session */
async function _bootAfterAuth(session){
  _supabaseToken = session.access_token;
  _currentUser   = session.user;
  const m = document.getElementById('modal-login');
  if(m) m.classList.remove('open');
  await initSalon();
  _startApp();
}

/* Récupère /api/me et personnalise tout le DOM avec les données du salon */
async function initSalon(){
  try{
    const res = await fetch(`${BACKEND_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${_supabaseToken}` }
    });
    if(!res.ok) throw new Error(`/api/me ${res.status}`);
    const salon = await res.json();
    _salonId   = salon.salon_id;
    _salonPlan = salon.plan || 'starter';

    // Substitution du titre de page
    document.title = salon.name + ' — Dashboard';

    // Remplacement dans le DOM
    ['sidebar-salon-name','barber-name'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.textContent = salon.name;
    });
    const topbarName = document.getElementById('topbar-name');
    if(topbarName) topbarName.textContent = salon.name;

    const initMark = document.getElementById('sidebar-logo-mark');
    if(initMark) initMark.textContent = salon.name.slice(0,1).toUpperCase();
    const initEl = document.getElementById('barber-initials');
    if(initEl) initEl.textContent = salon.name.slice(0,2).toUpperCase();

    // Logo image si logo_url défini
    if(salon.logo_url){
      ['sidebar-logo-img','login-logo-img'].forEach(id => {
        const img = document.getElementById(id);
        if(img){ img.src = salon.logo_url; img.style.display = 'block'; }
      });
      ['sidebar-logo-mark','login-logo-mark'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
      });
    }

    applyPlanGating(_salonPlan);
  }catch(e){
    console.error('[TrimSync] initSalon error', e);
  }
}

/* Griser les items nav non accessibles selon le plan du salon */
function applyPlanGating(plan){
  const rank = { starter: 0, pro: 1, max: 2 };
  const required = { pro: 1, max: 2 };
  document.querySelectorAll('[data-plan]').forEach(el => {
    const needed = required[el.dataset.plan] ?? 0;
    if((rank[plan] ?? 0) < needed){
      el.style.opacity = '0.35';
      el.style.pointerEvents = 'none';
      el.title = `Disponible à partir du plan ${el.dataset.plan.toUpperCase()}`;
      if(!el.querySelector('.plan-badge')){
        const badge = document.createElement('span');
        badge.className = 'plan-badge';
        badge.textContent = el.dataset.plan.toUpperCase();
        badge.style.cssText = 'margin-left:auto;font-size:9px;font-weight:700;letter-spacing:.5px;padding:2px 6px;border-radius:20px;background:rgba(0,196,180,.18);color:#00c4b4';
        el.appendChild(badge);
      }
    }
  });
}

/* Démarre les routines de l'app (après auth réussie) */
function _startApp(){
  loadDB();
  syncFromBookings();
  renderNotifs();
  nav('dashboard');
  syncFromBackend().then(() => {
    if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  });
  setInterval(() => { syncFromBookings(); syncFromBackend(); }, 20000);
}

// ─── COMPATIBILITÉ CODE EXISTANT ────────────────────────────
// Ces constantes gardent le code existant fonctionnel (PIN neutralisé)
const PIN_KEY      = 'ts_unused';
const PIN_DEFAULT  = '0000';
const FCUTZ_HEADER_KEY = 'unused';
const BIO_KEY      = 'ts_bio_unused';
const BIO_CRED_KEY = 'ts_bio_cred_unused';
const TODAY = () => new Date().toISOString().slice(0,10);
const NOW_HHMM = () => new Date().toTimeString().slice(0,5);

const DAY_KEYS = ['lun','mar','mer','jeu','ven','sam','dim'];
const DAY_LABELS = { lun:'Lundi', mar:'Mardi', mer:'Mercredi', jeu:'Jeudi', ven:'Vendredi', sam:'Samedi', dim:'Dimanche' };
const DAY_INDEX_TO_KEY = ['dim','lun','mar','mer','jeu','ven','sam']; // JS getDay()

// ─── SERVICES ───────────────────────────────────────────────
const SERVICES = [
  { id:'s1', name:'Coupe Simple',           price:15,   duration:30, cat:'coupe',   internal:false, img:'img/COUPE SIMPLE.png',   desc:'Dégradé net, finitions soignées' },
  { id:'s2', name:'Coupe Premium',          price:20,   duration:45, cat:'coupe',   internal:false, img:'img/COUPE PREMIUM.png',  desc:'Coupe complète haut de gamme' },
  { id:'s3', name:'Transformation',         price:20,   duration:45, cat:'transfo', internal:true,  img:'img/TRANSFORMATION.png', desc:'Changement de style complet' },
  { id:'s4', name:'Transfo (Via DM)',       price:25,   duration:45, cat:'transfo', internal:true,  img:'img/TRANSFORMATION.png', desc:'Transformation sur-mesure via Instagram' },
  { id:'s5', name:'Coupe Simple (Via DM)',  price:20,   duration:30, cat:'coupe',   internal:true,  img:'img/COUPE SIMPLE.png',   desc:'Coupe simple réservée via Instagram' },
];
const ADDONS = [
  { id:'a1', name:'+ Barbe',       price:5,    duration:15, img:'img/TRANSFORMATION.png' },
  { id:'a2', name:'+ Design',      price:5,    duration:15, img:'img/DESIGN.png' },
  { id:'a3', name:'Poudre DJIKS',  price:12,   duration:0,  img:'img/POUDRE.png' },
  { id:'a4', name:'Cannette',      price:1.5,  duration:0,  img:'img/CANNETTE.png' },
];

// ─── DEFAULT HOURS (per day) ───────────────────────────────
const DEFAULT_HOURS = {
  lun:{ open:true,  start:'09:00', end:'19:00' },
  mar:{ open:true,  start:'09:00', end:'19:00' },
  mer:{ open:true,  start:'09:00', end:'19:00' },
  jeu:{ open:true,  start:'09:00', end:'19:00' },
  ven:{ open:true,  start:'09:00', end:'19:00' },
  sam:{ open:true,  start:'10:00', end:'19:00' },
  dim:{ open:false, start:'10:00', end:'18:00' },
};

// ─── STATE ──────────────────────────────────────────────────
const DB = {
  clients: [],
  appointments: [],
  payments: [],
  notifications: [],
  stock: [],
  availability: {
    closedDates: [],
  },
  settings: {
    barberName: 'Fcutz',
    barberInitials: 'FC',
    objective: 5000,
    hours: JSON.parse(JSON.stringify(DEFAULT_HOURS)),
    sumupKey: 'sup_sk_1QpZccHb57ks7Ul0R66fjwRtbVfneGkR2',
    sumupMerchant: 'MK29GQN2',
    mktTemplates: {
      inactive: "Salut {prenom} ! Ça fait un bail qu'on s'est pas vus. Une coupe te tente ? 🪒 Réserve ici : https://fcutz.fr/booking",
      birthday: "🎉 Joyeux anniversaire {prenom} ! Pour fêter ça, on t'offre -15% sur ta prochaine coupe. À très vite chez FCUTZ ✂️",
      welcome:  "Merci pour ta visite {prenom} ! 🙏 N'hésite pas à revenir, on t'attend chez FCUTZ. Réserve quand tu veux : https://fcutz.fr/booking",
      vip:      "Salut {prenom}, en tant que client Or chez FCUTZ tu as accès aux créneaux prioritaires. Envoie-nous DM pour ton prochain RDV 👑",
    },
  },
};

// ─── CLEAR TEST DATA ────────────────────────────────────────
function clearTestAppointments(){
  if(DB.appointments && DB.appointments.length > 0){
    DB.appointments = [];
    saveDB();
  }
}

// ─── PHONE NORMALIZATION ────────────────────────────────────
function normalizePhone(p){
  if(!p) return '';
  return p.replace(/[\s\-\.\(\)]/g,'').replace(/^\+33/,'0');
}

// ─── DEDUPLICATION CLIENTS ──────────────────────────────────
function deduplicateClients(){
  const toRemove = new Set();
  const remap = new Map();

  function mergeGroup(group){
    if(group.length < 2) return;
    group.sort((a,b) => a.id.localeCompare(b.id));
    const keeper = group[0];
    for(const dup of group.slice(1)){
      if(toRemove.has(dup.id)) continue;
      keeper.visits = (keeper.visits||0) + (dup.visits||0);
      keeper.spent  = (keeper.spent||0)  + (dup.spent||0);
      if(!keeper.lastVisit||(dup.lastVisit&&dup.lastVisit>keeper.lastVisit)) keeper.lastVisit=dup.lastVisit;
      if(!keeper.phone && dup.phone) keeper.phone = dup.phone;
      if(!keeper.email && dup.email) keeper.email = dup.email;
      toRemove.add(dup.id);
      remap.set(dup.id, keeper.id);
    }
  }

  // 1. Dédup par téléphone
  const byPhone = new Map();
  for(const c of DB.clients){
    const np = normalizePhone(c.phone);
    if(!np) continue;
    if(!byPhone.has(np)) byPhone.set(np, []);
    byPhone.get(np).push(c);
  }
  for(const [, group] of byPhone) mergeGroup(group);

  // 2. Dédup par prénom+nom (clients sans phone ou phone différent)
  const byName = new Map();
  for(const c of DB.clients){
    if(toRemove.has(c.id)) continue;
    const key = `${(c.fname||'').toLowerCase().trim()}|${(c.lname||'').toLowerCase().trim()}`;
    if(!key || key === '|') continue;
    if(!byName.has(key)) byName.set(key, []);
    byName.get(key).push(c);
  }
  for(const [, group] of byName) mergeGroup(group);

  if(!toRemove.size) return 0;
  for(const a of DB.appointments){ if(a.clientId && remap.has(a.clientId)) a.clientId = remap.get(a.clientId); }
  for(const p of DB.payments){     if(p.clientId && remap.has(p.clientId)) p.clientId = remap.get(p.clientId); }
  DB.clients = DB.clients.filter(c => !toRemove.has(c.id));
  saveDB();
  return toRemove.size;
}

// ─── STORAGE ────────────────────────────────────────────────
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw){
      const p = JSON.parse(raw);
      Object.assign(DB, p);
      DB.clients ||= [];
      DB.appointments ||= [];
      DB.payments ||= [];
      DB.notifications ||= [];
      DB.stock ||= [];
      DB.availability ||= { closedDates: [] };
      const baseSettings = {
        barberName:'Fcutz', barberInitials:'FC', objective:5000,
        hours: JSON.parse(JSON.stringify(DEFAULT_HOURS)),
        sumupKey:'sup_sk_1QpZccHb57ks7Ul0R66fjwRtbVfneGkR2', sumupMerchant:'MK29GQN2',
        mktTemplates:{
          inactive: "Salut {prenom} ! Ça fait un bail qu'on s'est pas vus. Une coupe te tente ? 🪒 Réserve ici : https://fcutz.fr/booking",
          birthday: "🎉 Joyeux anniversaire {prenom} ! Pour fêter ça, on t'offre -15% sur ta prochaine coupe. À très vite chez FCUTZ ✂️",
          welcome:  "Merci pour ta visite {prenom} ! 🙏 N'hésite pas à revenir, on t'attend chez FCUTZ. Réserve quand tu veux : https://fcutz.fr/booking",
          vip:      "Salut {prenom}, en tant que client Or chez FCUTZ tu as accès aux créneaux prioritaires. Envoie-nous DM pour ton prochain RDV 👑",
        },
      };
      DB.settings = Object.assign(baseSettings, p.settings || {});
      // Migration : closedDays/openTime/closeTime → hours
      if(!DB.settings.hours || typeof DB.settings.hours !== 'object'){
        DB.settings.hours = JSON.parse(JSON.stringify(DEFAULT_HOURS));
      }
      if(p.settings && (p.settings.openTime || p.settings.closeTime || p.settings.closedDays)){
        const o = p.settings.openTime || '09:00';
        const c = p.settings.closeTime || '19:00';
        const closed = Array.isArray(p.settings.closedDays) ? p.settings.closedDays : [0];
        DAY_KEYS.forEach((k, i) => {
          // closedDays uses JS getDay() (0=dim,1=lun,...,6=sam)
          const jsDay = k === 'dim' ? 0 : DAY_KEYS.indexOf(k) + 1;
          DB.settings.hours[k] = DB.settings.hours[k] || {};
          DB.settings.hours[k].open = !closed.includes(jsDay);
          DB.settings.hours[k].start = DB.settings.hours[k].start || o;
          DB.settings.hours[k].end = DB.settings.hours[k].end || c;
        });
      }
      DB.settings.mktTemplates = Object.assign(baseSettings.mktTemplates, p.settings?.mktTemplates || {});
    }
  }catch(e){console.warn('loadDB error', e)}

  deduplicateClients();
  clearTestAppointments();

  if(!DB.stock.length){
    DB.stock = [
      { id:uid(), name:'Cire Mate', qty:8, threshold:3, price:15 },
      { id:uid(), name:'Huile à barbe', qty:5, threshold:3, price:18 },
      { id:uid(), name:'Poudre DJIKS', qty:12, threshold:5, price:12 },
      { id:uid(), name:'Cannettes', qty:24, threshold:10, price:1.5 },
    ];
    saveDB();
  }
}
function saveDB(){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch(e){ console.warn('saveDB error', e) }
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// ─── API CLIENT ─────────────────────────────────────────────
async function apiCall(method, path, body, signal){
  // Toutes les requêtes TrimSync portent le JWT Supabase + salon_id
  try{
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': _supabaseToken ? `Bearer ${_supabaseToken}` : ''
      }
    };
    // Injecter salon_id dans les requêtes POST/PUT
    if(body && _salonId) body = { ...body, salon_id: _salonId };
    if(body) opts.body = JSON.stringify(body);
    if(signal) opts.signal = signal;
    const r = await fetch(BACKEND_URL + path, opts);
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') ? await r.json() : await r.text();
  }catch(e){
    setBackendState(false);
    throw e;
  }
}
async function syncFromBackend(){
  try{
    const [appts, clients, pays, settings, avail] = await Promise.allSettled([
      apiCall('GET','/api/appointments'),
      apiCall('GET','/api/clients'),
      apiCall('GET','/api/payments'),
      apiCall('GET','/api/settings'),
      apiCall('GET','/api/availability'),
    ]);
    let hasChanges = false;
    if(appts.status==='fulfilled' && Array.isArray(appts.value)){
      const knownMap = new Map(DB.appointments.map(a => [a.id, a.status]));
      appts.value.forEach(a => {
        if(!knownMap.has(a.id)){
          if(a.source === 'booking') pushNotif('Nouvelle réservation', pushBodyFor(a), 'var(--info)', a.id);
          hasChanges = true;
        } else if(knownMap.get(a.id) !== a.status){
          hasChanges = true;
        }
      });
      DB.appointments = appts.value;
    }
    if(clients.status==='fulfilled' && Array.isArray(clients.value)) DB.clients = clients.value;
    if(pays.status==='fulfilled' && Array.isArray(pays.value)) DB.payments = pays.value;
    // Only merge backend hours if no local unsaved changes (prevents overwriting admin edits)
    if(settings.status==='fulfilled' && settings.value && settings.value.hours && !window._settingsDirty){
      console.log('📥 Found hours in settings table:', settings.value.hours);
      try{
        const h = typeof settings.value.hours === 'string' ? JSON.parse(settings.value.hours) : settings.value.hours;
        DB.settings.hours = Object.assign(DB.settings.hours, h);
        console.log('📥 After applying settings:', DB.settings.hours);
      }catch(_){}
    } else {
      if(settings.status==='fulfilled') console.log('⚠️  Skipping settings merge - _settingsDirty:', window._settingsDirty);
    }
    if(avail.status==='fulfilled' && avail.value && avail.value.hours && Object.keys(avail.value.hours).length > 0){
      console.log('📥 Syncing availability from backend:', avail.value);
      DB.settings.hours = Object.assign(DB.settings.hours, avail.value.hours);
      DB.availability.closedDates = avail.value.closedDates || [];
      console.log('📥 After sync:', DB.settings.hours);
    } else {
      console.log('⚠️  No availability data:', { status: avail.status, has_value: !!avail.value, has_hours: avail.value?.hours, isEmpty: avail.value && avail.value.hours && Object.keys(avail.value.hours).length === 0 });
    }
    console.log('💾 Final DB.settings.hours before saveDB:', DB.settings.hours);
    saveDB();
    setBackendState(true);
    if(hasChanges){
      if(document.getElementById('page-dashboard')?.classList.contains('active')) renderDashboard();
      if(document.getElementById('page-agenda')?.classList.contains('active')) renderAgenda();
    }
    // Re-render dispo if visible
    if(document.getElementById('page-disponibilites')?.classList.contains('active')) renderDisponibilites();
  }catch(e){
    setBackendState(false);
  }
}
function setBackendState(online){
  const el = document.getElementById('backend-state');
  const txt = document.getElementById('backend-state-txt');
  if(!el) return;
  el.classList.toggle('online', online);
  el.classList.toggle('offline', !online);
  if(txt) txt.textContent = online ? 'Backend connecté' : 'Mode local';
}

// ─── PIN / SECURITY (iOS keypad) ────────────────────────────
let _pinBuffer = '';
let _pinMaxLen = 4;
let _pinDB = null;
let _cachedPin = null;

async function initPinDB(){
  return new Promise((resolve) => {
    const req = indexedDB.open('fcutz_secure', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('credentials')) db.createObjectStore('credentials');
    };
    req.onsuccess = async () => {
      _pinDB = req.result;
      // Load PIN from IndexedDB or localStorage
      let v = PIN_DEFAULT;
      try{
        const tx = _pinDB.transaction('credentials', 'readonly');
        const store = tx.objectStore('credentials');
        const getReq = store.get('pin');
        await new Promise((res) => {
          getReq.onsuccess = () => { if(getReq.result?.value) v = getReq.result.value; res(); };
          getReq.onerror = () => res();
        });
      }catch(_){}
      // Fallback: check localStorage for migration
      if(v === PIN_DEFAULT && localStorage.getItem(PIN_KEY)){
        v = localStorage.getItem(PIN_KEY);
        // Migrate to IndexedDB
        if(_pinDB) {
          try{
            const tx = _pinDB.transaction('credentials', 'readwrite');
            tx.objectStore('credentials').put({value: v}, 'pin');
          }catch(_){}
        }
      }
      _cachedPin = v;
      _pinMaxLen = Math.max(4, v.length);
      resolve();
    };
    req.onerror = () => {
      _cachedPin = localStorage.getItem(PIN_KEY) || PIN_DEFAULT;
      _pinMaxLen = Math.max(4, _cachedPin.length);
      resolve();
    };
  });
}

function pinGet(){
  return _cachedPin || PIN_DEFAULT;
}

function pinSet(p){
  _cachedPin = p;
  localStorage.setItem(PIN_KEY, p);
  if(_pinDB){
    try{
      const tx = _pinDB.transaction('credentials', 'readwrite');
      const store = tx.objectStore('credentials');
      store.put({value: p}, 'pin');
    }catch(_){}
  }
}
let _unlocked = false;
function isUnlocked(){ return _unlocked; }
function unlock(){ _unlocked = true; }

function renderPinDots(){
  const wrap = document.getElementById('pin-dots');
  if(!wrap) return;
  // Build correct number of dots
  const expected = pinGet().length || 4;
  if(wrap.children.length !== expected){
    wrap.innerHTML = Array.from({length:expected}, () => '<div class="pin-dot"></div>').join('');
  }
  Array.from(wrap.children).forEach((d, i) => {
    d.classList.toggle('filled', i < _pinBuffer.length);
  });
}

function pinPress(k){
  if(k === 'back'){ _pinBuffer = _pinBuffer.slice(0,-1); renderPinDots(); return; }
  if(k === 'bio'){ biometricUnlock(); return; }
  if(_pinBuffer.length >= pinGet().length) return;
  _pinBuffer += String(k);
  renderPinDots();
  if(_pinBuffer.length === pinGet().length) setTimeout(() => verifyPinBuffer(), 80);
}

function verifyPinBuffer(){
  const err = document.getElementById('pin-err');
  if(_pinBuffer === pinGet()){
    unlock();
    err.textContent = '';
    closeModal('modal-pin');
    _pinBuffer = '';
    // Initialize biometrics on first successful unlock if enabled
    if(localStorage.getItem(BIO_KEY) === '1' && !localStorage.getItem(BIO_CRED_KEY)){
      registerBiometric().catch(()=>{});
    }
  } else {
    err.textContent = 'Code incorrect';
    document.getElementById('pin-dots').classList.add('shake');
    setTimeout(() => {
      document.getElementById('pin-dots').classList.remove('shake');
      _pinBuffer = '';
      renderPinDots();
      err.textContent = '';
    }, 500);
  }
}

function attachKeypad(){
  document.querySelectorAll('#keypad .keypad-key').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      pinPress(btn.dataset.key);
    });
    btn.addEventListener('touchstart', () => btn.classList.add('pressed'), { passive:true });
    btn.addEventListener('touchend', () => btn.classList.remove('pressed'), { passive:true });
  });
  // Keyboard fallback
  document.addEventListener('keydown', e => {
    if(!document.getElementById('modal-pin').classList.contains('open')) return;
    if(/^[0-9]$/.test(e.key)) pinPress(e.key);
    else if(e.key === 'Backspace') pinPress('back');
    else if(e.key === 'Enter' && _pinBuffer.length === pinGet().length) verifyPinBuffer();
  });
}

// ─── BIOMETRICS (WebAuthn) ──────────────────────────────────
async function registerBiometric(){
  if(!window.PublicKeyCredential) throw new Error('WebAuthn non supporté');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'FCUTZ Dashboard' },
      user: { id: userId, name: 'fcutz-admin', displayName: DB.settings.barberName || 'Fcutz' },
      pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
      authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred' },
      timeout: 60000,
      attestation: 'none',
    }
  });
  if(cred){
    localStorage.setItem(BIO_CRED_KEY, btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
    return true;
  }
  return false;
}

async function biometricUnlock(){
  const credId = localStorage.getItem(BIO_CRED_KEY);
  if(!credId){
    // First time : register
    try{
      await registerBiometric();
      unlock(); closeModal('modal-pin'); _pinBuffer = '';
      toast('Biométrie activée ✓', 'success');
    }catch(e){ toast('Échec biométrie : ' + e.message, 'danger'); }
    return;
  }
  try{
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rawId = Uint8Array.from(atob(credId), c => c.charCodeAt(0));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: rawId, type:'public-key', transports:['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      }
    });
    if(assertion){
      unlock(); closeModal('modal-pin'); _pinBuffer = '';
    }
  }catch(e){
    document.getElementById('pin-err').textContent = 'Authentification annulée';
    setTimeout(() => document.getElementById('pin-err').textContent = '', 1500);
  }
}

// ─── HELPERS ────────────────────────────────────────────────
function fmtMoney(n){ return Math.ceil(parseFloat(n)||0) + ' €'; }
function fmtDateFR(d){ if(!d) return ''; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}`; }
function fmtDayPretty(d){
  if(!d) return '—';
  const dt = new Date(d + 'T12:00:00');
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const months = ['jan.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${days[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
}
function fmtTimeHHhMM(t){
  if(!t) return '—';
  const [h, m] = t.split(':');
  return `${parseInt(h,10)}h${(m||'00').padStart(2,'0')}`;
}
function pushBodyFor(a){
  const status = (a.paid === true || a.status === 'paid')
    ? 'Payé'
    : (a.status === 'confirmed' ? 'Confirmé' : 'À régler sur place');
  return `${a.clientName || 'Client'} · ${a.service || 'Coupe'} · ${fmtDayPretty(a.date)}, ${fmtTimeHHhMM(a.time)} · ${status}`;
}
function clientName(c){ return c ? `${c.fname||''} ${c.lname||''}`.trim() || 'Client' : '—'; }
function clientById(id){ return DB.clients.find(c => c.id === id); }
function svcClassFor(s){
  if(!s) return 'svc-default';
  const sl = s.toLowerCase();
  if(sl.includes('via dm') || sl.includes('(dm)')) return 'svc-dm';
  if(sl.includes('premium')) return 'svc-premium';
  if(sl.includes('transformation') || sl.includes('transfo')) return 'svc-transfo';
  if(sl.includes('barbe')) return 'svc-barbe';
  if(sl.includes('design')) return 'svc-design';
  if(sl.includes('coupe')) return 'svc-coupe';
  return 'svc-default';
}
function svcSwatchFor(s){
  const map = {
    'svc-coupe':'#4A9AC8','svc-premium':'#8A4AC8','svc-transfo':'#9B59B6',
    'svc-dm':'#C84A4A','svc-barbe':'#C8892A','svc-design':'#4AC8C8','svc-default':'#666'
  };
  return map[svcClassFor(s)] || '#666';
}
function getServiceByName(name){ return SERVICES.find(s => s.name === name); }
function getOrCreateClient(searchTerm){
  const t = (searchTerm||'').trim();
  if(!t) return null;
  let c = DB.clients.find(c => clientName(c).toLowerCase() === t.toLowerCase());
  if(!c){
    const parts = t.split(' ');
    const fname = parts[0] || 'Client';
    const lname = parts.slice(1).join(' ');
    c = { id: uid(), fname, lname, phone:'', email:'', visits:0, spent:0, fav:'Coupe Simple' };
    DB.clients.push(c);
    saveDB();
    apiCall('POST','/api/clients', c).catch(()=>{});
  }
  return c;
}
function fidelityLevel(visits){
  if(visits >= 15) return 'or';
  if(visits >= 8)  return 'argent';
  if(visits >= 3)  return 'bronze';
  return null;
}
function fidelityTag(level){
  if(level === 'or') return '<span class="tag or">Or</span>';
  if(level === 'argent') return '<span class="tag argent">Argent</span>';
  if(level === 'bronze') return '<span class="tag bronze">Bronze</span>';
  return '';
}
function dayKeyFromDate(d){
  const i = (d instanceof Date) ? d.getDay() : new Date(d).getDay();
  return DAY_INDEX_TO_KEY[i];
}
function getDayHours(dayKey){
  return (DB.settings.hours && DB.settings.hours[dayKey]) || DEFAULT_HOURS[dayKey];
}
function widestOpenRange(){
  return { start: 8, end: 20 };
}

// ─── TOAST ──────────────────────────────────────────────────
function toast(msg, type){
  const wrap = document.getElementById('toast-wrap');
  if(!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('dismiss');
    setTimeout(() => el.remove(), 220);
  }, 3000);
}

// ─── NAVIGATION ─────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard:    { title: () => `Bonjour, <span class="accent">${DB.settings.barberName}</span>`, sub: () => dashSubtitle() },
  agenda:       { title: 'Agenda',      sub: 'Visualisez et organisez vos créneaux' },
  clients:      { title: 'Clients',     sub: () => `${DB.clients.length} client${DB.clients.length>1?'s':''} · classés` },
  encaissement: { title: 'Encaissement',sub: 'Caisse + historique' },
  stock:        { title: 'Stock',       sub: () => `${DB.stock.length} article${DB.stock.length>1?'s':''} suivis` },
  disponibilites: { title: 'Disponibilités', sub: 'Horaires + jours fermés' },
  stats:        { title: 'Statistiques',sub: 'Vue analytique complète' },
  fidelite:     { title: 'Fidélité',    sub: 'Programme Bronze · Argent · Or' },
  marketing:    { title: 'Marketing',   sub: 'Campagnes & relances' },
  parametres:   { title: 'Paramètres',  sub: 'Configuration de l\'application' },
};
function nav(id){
  document.querySelectorAll('.modal-bg').forEach(m => {
    if(m.id === 'modal-pin' && !isUnlocked()) return;
    m.classList.remove('open');
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-'+id);
  if(target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(t => t.classList.toggle('active', t.dataset.page === id));
  document.querySelectorAll('.mnav-item').forEach(t => t.classList.toggle('active', t.dataset.page === id));
  const t = PAGE_TITLES[id] || { title:id, sub:'' };
  const titleEl = document.getElementById('topbar-title');
  const subEl = document.getElementById('topbar-sub');
  titleEl.innerHTML = typeof t.title === 'function' ? t.title() : t.title;
  subEl.textContent = typeof t.sub === 'function' ? t.sub() : t.sub;
  if(id === 'dashboard') renderDashboard();
  if(id === 'agenda') renderAgenda();
  if(id === 'clients') renderClientsList();
  if(id === 'encaissement') renderEncaissement();
  if(id === 'stock') renderStock();
  if(id === 'disponibilites') renderDisponibilites();
  if(id === 'stats') renderStats();
  if(id === 'fidelite') renderFidelite();
  if(id === 'marketing') renderMarketing();
  if(id === 'parametres') loadSettingsForm();
  _closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function _closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('burger').classList.remove('is-open');
  const bd = document.getElementById('sidebar-backdrop');
  if(bd){ bd.classList.remove('visible'); setTimeout(()=>{ bd.style.display='none'; },380); }
}
function toggleSidebar(){
  const sidebar = document.getElementById('sidebar');
  const burger  = document.getElementById('burger');
  const bd      = document.getElementById('sidebar-backdrop');
  const isOpen  = sidebar.classList.toggle('open');
  burger.classList.toggle('is-open', isOpen);
  if(bd){
    if(isOpen){
      bd.style.display='block';
      requestAnimationFrame(()=> requestAnimationFrame(()=> bd.classList.add('visible')));
    } else {
      bd.classList.remove('visible');
      setTimeout(()=>{ bd.style.display='none'; }, 380);
    }
  }
}
function dashSubtitle(){
  const t = TODAY();
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date(t);
  const today = DB.appointments.filter(a => a.date === t && a.status !== 'cancelled');
  const dateStr = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  return `${dateStr} · ${today.length} rendez-vous aujourd'hui`;
}

// ─── NOTIFS PANEL ───────────────────────────────────────────
function toggleNotif(){
  document.getElementById('notif-panel').classList.toggle('open');
  markNotifsRead();
}
function renderNotifs(){
  const list = document.getElementById('notif-list');
  const count = document.getElementById('notif-count');
  const items = (DB.notifications || []).slice(-25).reverse();
  if(!items.length){
    list.innerHTML = '<div class="empty"><i class="ti ti-bell-off"></i>Aucune notification</div>';
    count.classList.add('hidden');
    return;
  }
  const unread = items.filter(n => !n.read).length;
  list.innerHTML = items.map(n => {
    const isRdv = n.rdvId || (n.type && (n.type.includes('RDV') || n.type.includes('rendez-vous')));
    const clickable = isRdv ? `onclick="openNotifRdv('${n.rdvId || ''}')" style="cursor:pointer"` : '';
    const premium = isRdv ? ' premium' : '';
    const dateDisplay = n.date ? formatNotifDate(n.date) : '';
    return `
      <div class="notif-item ${!n.read ? 'unread' : ''}${premium}" ${clickable}>
        <div class="notif-badge" style="background-color:${n.color || 'var(--gold-0)'};"></div>
        <div class="notif-content">
          <div class="notif-type" style="color:${n.color || 'var(--gold-0)'}">${n.type || 'Info'}</div>
          <div class="notif-text">${n.text}</div>
          <div class="notif-time">${dateDisplay}${dateDisplay && n.time ? ' · ' + n.time : (n.time || '')}</div>
        </div>
        ${isRdv ? '<div class="notif-arrow"><i class="ti ti-chevron-right"></i></div>' : ''}
      </div>
    `;
  }).join('');
  if(unread > 0){
    count.classList.remove('hidden');
    count.textContent = unread > 9 ? '9+' : unread;
  } else {
    count.classList.add('hidden');
  }
}
function pushNotif(type, text, color, rdvId){
  DB.notifications.push({ type, text, color, rdvId: rdvId || null, time: NOW_HHMM(), date: TODAY(), ts: Date.now(), read: false });
  if(DB.notifications.length > 80) DB.notifications.splice(0, DB.notifications.length - 80);
  saveDB();
  renderNotifs();
}
function formatNotifDate(dateStr){
  if(!dateStr) return '';
  const today = TODAY();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })();
  const weekFrom = (() => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })();
  const twoWeeksFrom = (() => { const d = new Date(); d.setDate(d.getDate()+14); return d.toISOString().slice(0,10); })();

  if(dateStr === today) return 'aujourd\'hui';
  if(dateStr === tomorrow) return 'demain';

  const daysFrom = Math.floor((new Date(dateStr) - new Date(today)) / (1000*60*60*24));
  if(daysFrom > 0 && daysFrom < 7) return `dans ${daysFrom} jour${daysFrom>1?'s':''}`;
  if(dateStr === weekFrom || (daysFrom >= 7 && daysFrom < 14)) return 'la semaine prochaine';
  if(dateStr === twoWeeksFrom || (daysFrom >= 14 && daysFrom < 21)) return 'dans deux semaines';
  return fmtDateFR(dateStr);
}
function openNotifRdv(rdvId){
  if(!rdvId) return;
  const appt = DB.appointments.find(a => a.id === rdvId);
  if(!appt){ toast('Rendez-vous non trouvé','warning'); return; }
  document.getElementById('rdv-edit-id').value = rdvId;
  document.getElementById('rdv-edit-client').value = appt.clientName || '';
  document.getElementById('rdv-edit-date').value = appt.date;
  document.getElementById('rdv-edit-time').value = appt.time;
  document.getElementById('rdv-edit-service').value = `${appt.service}|${appt.price}|${appt.duration}`;
  document.getElementById('rdv-edit-status').value = appt.status;
  document.getElementById('rdv-edit-note').value = appt.note || '';
  openModal('modal-rdv-edit');
  toggleNotif();
}
function markNotifsRead(){
  let changed = false;
  DB.notifications.forEach(n => { if(!n.read){ n.read = true; changed = true; } });
  if(changed){ saveDB(); renderNotifs(); }
}
function clearNotifs(){
  if(!confirm('Effacer toutes les notifications ?')) return;
  DB.notifications = [];
  saveDB();
  renderNotifs();
}

// ─── DASHBOARD RENDER ───────────────────────────────────────
function renderDashboard(){
  const today = TODAY();
  const now = new Date();
  const monthStart = today.slice(0,7) + '-01';

  // RDV aujourd'hui
  const todayRdv = DB.appointments.filter(a => a.date === today && a.status !== 'cancelled').length;
  document.getElementById('kpi-rdv-today').textContent = todayRdv;
  const ydate = new Date(now); ydate.setDate(ydate.getDate()-1);
  const ystr = ydate.toISOString().slice(0,10);
  const yRdv = DB.appointments.filter(a => a.date === ystr && a.status !== 'cancelled').length;
  setTrend('kpi-rdv-today-trend', todayRdv, yRdv, 'vs hier');

  // CA aujourd'hui
  const todayCA = DB.appointments
    .filter(a => a.date === today && a.status !== 'cancelled' && a.status !== 'noshow')
    .reduce((s,a) => s + parseFloat(a.price || 0), 0);
  document.getElementById('kpi-ca-today').textContent = fmtMoney(todayCA).replace(' €','');
  const yCA = DB.appointments
    .filter(a => a.date === ystr && a.status !== 'cancelled' && a.status !== 'noshow')
    .reduce((s,a) => s + parseFloat(a.price || 0), 0);
  setTrend('kpi-ca-trend', todayCA, yCA, 'vs hier');

  // RDV ce mois
  const monthRdv = DB.appointments.filter(a => a.date >= monthStart && a.status !== 'cancelled').length;
  document.getElementById('kpi-rdv-month').textContent = monthRdv;
  const prevMonth = new Date(now); prevMonth.setMonth(prevMonth.getMonth()-1);
  const pmStart = prevMonth.toISOString().slice(0,7) + '-01';
  const pmEnd = today.slice(0,7) + '-01';
  const pmRdv = DB.appointments.filter(a => a.date >= pmStart && a.date < pmEnd && a.status !== 'cancelled').length;
  setTrend('kpi-rdv-trend', monthRdv, pmRdv, 'vs N-1');

  // CA ce mois
  const caMonth = DB.appointments
    .filter(a => a.date >= monthStart && a.status !== 'cancelled' && a.status !== 'noshow')
    .reduce((s,a) => s + parseFloat(a.price || 0), 0);
  document.getElementById('kpi-ca-month').textContent = fmtMoney(caMonth).replace(' €','');
  const pmCA = DB.appointments
    .filter(a => a.date >= pmStart && a.date < pmEnd && a.status !== 'cancelled' && a.status !== 'noshow')
    .reduce((s,a) => s + parseFloat(a.price || 0), 0);
  setTrend('kpi-ca-month-trend', caMonth, pmCA, 'vs N-1');

  renderCompactAgenda();
  renderNextClient();
  renderDashPayments();
  renderTopPrestas();

  const monthCA = DB.payments.filter(p => p.date >= monthStart).reduce((s,p) => s + parseFloat(p.amount||0), 0);
  const obj = DB.settings.objective || 5000;
  const pct = Math.min(100, (monthCA/obj)*100);
  document.getElementById('obj-current').textContent = `${fmtMoney(monthCA)} / ${fmtMoney(obj)}`;
  setTimeout(() => { document.getElementById('obj-bar').style.width = pct.toFixed(1)+'%'; }, 80);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const projection = dayOfMonth ? (monthCA / dayOfMonth) * daysInMonth : 0;
  document.getElementById('obj-projection').textContent = `${pct.toFixed(1)}% · Projection : ${fmtMoney(projection)}`;

  renderDashClients();
  renderHeatmap();
  renderDashStock();
  renderDashFidelite();
  renderCAChart();

  document.getElementById('topbar-sub').textContent = dashSubtitle();
}

function setTrend(id, current, prev, suffix){
  const el = document.getElementById(id);
  if(!el) return;
  if(!prev){ el.className='kpi-trend flat'; el.innerHTML=`<i class="ti ti-minus"></i> — ${suffix}`; return; }
  const diff = current - prev;
  const pct = Math.abs(Math.round((diff/prev)*100));
  if(diff > 0){ el.className='kpi-trend up'; el.innerHTML=`<i class="ti ti-trending-up"></i> +${pct}% ${suffix}`; }
  else if(diff < 0){ el.className='kpi-trend down'; el.innerHTML=`<i class="ti ti-trending-down"></i> -${pct}% ${suffix}`; }
  else { el.className='kpi-trend flat'; el.innerHTML=`<i class="ti ti-minus"></i> stable ${suffix}`; }
}

function renderCompactAgenda(){
  const container = document.getElementById('dash-agenda-compact');
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now); monday.setDate(monday.getDate() - dow);
  const days = Array.from({length:7}, (_,i) => { const d = new Date(monday); d.setDate(d.getDate()+i); return d; });
  const dayNames = ['LUN','MAR','MER','JEU','VEN','SAM','DIM'];
  const hours = []; for(let h=8; h<=17; h++) hours.push(h);
  const today = TODAY();

  const monthLabels = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  document.getElementById('dash-week-label').textContent = `${days[0].getDate()} – ${days[6].getDate()} ${monthLabels[days[6].getMonth()]} ${days[6].getFullYear()}`;

  let html = '<div class="agenda-compact"><div></div>';
  days.forEach((d,i) => {
    const isToday = d.toISOString().slice(0,10) === today;
    const dStr = d.toISOString().slice(0,10);
    html += `<div class="ac-day-h ${isToday?'today':''}" onclick="agOpenDay('${dStr}')" title="Voir ce jour">${dayNames[i]}<span class="ac-day-num">${isToday ? `<span>${d.getDate()}</span>` : d.getDate()}</span></div>`;
  });
  hours.forEach(h => {
    html += `<div class="ac-time">${String(h).padStart(2,'0')}h</div>`;
    days.forEach(d => {
      const dStr = d.toISOString().slice(0,10);
      const slot = DB.appointments.filter(a => a.date === dStr && a.status !== 'cancelled' && parseInt(a.time.split(':')[0]) === h);
      if(slot.length){
        const a = slot[0];
        const c = clientById(a.clientId);
        const cls = svcClassFor(a.service);
        html += `<div class="ac-slot"><div class="ac-appt ${cls}" onclick="openEditRdv('${a.id}')"><div class="ac-appt-name">${c ? clientName(c) : (a.clientName || 'Client')}</div><div class="ac-appt-svc">${a.service||''}</div></div></div>`;
      } else {
        html += `<div class="ac-slot"></div>`;
      }
    });
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderNextClient(){
  const card = document.getElementById('next-client-card');
  const today = TODAY();
  const now = NOW_HHMM();
  const future = DB.appointments
    .filter(a => a.status !== 'cancelled' && a.status !== 'done' && a.status !== 'noshow' && (a.date > today || (a.date === today && a.time >= now)))
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
  if(!future.length){
    card.innerHTML = '<div class="empty"><i class="ti ti-calendar-off"></i>Aucun RDV à venir</div>';
    return;
  }
  const next = future[0];
  const c = clientById(next.clientId);
  const name = c ? clientName(c) : (next.clientName || 'Client');
  const visits = c?.visits || 0;
  const spent = c?.spent || 0;
  const fid = fidelityLevel(visits);
  const tags = [];
  if(fid === 'or') tags.push('<span class="tag or"><i class="ti ti-crown"></i>VIP Or</span>');
  else if(fid === 'argent') tags.push('<span class="tag argent">Argent</span>');
  else if(fid === 'bronze') tags.push('<span class="tag bronze">Bronze</span>');
  else if(visits === 0) tags.push('<span class="tag new">Nouveau</span>');
  if(visits >= 5) tags.push('<span class="tag regular">Régulier</span>');
  if(next.note) tags.push(`<span class="tag note">${next.note}</span>`);

  const nowD = new Date();
  const nextD = new Date(`${next.date}T${next.time}`);
  const diffMin = Math.round((nextD - nowD) / 60000);
  let countdown;
  if(diffMin < 0) countdown = 'En cours';
  else if(diffMin < 60) countdown = `dans ${diffMin} min`;
  else if(diffMin < 1440) countdown = `dans ${Math.round(diffMin/60)}h`;
  else countdown = `dans ${Math.round(diffMin/1440)} j`;

  const phone = c?.phone || '';
  card.innerHTML = `
    <div class="next-label"><span class="live-dot"></span>Prochain client · ${countdown}</div>
    <div class="next-time">${next.time}</div>
    <div class="next-name">${name}</div>
    <div class="next-service">${next.service||''} · ${next.duration||30} min · ${fmtMoney(next.price||0)}</div>
    <div class="next-tags">${tags.join('')}</div>
    <div class="next-history"><strong>${visits}</strong> visite${visits>1?'s':''} · Total dépensé : <strong>${fmtMoney(spent)}</strong>${c?.lastVisit ? ` · Dernière le <strong>${fmtDateFR(c.lastVisit)}</strong>` : ''}</div>
    <div class="next-actions">
      <button class="btn btn-ghost btn-sm" ${phone ? `onclick="window.location.href='tel:${phone}'"` : 'disabled'}><i class="ti ti-phone"></i>Appeler</button>
      <button class="btn btn-ghost btn-sm" ${phone ? `onclick="window.location.href='sms:${phone}'"` : 'disabled'}><i class="ti ti-message"></i>SMS</button>
    </div>
  `;
}

function renderDashPayments(){
  const list = document.getElementById('dash-payments');
  const items = [...DB.payments].sort((a,b) => (b.date+(b.time||'')).localeCompare(a.date+(a.time||''))).slice(0,4);
  if(!items.length){
    list.innerHTML = '<div class="empty" style="padding:var(--sp-4) 0"><i class="ti ti-receipt-off"></i>Aucun paiement</div>';
    return;
  }
  const ICONS = { sumup:'ti-credit-card', cash:'ti-cash', link:'ti-link' };
  const COLORS = { sumup:['rgba(74,138,200,.15)','#A8C8F0'], cash:['rgba(74,186,106,.15)','#8EE4C6'], link:['rgba(200,168,90,.15)','var(--gold-0)'] };
  list.innerHTML = items.map(p => {
    const c = clientById(p.clientId);
    const m = p.method || 'sumup';
    const ic = ICONS[m] || 'ti-receipt';
    const col = COLORS[m] || ['rgba(245,240,230,.06)','var(--marble-1)'];
    return `
      <div class="pay-row">
        <div class="pay-icon" style="background:${col[0]}"><i class="ti ${ic}" style="color:${col[1]}"></i></div>
        <div class="pay-info">
          <div class="pay-name">${c ? clientName(c) : (p.clientName || 'Client')}</div>
          <div class="pay-time">${p.time||''} · ${p.service || '—'}</div>
        </div>
        <div class="pay-amount pos">+${fmtMoney(p.amount)}</div>
      </div>
    `;
  }).join('');
}

function renderTopPrestas(){
  const counts = {};
  DB.appointments.filter(a => a.status !== 'cancelled').forEach(a => {
    if(a.service) counts[a.service] = (counts[a.service] || 0) + 1;
  });
  const total = Object.values(counts).reduce((s,n) => s+n, 0) || 1;
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5);
  const container = document.getElementById('dash-top-prestas');
  if(!sorted.length){
    container.innerHTML = '<div class="empty" style="padding:var(--sp-3) 0;font-size:11px"><i class="ti ti-chart-bar-off"></i>Aucune donnée</div>';
    return;
  }
  container.innerHTML = sorted.map(([name, n]) => {
    const pct = Math.round((n/total)*100);
    return `<div class="stat-row">
      <div class="stat-label">${name}</div>
      <div class="stat-bar-wrap"><div class="stat-bar" data-w="${pct}%"></div></div>
      <div class="stat-val">${pct}%</div>
    </div>`;
  }).join('');
  setTimeout(() => document.querySelectorAll('#dash-top-prestas .stat-bar').forEach(b => b.style.width = b.dataset.w), 60);
}

function renderDashClients(){
  const today = TODAY();
  const scored = DB.clients.map(c => {
    const past = DB.appointments.filter(a => a.clientId === c.id && a.date < today && a.status !== 'cancelled');
    return { c, count: past.length, pastSpent: past.reduce((s,a) => s + parseFloat(a.price||0), 0) };
  }).filter(x => x.count > 0)
    .sort((a,b) => b.count - a.count || b.pastSpent - a.pastSpent)
    .slice(0,5);
  const list = document.getElementById('dash-clients');
  if(!scored.length){
    list.innerHTML = '<div class="empty"><i class="ti ti-users-off"></i>Aucun client</div>';
    return;
  }
  list.innerHTML = scored.map(({c, count}) => {
    const initials = ((c.fname||'')[0] || '') + ((c.lname||'')[0] || 'C');
    const fid = fidelityLevel(count);
    const fidLabel = fid ? ` · ${fid}` : '';
    return `<div class="client-row" onclick="nav('clients')">
      <div class="client-av">${initials.toUpperCase()}</div>
      <div class="client-info">
        <div class="client-name">${clientName(c)}</div>
        <div class="client-meta">${count} RDV honoré${count>1?'s':''}${fidLabel}</div>
      </div>
      <div class="client-amount">${fmtMoney(c.spent||0)}</div>
    </div>`;
  }).join('');
}

function renderHeatmap(){
  const days = ['L','M','M','J','V','S'];
  const range = widestOpenRange();
  const hours = []; for(let h=range.start; h<=range.end; h++) hours.push(h);
  const data = hours.map(h => days.map((_,di) => {
    let count = 0;
    DB.appointments.forEach(a => {
      if(a.status === 'cancelled') return;
      const ah = parseInt(a.time.split(':')[0]);
      if(ah !== h) return;
      const d = new Date(a.date);
      const adow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      if(adow === di) count++;
    });
    return count;
  }));
  const max = Math.max(1, ...data.flat());
  let html = '<div class="heatmap"><div></div>';
  days.forEach(d => html += `<div class="heat-day">${d}</div>`);
  hours.forEach((h,hi) => {
    html += `<div class="heat-time">${String(h).padStart(2,'0')}h</div>`;
    data[hi].forEach(v => {
      const op = (0.08 + (v/max)*0.85).toFixed(2);
      html += `<div class="heat-cell" style="background:rgba(200,168,90,${op})" title="${v} RDV"></div>`;
    });
  });
  html += '</div>';
  document.getElementById('heatmap').innerHTML = html;
}

function renderDashStock(){
  const list = document.getElementById('dash-stock');
  const items = DB.stock.filter(s => s.qty <= s.threshold).sort((a,b) => a.qty - b.qty);
  if(!items.length){
    list.innerHTML = '<div class="empty" style="padding:var(--sp-3) 0;font-size:11px"><i class="ti ti-package"></i>Stock OK</div>';
    return;
  }
  list.innerHTML = items.slice(0,5).map(s => {
    const crit = s.qty <= Math.max(1, s.threshold * 0.4);
    return `<div class="stat-row">
      <div class="stat-label"><span class="dot ${crit?'red':'gold'}"></span>${s.name}</div>
      <div class="stat-val" style="color:${crit?'var(--danger)':'var(--gold-0)'}">${s.qty} unités</div>
    </div>`;
  }).join('');
}

function renderDashFidelite(){
  const counts = { bronze:0, argent:0, or:0 };
  DB.clients.forEach(c => {
    const lv = fidelityLevel(c.visits || 0);
    if(lv) counts[lv]++;
  });
  const colors = { bronze:'#c0a060', argent:'#b0b8c0', or:'var(--gold-1)' };
  const labels = { bronze:'Bronze', argent:'Argent', or:'Or' };
  document.getElementById('dash-fidelite').innerHTML = ['bronze','argent','or'].map(k => `
    <div class="flex items-center justify-between" style="padding:5px 0;font-size:12px;color:var(--marble-1)">
      <div class="flex items-center gap-2"><div style="width:8px;height:8px;border-radius:50%;background:${colors[k]}"></div>${labels[k]}</div>
      <div style="font-weight:700;color:${colors[k]}">${counts[k]} client${counts[k]>1?'s':''}</div>
    </div>
  `).join('');
}

// ─── CHART CA ───────────────────────────────────────────────
let chartCA = null;
function renderCAChart(){
  if(typeof Chart === 'undefined') return;
  const now = new Date();
  const labels = [];
  const series = [];
  const seriesPrev = [];
  for(let i=6; i>=0; i--){
    const d = new Date(now); d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0,10);
    labels.push(['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][d.getDay()===0?6:d.getDay()-1]);
    series.push(DB.payments.filter(p => p.date === dStr).reduce((s,p) => s + parseFloat(p.amount||0), 0));
    const prev = new Date(d); prev.setDate(prev.getDate() - 7);
    const pStr = prev.toISOString().slice(0,10);
    seriesPrev.push(DB.payments.filter(p => p.date === pStr).reduce((s,p) => s + parseFloat(p.amount||0), 0));
  }
  const ctx = document.getElementById('chart-ca');
  if(!ctx) return;
  if(chartCA) chartCA.destroy();
  chartCA = new Chart(ctx.getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Cette semaine', data:series, backgroundColor:'rgba(200,168,90,.35)', borderColor:'#C8A85A', borderWidth:1.5, borderRadius:6, barThickness:22 },
      { label:'Précédente', data:seriesPrev, backgroundColor:'rgba(245,240,230,.06)', borderColor:'rgba(245,240,230,.18)', borderWidth:1, borderRadius:6, barThickness:22 },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{
        backgroundColor:'#14161B', borderColor:'rgba(200,168,90,.25)', borderWidth:1,
        titleColor:'#F5F0E6', bodyColor:'#C9C3B8',
        callbacks:{ label: c => ` ${c.parsed.y}€` }
      }},
      scales:{
        x:{ grid:{ color:'rgba(200,168,90,.05)' }, ticks:{ color:'#8A857E', font:{ family:'Syne', size:11 } } },
        y:{ grid:{ color:'rgba(200,168,90,.06)' }, ticks:{ color:'#8A857E', font:{ family:'Syne', size:11 }, callback: v => v+'€' }, beginAtZero:true }
      }
    }
  });
}

// ─── AGENDA PAGE ────────────────────────────────────────────
let agView = window.innerWidth < 640 ? 'day' : 'week';
let agDate = new Date();

function renderAgenda(){
  const leg = document.getElementById('ag-legend');
  const services = SERVICES;
  leg.innerHTML = services.map(s => `<div class="ag-leg-item"><span class="ag-leg-swatch" style="background:${svcSwatchFor(s.name)}"></span>${s.name}</div>`).join('');
  document.getElementById('ag-tab-day').classList.toggle('active', agView==='day');
  document.getElementById('ag-tab-week').classList.toggle('active', agView==='week');
  if(agView === 'day') buildAgendaDay(); else buildAgendaWeek();
}
function agSetView(v){ agView = v; renderAgenda(); }
function agToday(){ agDate = new Date(); renderAgenda(); }
function agPrev(){ const d = new Date(agDate); d.setDate(d.getDate() - (agView==='day'?1:7)); agDate = d; renderAgenda(); }
function agNext(){ const d = new Date(agDate); d.setDate(d.getDate() + (agView==='day'?1:7)); agDate = d; renderAgenda(); }
function agOpenDay(dStr){
  agDate = new Date(dStr + 'T12:00:00');
  agView = 'day';
  nav('agenda');
}

function buildAgendaWeek(){
  const dow = agDate.getDay() === 0 ? 6 : agDate.getDay() - 1;
  const monday = new Date(agDate); monday.setDate(monday.getDate() - dow);
  const days = Array.from({length:7}, (_,i) => { const d = new Date(monday); d.setDate(d.getDate()+i); return d; });
  const monthLabels = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  document.getElementById('ag-cur-label').textContent = `${days[0].getDate()} – ${days[6].getDate()} ${monthLabels[days[6].getMonth()]} ${days[6].getFullYear()}`;
  const range = widestOpenRange();
  buildAgendaGrid(days, range.start, range.end);
}
function buildAgendaDay(){
  const days = [new Date(agDate)];
  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const monthLabels = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  document.getElementById('ag-cur-label').textContent = `${dayNames[agDate.getDay()]} ${agDate.getDate()} ${monthLabels[agDate.getMonth()]} ${agDate.getFullYear()}`;
  const range = widestOpenRange();
  buildAgendaGrid(days, range.start, range.end);
}
function buildAgendaGrid(days, start, end){
  const today = TODAY();
  const dayNames = ['LUN','MAR','MER','JEU','VEN','SAM','DIM'];
  let html = '<div class="ag-grid"><div class="ag-time-col"><div class="ag-time-h"></div>';
  for(let h=start; h<=end; h++) html += `<div class="ag-time-cell">${String(h).padStart(2,'0')}h</div>`;
  html += '</div><div class="ag-days-wrap">';
  days.forEach(d => {
    const dStr = d.toISOString().slice(0,10);
    const isToday = dStr === today;
    const dn = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const switchAction = agView === 'week' ? `onclick="agOpenDay('${dStr}')"` : '';
    html += `<div class="ag-day-col${isToday?' today-col':''}" data-date="${dStr}">`;
    html += `<div class="ag-day-h ${isToday?'today':''}" ${switchAction} title="${agView === 'week' ? 'Voir ce jour' : ''}">${dayNames[dn]}<span class="num">${d.getDate()}</span></div>`;
    for(let h=start; h<=end; h++){
      html += `<div class="ag-hour ag-half" data-hour="${h}" data-min="0" onclick="quickCreateRdv('${dStr}','${String(h).padStart(2,'0')}:00')"></div>`;
      html += `<div class="ag-hour ag-half ag-half-30" data-hour="${h}" data-min="15" onclick="quickCreateRdv('${dStr}','${String(h).padStart(2,'0')}:15')"></div>`;
      html += `<div class="ag-hour ag-half" data-hour="${h}" data-min="30" onclick="quickCreateRdv('${dStr}','${String(h).padStart(2,'0')}:30')"></div>`;
      html += `<div class="ag-hour ag-half ag-half-30" data-hour="${h}" data-min="45" onclick="quickCreateRdv('${dStr}','${String(h).padStart(2,'0')}:45')"></div>`;
    }
    const appts = DB.appointments.filter(a => a.date === dStr && a.status !== 'cancelled');
    appts.forEach(a => {
      const [h,m] = a.time.split(':').map(Number);
      if(h < start || h > end) return;
      const top = (h - start) * 60 + (m/60)*60 + 56;
      const dur = a.duration || 30;
      const height = Math.max(28, (dur/60)*60 - 4);
      const c = clientById(a.clientId);
      const name = c ? clientName(c) : (a.clientName || 'Client');
      const cls = svcClassFor(a.service);
      const isPaid = a.paid === true || a.status === 'paid';
      html += `<div class="ag-appt ${cls}" data-id="${a.id}" draggable="true" style="top:${top}px;height:${height}px" onclick="event.stopPropagation();openEditRdv('${a.id}')">
        ${isPaid ? '<div class="ag-appt-paid"><i class="ti ti-circle-check"></i></div>' : ''}
        <div class="ag-appt-time">${a.time}</div>
        <div class="ag-appt-name">${name}</div>
        <div class="ag-appt-svc">${a.service || ''}</div>
      </div>`;
    });
    if(isToday){
      const now = new Date();
      const nowH = now.getHours(), nowM = now.getMinutes();
      if(nowH >= start && nowH <= end){
        const nowTop = (nowH - start) * 60 + nowM + 56;
        html += `<div class="ag-now-line" style="top:${nowTop}px"></div>`;
      }
    }
    html += '</div>';
  });
  html += '</div></div>';
  const prevScrollLeft = document.querySelector('.ag-days-wrap')?.scrollLeft ?? 0;
  document.getElementById('ag-container').innerHTML = html;
  initAgendaDnD();

  // Restaurer la position horizontale (ex : scroll sur samedi) puis scroller verticalement à 10h
  setTimeout(() => {
    const wrap = document.querySelector('.ag-days-wrap');
    if(wrap && prevScrollLeft > 0) wrap.scrollLeft = prevScrollLeft;
    const grid = document.querySelector('.ag-grid');
    if(grid) grid.scrollTop = (10 * 60) - 120;
  }, 50);
}

function initAgendaDnD(){
  let dragId = null;
  let dragGhost = null;

  function removeDragGhost(){
    if(dragGhost){ dragGhost.remove(); dragGhost = null; }
    document.querySelectorAll('.ag-hour.drag-over').forEach(h => h.classList.remove('drag-over'));
  }

  function showDragGhost(cell, appt){
    removeDragGhost();
    const col = cell.closest('.ag-day-col');
    if(!col) return;
    const range = widestOpenRange();
    const h = parseInt(cell.dataset.hour);
    const m = parseInt(cell.dataset.min || 0);
    const top = (h - range.start) * 60 + (m / 60) * 60 + 56;
    const height = Math.max(28, ((appt.duration || 30) / 60) * 60 - 4);
    dragGhost = document.createElement('div');
    dragGhost.className = 'ag-appt ag-drag-ghost ' + svcClassFor(appt.service);
    dragGhost.style.cssText = `top:${top}px;height:${height}px;pointer-events:none;`;
    dragGhost.innerHTML = `<div class="ag-appt-time">${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}</div><div class="ag-appt-name">${appt.clientName||'Client'}</div>`;
    col.appendChild(dragGhost);
  }

  document.querySelectorAll('.ag-appt[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      dragId = el.dataset.id;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      removeDragGhost();
    });
  });
  document.querySelectorAll('.ag-hour').forEach(cell => {
    cell.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if(!dragId) return;
      const appt = DB.appointments.find(a => a.id === dragId);
      if(appt) showDragGhost(cell, appt);
    });
    cell.addEventListener('dragleave', e => {
      // Ne supprimer que si on quitte vraiment la zone de drop
      if(!e.relatedTarget || !e.relatedTarget.closest('.ag-day-col')) removeDragGhost();
    });
    cell.addEventListener('drop', e => {
      e.preventDefault();
      removeDragGhost();
      if(!dragId) return;
      const appt = DB.appointments.find(a => a.id === dragId);
      if(!appt) return;
      appt.date = cell.closest('.ag-day-col').dataset.date;
      appt.time = String(cell.dataset.hour).padStart(2,'0') + ':' + String(cell.dataset.min||'0').padStart(2,'0');
      saveDB();
      apiCall('PATCH','/api/appointments/'+dragId,{ date:appt.date, time:appt.time }).catch(()=>{});
      dragId = null;
      renderAgenda();
    });
  });
  // Mobile touch drag
  let touchId = null, touchClone = null, touchOrigin = null;
  document.querySelectorAll('.ag-appt[draggable]').forEach(el => {
    el.addEventListener('touchstart', e => {
      touchId = el.dataset.id;
      touchOrigin = el;
      const r = el.getBoundingClientRect();
      touchClone = el.cloneNode(true);
      Object.assign(touchClone.style, { position:'fixed', top:r.top+'px', left:r.left+'px', width:r.width+'px', height:r.height+'px', opacity:'.85', zIndex:'9999', pointerEvents:'none', border:'2px solid var(--gold-0)', borderRadius:'8px' });
      document.body.appendChild(touchClone);
      el.style.opacity = '.25';
    }, { passive:true });
    el.addEventListener('touchmove', e => {
      if(!touchClone) return;
      e.preventDefault();
      const t = e.touches[0];
      touchClone.style.top  = (t.clientY - 24) + 'px';
      touchClone.style.left = (t.clientX - touchClone.offsetWidth/2) + 'px';
      document.querySelectorAll('.ag-hour.drag-over').forEach(h => h.classList.remove('drag-over'));
      touchClone.style.pointerEvents = 'none';
      const under = document.elementFromPoint(t.clientX, t.clientY);
      under?.closest('.ag-hour')?.classList.add('drag-over');
    }, { passive:false });
    el.addEventListener('touchend', e => {
      if(touchOrigin) touchOrigin.style.opacity = '';
      if(touchClone){ document.body.removeChild(touchClone); touchClone = null; }
      document.querySelectorAll('.ag-hour.drag-over').forEach(h => h.classList.remove('drag-over'));
      if(!touchId) return;
      const t = e.changedTouches[0];
      const under = document.elementFromPoint(t.clientX, t.clientY);
      const cell = under?.closest('.ag-hour');
      if(cell){
        const appt = DB.appointments.find(a => a.id === touchId);
        if(appt){
          appt.date = cell.closest('.ag-day-col').dataset.date;
          appt.time = String(cell.dataset.hour).padStart(2,'0') + ':' + String(cell.dataset.min||'0').padStart(2,'0');
          saveDB();
          apiCall('PATCH','/api/appointments/'+touchId,{ date:appt.date, time:appt.time }).catch(()=>{});
        }
      }
      touchId = null; touchOrigin = null;
      renderAgenda();
    });
  });
}

function quickCreateRdv(date, time){
  document.getElementById('rdv-date').value = date;
  document.getElementById('rdv-time').value = time;
  document.getElementById('rdv-client').value = '';
  const rdvPhone = document.getElementById('rdv-phone');
  if(rdvPhone) rdvPhone.value = '';
  document.getElementById('rdv-note').value = '';
  populateServiceSelect('rdv-service');
  openModal('modal-rdv-new');
}

// ─── RDV MODAL : NEW ────────────────────────────────────────
function populateServiceSelect(selId){
  const sel = document.getElementById(selId);
  if(!sel) return;
  sel.innerHTML = SERVICES.map(s => `<option value="${s.name}|${s.price}|${s.duration}">${s.name} — ${s.price}€ · ${s.duration} min${s.internal ? ' [DM]' : ''}</option>`).join('');
}
function rdvCheckConflict(){
  const date = document.getElementById('rdv-date').value;
  const time = document.getElementById('rdv-time').value;
  const sv = document.getElementById('rdv-service').value;
  if(!date || !time || !sv) return;
  const dur = parseInt(sv.split('|')[2] || 30);
  const conflict = hasConflict(date, time, dur, null);
  document.getElementById('rdv-conflict').classList.toggle('hidden', !conflict);
}
function rdvEditCheckConflict(){
  const date = document.getElementById('rdv-edit-date').value;
  const time = document.getElementById('rdv-edit-time').value;
  const sv = document.getElementById('rdv-edit-service').value;
  if(!date || !time || !sv) return;
  const dur = parseInt(sv.split('|')[2] || 30);
  const id = document.getElementById('rdv-edit-id').value;
  const conflict = hasConflict(date, time, dur, id);
  document.getElementById('rdv-edit-conflict').classList.toggle('hidden', !conflict);
}
function hasConflict(date, time, dur, excludeId){
  const startMin = toMin(time);
  const endMin = startMin + dur;
  return DB.appointments.some(a => {
    if(a.id === excludeId) return false;
    if(a.date !== date) return false;
    if(a.status === 'cancelled' || a.status === 'noshow') return false;
    const aStart = toMin(a.time);
    const aEnd = aStart + (a.duration || 30);
    return startMin < aEnd && endMin > aStart;
  });
}
function toMin(t){ const [h,m] = t.split(':').map(Number); return h*60 + m; }

// ─── RDV MODAL : AUTOCOMPLETE CLIENT ─────────────────────────
function filterClientsForRdv(){
  const input = document.getElementById('rdv-client');
  const suggestionsDiv = document.getElementById('rdv-client-suggestions');
  const query = (input.value || '').trim().toLowerCase();
  if(!query || query.length < 1){
    suggestionsDiv.style.display = 'none';
    return;
  }
  const matches = DB.clients.filter(c => {
    const name = clientName(c).toLowerCase();
    return name.includes(query);
  }).slice(0, 5);
  if(matches.length === 0){
    suggestionsDiv.style.display = 'none';
    return;
  }
  suggestionsDiv.innerHTML = matches.map(c => {
    const name = clientName(c);
    const visits = c.visits || 0;
    return `<div class="autocomplete-item" style="padding:10px 14px;border-bottom:1px solid rgba(200,168,90,.08);cursor:pointer;transition:background 150ms;display:flex;align-items:center;justify-content:space-between" onmouseover="this.style.background='rgba(200,168,90,.08)'" onmouseout="this.style.background='transparent'" onclick="selectClientForRdv('${name.replace(/'/g,"\\'")}')">
      <span style="font-size:13px;font-weight:600;color:var(--marble-0)">${name}</span>
      <span style="font-size:11px;color:var(--marble-2)">${visits} visite${visits!==1?'s':''}</span>
    </div>`;
  }).join('');
  suggestionsDiv.style.display = 'block';
}
function selectClientForRdv(clientName){
  document.getElementById('rdv-client').value = clientName;
  document.getElementById('rdv-client-suggestions').style.display = 'none';
}
document.addEventListener('click', function(e){
  const suggestionsDiv = document.getElementById('rdv-client-suggestions');
  const input = document.getElementById('rdv-client');
  if(suggestionsDiv && !suggestionsDiv.contains(e.target) && e.target !== input){
    suggestionsDiv.style.display = 'none';
  }
});

function saveNewRdv(){
  const date = document.getElementById('rdv-date').value;
  const time = document.getElementById('rdv-time').value;
  const sv = document.getElementById('rdv-service').value;
  const clientNameInput = document.getElementById('rdv-client').value.trim();
  const phoneInput = (document.getElementById('rdv-phone')?.value || '').trim();
  const note = document.getElementById('rdv-note').value.trim();
  if(!date || !time || !sv){ toast('Date, heure et prestation requis','danger'); return; }
  const [name, price, duration] = sv.split('|');
  if(hasConflict(date, time, parseInt(duration), null)){
    if(!confirm('Ce créneau chevauche un autre RDV. Confirmer ?')) return;
  }
  // Téléphone → identifiant unique : chercher d'abord par phone, puis par nom
  const np = normalizePhone(phoneInput);
  let c = np ? DB.clients.find(x => normalizePhone(x.phone) === np) : null;
  if(!c) c = getOrCreateClient(clientNameInput);
  // Si le client existe par phone mais n'a pas encore de nom, on met à jour
  if(c && phoneInput && !c.phone) { c.phone = phoneInput; saveDB(); }
  if(c && phoneInput && c.phone !== phoneInput && !normalizePhone(c.phone)){
    c.phone = phoneInput; saveDB();
  }
  const appt = {
    id: uid(),
    clientId: c?.id || null,
    clientName: c ? clientName(c) : (clientNameInput || 'Client'),
    service: name,
    price: parseFloat(price),
    duration: parseInt(duration),
    date, time,
    status: 'pending',
    note,
    source: 'dashboard',
    createdAt: new Date().toISOString(),
  };
  DB.appointments.push(appt);
  saveDB();
  apiCall('POST','/api/appointments', appt).catch(()=>{});
  pushNotif('Nouvelle réservation', pushBodyFor(appt), 'var(--gold-0)', appt.id);
  toast('Rendez-vous créé ✓','success');
  closeModal('modal-rdv-new');
  if(document.getElementById('page-agenda').classList.contains('active')) renderAgenda();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

// ─── RDV MODAL : EDIT ───────────────────────────────────────
function openEditRdv(id){
  const a = DB.appointments.find(x => x.id === id);
  if(!a) return;
  document.getElementById('rdv-edit-id').value = a.id;
  const c = clientById(a.clientId);
  document.getElementById('rdv-edit-client').value = c ? clientName(c) : (a.clientName || '');
  document.getElementById('rdv-edit-date').value = a.date;
  document.getElementById('rdv-edit-time').value = a.time;
  populateServiceSelect('rdv-edit-service');
  document.getElementById('rdv-edit-service').value = `${a.service}|${a.price}|${a.duration}`;
  document.getElementById('rdv-edit-status').value = a.status || 'pending';
  document.getElementById('rdv-edit-note').value = a.note || '';
  document.getElementById('rdv-edit-conflict').classList.add('hidden');
  const paidBadge = document.getElementById('rdv-edit-paid-badge');
  if(paidBadge) paidBadge.classList.toggle('hidden', !(a.paid === true || a.status === 'paid'));
  const phone = c?.phone || '';
  const contactDiv = document.getElementById('rdv-edit-contact');
  if(phone){
    document.getElementById('rdv-edit-call').href = 'tel:' + phone;
    document.getElementById('rdv-edit-sms').href = 'sms:' + phone;
    contactDiv.classList.remove('hidden');
  } else {
    contactDiv.classList.add('hidden');
  }
  openModal('modal-rdv-edit');
}
function saveEditRdv(){
  const id = document.getElementById('rdv-edit-id').value;
  const a = DB.appointments.find(x => x.id === id);
  if(!a) return;
  const date = document.getElementById('rdv-edit-date').value;
  const time = document.getElementById('rdv-edit-time').value;
  const sv = document.getElementById('rdv-edit-service').value;
  const status = document.getElementById('rdv-edit-status').value;
  const note = document.getElementById('rdv-edit-note').value.trim();
  const newClient = document.getElementById('rdv-edit-client').value.trim();
  const [name, price, duration] = sv.split('|');
  if(hasConflict(date, time, parseInt(duration), id)){
    if(!confirm('Conflit détecté. Continuer ?')) return;
  }
  const currentC = clientById(a.clientId);
  const currentName = currentC ? clientName(currentC) : a.clientName;
  if(newClient && newClient !== currentName){
    const c = getOrCreateClient(newClient);
    a.clientId = c?.id || a.clientId;
    a.clientName = newClient;
  }
  const prevStatus = a.status;
  Object.assign(a, { date, time, service:name, price:parseFloat(price), duration:parseInt(duration), status, note });
  if(status === 'done'){
    const c = clientById(a.clientId);
    if(c){
      c.visits = (c.visits || 0) + 1;
      c.spent = (c.spent || 0) + parseFloat(a.price || 0);
      c.lastVisit = a.date;
    }
  }
  saveDB();
  const isCancellation = status === 'cancelled' && prevStatus !== 'cancelled';
  if(isCancellation){
    apiCall('PUT','/api/appointments/'+id, a)
      .then(r => {
        if(r?.pushSent) toast('Client notifié de l\'annulation ✓','success');
        else toast('Annulé — push impossible (client non abonné aux notifs)','r');
      })
      .catch(e => console.error('[FCUTZ] PUT /api/appointments/'+id+' failed:', e));
  } else {
    apiCall('PUT','/api/appointments/'+id, a).catch(e => console.error('[FCUTZ] PUT /api/appointments/'+id+' failed:', e));
    toast('RDV mis à jour ✓','success');
  }
  closeModal('modal-rdv-edit');
  renderAgenda();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}
function deleteRdv(){
  const id = document.getElementById('rdv-edit-id').value;
  if(!confirm('Supprimer ce rendez-vous ?')) return;
  DB.appointments = DB.appointments.filter(a => a.id !== id);
  saveDB();
  closeModal('modal-rdv-edit');
  renderAgenda();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  apiCall('DELETE','/api/appointments/'+id)
    .then(r => {
      if(r?.pushSent) toast('RDV supprimé — client notifié ✓','success');
      else toast('RDV supprimé','danger');
    })
    .catch(()=> toast('RDV supprimé','danger'));
}

// ─── CLIENTS ────────────────────────────────────────────────
let cliSort = 'spent';
function cliSetSort(s){
  cliSort = s;
  document.getElementById('cli-tab-spent').classList.toggle('active', s==='spent');
  document.getElementById('cli-tab-visits').classList.toggle('active', s==='visits');
  renderClientsList();
}
function renderClientsList(){
  const q = (document.getElementById('cli-search').value || '').toLowerCase().trim();
  let list = [...DB.clients];
  if(q){
    list = list.filter(c => clientName(c).toLowerCase().includes(q) || (c.phone||'').includes(q) || (c.email||'').toLowerCase().includes(q));
  }
  list.sort((a,b) => cliSort==='visits' ? (b.visits||0)-(a.visits||0) : (b.spent||0)-(a.spent||0));
  const container = document.getElementById('clients-list');
  if(!list.length){
    container.innerHTML = '<div class="empty"><i class="ti ti-user-off"></i>Aucun client trouvé</div>';
    return;
  }
  container.innerHTML = list.map(c => {
    const initials = ((c.fname||'')[0] || '') + ((c.lname||'')[0] || 'C');
    const fid = fidelityLevel(c.visits || 0);
    return `<div class="client-row" onclick="openClientDetail('${c.id}')">
      <div class="client-av">${initials.toUpperCase()}</div>
      <div class="client-info">
        <div class="client-name">${clientName(c)} ${fidelityTag(fid)}</div>
        <div class="client-meta">${c.visits||0} visites · ${c.phone||''} ${c.email ? '· '+c.email : ''}</div>
      </div>
      <div class="client-amount">${fmtMoney(c.spent||0)}</div>
    </div>`;
  }).join('');
}
function openClientDetail(id){
  const c = clientById(id);
  if(!c) return;
  document.getElementById('rdv-client').value = clientName(c);
  document.getElementById('rdv-date').value = TODAY();
  document.getElementById('rdv-time').value = NOW_HHMM().split(':')[0]+':00';
  populateServiceSelect('rdv-service');
  openModal('modal-rdv-new');
}
function saveNewClient(){
  const fname = document.getElementById('cli-fname').value.trim();
  const lname = document.getElementById('cli-lname').value.trim();
  const phone = document.getElementById('cli-phone').value.trim();
  const email = document.getElementById('cli-email').value.trim();
  if(!fname && !lname){ toast('Nom requis','danger'); return; }
  const c = { id:uid(), fname, lname, phone, email, visits:0, spent:0, fav:'Coupe Simple' };
  DB.clients.push(c);
  saveDB();
  apiCall('POST','/api/clients', c).catch(()=>{});
  toast('Client créé ✓','success');
  closeModal('modal-client-new');
  ['cli-fname','cli-lname','cli-phone','cli-email'].forEach(id => document.getElementById(id).value = '');
  refreshClientsDatalist();
  renderClientsList();
}
function refreshClientsDatalist(){
  const dl = document.getElementById('clientsDatalist');
  if(!dl) return;
  dl.innerHTML = DB.clients.map(c => `<option value="${clientName(c)}">`).join('');
}
async function syncSumUp(){
  toast('Sync SumUp en cours…');
  try{
    const r = await apiCall('POST','/sumup/sync-customers', { key: DB.settings.sumupKey });
    if(r && Array.isArray(r.customers)){
      let added = 0;
      r.customers.forEach(su => {
        if(!DB.clients.find(c => c.sumupId === su.customer_id || (c.email && c.email === su.contact?.email))){
          DB.clients.push({
            id: uid(),
            fname: su.personal_details?.first_name || 'Client',
            lname: su.personal_details?.last_name || '',
            phone: su.personal_details?.phone || '',
            email: su.contact?.email || '',
            sumupId: su.customer_id,
            visits: 0, spent: 0, fav: 'Coupe Simple'
          });
          added++;
        }
      });
      saveDB();
      renderClientsList();
      toast(added ? `${added} clients importés ✓` : 'Déjà à jour', 'success');
    }
  }catch(e){ toast('Erreur sync : '+e.message,'danger'); }
}

// ─── ENCAISSEMENT ───────────────────────────────────────────
let cart = [];
let cartMethod = 'sumup';
let payPeriod = 'today';
function renderEncaissement(){
  document.getElementById('cash-services').innerHTML = SERVICES.map(s => `
    <button class="cash-svc" onclick="addToCart('${s.id}','svc')">
      ${s.internal ? '<div class="cash-svc-dm">DM</div>' : ''}
      <img class="cash-svc-img" src="${s.img}" alt="${s.name}" loading="lazy">
      <div class="cash-svc-body">
        <div class="cash-svc-name">${s.name}</div>
        <div class="cash-svc-price">${s.price} €</div>
      </div>
    </button>
  `).join('');
  document.getElementById('cash-addons').innerHTML = ADDONS.map(a => `
    <button class="cash-addon" onclick="addToCart('${a.id}','add')">
      <img class="cash-addon-img" src="${a.img}" alt="${a.name}" loading="lazy">
      <span>${a.name}</span><span style="color:var(--gold-0);font-weight:700">+${a.price}€</span>
    </button>
  `).join('');
  refreshClientsDatalist();
  renderCart();
  renderPayHistory();
}
function addToCart(id, kind){
  const item = (kind === 'svc' ? SERVICES : ADDONS).find(x => x.id === id);
  if(!item) return;
  cart.push({ kind, id:item.id, name:item.name, price:item.price, duration:item.duration||0, lineId:uid() });
  renderCart();
}
function removeCartLine(lineId){ cart = cart.filter(l => l.lineId !== lineId); renderCart(); }
function renderCart(){
  const lines = document.getElementById('cart-lines');
  if(!cart.length){
    lines.innerHTML = '<div class="empty" style="padding:var(--sp-4) 0"><i class="ti ti-shopping-cart-off"></i>Panier vide</div>';
  } else {
    lines.innerHTML = cart.map(l => `
      <div class="cart-line">
        <span class="name">${l.name}</span>
        <span class="price">${fmtMoney(l.price)}</span>
        <button class="btn-icon" style="width:24px;height:24px;font-size:13px" onclick="removeCartLine('${l.lineId}')" aria-label="Supprimer"><i class="ti ti-x"></i></button>
      </div>`).join('');
  }
  const total = cart.reduce((s,l) => s + l.price, 0);
  document.getElementById('cart-total').textContent = fmtMoney(total);
  document.getElementById('encaisser-amount').textContent = fmtMoney(total);
}
function resetCart(){ cart = []; renderCart(); }
function setPayMethod(m){
  cartMethod = m;
  document.querySelectorAll('.pay-m').forEach(el => el.classList.toggle('sel', el.dataset.method === m));
}
function encaisser(){
  if(!cart.length){ toast('Panier vide','warning'); return; }
  const total = cart.reduce((s,l) => s + l.price, 0);
  const clientNameInput = document.getElementById('cart-client').value.trim();
  const c = clientNameInput ? getOrCreateClient(clientNameInput) : null;
  if(cartMethod === 'sumup'){
    triggerCheckout(total, cart.map(l => l.name).join(' + '), c);
    return;
  }
  finalizePayment(total, c);
}
function finalizePayment(total, c, checkoutId){
  const services = cart.filter(l => l.kind==='svc').map(l => l.name).join(' + ');
  const items = cart.map(l => l.name).join(' + ');
  const pay = {
    id: uid(),
    clientId: c?.id || null,
    clientName: c ? clientName(c) : '',
    service: items,
    amount: total,
    method: cartMethod,
    date: TODAY(),
    time: NOW_HHMM(),
    checkoutId: checkoutId || null,
    createdAt: new Date().toISOString(),
  };
  DB.payments.push(pay);
  saveDB();
  apiCall('POST','/api/payments', pay).catch(()=>{});
  if(c){
    c.visits = (c.visits || 0) + 1;
    c.spent = (c.spent || 0) + total;
    c.lastVisit = pay.date;
    if(services) c.fav = services;
    apiCall('PUT','/api/clients/'+c.id, c).catch(()=>{});
  }
  cart.filter(l => l.kind === 'add').forEach(l => {
    const stk = DB.stock.find(s => s.name.toLowerCase().includes(l.name.toLowerCase().replace(/[+]/g,'').trim()));
    if(stk && stk.qty > 0){ stk.qty -= 1; }
  });
  saveDB();
  pushNotif('Paiement reçu', `${pay.clientName || 'Client'} — ${fmtMoney(total)} ${cartMethod}`, 'var(--success)');
  toast(`Encaissé ${fmtMoney(total)} ✓`,'success');
  cart = [];
  document.getElementById('cart-client').value = '';
  renderCart();
  renderPayHistory();
}
function setPayPeriod(p){
  payPeriod = p;
  document.querySelectorAll('[data-period]').forEach(el => el.classList.toggle('active', el.dataset.period === p));
  renderPayHistory();
}
async function refreshPayHistory(){
  toast('Actualisation des paiements…');
  try{
    const pays = await apiCall('GET','/api/payments');
    if(Array.isArray(pays)){
      DB.payments = pays;
      saveDB();
      renderPayHistory();
      toast('Paiements à jour ✓','success');
    }
  }catch(e){ toast('Backend indisponible','danger'); }
}
function renderPayHistory(){
  const today = TODAY();
  const now = new Date();
  const weekStart = (() => { const d = new Date(now); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); })();
  const monthStart = today.slice(0,7) + '-01';
  let pays;
  if(payPeriod === 'today') pays = DB.payments.filter(p => p.date === today);
  else if(payPeriod === 'week') pays = DB.payments.filter(p => p.date >= weekStart);
  else if(payPeriod === 'month') pays = DB.payments.filter(p => p.date >= monthStart);
  else pays = DB.payments;
  pays = [...pays].sort((a,b) => (b.date+(b.time||'')).localeCompare(a.date+(a.time||'')));
  const container = document.getElementById('pay-history');
  if(!pays.length){
    container.innerHTML = '<div class="empty"><i class="ti ti-receipt-off"></i>Aucun paiement sur la période</div>';
    return;
  }
  const total = pays.reduce((s,p) => s + parseFloat(p.amount||0), 0);
  const ICONS = { sumup:'ti-credit-card', cash:'ti-cash', link:'ti-link' };
  container.innerHTML = `<div style="font-size:12px;color:var(--marble-2);margin-bottom:var(--sp-2)">${pays.length} transactions · Total <strong style="color:var(--gold-0);font-family:'Unbounded'">${fmtMoney(total)}</strong></div>` +
    pays.map(p => {
      const c = clientById(p.clientId);
      return `<div class="pay-row">
        <div class="pay-icon" style="background:rgba(200,168,90,.1)"><i class="ti ${ICONS[p.method]||'ti-receipt'}" style="color:var(--gold-0)"></i></div>
        <div class="pay-info">
          <div class="pay-name">${c ? clientName(c) : (p.clientName || 'Client')}</div>
          <div class="pay-time">${fmtDateFR(p.date)} ${p.time||''} · ${p.service || '—'}</div>
        </div>
        <div class="pay-amount pos">+${fmtMoney(p.amount)}</div>
      </div>`;
    }).join('');
}

// ─── CHECKOUT SUMUP ─────────────────────────────────────────
let pendingCheckout = null;
async function triggerCheckout(amount, label, c){
  pendingCheckout = { amount, label, c, checkoutId:null };
  document.getElementById('ck-amount').textContent = fmtMoney(amount);
  document.getElementById('ck-status').textContent = 'Création du checkout…';
  document.getElementById('ck-link-box').classList.add('hidden');
  document.getElementById('ck-confirm').disabled = true;
  openModal('modal-checkout');
  try{
    const r = await apiCall('POST','/sumup/checkout', { amount, description: label, key: DB.settings.sumupKey, merchant: DB.settings.sumupMerchant });
    if(r?.checkout_url){
      pendingCheckout.checkoutId = r.checkout_id;
      document.getElementById('ck-status').textContent = 'En attente de paiement client';
      document.getElementById('ck-link-box').classList.remove('hidden');
      const a = document.getElementById('ck-link');
      a.textContent = r.checkout_url;
      a.href = r.checkout_url;
      document.getElementById('ck-qr').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=14161B&color=C8A85A&data=${encodeURIComponent(r.checkout_url)}" alt="QR" style="border-radius:8px">`;
      document.getElementById('ck-confirm').disabled = false;
    } else {
      throw new Error('Réponse SumUp invalide');
    }
  }catch(e){
    document.getElementById('ck-status').innerHTML = `<span style="color:var(--warning)">⚠ Backend SumUp indisponible. Marquage manuel possible.</span>`;
    document.getElementById('ck-confirm').disabled = false;
  }
}
function confirmCheckout(){
  if(!pendingCheckout) return;
  finalizePayment(pendingCheckout.amount, pendingCheckout.c, pendingCheckout.checkoutId);
  closeModal('modal-checkout');
  pendingCheckout = null;
}

// ─── STOCK ──────────────────────────────────────────────────
function renderStock(){
  const grid = document.getElementById('stock-grid');
  if(!DB.stock.length){
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><i class="ti ti-package-off"></i>Aucun article. Ajoutez-en un.</div>';
    return;
  }
  grid.innerHTML = DB.stock.map(s => {
    const cls = s.qty <= 0 ? 'crit' : s.qty <= s.threshold ? 'low' : '';
    return `<div class="stock-card">
      <div class="stock-name">${s.name}</div>
      <div class="stock-qty ${cls}">${s.qty}<span style="font-size:13px;opacity:.6"> unités</span></div>
      <div class="stock-meta">Seuil alerte : ${s.threshold} ${s.price ? '· ' + fmtMoney(s.price) : ''}</div>
      <div class="stock-actions">
        <button class="btn btn-ghost btn-xs" onclick="adjustStock('${s.id}',-1)"><i class="ti ti-minus"></i></button>
        <button class="btn btn-ghost btn-xs" onclick="adjustStock('${s.id}',1)"><i class="ti ti-plus"></i></button>
        <button class="btn btn-ghost btn-xs" style="margin-left:auto" onclick="editStock('${s.id}')"><i class="ti ti-edit"></i></button>
        <button class="btn btn-danger btn-xs" onclick="deleteStock('${s.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}
function adjustStock(id, delta){
  const s = DB.stock.find(x => x.id === id);
  if(!s) return;
  s.qty = Math.max(0, s.qty + delta);
  saveDB();
  renderStock();
}
function editStock(id){
  const s = DB.stock.find(x => x.id === id);
  if(!s) return;
  document.getElementById('stock-edit-id').value = s.id;
  document.getElementById('stock-name').value = s.name;
  document.getElementById('stock-qty').value = s.qty;
  document.getElementById('stock-threshold').value = s.threshold;
  document.getElementById('stock-price').value = s.price || '';
  openModal('modal-stock-new');
}
function deleteStock(id){
  if(!confirm('Supprimer cet article ?')) return;
  DB.stock = DB.stock.filter(s => s.id !== id);
  saveDB();
  renderStock();
}
function saveStockItem(){
  const id = document.getElementById('stock-edit-id').value;
  const name = document.getElementById('stock-name').value.trim();
  const qty = parseInt(document.getElementById('stock-qty').value) || 0;
  const threshold = parseInt(document.getElementById('stock-threshold').value) || 0;
  const price = parseFloat(document.getElementById('stock-price').value) || 0;
  if(!name){ toast('Nom requis','danger'); return; }
  if(id){
    const s = DB.stock.find(x => x.id === id);
    if(s) Object.assign(s, { name, qty, threshold, price });
  } else {
    DB.stock.push({ id:uid(), name, qty, threshold, price });
  }
  saveDB();
  toast('Article enregistré ✓','success');
  ['stock-edit-id','stock-name','stock-price'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('stock-qty').value = 0;
  document.getElementById('stock-threshold').value = 3;
  closeModal('modal-stock-new');
  renderStock();
}

// ─── STATS ──────────────────────────────────────────────────
let chartMonth = null, chartPresta = null;
function _caForPrefix(prefix){
  return DB.appointments
    .filter(a => a.status !== 'cancelled' && a.status !== 'noshow' && a.date && a.date.startsWith(prefix))
    .reduce((s,a) => { const sv = SERVICES.find(x=>x.name===a.service); return s+(sv?sv.price:parseFloat(a.price||0)); }, 0);
}
function renderStats(){
  if(typeof Chart === 'undefined') return;
  const now = new Date();
  const today = TODAY();
  const monthStart = today.slice(0,7);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevMonth = prevMonthDate.toISOString().slice(0,7);
  const labels = [];
  const series = [];
  for(let i=11; i>=0; i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const m = d.toISOString().slice(0,7);
    labels.push(['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'][d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
    series.push(Math.ceil(_caForPrefix(m)));
  }
  const ctxM = document.getElementById('chart-month');
  if(ctxM){
    if(chartMonth) chartMonth.destroy();
    chartMonth = new Chart(ctxM.getContext('2d'), {
      type:'line',
      data:{ labels, datasets:[{ data:series, borderColor:'#C8A85A', backgroundColor:'rgba(200,168,90,.15)', fill:true, tension:.35, borderWidth:2, pointBackgroundColor:'#E8C87A', pointRadius:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx => Math.ceil(ctx.parsed.y) + ' €' } } }, scales:{ x:{ ticks:{color:'#8A857E'} }, y:{ ticks:{color:'#8A857E', callback:v=>Math.ceil(v)+'€'}, beginAtZero:true } } }
    });
  }
  const counts = {};
  DB.appointments.filter(a => a.status !== 'cancelled').forEach(a => { if(a.service) counts[a.service] = (counts[a.service]||0) + 1; });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const ctxP = document.getElementById('chart-presta');
  if(ctxP){
    if(chartPresta) chartPresta.destroy();
    const colors = ['#C8A85A','#E8C87A','#8A6E36','#9B59B6','#4A9AC8','#C8892A','#4ABA6A'];
    chartPresta = new Chart(ctxP.getContext('2d'), {
      type:'doughnut',
      data:{ labels: sorted.length ? sorted.map(s=>s[0]) : ['Aucune donnée'], datasets:[{ data: sorted.length ? sorted.map(s=>s[1]) : [1], backgroundColor: sorted.length ? colors.slice(0,sorted.length) : ['#2A2A2A'], borderColor:'#14161B', borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#C9C3B8', font:{family:'Syne',size:11} } } } }
    });
  }
  const rdvToday = DB.appointments.filter(a => a.date === today && a.status !== 'cancelled').length;
  const caMonth = _caForPrefix(monthStart);
  const caPrevMonth = _caForPrefix(prevMonth);
  const weekStartDate = new Date(now); weekStartDate.setDate(weekStartDate.getDate()-7);
  const weekStartStr = weekStartDate.toISOString().slice(0,10);
  const caWeek = DB.appointments
    .filter(a => a.status !== 'cancelled' && a.status !== 'noshow' && a.date && a.date >= weekStartStr)
    .reduce((s,a) => { const sv = SERVICES.find(x=>x.name===a.service); return s+(sv?sv.price:parseFloat(a.price||0)); }, 0);
  const yearPrefix = String(now.getFullYear());
  const caYear = DB.appointments
    .filter(a => a.status !== 'cancelled' && a.status !== 'noshow' && a.date && a.date.startsWith(yearPrefix))
    .reduce((s,a) => { const sv = SERVICES.find(x=>x.name===a.service); return s+(sv?sv.price:parseFloat(a.price||0)); }, 0);
  const monthRdv = DB.appointments.filter(a => a.date && a.date.startsWith(monthStart) && a.status !== 'cancelled').length;
  const monthAppts = DB.appointments.filter(a => a.date && a.date.startsWith(monthStart) && a.status !== 'cancelled');
  const noshows = monthAppts.filter(a => a.status === 'noshow').length;
  const nsRate = monthAppts.length ? Math.round((noshows/monthAppts.length)*100) : 0;
  const cancelled = monthAppts.filter(a => a.status === 'cancelled').length;
  const cancelRate = monthAppts.length ? Math.round((cancelled/monthAppts.length)*100) : 0;
  const caPrevu = DB.appointments
    .filter(a => a.date && a.date.startsWith(monthStart) && a.status !== 'done' && a.status !== 'cancelled')
    .reduce((s,a) => { const sv = SERVICES.find(x=>x.name===a.service); return s+(sv?sv.price:parseFloat(a.price||0)); }, 0);
  const rdvPrevus = DB.appointments
    .filter(a => a.date && a.date.startsWith(monthStart) && a.date >= today && a.status !== 'cancelled').length;
  const URSSAF_RATE = 0.209;
  const benefitWeek = caWeek * (1 - URSSAF_RATE);
  const benefitMonth = caMonth * (1 - URSSAF_RATE);
  const benefitYear = caYear * (1 - URSSAF_RATE);
  const trend = caPrevMonth > 0 ? Math.round((caMonth-caPrevMonth)/caPrevMonth*100) : null;
  const trendHtml = trend !== null ? `<span style="font-size:11px;margin-left:6px;color:${trend>=0?'var(--success)':'var(--danger)'}"><i class="ti ti-trending-${trend>=0?'up':'down'}"></i>${Math.abs(trend)}%</span>` : '';
  document.getElementById('global-stats').innerHTML = `
    <div style="margin-bottom:var(--sp-5)">
      <div style="font-size:13px;font-weight:700;color:var(--marble-0);margin-bottom:var(--sp-3);letter-spacing:.5px;text-transform:uppercase">Chiffre d'affaires</div>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:5px">
        <div class="kpi-card kpi-ca-week" style="border-radius:22px 6px 6px 22px"><i class="ti ti-coin kpi-icon"></i><div class="kpi-label">CA cette semaine</div><div class="kpi-value">${fmtMoney(caWeek)}</div></div>
        <div class="kpi-card kpi-ca-month" style="border-radius:6px"><i class="ti ti-coin kpi-icon"></i><div class="kpi-label">CA ce mois</div><div class="kpi-value">${fmtMoney(caMonth)}${trendHtml}</div></div>
        <div class="kpi-card kpi-ca-year" style="border-radius:6px 22px 22px 6px"><i class="ti ti-coin kpi-icon"></i><div class="kpi-label">CA cette année</div><div class="kpi-value">${fmtMoney(caYear)}</div></div>
      </div>
    </div>
    <div style="margin-bottom:var(--sp-5)">
      <div style="font-size:13px;font-weight:700;color:var(--marble-0);margin-bottom:var(--sp-3);letter-spacing:.5px;text-transform:uppercase">Bénéfice net (après URSSAF 20,9%)</div>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:5px">
        <div class="kpi-card kpi-benefit-week" style="border-radius:22px 6px 6px 22px"><i class="ti ti-trending-up kpi-icon"></i><div class="kpi-label">Bénéfice cette semaine</div><div class="kpi-value">${fmtMoney(benefitWeek)}</div></div>
        <div class="kpi-card kpi-benefit-month" style="border-radius:6px"><i class="ti ti-trending-up kpi-icon"></i><div class="kpi-label">Bénéfice ce mois</div><div class="kpi-value">${fmtMoney(benefitMonth)}</div></div>
        <div class="kpi-card kpi-benefit-year" style="border-radius:6px 22px 22px 6px"><i class="ti ti-trending-up kpi-icon"></i><div class="kpi-label">Bénéfice cette année</div><div class="kpi-value">${fmtMoney(benefitYear)}</div></div>
      </div>
    </div>
    <div style="margin-bottom:var(--sp-5)">
      <div style="font-size:13px;font-weight:700;color:var(--marble-0);margin-bottom:var(--sp-3);letter-spacing:.5px;text-transform:uppercase">Prévisions ce mois</div>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:5px">
        <div class="kpi-card" style="border-radius:22px 6px 6px 22px"><i class="ti ti-calendar-dollar kpi-icon"></i><div class="kpi-label">CA attendu ce mois</div><div class="kpi-value">${fmtMoney(caPrevu)}</div></div>
        <div class="kpi-card" style="border-radius:6px"><i class="ti ti-calendar-check kpi-icon"></i><div class="kpi-label">RDV à venir ce mois</div><div class="kpi-value">${rdvPrevus}</div></div>
        <div class="kpi-card kpi-rdv-today" style="border-radius:6px 22px 22px 6px"><i class="ti ti-calendar-check kpi-icon"></i><div class="kpi-label">RDV aujourd'hui</div><div class="kpi-value">${rdvToday}</div></div>
      </div>
    </div>
    <div>
      <div style="font-size:13px;font-weight:700;color:var(--marble-0);margin-bottom:var(--sp-3);letter-spacing:.5px;text-transform:uppercase">Qualité de service</div>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:5px">
        <div class="kpi-card kpi-noshow" style="border-radius:22px 6px 6px 22px"><i class="ti ti-clock-x kpi-icon"></i><div class="kpi-label">Taux no-show</div><div class="kpi-value"><span>${nsRate}</span><span class="unit">%</span></div></div>
        <div class="kpi-card kpi-cancel" style="border-radius:6px 22px 22px 6px"><i class="ti ti-calendar-x kpi-icon"></i><div class="kpi-label">Taux annulation</div><div class="kpi-value"><span>${cancelRate}</span><span class="unit">%</span></div></div>
      </div>
    </div>
  `;
}

// ─── FIDELITE ───────────────────────────────────────────────
function renderFidelite(){
  const buckets = { bronze:[], argent:[], or:[] };
  DB.clients.forEach(c => {
    const lv = fidelityLevel(c.visits || 0);
    if(lv) buckets[lv].push(c);
  });
  ['bronze','argent','or'].forEach(k => {
    document.getElementById('fid-'+k+'-count').textContent = buckets[k].length;
    const list = document.getElementById('fid-'+k+'-list');
    if(!buckets[k].length){
      list.innerHTML = '<div class="empty" style="padding:var(--sp-3) 0;font-size:11px"><i class="ti ti-user-off"></i>Aucun client</div>';
      return;
    }
    list.innerHTML = buckets[k].sort((a,b) => (b.visits||0)-(a.visits||0)).slice(0,10).map(c => `
      <div class="client-row" style="padding:7px 0">
        <div class="client-av" style="width:30px;height:30px;font-size:10px">${((c.fname||'')[0]||'')+((c.lname||'')[0]||'C')}</div>
        <div class="client-info"><div class="client-name" style="font-size:12px">${clientName(c)}</div><div class="client-meta">${c.visits} visites</div></div>
        <div class="client-amount" style="font-size:11.5px">${fmtMoney(c.spent||0)}</div>
      </div>`).join('');
  });
}

// ─── MARKETING ──────────────────────────────────────────────
function getInactiveClients(){
  const cutoff = Date.now() - 60*86400000;
  return DB.clients.filter(c => {
    if(!c.lastVisit) return (c.visits || 0) > 0;
    return new Date(c.lastVisit).getTime() < cutoff;
  });
}
function getBirthdayClients(){
  const m = new Date().getMonth();
  return DB.clients.filter(c => c.birthday && new Date(c.birthday).getMonth() === m);
}
function getNewClients(){
  const cutoff = Date.now() - 30*86400000;
  return DB.clients.filter(c => (c.visits || 0) <= 1 && (!c.created_at || new Date(c.created_at).getTime() > cutoff));
}
function getVipClients(){
  return DB.clients.filter(c => fidelityLevel(c.visits || 0) === 'or');
}

function renderMarketing(){
  const inactive = getInactiveClients();
  const birthday = getBirthdayClients();
  const newest = getNewClients();
  const vips = getVipClients();
  document.getElementById('mkt-stat-inactive').textContent = inactive.length;
  document.getElementById('mkt-stat-birthday').textContent = birthday.length;
  document.getElementById('mkt-stat-new').textContent = newest.length;
  document.getElementById('mkt-stat-vip').textContent = vips.length;

  document.getElementById('mkt-tpl-inactive').value = DB.settings.mktTemplates.inactive || '';
  document.getElementById('mkt-tpl-birthday').value = DB.settings.mktTemplates.birthday || '';
  document.getElementById('mkt-tpl-welcome').value = DB.settings.mktTemplates.welcome || '';

  const list = document.getElementById('mkt-inactive-list');
  if(!inactive.length){
    list.innerHTML = '<div class="empty" style="padding:var(--sp-3) 0"><i class="ti ti-mood-happy"></i>Aucun client inactif 🎉</div>';
    return;
  }
  list.innerHTML = inactive.slice(0,30).map(c => {
    const phone = c.phone || '';
    const email = c.email || '';
    return `<div class="client-row">
      <div class="client-av">${((c.fname||'')[0]||'')+((c.lname||'')[0]||'C')}</div>
      <div class="client-info"><div class="client-name">${clientName(c)}</div><div class="client-meta">Dernière visite : ${c.lastVisit ? fmtDateFR(c.lastVisit) : 'jamais'} · ${c.visits||0} visite${(c.visits||0)>1?'s':''}</div></div>
      <div class="flex gap-2" onclick="event.stopPropagation()">
        ${phone ? `<button class="btn btn-ghost btn-xs" onclick="mktSendSms('${c.id}','inactive')" title="SMS"><i class="ti ti-message"></i></button>` : ''}
        ${email ? `<button class="btn btn-ghost btn-xs" onclick="mktSendEmail('${c.id}','inactive')" title="Email"><i class="ti ti-mail"></i></button>` : ''}
      </div>
    </div>`;
  }).join('');
}
function mktSaveTemplates(){
  DB.settings.mktTemplates.inactive = document.getElementById('mkt-tpl-inactive').value;
  DB.settings.mktTemplates.birthday = document.getElementById('mkt-tpl-birthday').value;
  DB.settings.mktTemplates.welcome = document.getElementById('mkt-tpl-welcome').value;
  saveDB();
  apiCall('POST','/api/settings', { mktTemplates: JSON.stringify(DB.settings.mktTemplates) }).catch(()=>{});
  toast('Modèles enregistrés ✓','success');
}
function applyTemplate(tpl, c){
  return (tpl || '')
    .replaceAll('{prenom}', c.fname || '')
    .replaceAll('{nom}', c.lname || '')
    .replaceAll('{visites}', String(c.visits || 0));
}
function mktSendSms(id, tplKey){
  const c = clientById(id);
  if(!c || !c.phone) return;
  const body = applyTemplate(DB.settings.mktTemplates[tplKey], c);
  window.location.href = `sms:${c.phone}${navigator.userAgent.includes('iPhone') ? '&' : '?'}body=${encodeURIComponent(body)}`;
}
function mktSendEmail(id, tplKey){
  const c = clientById(id);
  if(!c || !c.email) return;
  const body = applyTemplate(DB.settings.mktTemplates[tplKey], c);
  const subject = tplKey === 'birthday' ? 'Joyeux anniversaire !' : tplKey === 'welcome' ? 'Bienvenue chez FCUTZ' : 'Tu nous manques chez FCUTZ';
  window.location.href = `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function mktCampaign(kind){
  let list = [], tplKey = kind === 'welcome' ? 'welcome' : kind === 'birthday' ? 'birthday' : kind === 'vip' ? 'vip' : 'inactive';
  if(kind === 'inactive') list = getInactiveClients();
  else if(kind === 'birthday') list = getBirthdayClients();
  else if(kind === 'welcome') list = getNewClients();
  else if(kind === 'vip') list = getVipClients();
  if(!list.length){ toast('Aucun client dans cette catégorie', 'warning'); return; }
  // Build a single SMS link with the first eligible client + propose recap
  const withPhone = list.filter(c => c.phone);
  if(!withPhone.length){ toast('Aucun téléphone disponible', 'warning'); return; }
  if(!confirm(`Lancer la campagne SMS vers ${withPhone.length} client(s) ? Le SMS sera ouvert un par un dans ton app par défaut.`)) return;
  // Open first ; user can iterate
  mktSendSms(withPhone[0].id, tplKey);
  toast(`SMS prêt pour ${clientName(withPhone[0])}. Reproduis pour les ${withPhone.length-1} suivants.`, 'success');
}

// ─── PARAMETRES ─────────────────────────────────────────────
function renderHoursRows(){
  const wrap = document.getElementById('hours-rows');
  wrap.innerHTML = DAY_KEYS.map(k => {
    const h = getDayHours(k);
    return `<div class="day-row ${h.open ? '' : 'off'}" data-day="${k}">
      <div class="dlabel">${DAY_LABELS[k]}</div>
      <label class="switch"><input type="checkbox" ${h.open ? 'checked' : ''} onchange="toggleDayOpen('${k}', this.checked)"><span class="slider"></span></label>
      <input class="input" type="time" value="${h.start || '09:00'}" onchange="setDayTime('${k}','start',this.value)">
      <input class="input" type="time" value="${h.end || '19:00'}" onchange="setDayTime('${k}','end',this.value)">
    </div>`;
  }).join('');
}
function toggleDayOpen(k, open){
  DB.settings.hours[k] = DB.settings.hours[k] || {};
  DB.settings.hours[k].open = open;
  saveDB();
  window._settingsDirty = true;
  apiCall('POST', '/api/availability', { hours: DB.settings.hours, closedDates: DB.availability.closedDates })
    .then(() => { window._settingsDirty = false; toast('Horaires enregistrés ✓','success'); })
    .catch(() => toast('Erreur de sauvegarde — changements conservés localement','warning'));
  renderHoursRows();
}
function setDayTime(k, which, val){
  DB.settings.hours[k] = DB.settings.hours[k] || {};
  DB.settings.hours[k][which] = val;
  saveDB();
  window._settingsDirty = true;
  apiCall('POST', '/api/availability', { hours: DB.settings.hours, closedDates: DB.availability.closedDates })
    .then(() => { window._settingsDirty = false; })
    .catch(() => toast('Erreur de sauvegarde — changements conservés localement','warning'));
}

function loadSettingsForm(){
  document.getElementById('set-barber-name').value = DB.settings.barberName || '';
  document.getElementById('set-barber-initials').value = DB.settings.barberInitials || '';
  document.getElementById('set-objective').value = DB.settings.objective || 5000;
  document.getElementById('set-sumup-key').value = DB.settings.sumupKey || '';
  document.getElementById('set-sumup-merchant').value = DB.settings.sumupMerchant || '';
  document.getElementById('set-bio-enabled').checked = localStorage.getItem(BIO_KEY) === '1';
  const pushActive = !!(localStorage.getItem('fcutz_push_sub') || localStorage.getItem('fcutz_push_enabled'));
  document.getElementById('set-push-enabled').checked = pushActive;
  document.getElementById('push-state-txt').textContent = `Statut : ${pushActive ? 'activé sur cet appareil' : 'non configuré'}`;

  // Immediate persistence on change
  const onSettingChange = () => {
    DB.settings.barberName = document.getElementById('set-barber-name').value.trim() || 'Fcutz';
    DB.settings.barberInitials = (document.getElementById('set-barber-initials').value.trim() || 'FC').slice(0,3).toUpperCase();
    DB.settings.objective = parseInt(document.getElementById('set-objective').value) || 5000;
    DB.settings.sumupKey = document.getElementById('set-sumup-key').value.trim();
    DB.settings.sumupMerchant = document.getElementById('set-sumup-merchant').value.trim();
    saveDB();
    window._settingsDirty = true;
    document.getElementById('barber-name').textContent = DB.settings.barberName;
    document.getElementById('barber-initials').textContent = DB.settings.barberInitials;
    document.getElementById('topbar-name').textContent = DB.settings.barberName;
    apiCall('POST','/api/settings', {
      barber_name: DB.settings.barberName,
      objective: String(DB.settings.objective),
      sumup_key: DB.settings.sumupKey || '',
      sumup_merchant: DB.settings.sumupMerchant || '',
    }).then(() => { window._settingsDirty = false; })
    .catch(() => {});
  };
  document.getElementById('set-barber-name').addEventListener('change', onSettingChange);
  document.getElementById('set-barber-initials').addEventListener('change', onSettingChange);
  document.getElementById('set-objective').addEventListener('change', onSettingChange);
  document.getElementById('set-sumup-key').addEventListener('change', onSettingChange);
  document.getElementById('set-sumup-merchant').addEventListener('change', onSettingChange);

  document.getElementById('set-bio-enabled').addEventListener('change', (e) => {
    localStorage.setItem(BIO_KEY, e.target.checked ? '1' : '0');
    if(!e.target.checked) localStorage.removeItem(BIO_CRED_KEY);
  });

  renderHoursRows();
}
function saveSettings(){
  DB.settings.barberName = document.getElementById('set-barber-name').value.trim() || 'Fcutz';
  DB.settings.barberInitials = (document.getElementById('set-barber-initials').value.trim() || 'FC').slice(0,3).toUpperCase();
  DB.settings.objective = parseInt(document.getElementById('set-objective').value) || 5000;
  DB.settings.sumupKey = document.getElementById('set-sumup-key').value.trim();
  DB.settings.sumupMerchant = document.getElementById('set-sumup-merchant').value.trim();

  const bio = document.getElementById('set-bio-enabled').checked;
  localStorage.setItem(BIO_KEY, bio ? '1' : '0');
  if(!bio) localStorage.removeItem(BIO_CRED_KEY);

  const pinOld = document.getElementById('set-pin-old').value;
  const pinNew = document.getElementById('set-pin-new').value;
  if(pinNew){
    if(pinOld !== pinGet()){ toast('Ancien PIN incorrect','danger'); return; }
    if(pinNew.length < 4){ toast('Nouveau PIN trop court','danger'); return; }
    pinSet(pinNew);
    document.getElementById('set-pin-old').value = '';
    document.getElementById('set-pin-new').value = '';
    toast('PIN modifié ✓','success');
  }
  saveDB();
  // Push to backend
  apiCall('POST','/api/settings', {
    hours: JSON.stringify(DB.settings.hours),
    barber_name: DB.settings.barberName,
    objective: String(DB.settings.objective),
    sumup_key: DB.settings.sumupKey || '',
    sumup_merchant: DB.settings.sumupMerchant || '',
  }).catch(()=>{});
  document.getElementById('barber-name').textContent = DB.settings.barberName;
  document.getElementById('barber-initials').textContent = DB.settings.barberInitials;
  document.getElementById('topbar-name').textContent = DB.settings.barberName;
  toast('Paramètres enregistrés ✓','success');
}
async function runDeduplicateClients(){
  const n = deduplicateClients();
  toast('Nettoyage en cours…', 'gold');
  try{
    const r = await apiCall('POST', '/api/admin/merge-dupes');
    await syncFromBackend();
    const total = n + (r?.totalMerged || 0);
    if(total === 0) toast('Aucun doublon détecté ✓','success');
    else toast(`${total} doublon${total>1?'s':''} supprimé${total>1?'s':''} ✓`, 'success');
    renderClients();
  }catch(e){
    if(n === 0) toast('Aucun doublon local — backend inaccessible','r');
    else { toast(`${n} doublon${n>1?'s':''} local${n>1?'s':''} supprimé${n>1?'s':''} ✓`,'success'); renderClients(); }
  }
}
function exportDB(){
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fcutz-export-${TODAY()}.json`;
  a.click();
  toast('Export téléchargé','success');
}
function importDB(ev){
  const f = ev.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = e => {
    try{
      const p = JSON.parse(e.target.result);
      if(!confirm('Remplacer toutes les données actuelles par celles du fichier ?')) return;
      Object.assign(DB, p);
      saveDB();
      toast('Import effectué ✓','success');
      nav('dashboard');
    }catch(err){ toast('Fichier JSON invalide','danger'); }
  };
  r.readAsText(f);
  ev.target.value = '';
}
function resetTransactions(){
  if(!confirm('Vider tous les paiements et rendez-vous de test ? Les clients et le stock sont conservés.')) return;
  DB.payments = [];
  DB.appointments = [];
  saveDB();
  apiCall('DELETE','/api/payments/all').catch(()=>{});
  toast('Transactions vidées ✓','success');
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}
function resetDB(){
  if(!confirm('⚠️ Réinitialiser TOUTES les données (clients, RDV, paiements, stock) ? Cette action est irréversible.')) return;
  if(!confirm('Êtes-vous absolument sûr ?')) return;
  localStorage.removeItem(DB_KEY);
  location.reload();
}


// ─── MODALS ─────────────────────────────────────────────────
function openModal(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('open');
  if(id === 'modal-rdv-new'){
    if(!document.getElementById('rdv-date').value) document.getElementById('rdv-date').value = TODAY();
    if(!document.getElementById('rdv-time').value) document.getElementById('rdv-time').value = '10:00';
    populateServiceSelect('rdv-service');
    rdvCheckConflict();
    refreshClientsDatalist();
  }
  if(id === 'modal-pin'){
    _pinBuffer = '';
    renderPinDots();
    // Show bio button if available + enabled
    const bioBtn = document.getElementById('keypad-bio');
    const bioEnabled = localStorage.getItem(BIO_KEY) === '1' && !!window.PublicKeyCredential;
    if(bioBtn) bioBtn.style.visibility = bioEnabled ? 'visible' : 'hidden';
  }
}
function closeModal(id){
  const el = document.getElementById(id);
  if(el) el.classList.remove('open');
}

// ─── DISPONIBILITÉS ─────────────────────────────────────────
function renderDisponibilites(){
  const cont = document.getElementById('dispo-rows');
  if(!cont) return;
  cont.innerHTML = '';
  DAY_KEYS.forEach((dayKey) => {
    const h = DB.settings.hours[dayKey];
    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `
      <div class="dlabel">${DAY_LABELS[dayKey]}</div>
      <label class="switch">
        <input type="checkbox" ${h.open ? 'checked' : ''} onchange="toggleDayOpenDispo('${dayKey}', this.checked)">
        <span class="slider"></span>
      </label>
      <input class="input day-open-${dayKey}" type="time" value="${h.start}" onchange="updateDayTimeDispo('${dayKey}', 'start', this.value)" ${!h.open ? 'disabled' : ''}>
      <input class="input day-close-${dayKey}" type="time" value="${h.end}" onchange="updateDayTimeDispo('${dayKey}', 'end', this.value)" ${!h.open ? 'disabled' : ''}>
    `;
    cont.appendChild(row);
  });
  renderClosedDays();
}
function toggleDayOpenDispo(dayKey, isOpen){
  DB.settings.hours[dayKey].open = isOpen;
  document.querySelector('.day-open-' + dayKey).disabled = !isOpen;
  document.querySelector('.day-close-' + dayKey).disabled = !isOpen;
  saveDB();
  window._settingsDirty = true;
  apiCall('POST','/api/availability',{ hours: DB.settings.hours, closedDates: DB.availability.closedDates })
    .then(() => { window._settingsDirty = false; toast('Horaires enregistrés ✓','success'); })
    .catch(() => toast('Erreur de sauvegarde — changements conservés localement','warning'));
}
function updateDayTimeDispo(dayKey, field, val){
  console.log('🕐 updateDayTimeDispo called:', { dayKey, field, val, before: DB.settings.hours[dayKey] });
  DB.settings.hours[dayKey][field] = val;
  console.log('🕐 State updated:', DB.settings.hours[dayKey]);
  saveDB();
  window._settingsDirty = true;
  const payload = { hours: DB.settings.hours, closedDates: DB.availability.closedDates };
  console.log('🕐 Sending POST /api/availability:', payload);
  apiCall('POST','/api/availability', payload)
    .then(() => {
      console.log('✅ POST succeeded');
      window._settingsDirty = false;
    })
    .catch((err) => {
      console.error('❌ POST failed:', err);
      toast('Erreur de sauvegarde — changements conservés localement','warning');
    });
}
function renderClosedDays(){
  const cont = document.getElementById('dispo-closed-list');
  if(!cont) return;
  if(!DB.availability.closedDates.length){
    cont.innerHTML = '<div class="empty"><i class="ti ti-calendar-off"></i>Aucune fermeture programmée</div>';
    return;
  }
  const html = DB.availability.closedDates
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(cd => `
      <div class="pay-row" style="justify-content:space-between">
        <div>
          <div style="font-weight:600">${fmtDateFR(cd.date)}</div>
          <div style="font-size:11px;color:var(--marble-2);margin-top:2px">${cd.reason || '—'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="removeClosedDay('${cd.date}')"><i class="ti ti-trash"></i></button>
      </div>
    `).join('');
  cont.innerHTML = html;
}
function addClosedDay(){
  const dateInput = document.getElementById('dispo-closed-date');
  const reasonInput = document.getElementById('dispo-closed-reason');
  const date = dateInput.value;
  if(!date){ toast('Sélectionner une date','warning'); return; }
  if(DB.availability.closedDates.find(cd => cd.date === date)){
    toast('Cette date est déjà fermée','warning'); return;
  }
  DB.availability.closedDates.push({ date, reason: reasonInput.value || '' });
  saveDB();
  apiCall('POST', '/api/availability/closed', { date, reason: reasonInput.value || '' }).catch(()=>{});
  toast('Jour fermé ajouté','success');
  closeModal('modal-dispo-closed');
  dateInput.value = '';
  reasonInput.value = '';
  renderClosedDays();
}
function removeClosedDay(date){
  DB.availability.closedDates = DB.availability.closedDates.filter(cd => cd.date !== date);
  saveDB();
  apiCall('POST', '/api/availability/closed/remove', { date }).catch(()=>{});
  renderClosedDays();
}
function isDateClosed(date){
  return DB.availability.closedDates.some(cd => cd.date === date);
}
function isTimeAvailable(date, time){
  if(isDateClosed(date)) return false;
  const d = new Date(date);
  const dayKey = DAY_INDEX_TO_KEY[d.getDay()];
  const h = DB.settings.hours[dayKey];
  if(!h.open) return false;
  return time >= h.start && time < h.end;
}
function getAvailableSlots(date){
  if(isDateClosed(date)) return [];
  const d = new Date(date);
  const dayKey = DAY_INDEX_TO_KEY[d.getDay()];
  const h = DB.settings.hours[dayKey];
  if(!h.open) return [];
  const slots = [];
  const [startH, startM] = h.start.split(':').map(Number);
  const [endH, endM] = h.end.split(':').map(Number);
  let min = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  while(min < endMin){
    const hours = Math.floor(min / 60).toString().padStart(2, '0');
    const mins = (min % 60).toString().padStart(2, '0');
    slots.push(`${hours}:${mins}`);
    min += 15;
  }
  return slots;
}
function saveDisponibilites(){
  saveDB();
  apiCall('POST', '/api/availability', {
    hours: DB.settings.hours,
    closedDates: DB.availability.closedDates,
  }).then(() => {
    toast('Disponibilités enregistrées','success');
  }).catch(e => {
    toast('Erreur backend','danger');
    console.warn(e);
  });
}

// ─── INIT ───────────────────────────────────────────────────
function syncFromBookings(){
  try{
    const raw = localStorage.getItem('fcutz_bookings');
    if(!raw) return;
    const bookings = JSON.parse(raw);
    let added = 0;
    bookings.forEach(b => {
      if(!b.id) return;
      if(DB.appointments.find(a => a.id === b.id)) return;
      const c = getOrCreateClient(`${b.fname||''} ${b.lname||''}`.trim());
      if(c && !c.phone && b.phone) c.phone = b.phone;
      DB.appointments.push({
        id: b.id,
        clientId: c?.id || null,
        clientName: `${b.fname||''} ${b.lname||''}`.trim() || 'Client',
        service: b.service || 'Coupe Simple',
        price: parseFloat(b.price || 0),
        duration: parseInt(b.duration || 30),
        date: b.date,
        time: b.time,
        status: b.paid ? 'confirmed' : 'pending',
        note: b.note || '',
        source: 'booking',
        createdAt: b.createdAt || new Date().toISOString(),
      });
      added++;
    });
    if(added){
      saveDB();
      pushNotif('Nouveau RDV en ligne', `${added} nouvelle${added>1?'s':''} réservation${added>1?'s':''} depuis le site client`, 'var(--info)');
    }
  }catch(e){ console.warn('syncFromBookings error', e); }
}

document.addEventListener('DOMContentLoaded', async () => {
  // ─── AUTH SUPABASE ── remplace le système PIN ────────────
  // Masquer le contenu pendant la vérification de session
  document.body.style.visibility = 'hidden';

  // Écouter les changements d'état auth (login/logout)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if(session){
      document.body.style.visibility = 'visible';
      if(!_currentUser) await _bootAfterAuth(session);
    } else {
      // Pas de session → afficher le modal de login
      document.body.style.visibility = 'visible';
      _currentUser = null;
      const m = document.getElementById('modal-login');
      if(m) m.classList.add('open');
    }
  });

  // Vérifier si une session existe déjà (rechargement de page)
  const { data: { session } } = await supabase.auth.getSession();
  if(!session){
    document.body.style.visibility = 'visible';
    const m = document.getElementById('modal-login');
    if(m) m.classList.add('open');
  }
  // Si session existe, onAuthStateChange s'en charge

  // ─── Reste du setup non-auth ─────────────────────────────

  // BroadcastChannel listener (same-device booking page → dashboard instant notif)
  if('BroadcastChannel' in window){
    try{
      const ch = new BroadcastChannel('fcutz_bookings_channel');
      ch.onmessage = ev => {
        if(ev.data?.type === 'NEW_BOOKING' && ev.data.appt){
          const a = ev.data.appt;
          if(!DB.appointments.find(x => x.id === a.id)){
            DB.appointments.push({
              id: a.id, clientName: `${a.fname||''} ${a.lname||''}`.trim() || 'Client',
              service: a.service, price: a.price, duration: a.duration,
              date: a.date, time: a.time, status: a.status || 'pending',
              note: a.note, source: 'booking', createdAt: new Date().toISOString()
            });
            saveDB();
            pushNotif('Nouvelle réservation', pushBodyFor({
              clientName: `${a.fname || ''} ${a.lname || ''}`.trim() || 'Client',
              service: a.service, date: a.date, time: a.time, status: a.status,
            }), 'var(--info)');
            if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
            if(document.getElementById('page-agenda').classList.contains('active')) renderAgenda();
          }
        }
      };
    }catch(_){}
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }

  // Lien profond : ?openRdv=<id> ouvre directement le modal d'édition
  try{
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('openRdv');
    if(openId){
      const tryOpen = () => {
        const exists = (DB.appointments || []).find(a => a.id === openId);
        if(exists){
          nav('agenda');
          openEditRdv(openId);
        }
      };
      // Tente immédiatement, et après le sync backend
      setTimeout(tryOpen, 200);
      setTimeout(tryOpen, 1500);
      // Nettoie l'URL pour éviter ré-ouverture au refresh
      history.replaceState({}, '', window.location.pathname);
    } else if(params.get('agenda') === '1'){
      nav('agenda');
      history.replaceState({}, '', window.location.pathname);
    }
  }catch(_){}

  // Sidebar backdrop — close only if clicking outside sidebar
  const backdrop = document.getElementById('sidebar-backdrop');
  if(backdrop){
    backdrop.addEventListener('click', e => {
      if(!e.target.closest('.sidebar')){
        toggleSidebar();
      }
    });
    // Remove the inline onclick handler to prevent duplicate toggles
    backdrop.onclick = null;
  }

  // Nav items click handler (for mobile sidebar compatibility)
  document.addEventListener('click', e => {
    const navItem = e.target.closest('.nav-item');
    if(navItem){
      const page = navItem.dataset.page;
      if(page) nav(page);
    }
  });



  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      document.querySelectorAll('.modal-bg.open').forEach(m => { if(m.id !== 'modal-pin') m.classList.remove('open'); });
      document.getElementById('notif-panel').classList.remove('open');
    }
  });
  document.querySelectorAll('.modal-bg').forEach(m => {
    m.addEventListener('click', e => { if(e.target === m && m.id !== 'modal-pin') m.classList.remove('open'); });
  });

  // Prevent iOS pinch zoom on dashboard
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => { if(!e.target.closest('input,textarea,select,[contenteditable]')) e.preventDefault(); });
});

// Mobile bottom nav
window.addEventListener('load', () => {
  if(document.getElementById('mnav-injected')) return;
  const navEl = document.createElement('nav');
  navEl.className = 'mnav';
  navEl.id = 'mnav-injected';
  navEl.innerHTML = `
    <button class="mnav-item active" data-page="dashboard" onclick="nav('dashboard')"><i class="ti ti-layout-dashboard"></i>Dashboard</button>
    <button class="mnav-item" data-page="agenda" onclick="nav('agenda')"><i class="ti ti-calendar"></i>Agenda</button>
    <button class="mnav-item" data-page="encaissement" onclick="nav('encaissement')"><i class="ti ti-cash"></i>Caisse</button>
    <button class="mnav-item" data-page="disponibilites" onclick="nav('disponibilites')"><i class="ti ti-calendar-time"></i>Dispos</button>
    <button class="mnav-item" data-page="parametres" onclick="nav('parametres')"><i class="ti ti-settings"></i>Réglages</button>
  `;
  document.body.appendChild(navEl);
});

// ══════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS — Barbier (Admin)
// ══════════════════════════════════════════════════════════════
const VAPID_KEY = 'BBi7Rj4vKyX1xuvYkG8940z02hL5T-FtSFSzvtS_mFNsnNopRSI3wmIjDdVKUCghYE0Stuxh71k6Kzj1jNTuHBY';

function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'));
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

async function togglePush(enabled) {
  const checkbox = document.getElementById('set-push-enabled');
  const statusTxt = document.getElementById('push-state-txt');

  if (!enabled) {
    try{
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if(sub) await sub.unsubscribe();
    }catch(_){}
    localStorage.removeItem('fcutz_push_enabled');
    if (checkbox) checkbox.checked = false;
    if (statusTxt) statusTxt.textContent = 'Statut : non configuré';
    toast('Notifications désactivées', 'warning');
    return;
  }

  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('Navigateur non supporté pour les push', 'danger');
      if (checkbox) checkbox.checked = false;
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast('Permission de notification refusée par le navigateur', 'danger');
      if (checkbox) checkbox.checked = false;
      return;
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Récupérer la clé VAPID publique depuis le backend (source de vérité)
    let vapidKey = VAPID_KEY;
    try{ const vr = await apiCall('GET', '/api/push/vapid-public'); if(vr.key) vapidKey = vr.key; }catch(_){}

    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapidKey) });
    const sj = sub.toJSON();

    const r = await fetch(BACKEND_URL + '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-fcutz-key': FCUTZ_HEADER_KEY },
      body: JSON.stringify({ endpoint: sj.endpoint, keys: sj.keys, device: 'admin-dashboard' })
    });

    if (!r.ok) {
      const errText = await r.clone().text().catch(()=>'');
      throw new Error('Serveur ' + r.status + (errText ? ' : ' + errText.slice(0,80) : ''));
    }

    localStorage.setItem('fcutz_push_enabled', '1');
    if (checkbox) checkbox.checked = true;
    if (statusTxt) statusTxt.textContent = 'Statut : activé sur cet appareil';
    toast('Notifications push activées ✓', 'success');

  } catch (e) {
    toast('Échec activation push : ' + e.message, 'danger');
    if (checkbox) checkbox.checked = false;
  }
}

// Restaurer l'état des notifications au chargement
document.addEventListener('DOMContentLoaded', () => {
  const checkbox = document.getElementById('set-push-enabled');
  if (checkbox) {
    checkbox.checked = localStorage.getItem('fcutz_push_enabled') === '1';
  }
});

async function testPush(){
  const btn = document.querySelector('[onclick="testPush()"]');
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i>Envoi…'; }
  try{
    const r = await apiCall('POST', '/api/push/test', {});
    if(r.sent > 0){
      toast(`Push envoyé (${r.sent}/${r.total} abonné(s)) — vérifie ta notif ✓`, 'success');
    } else if(!r.total){
      toast(r.message || 'Aucune subscription — active le push dans Paramètres', 'warning');
    } else {
      const errDetail = r.errors?.length ? r.errors.map(e => `[${e.status}] ${e.detail}`).join(' · ') : 'Erreur inconnue';
      toast(`Échec (${r.total} sub en base) : ${errDetail}`, 'danger');
    }
  }catch(e){
    toast('Erreur test push : ' + e.message, 'danger');
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ti ti-bell-ringing"></i>Envoyer un push de test'; }
  }
}

async function testDailySummary(){
  const btn = document.querySelector('[onclick="testDailySummary()"]');
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i>Envoi…'; }
  try{
    const r = await apiCall('POST', '/api/daily-summary/test', {});
    if(r.ok) toast('Résumé journalier envoyé ✓', 'success');
    else toast(r.error || 'Erreur envoi résumé', 'danger');
  }catch(e){
    toast('Erreur : ' + e.message, 'danger');
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ti ti-chart-bar"></i>Tester le résumé journalier'; }
  }
}

const BROADCAST_PRESETS = [
  { title:'Places dispo ce samedi 💈', body:'Des créneaux sont disponibles ce samedi ! Réserve vite.' },
  { title:'Dispo en DM 💈', body:'Plus de créneau en ligne. Écris-moi en DM pour un rendez-vous à 20€.' },
  { title:'Dispo en DM 💈', body:'Plus de créneau en ligne. Écris-moi en DM pour un rendez-vous à 15€.' },
  { title:'Fermeture exceptionnelle 🚫', body:'Le salon sera fermé [compléter le jour]. Merci de votre compréhension !' },
  { title:'Ouverture spéciale ✅', body:'Je serai disponible [compléter le jour] ! Réserve vite.' },
];
function applyBroadcastPreset(i){
  const p = BROADCAST_PRESETS[i];
  if(!p) return;
  document.getElementById('broadcast-title').value = p.title;
  document.getElementById('broadcast-body').value  = p.body;
  document.getElementById('broadcast-title').focus();
}

async function broadcastToClients(){
  const title = (document.getElementById('broadcast-title')?.value || '').trim();
  const body  = (document.getElementById('broadcast-body')?.value  || '').trim();
  if(!title || !body){ toast('Remplis le titre et le message','warning'); return; }
  const btn = document.querySelector('[onclick="broadcastToClients()"]');
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i>Envoi…'; }
  try{
    const r = await apiCall('POST', '/api/push-broadcast-clients', { title, body });
    toast(`Message envoyé à ${r.sent ?? 0} client(s) ✓`, 'success');
    document.getElementById('broadcast-title').value = '';
    document.getElementById('broadcast-body').value  = '';
  }catch(e){
    toast('Erreur envoi : ' + e.message, 'error');
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ti ti-broadcast"></i>Envoyer à tous les clients'; }
  }
}

// ─── SW MESSAGE HANDLER ─────────────────────────────────────
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', async e => {
    if(!e.data) return;
    const { type, apptId } = e.data;
    if(type === 'SYNC_APPOINTMENTS'){
      await syncFromBackend();
    } else if(type === 'OPEN_AGENDA'){
      await syncFromBackend();
      nav('agenda');
    } else if(type === 'OPEN_RDV'){
      await syncFromBackend();
      nav('agenda');
      if(apptId) setTimeout(() => openEditRdv(apptId), 400);
    } else if(type === 'DAILY_SUMMARY'){
      showDailySummary(e.data.stats);
    }
  });
}

// ─── RÉSUMÉ JOURNALIER ───────────────────────────────────────
function showDailySummary(stats){
  if(!stats) return;

  const dateEl = document.getElementById('ds-date');
  if(dateEl && stats.date){
    const d = new Date(stats.date + 'T12:00:00');
    const jours = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const mois = ['jan.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    dateEl.textContent = `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
  }

  const rdvEl = document.getElementById('ds-rdv');
  if(rdvEl) rdvEl.textContent = stats.totalRdv || 0;

  const caEl = document.getElementById('ds-ca');
  if(caEl) caEl.textContent = fmtMoney(stats.caTotal || 0);

  const panierEl = document.getElementById('ds-panier');
  if(panierEl) panierEl.textContent = fmtMoney(stats.panierMoyen || 0);

  const svcEl = document.getElementById('ds-services');
  if(svcEl && stats.services && stats.services.length){
    const isCoupe = s => s && /coupe/i.test(s);
    const coupes  = stats.services.filter(s => isCoupe(s.service));
    const annexes = stats.services.filter(s => !isCoupe(s.service));

    const renderRow = s =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:rgba(255,255,255,.03);border-radius:var(--r-sm);margin-bottom:4px">
        <span style="font-size:13px;color:var(--marble-1)">${s.count}× ${s.service || '—'} <span style="color:var(--marble-3);font-size:11px">(${fmtMoney(s.price)} / coupe)</span></span>
        <span style="font-size:13px;font-weight:700;color:var(--gold-0)">${fmtMoney(s.total)}</span>
      </div>`;

    const label = t =>
      `<div style="font-size:9.5px;color:var(--marble-2);text-transform:uppercase;letter-spacing:1.5px;margin:10px 0 6px">${t}</div>`;

    let html = '';
    if(coupes.length)  html += label('Coupes')           + coupes.map(renderRow).join('');
    if(annexes.length) html += label('Produits annexes') + annexes.map(renderRow).join('');
    svcEl.innerHTML = html;
  } else if(svcEl){
    svcEl.innerHTML = '<div style="color:var(--marble-2);font-size:13px;text-align:center;padding:var(--sp-3) 0">Aucune prestation confirmée</div>';
  }

  openModal('modal-daily-summary');
}
