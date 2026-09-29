/* ── Notifications sur le téléphone du pro ──
   Le serveur prévient déjà à chaque nouveau rendez-vous, annulation et
   inscription en liste d'attente (lib/push.js) ; ici, le téléphone s'abonne.
   Sur iPhone, Safari n'autorise les notifications web que pour une app
   ajoutée à l'écran d'accueil : la carte l'explique avant tout. */

const NOTIF_PLUS_TARD = 'ts_notif_plus_tard';

function notifsPossibles() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function estIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function estInstallee() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function cleVapid(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const brut = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(brut, c => c.charCodeAt(0));
}

async function abonnementActuel() {
  if (!notifsPossibles()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

// Abonne ce téléphone et le rattache au compte connecté (un navigateur = un salon).
async function inscrirePush() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { cle } = await api('GET', '/api/push/cle-publique');
  if (!cle) throw new Error('Notifications indisponibles pour le moment');
  let abo = await reg.pushManager.getSubscription();
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid(cle) });
  await api('POST', '/api/push/abonnement', abo.toJSON());
}

async function activerNotifications() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast('Notifications refusées : tu peux les autoriser plus tard dans les réglages du navigateur.', '');
    } else {
      await inscrirePush();
      toast('Notifications activées : tu seras prévenu à chaque réservation ✓', 'success');
    }
  } catch (e) { toast(messageErreur(e), 'danger'); }
  renderAccueil();
}

function notifsPlusTard() {
  try { localStorage.setItem(NOTIF_PLUS_TARD, String(Date.now())); } catch (_) {}
  renderAccueil();
}

// À chaque ouverture : si le téléphone a déjà dit oui, on rattache l'abonnement
// au compte connecté (il a pu changer, ou l'abonnement a pu être renouvelé).
async function reinscrirePush() {
  if (!notifsPossibles() || Notification.permission !== 'granted') return;
  try { await inscrirePush(); } catch (_) { /* silencieux : la carte le proposera */ }
}

async function carteNotifications() {
  try {
    if (Date.now() - Number(localStorage.getItem(NOTIF_PLUS_TARD) || 0) < 7 * 86400000) return '';
  } catch (_) {}
  const carte = (texte, bouton) => `<div class="card ts-carte ts-notifs">
    <div class="card-h"><div><div class="card-title"><i class="ti ti-bell-ringing"></i> Sois prévenu à chaque réservation</div>
      <div class="card-sub">${texte}</div></div></div>
    <div class="ts-boutons">${bouton}<button class="btn btn-ghost btn-sm" onclick="notifsPlusTard()">Plus tard</button></div>
  </div>`;

  if (estIOS() && !estInstallee()) {
    return carte("Sur iPhone, les notifications ne marchent qu'avec TrimSync sur l'écran d'accueil : touche <i class=\"ti ti-share\"></i> <strong>Partager</strong>, puis <strong>« Sur l'écran d'accueil »</strong>, et ouvre TrimSync depuis la nouvelle icône.", '');
  }
  if (!notifsPossibles()) return '';
  if (Notification.permission === 'denied') {
    return carte('Les notifications sont bloquées pour TrimSync sur cet appareil. Autorise-les dans les réglages du navigateur, puis recharge la page.', '');
  }
  if (Notification.permission === 'granted' && await abonnementActuel().catch(() => null)) return '';
  return carte('Nouveau rendez-vous, annulation, client en liste d\'attente : une notification sur ce téléphone, même app fermée.',
    '<button class="btn btn-gold btn-sm" onclick="activerNotifications()"><i class="ti ti-bell"></i>Activer les notifications</button>');
}
