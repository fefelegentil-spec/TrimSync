/* ────────────────────────────────────────────────────────────────────────────
   TrimSync — Hero 3D
   Inspiré de buttermax.net : un seul objet 3D (iPhone) qui morph au scroll
   à travers 5 scènes du parcours barbier.

   Architecture :
   - Three.js (module ESM via importmap) pour la scène 3D
   - Lenis pour le smooth scroll buttery
   - Timeline maison (evaluate(progress) → état global)
   - 5 écrans rendus en canvas2D, injectés en texture
   - PostProcessing : UnrealBloom + Bokeh (cinematic DOF)
   - Curseur magnétique, glitch typo, sound design opt-in, gyro mobile

   Note: tout en un seul fichier pour rester proche du PRODUCT.md
   "HTML/CSS/JS vanilla, inline (pas de bundler)".
   ──────────────────────────────────────────────────────────────────────────── */

// Three.js & addons chargés DYNAMIQUEMENT (chemin desktop uniquement).
// Le fallback mobile ne télécharge JAMAIS le moteur WebGL (~180 KB).
let THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, RGBShiftShader, RoomEnvironment;
async function loadThree() {
  THREE = await import('three');
  ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
  ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
  ({ UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'));
  ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
  ({ ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js'));
  ({ RGBShiftShader } = await import('three/addons/shaders/RGBShiftShader.js'));
  ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. CONSTANTES & TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */

const SCENES = [
  {
    eyebrow: { en: '01 · The lost DM',         fr: '01 · Le DM oublié' },
    title:   { en: 'Your chair fills itself.', fr: 'Ta chaise se remplit toute seule.' },
    sub:     { en: 'While you sleep, the DMs that used to die in your inbox become booked appointments.',
               fr: 'Pendant que tu dors, les DMs qui mouraient dans ta boîte deviennent des RDV pris.' },
    bg: [0.12, 0.008, 222],         // quasi-noir
    iphone: { px: -0.15, py: 0.0,  pz: 0.0,  rx: -0.05, ry: -0.18, rz: 0.04, scale: 1.00 },
    rim: 0.4,
    cta: false
  },
  {
    eyebrow: { en: '02 · AI replies',          fr: '02 · L\'IA répond' },
    title:   { en: 'Trained on barber DMs.',   fr: 'Entraînée sur des DMs de barbiers.' },
    sub:     { en: 'Not on web text. Real conversations, real slang, real bookings.',
               fr: 'Pas sur du texte web. De vraies conversations, du vrai slang, de vrais RDV.' },
    bg: [0.30, 0.10, 200],          // teal sombre
    iphone: { px:  0.10, py: 0.05, pz: 0.4,  rx: -0.10, ry:  0.22, rz: 0.02, scale: 1.06 },
    rim: 0.7,
    cta: false
  },
  {
    eyebrow: { en: '03 · Booked',              fr: '03 · Réservé' },
    title:   { en: 'Booked. Synced. Done.',    fr: 'Pris. Synchro. Bouclé.' },
    sub:     { en: 'No reply needed. The slot lands in your agenda — and on the client\'s calendar.',
               fr: 'Pas besoin de répondre. Le créneau atterrit dans ton agenda et dans le calendrier du client.' },
    bg: [0.55, 0.13, 193],          // teal pleine puissance
    iphone: { px:  0.00, py: 0.10, pz: 0.6,  rx:  0.00, ry:  0.00, rz: 0.0,  scale: 1.10 },
    rim: 1.0,
    cta: false
  },
  {
    eyebrow: { en: '04 · Your week, autopiloted', fr: '04 · Ta semaine en pilote auto' },
    title:   { en: 'Open the dashboard. Smile.',  fr: 'Ouvre le dashboard. Souris.' },
    sub:     { en: 'Every slot already booked, every client tracked, every euro counted.',
               fr: 'Chaque créneau déjà pris, chaque client suivi, chaque euro compté.' },
    bg: [0.48, 0.13, 60],           // cuivre chaud (salon)
    iphone: { px:  0.10, py: -0.05, pz: 0.2, rx:  0.12, ry:  0.55, rz: -0.05, scale: 1.04 },
    rim: 0.8,
    cta: false
  },
  {
    eyebrow: { en: '05 · ROI',                 fr: '05 · Le retour' },
    title:   { en: '€340 a month, back.',      fr: '340 € par mois, récupérés.' },
    sub:     { en: 'That\'s the average barber saves with TrimSync. Ten minutes to set up.',
               fr: 'C\'est ce que récupère le barbier moyen avec TrimSync. Dix minutes pour l\'installer.' },
    bg: [0.88, 0.04, 200],          // blanc cassé
    iphone: { px: -0.20, py: 0.0,   pz: -0.4, rx: -0.05, ry: -0.30, rz: 0.0, scale: 0.92 },
    rim: 0.5,
    cta: true
  }
];

const SCENE_COUNT = SCENES.length;
const PREF_RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;

/* ═══════════════════════════════════════════════════════════════════════════
   2. UTILITAIRES
   ═══════════════════════════════════════════════════════════════════════════ */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (t) => 1 - Math.pow(1 - t, 3);  // ease-out-cubic

// Lerp oklch → CSS string (les keyframes sont en [L, C, H])
function oklchLerp(a, b, t) {
  return `oklch(${lerp(a[0], b[0], t).toFixed(3)} ${lerp(a[1], b[1], t).toFixed(3)} ${lerp(a[2], b[2], t).toFixed(1)})`;
}

// Conversion oklch → sRGB (0..1). Le navigateur renvoie l'oklch
// non-converti via getComputedStyle, donc on le fait nous-mêmes
// pour piloter scene.background (le morph de fond signature).
function oklchToSRGB(L, C, H) {
  const hr = H * Math.PI / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  l_ = l_ * l_ * l_; m_ = m_ * m_ * m_; s_ = s_ * s_ * s_;
  const r  =  4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g  = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;
  const enc = c => { c = Math.min(Math.max(c, 0), 1); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
  return [enc(r), enc(g), enc(bb)];
}

// Lerp iPhone pose
function poseLerp(a, b, t) {
  return {
    px: lerp(a.px, b.px, t), py: lerp(a.py, b.py, t), pz: lerp(a.pz, b.pz, t),
    rx: lerp(a.rx, b.rx, t), ry: lerp(a.ry, b.ry, t), rz: lerp(a.rz, b.rz, t),
    scale: lerp(a.scale, b.scale, t)
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. LENIS — smooth scroll buttery
   On l'injecte en runtime (CDN ESM) pour éviter une nouvelle dépendance npm.
   ═══════════════════════════════════════════════════════════════════════════ */

let lenis = null;
async function initLenis() {
  if (PREF_RM) return null;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/lenis@1.1.18/+esm');
    const Lenis = mod.default;
    lenis = new Lenis({
      duration: 1.2,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false,
      lerp: 0.10
    });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    return lenis;
  } catch (e) {
    console.warn('[hero3d] Lenis failed to load, falling back to native scroll', e);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. iPHONE — modélisé en code (zéro asset externe)
   ═══════════════════════════════════════════════════════════════════════════ */

// RoundedBoxGeometry inline (évite l'import additionnel)
function makeRoundedBox(w, h, d, radius, segments) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + w - radius, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + radius);
  shape.lineTo(x + w, y + h - radius);
  shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  shape.lineTo(x + radius, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  // Bevel FIN : un gros bevel (radius*0.5) faisait bomber la face avant
  // à z≈0.17 et ensevelissait l'écran (z 0.085) dans le corps opaque.
  const extrudeSettings = { depth: d, bevelEnabled: true, bevelSegments: segments, steps: 1, bevelSize: 0.04, bevelThickness: 0.02, curveSegments: segments };
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.translate(0, 0, -d / 2);
  geom.computeVertexNormals();
  return geom;
}

class iPhone {
  constructor() {
    this.group = new THREE.Group();
    this.screenTexture = null;
    this.screenCanvas = null;
    this.screenCtx = null;
    this.glowLight = null;
    this._build();
  }

  _build() {
    // Dimensions iPhone 15 Pro (proportions)
    const W = 1.42;   // largeur
    const H = 2.92;   // hauteur
    const D = 0.16;   // épaisseur
    const R = 0.18;   // radius coins

    /* — Corps titanium — */
    const bodyGeom = makeRoundedBox(W, H, D, R, 12);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x121419,
      metalness: 0.95,
      roughness: 0.40,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.5    // RoomEnvironment est lumineux → on baisse pour garder le dark premium
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    this.group.add(body);

    /* — Écran (CanvasTexture dynamique) — */
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 540;
    this.screenCanvas.height = 1170;  // ratio 19.5:9 iPhone
    this.screenCtx = this.screenCanvas.getContext('2d');
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 8;

    const screenW = W - 0.10;
    const screenH = H - 0.20;
    const screenGeom = new THREE.PlaneGeometry(screenW, screenH);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
      toneMapped: false
    });
    const screen = new THREE.Mesh(screenGeom, screenMat);
    screen.position.z = D / 2 + 0.045;   // devant la face avant (bevel 0.02)
    this.group.add(screen);

    /* — Vitre (B1 corrigé) — La transmission éteignait l'écran.
       On garde une fine couche spéculaire ADDITIVE qui capte
       l'environnement (reflets "verre") sans soustraire la
       luminosité de l'écran en dessous. depthWrite:false pour
       ne jamais occulter le contenu. */
    const glassGeom = new THREE.PlaneGeometry(W, H);
    const glassMat = new THREE.MeshPhysicalMaterial({
      transparent: true,
      opacity: 0.06,          // très subtil : ne doit pas laiteuser l'écran
      metalness: 0.0,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      ior: 1.45,
      reflectivity: 0.3,
      color: 0xffffff,
      envMapIntensity: 0.5,
      depthWrite: false       // blend NORMAL (plus d'additive qui ajoutait du blanc partout)
    });
    const glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.z = D / 2 + 0.05;
    this.group.add(glass);

    /* — Dynamic Island — */
    const diGeom = new THREE.CapsuleGeometry(0.06, 0.18, 8, 16);
    diGeom.rotateZ(Math.PI / 2);
    const diMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const di = new THREE.Mesh(diGeom, diMat);
    di.position.set(0, H / 2 - 0.24, D / 2 + 0.055);
    this.group.add(di);

    /* — Side buttons (titanium relief) — */
    const btnMat = new THREE.MeshPhysicalMaterial({ color: 0x121215, metalness: 1.0, roughness: 0.45 });
    const power = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.08), btnMat);
    power.position.set(W / 2 + 0.005, 0.45, 0);
    this.group.add(power);
    const volU = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.08), btnMat);
    volU.position.set(-W / 2 - 0.005, 0.6, 0);
    this.group.add(volU);
    const volD = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.08), btnMat);
    volD.position.set(-W / 2 - 0.005, 0.25, 0);
    this.group.add(volD);

    /* — Rim light (B2) — PointLight derrière l'écran qui éclaire le bord — */
    this.glowLight = new THREE.PointLight(0x60c4c8, 1.2, 4.0, 2);
    this.glowLight.position.set(0, 0, -(D / 2 + 0.35));  // DERRIÈRE : back-rim halo, ne lave plus l'écran
    this.group.add(this.glowLight);

    /* Position de base */
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
  }

  pose({ px, py, pz, rx, ry, rz, scale }) {
    this.group.position.set(px, py, pz);
    this.group.rotation.set(rx, ry, rz);
    this.group.scale.setScalar(scale);
  }

  setRimIntensity(intensity, color) {
    if (this.glowLight) {
      this.glowLight.intensity = intensity * 2.5;
      if (color) this.glowLight.color.setRGB(color[0], color[1], color[2]);
    }
  }

  markScreenDirty() {
    if (this.screenTexture) this.screenTexture.needsUpdate = true;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. ÉCRANS — 5 renderers canvas2D animés
   ═══════════════════════════════════════════════════════════════════════════ */

const SCREEN_W = 540;
const SCREEN_H = 1170;

// Helper draw rounded rect
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Common chrome (status bar + dynamic island shadow)
function drawChrome(ctx, isDark = true) {
  ctx.fillStyle = isDark ? '#000' : '#fff';
  ctx.font = '600 28px Figtree, system-ui';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isDark ? '#fff' : '#000';
  ctx.textAlign = 'left';
  ctx.fillText('9:41', 40, 56);
  ctx.textAlign = 'right';
  ctx.fillText('●●●  ⌃  ▮', SCREEN_W - 40, 56);
}

// Scene 0 — Instagram DM at 2:47am
function drawScreen0(ctx, t) {
  // Background: Instagram dark
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawChrome(ctx);

  // Header
  ctx.fillStyle = '#fff';
  ctx.font = '700 32px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('@_kev.cuts', 50, 160);
  ctx.fillStyle = '#888';
  ctx.font = '500 22px Figtree, system-ui';
  ctx.fillText('Active 2h ago', 50, 192);

  // Time stamp
  ctx.fillStyle = '#666';
  ctx.font = '500 20px Figtree, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Today  ·  2:47 AM', SCREEN_W / 2, 280);

  // Client bubble (gray, left)
  const bubbleW = 380;
  const bubbleH = 110;
  const bubbleX = 40;
  const bubbleY = 320;
  ctx.fillStyle = '#262626';
  roundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 24);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '500 26px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Yo frérot tu peux me', bubbleX + 28, bubbleY + 40);
  ctx.fillText('prendre demain ?', bubbleX + 28, bubbleY + 76);

  // Typing indicator that pulses (animated)
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  ctx.fillStyle = `rgba(96, 196, 200, ${0.3 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(bubbleX + 30, bubbleY + 180, 8, 0, Math.PI * 2);
  ctx.arc(bubbleX + 60, bubbleY + 180, 8, 0, Math.PI * 2);
  ctx.arc(bubbleX + 90, bubbleY + 180, 8, 0, Math.PI * 2);
  ctx.fill();

  // Input bar bottom (faded)
  ctx.fillStyle = '#1a1a1a';
  roundRect(ctx, 40, SCREEN_H - 140, SCREEN_W - 80, 80, 40);
  ctx.fill();
  ctx.fillStyle = '#444';
  ctx.font = '500 26px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Message…', 80, SCREEN_H - 100);

  // Notification banner sliding in top (fades according to t)
  const notifY = -180 + Math.min(t * 600, 180);
  if (notifY > -100) {
    ctx.fillStyle = 'rgba(20, 20, 22, 0.95)';
    roundRect(ctx, 30, notifY, SCREEN_W - 60, 140, 28);
    ctx.fill();
    ctx.fillStyle = '#60c4c8';
    ctx.font = '700 22px Figtree, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('TRIMSYNC', 56, notifY + 44);
    ctx.fillStyle = '#fff';
    ctx.font = '500 24px Figtree, system-ui';
    ctx.fillText('New DM — replying for you…', 56, notifY + 88);
  }
}

// Scene 1 — TrimSync AI responding
function drawScreen1(ctx, t) {
  // Background teal-tinted
  const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  grad.addColorStop(0, '#0a1418');
  grad.addColorStop(1, '#102024');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawChrome(ctx);

  // Header
  ctx.fillStyle = '#60c4c8';
  ctx.font = '700 32px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('TrimSync · AI', 50, 160);
  ctx.fillStyle = '#a0d6d8';
  ctx.font = '500 22px Figtree, system-ui';
  ctx.fillText('Active · replying in your voice', 50, 192);

  // Client message
  ctx.fillStyle = '#1f2c30';
  roundRect(ctx, 40, 260, 380, 90, 22);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '500 24px Figtree, system-ui';
  ctx.fillText('Yo frérot tu peux me prendre demain ?', 60, 312);

  // AI bubble (teal, right)
  const aiY = 380;
  ctx.fillStyle = '#60c4c8';
  roundRect(ctx, 100, aiY, SCREEN_W - 140, 130, 22);
  ctx.fill();
  ctx.fillStyle = '#0a1010';
  ctx.font = '600 24px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Yo ! J\'ai 3 créneaux demain', 124, aiY + 44);
  ctx.fillText('14:00, 16:30, 18:00.', 124, aiY + 76);
  ctx.font = '500 22px Figtree, system-ui';
  ctx.fillText('Tu veux lequel ?', 124, aiY + 108);

  // 3 time slot chips that fade-in staggered
  const slots = ['14:00', '16:30', '18:00'];
  slots.forEach((s, i) => {
    const delay = i * 0.25;
    const localT = clamp((t - delay) * 1.5, 0, 1);
    if (localT <= 0) return;
    const opacity = localT;
    const y = 560 + i * 110;
    const offsetX = (1 - localT) * 40;
    ctx.fillStyle = `rgba(96, 196, 200, ${0.15 * opacity})`;
    ctx.strokeStyle = `rgba(96, 196, 200, ${opacity})`;
    ctx.lineWidth = 2;
    roundRect(ctx, 60 + offsetX, y, SCREEN_W - 120, 84, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.font = '600 28px Figtree, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(s, 96 + offsetX, y + 54);
    ctx.font = '500 22px Figtree, system-ui';
    ctx.fillStyle = `rgba(160, 214, 216, ${opacity})`;
    ctx.textAlign = 'right';
    ctx.fillText('Tap to book', SCREEN_W - 96 + offsetX, y + 54);
  });
}

// Scene 2 — Booked & confirmed
function drawScreen2(ctx, t) {
  // Background bright teal-tinted
  const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  grad.addColorStop(0, '#102a30');
  grad.addColorStop(1, '#1a4248');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawChrome(ctx);

  // Big circular checkmark (animated draw-on)
  const cx = SCREEN_W / 2, cy = 500;
  const r = 130;
  const ringT = clamp(t * 1.5, 0, 1);
  ctx.strokeStyle = '#60c4c8';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + ringT * Math.PI * 2);
  ctx.stroke();

  if (ringT >= 1) {
    const checkT = clamp((t - 0.7) * 2, 0, 1);
    ctx.strokeStyle = '#60c4c8';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy + 5);
    const midX = cx - 12, midY = cy + 45;
    const endX = cx + 56, endY = cy - 38;
    if (checkT < 0.5) {
      const p = checkT / 0.5;
      ctx.lineTo(cx - 50 + (midX - (cx - 50)) * p, cy + 5 + (midY - (cy + 5)) * p);
    } else {
      ctx.lineTo(midX, midY);
      const p = (checkT - 0.5) / 0.5;
      ctx.lineTo(midX + (endX - midX) * p, midY + (endY - midY) * p);
    }
    ctx.stroke();
  }

  // Booking card
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, 60, 720, SCREEN_W - 120, 280, 28);
  ctx.fill();
  ctx.fillStyle = '#60c4c8';
  ctx.font = '700 22px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('CONFIRMED', 96, 768);
  ctx.fillStyle = '#fff';
  ctx.font = '700 36px Bricolage Grotesque, system-ui';
  ctx.fillText('Saturday · 2:00 PM', 96, 820);
  ctx.fillStyle = '#a0d6d8';
  ctx.font = '500 24px Figtree, system-ui';
  ctx.fillText('Coupe Premium · 45 min · 35 €', 96, 868);
  ctx.fillText('Client: @_kev.cuts', 96, 908);
  ctx.fillStyle = '#60c4c8';
  ctx.font = '600 22px Figtree, system-ui';
  ctx.fillText('Added to your agenda  →', 96, 968);
}

// Scene 3 — Barbier's agenda (week view)
function drawScreen3(ctx, t) {
  // Warm copper background
  const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  grad.addColorStop(0, '#1a1410');
  grad.addColorStop(1, '#2a1f18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawChrome(ctx);

  // Header
  ctx.fillStyle = '#fff';
  ctx.font = '700 30px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('This week', 50, 160);
  ctx.fillStyle = '#d4a574';
  ctx.font = '500 22px Figtree, system-ui';
  ctx.fillText('17 bookings · 720 €', 50, 192);

  // Days
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const colW = (SCREEN_W - 80) / 6;
  const startY = 240;

  // Headers
  ctx.fillStyle = '#888';
  ctx.font = '600 18px Figtree, system-ui';
  ctx.textAlign = 'center';
  days.forEach((d, i) => {
    ctx.fillText(d, 40 + colW * i + colW / 2, startY + 24);
  });

  // Booking blocks (simulated)
  const blocks = [
    { day: 0, start: 0.1, dur: 0.08, label: '10h', col: '#60c4c8' },
    { day: 0, start: 0.25, dur: 0.08, label: '12h', col: '#60c4c8' },
    { day: 1, start: 0.15, dur: 0.08, label: '11h', col: '#d4a574' },
    { day: 1, start: 0.35, dur: 0.10, label: '14h', col: '#d4a574' },
    { day: 1, start: 0.55, dur: 0.08, label: '17h', col: '#60c4c8' },
    { day: 2, start: 0.08, dur: 0.10, label: '09h', col: '#d4a574' },
    { day: 2, start: 0.28, dur: 0.12, label: '13h', col: '#60c4c8' },
    { day: 2, start: 0.48, dur: 0.08, label: '16h', col: '#d4a574' },
    { day: 3, start: 0.18, dur: 0.10, label: '12h', col: '#60c4c8' },
    { day: 3, start: 0.40, dur: 0.10, label: '15h', col: '#d4a574' },
    { day: 4, start: 0.10, dur: 0.08, label: '10h', col: '#d4a574' },
    { day: 4, start: 0.30, dur: 0.12, label: '13h', col: '#60c4c8' },
    { day: 4, start: 0.55, dur: 0.10, label: '17h', col: '#d4a574' },
    { day: 5, start: 0.05, dur: 0.10, label: '09h', col: '#60c4c8' },
    { day: 5, start: 0.25, dur: 0.10, label: '12h', col: '#d4a574' },
    { day: 5, start: 0.45, dur: 0.10, label: '15h', col: '#60c4c8' }
  ];

  const gridStartY = startY + 48;
  const gridH = SCREEN_H - gridStartY - 100;
  blocks.forEach((b, i) => {
    const localT = clamp(t * 2.5 - i * 0.04, 0, 1);
    if (localT <= 0) return;
    const x = 40 + colW * b.day + 6;
    const w = colW - 12;
    const y = gridStartY + b.start * gridH;
    const h = b.dur * gridH;
    ctx.globalAlpha = localT;
    ctx.fillStyle = b.col;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // "New booking" highlight that pulses
  const newT = clamp((t - 0.65) * 3, 0, 1);
  if (newT > 0) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 6);
    const lastBlock = blocks[blocks.length - 1];
    const x = 40 + colW * lastBlock.day + 6;
    const w = colW - 12;
    const y = gridStartY + lastBlock.start * gridH;
    const h = lastBlock.dur * gridH;
    ctx.strokeStyle = `rgba(255,255,255,${newT * pulse})`;
    ctx.lineWidth = 3;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 10);
    ctx.stroke();

    ctx.fillStyle = `rgba(255,255,255,${newT})`;
    ctx.font = '600 20px Figtree, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('+ Just booked', 50, SCREEN_H - 60);
  }
}

// Scene 4 — ROI stats
function drawScreen4(ctx, t) {
  // Clean off-white background
  const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  grad.addColorStop(0, '#f4f6f8');
  grad.addColorStop(1, '#e4eaed');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Status bar (dark text on light)
  ctx.fillStyle = '#000';
  ctx.font = '600 28px Figtree, system-ui';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('9:41', 40, 56);

  // Header
  ctx.fillStyle = '#0a1010';
  ctx.font = '700 30px Figtree, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Your month', 50, 160);
  ctx.fillStyle = '#666';
  ctx.font = '500 22px Figtree, system-ui';
  ctx.fillText('Compared to last month', 50, 192);

  // Big number that counts up
  const target = 340;
  const countT = ease(clamp(t * 1.2, 0, 1));
  const value = Math.round(target * countT);
  ctx.fillStyle = '#60c4c8';
  ctx.font = '700 140px Bricolage Grotesque, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('+€' + value, 50, 380);
  ctx.fillStyle = '#0a1010';
  ctx.font = '500 26px Figtree, system-ui';
  ctx.fillText('recovered DMs this month', 50, 430);

  // Bar chart (DMs missed → 0)
  const barY = 510;
  const barW = (SCREEN_W - 100) / 8;
  const bars = [42, 38, 35, 28, 22, 14, 8, 2];
  bars.forEach((bv, i) => {
    const localT = clamp(t * 2 - i * 0.06, 0, 1);
    const h = bv * 5 * localT;
    const x = 50 + i * barW + 6;
    const y = barY + 200 - h;
    ctx.fillStyle = i < 6 ? '#cbd5d8' : '#60c4c8';
    roundRect(ctx, x, y, barW - 12, h, 4);
    ctx.fill();
  });
  ctx.fillStyle = '#666';
  ctx.font = '500 18px Figtree, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('DMs missed per week', SCREEN_W / 2, barY + 250);

  // Time badge
  ctx.fillStyle = '#0a1010';
  roundRect(ctx, 50, 980, 220, 80, 16);
  ctx.fill();
  ctx.fillStyle = '#60c4c8';
  ctx.font = '700 36px Bricolage Grotesque, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('12h', 80, 1030);
  ctx.fillStyle = '#fff';
  ctx.font = '500 18px Figtree, system-ui';
  ctx.fillText('gained', 160, 1030);

  // Bookings count
  ctx.fillStyle = '#0a1010';
  roundRect(ctx, 290, 980, 220, 80, 16);
  ctx.fill();
  ctx.fillStyle = '#60c4c8';
  ctx.font = '700 36px Bricolage Grotesque, system-ui';
  ctx.fillText('64', 320, 1030);
  ctx.fillStyle = '#fff';
  ctx.font = '500 18px Figtree, system-ui';
  ctx.fillText('bookings', 380, 1030);
}

const SCREEN_RENDERERS = [drawScreen0, drawScreen1, drawScreen2, drawScreen3, drawScreen4];

/* ═══════════════════════════════════════════════════════════════════════════
   6. TIMELINE — evaluate(progress) → état global
   ═══════════════════════════════════════════════════════════════════════════ */

function evaluateTimeline(progress) {
  // Progress global 0..1 mappé sur 5 scènes (0..4)
  const sceneFloat = progress * (SCENE_COUNT - 1);
  const idx = Math.min(Math.floor(sceneFloat), SCENE_COUNT - 2);
  const localT = sceneFloat - idx;

  // Le titre reste stable pendant [0..0.7], glitch pendant [0.7..1.0]
  const titleStable = localT < 0.7;
  const titleTransition = localT >= 0.7 ? (localT - 0.7) / 0.3 : 0;

  // Sur la pose, on lerp tout le long (mouvement continu)
  const poseT = ease(localT);

  const from = SCENES[idx];
  const to = SCENES[Math.min(idx + 1, SCENE_COUNT - 1)];
  const pose = poseLerp(from.iphone, to.iphone, poseT);
  const bg = [
    lerp(from.bg[0], to.bg[0], poseT),
    lerp(from.bg[1], to.bg[1], poseT),
    lerp(from.bg[2], to.bg[2], poseT)
  ];
  const rim = lerp(from.rim, to.rim, poseT);

  return {
    progress, sceneFloat, idx, localT, titleStable, titleTransition,
    pose, bg, rim,
    currentScene: localT < 0.5 ? from : to,
    nextScene: to
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. SCENE THREE.JS
   ═══════════════════════════════════════════════════════════════════════════ */

let renderer, scene, camera, composer, bloomPass, rgbShift;
let iphone;
let envTarget, envCamera;

async function initThree() {
  await loadThree();
  const canvas = document.getElementById('hero-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene();
  // Le composer (bloom) peint du noir opaque sur les zones vides → un
  // fond transparent ne marche pas. On met la couleur DANS la scène et
  // on la pilote chaque frame (cf. loop). C'est le morph de couleur
  // signature de buttermax.
  scene.background = new THREE.Color(0x0a0e12);

  camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7);
  camera.lookAt(0, 0, 0);

  /* — Environment map (procédural pour les reflets) — */
  envCamera = new THREE.CubeCamera(0.1, 50, new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }));
  envCamera.position.set(0, 0, 0);
  scene.add(envCamera);

  /* — Lighting 3-point + ambient — */
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x60c4c8, 0.6);
  fillLight.position.set(-4, 1, 3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
  rimLight.position.set(0, -2, -5);
  scene.add(rimLight);

  /* — iPhone — */
  iphone = new iPhone();
  scene.add(iphone.group);

  // Environment — RoomEnvironment via PMREM : vrais reflets studio
  // sur le titane et le verre (zéro asset externe, ~1 frame de coût).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  /* — Post-processing : Bloom (B2 rim emissive) + RGBShift léger (B1 glitch) — */
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.2);
  bloomPass.threshold = 0.4;
  bloomPass.strength = 0.45;
  bloomPass.radius = 0.6;
  composer.addPass(bloomPass);

  rgbShift = new ShaderPass(RGBShiftShader);
  rgbShift.uniforms.amount.value = 0.0;
  composer.addPass(rgbShift);

  composer.addPass(new OutputPass());

  /* — Resize handling — */
  addEventListener('resize', onResize);
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. TEXT GLITCH — titre overlay
   ═══════════════════════════════════════════════════════════════════════════ */

const overlayEyebrow = document.getElementById('overlayEyebrow');
const overlayTitle   = document.getElementById('overlayTitle');
const overlaySub     = document.getElementById('overlaySub');
const sceneCta       = document.getElementById('sceneCta');

let currentSceneIdx = -1;
let currentLang = 'en';

function wrapTitleHTML(text) {
  return text.split(' ').map(word =>
    '<span class="word">' + [...word].map(c => `<span class="char">${c === ' ' ? '&nbsp;' : c}</span>`).join('') + '</span>'
  ).join(' ');
}

function setOverlayContent(idx, lang) {
  const s = SCENES[idx];
  overlayEyebrow.textContent = s.eyebrow[lang];
  overlayTitle.innerHTML = wrapTitleHTML(s.title[lang]);
  overlaySub.textContent = s.sub[lang];
  sceneCta.classList.toggle('is-visible', !!s.cta);
}

function animateOverlayIn() {
  const chars = overlayTitle.querySelectorAll('.char');
  chars.forEach((c, i) => {
    c.style.transform = 'translateY(100%)';
    c.style.opacity = '0';
    requestAnimationFrame(() => {
      c.style.transition = `transform 600ms cubic-bezier(0.16,1,0.3,1) ${i * 22}ms, opacity 400ms ease ${i * 22}ms`;
      c.style.transform = 'translateY(0)';
      c.style.opacity = '1';
    });
  });

  overlayEyebrow.style.opacity = '0';
  overlayEyebrow.style.transform = 'translateX(-12px)';
  requestAnimationFrame(() => {
    overlayEyebrow.style.transition = 'all 500ms cubic-bezier(0.16,1,0.3,1) 100ms';
    overlayEyebrow.style.opacity = '1';
    overlayEyebrow.style.transform = 'translateX(0)';
  });

  overlaySub.style.opacity = '0';
  overlaySub.style.transform = 'translateY(8px)';
  requestAnimationFrame(() => {
    overlaySub.style.transition = 'all 600ms cubic-bezier(0.16,1,0.3,1) 300ms';
    overlaySub.style.opacity = '1';
    overlaySub.style.transform = 'translateY(0)';
  });

  // Variable font morph
  if (!PREF_RM) {
    overlayTitle.animate(
      [{ fontVariationSettings: "'wght' 250, 'opsz' 18" },
       { fontVariationSettings: "'wght' 360, 'opsz' 96" }],
      { duration: 1200, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'forwards' }
    );
  }
}

function animateOverlayOut() {
  const chars = overlayTitle.querySelectorAll('.char');
  chars.forEach((c, i) => {
    c.style.transition = `transform 350ms cubic-bezier(0.7,0,0.84,0) ${i * 12}ms, opacity 300ms ease ${i * 12}ms`;
    c.style.transform = 'translateY(-110%)';
    c.style.opacity = '0';
  });
}

function maybeSwapScene(dominantIdx) {
  // Sens-agnostique : swap dès que la scène dominante change
  // (avant, arrière, ou saut via la timeline). Plus de dépendance
  // au sens de transition → l'overlay ne se désynchronise plus.
  if (dominantIdx === currentSceneIdx) return;
  currentSceneIdx = dominantIdx;
  animateOverlayOut();
  setTimeout(() => {
    setOverlayContent(dominantIdx, currentLang);
    animateOverlayIn();
  }, 200);
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. CURSEUR MAGNÉTIQUE
   ═══════════════════════════════════════════════════════════════════════════ */

const cursorDot = document.getElementById('cursorDot');
let mouseX = innerWidth / 2, mouseY = innerHeight / 2;
let cursorX = mouseX, cursorY = mouseY;

if (cursorDot && !IS_TOUCH) {
  addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
  addEventListener('mousedown', () => cursorDot.classList.add('is-press'));
  addEventListener('mouseup', () => cursorDot.classList.remove('is-press'));

  // Magnetism on hoverable elements
  document.querySelectorAll('a, button, .timeline-dot').forEach(el => {
    el.addEventListener('mouseenter', () => cursorDot.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => cursorDot.classList.remove('is-hover'));
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. SOUND DESIGN (B4 — opt-in)
   ═══════════════════════════════════════════════════════════════════════════ */

let audioCtx = null;
let soundEnabled = false;
const soundToggle = document.getElementById('soundToggle');

soundToggle?.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggle.classList.toggle('is-on', soundEnabled);
  soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  if (soundEnabled && !audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (soundEnabled) playClick();
});

function playClick() {
  if (!soundEnabled || !audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = 880;
  o.type = 'triangle';
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.1);
}

function playWhisper() {
  if (!soundEnabled || !audioCtx) return;
  const noise = audioCtx.createBufferSource();
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.4, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
  noise.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 0.8;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.04, audioCtx.currentTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
  noise.connect(filter).connect(g).connect(audioCtx.destination);
  noise.start();
  noise.stop(audioCtx.currentTime + 0.4);
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. GYROSCOPE MOBILE (B5)
   ═══════════════════════════════════════════════════════════════════════════ */

let gyroX = 0, gyroY = 0;
function initGyro() {
  if (!IS_TOUCH) return;
  if (typeof DeviceOrientationEvent !== 'undefined') {
    addEventListener('deviceorientation', e => {
      gyroX = (e.beta || 0) / 180;
      gyroY = (e.gamma || 0) / 90;
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   12. EASTER EGG — scroll inverse au début (B6)
   ═══════════════════════════════════════════════════════════════════════════ */

let easterTriggered = false;
let easterPhase = 0;
addEventListener('wheel', e => {
  if (window.scrollY < 10 && e.deltaY < -10 && !easterTriggered) {
    easterTriggered = true;
    easterPhase = 1;
    playWhisper();
    setTimeout(() => { easterTriggered = false; }, 800);
  }
}, { passive: true });

/* ═══════════════════════════════════════════════════════════════════════════
   13. RAF LOOP — render + sync DOM
   ═══════════════════════════════════════════════════════════════════════════ */

const timelineDots = document.querySelectorAll('.timeline-dot');
const stickyCta = document.getElementById('stickyCta');
let lastIdx = -1;
let frame = 0;
let _lastIsLight = false;

// Mode embarqué : si une section .hero3d existe (intégration dans index.html),
// le scroll est mesuré par rapport à cette section (canvas sticky) et le fond
// ne touche pas le body. Sinon (preview standalone) : scroll plein écran.
const HERO_SECTION = document.querySelector('.hero3d');
const EMBEDDED = !!HERO_SECTION;

function getScrollProgress() {
  if (EMBEDDED) {
    const rect = HERO_SECTION.getBoundingClientRect();
    const span = rect.height - innerHeight;
    return span > 0 ? clamp(-rect.top / span, 0, 1) : 0;
  }
  const scrollEnd = (SCENE_COUNT - 1) * innerHeight;
  const y = lenis ? lenis.scroll : window.scrollY;
  return clamp(y / scrollEnd, 0, 1);
}

function scheduleNext(cb) {
  // RAF est pausé quand visibilityState=hidden (preview tools).
  // Fallback setTimeout pour que la scène continue à animer en background.
  if (document.hidden) setTimeout(() => cb(performance.now()), 16);
  else requestAnimationFrame(cb);
}

function loop(time) {
  frame++;
  const t = time / 1000;
  const progress = getScrollProgress();
  const state = evaluateTimeline(progress);
  const isLight = state.bg[0] > 0.6;   // fond clair (scène ROI) → ajuste bloom + texte

  /* — iPhone pose — */
  // Add gyro & mouse drift
  const mouseDriftX = ((mouseX / innerWidth) - 0.5) * 0.06;
  const mouseDriftY = ((mouseY / innerHeight) - 0.5) * 0.04;
  const finalPose = { ...state.pose };
  finalPose.ry += mouseDriftX + gyroY * 0.3;
  finalPose.rx += -mouseDriftY + gyroX * 0.3;
  // Subtle floating
  finalPose.py += Math.sin(t * 0.7) * 0.04;
  finalPose.rz += Math.sin(t * 0.5) * 0.015;

  // Easter egg : "non" rotation if triggered
  if (easterPhase > 0) {
    easterPhase = Math.max(0, easterPhase - 0.04);
    finalPose.ry += Math.sin(t * 14) * 0.3 * easterPhase;
  }

  iphone.pose(finalPose);
  iphone.setRimIntensity(state.rim);

  /* — RGB shift (glitch) durant la transition — */
  if (state.titleTransition > 0) {
    rgbShift.uniforms.amount.value = state.titleTransition * 0.006;
  } else {
    rgbShift.uniforms.amount.value *= 0.85;
  }

  /* — Bloom intensity follows rim — */
  // Bloom adouci : l'ancien réglage cramait l'écran clair (scène ROI)
  // et faisait disparaître l'iPhone sur fond blanc.
  bloomPass.strength = (isLight ? 0.10 : 0.22) + state.rim * 0.28;

  /* — Background color (morph signature buttermax) — */
  const [br, bgc, bbl] = oklchToSRGB(state.bg[0], state.bg[1], state.bg[2]);
  if (scene.background) scene.background.setRGB(br, bgc, bbl, THREE.SRGBColorSpace);
  // En embarqué on ne peint PAS le body (le reste de la landing garde son fond).
  if (!EMBEDDED) document.body.style.backgroundColor = oklchLerp(state.bg, state.bg, 0);

  /* — Light scene : texte en sombre quand le fond est clair. Scopé à la
     section en embarqué pour ne pas polluer le reste de la page. */
  if (isLight !== _lastIsLight) {
    _lastIsLight = isLight;
    (EMBEDDED ? HERO_SECTION : document.body).classList.toggle('light-scene', isLight);
  }

  /* — Screen content (canvas2D) — */
  // Update the iPhone screen with the current scene renderer
  // During transition we cross-fade by blending two renderers
  const screenT = t;
  const ctx = iphone.screenCtx;
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

  const localT = state.localT;
  if (localT < 0.7) {
    // Show current scene fully
    SCREEN_RENDERERS[state.idx](ctx, localT / 0.7);
  } else {
    // Cross-fade between current and next
    const fadeT = (localT - 0.7) / 0.3;
    SCREEN_RENDERERS[state.idx](ctx, 1.0);
    ctx.globalAlpha = fadeT;
    SCREEN_RENDERERS[Math.min(state.idx + 1, SCENE_COUNT - 1)](ctx, 0.05);
    ctx.globalAlpha = 1;
  }
  iphone.markScreenDirty();

  /* — Timeline dots — */
  if (state.idx !== lastIdx) {
    lastIdx = state.idx;
    timelineDots.forEach((d, i) => {
      d.classList.toggle('is-current', i === state.idx);
      d.classList.toggle('is-past', i < state.idx);
    });
    playWhisper();
  }

  /* — Sticky CTA visibility — */
  if (stickyCta) stickyCta.classList.toggle('is-visible', state.sceneFloat >= 2.0);

  /* — Maybe swap overlay scene (sens-agnostique : avant/arrière/saut) — */
  const dominantIdx = clamp(Math.round(state.sceneFloat), 0, SCENE_COUNT - 1);
  maybeSwapScene(dominantIdx);

  /* — Cursor follow (smooth) — */
  if (cursorDot && !IS_TOUCH) {
    cursorX = lerp(cursorX, mouseX, 0.18);
    cursorY = lerp(cursorY, mouseY, 0.18);
    cursorDot.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;
  }

  /* — Render — */
  composer.render();

  scheduleNext(loop);
}

/* ═══════════════════════════════════════════════════════════════════════════
   14. TIMELINE RAIL — click to jump
   ═══════════════════════════════════════════════════════════════════════════ */

timelineDots.forEach((dot, i) => {
  dot.addEventListener('click', () => {
    // En embarqué : cible dans la section hero (offset + fraction).
    const targetY = EMBEDDED
      ? HERO_SECTION.offsetTop + (i / (SCENE_COUNT - 1)) * (HERO_SECTION.offsetHeight - innerHeight)
      : i * innerHeight;
    if (lenis) {
      lenis.scrollTo(targetY, { duration: 1.4 });
    } else {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
    playClick();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   14b. FALLBACK MOBILE / DOM dégradé (zéro WebGL)
   ═══════════════════════════════════════════════════════════════════════════ */

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function initMobileFallback() {
  document.body.classList.add('m-fallback');
  // On démonte tout l'appareillage WebGL/desktop
  ['hero-canvas', 'overlay', 'timelineRail', 'stickyCta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Preview : les .scene existent déjà. Embarqué (index.html) : on les crée
  // dans la section hero et on la repasse en hauteur auto (plus de 500vh).
  let sections = [...document.querySelectorAll('.scene')];
  if (sections.length === 0 && HERO_SECTION) {
    HERO_SECTION.style.height = 'auto';
    sections = SCENES.map((_, i) => {
      const d = document.createElement('section');
      d.className = 'scene'; d.dataset.idx = i;
      HERO_SECTION.appendChild(d);
      return d;
    });
  }
  sections.forEach((sec, i) => {
    const s = SCENES[i];
    sec.classList.add('m-scene');

    const copy = document.createElement('div');
    copy.className = 'm-copy';
    copy.innerHTML =
      `<span class="m-eyebrow">${s.eyebrow[currentLang]}</span>` +
      `<h2 class="m-title">${s.title[currentLang]}</h2>` +
      `<p class="m-sub">${s.sub[currentLang]}</p>` +
      (s.cta ? `<a class="m-cta" href="#cta">${currentLang === 'fr' ? 'Commencer — 10 min' : 'Start free — 10 min'}</a>` : '');

    const phone = document.createElement('div');
    phone.className = 'm-phone';
    const cv = document.createElement('canvas');
    cv.width = SCREEN_W; cv.height = SCREEN_H; cv.className = 'm-screen';
    // Rendu COMPLET statique de l'écran de la scène (réutilise les renderers)
    SCREEN_RENDERERS[i](cv.getContext('2d'), 1);
    const island = document.createElement('div');
    island.className = 'm-island';
    phone.append(cv, island);

    sec.append(copy, phone);
  });

  // Fond + light-scene pilotés par IntersectionObserver (scroll natif)
  const applyScene = (i) => {
    const s = SCENES[i];
    document.body.style.backgroundColor = `oklch(${s.bg[0]} ${s.bg[1]} ${s.bg[2]})`;
    document.body.classList.toggle('light-scene', s.bg[0] > 0.6);
  };
  applyScene(0);

  if ('IntersectionObserver' in window) {
    // Bande centrale : une section devient "active" quand elle croise le
    // milieu du viewport. Robuste même si la section est plus haute que
    // l'écran (le seuil 0.5 ne se déclenchait jamais dans ce cas).
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          applyScene(+e.target.dataset.idx);
          e.target.classList.add('m-in');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    sections.forEach(sec => io.observe(sec));
  } else {
    sections.forEach(sec => sec.classList.add('m-in'));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   15. BOOTSTRAP
   ═══════════════════════════════════════════════════════════════════════════ */

(async function bootstrap() {
  console.log('[hero3d] bootstrap start');
  try {
    // Branche fallback : mobile, reduced-motion, petit écran ou pas de WebGL
    // → mode DOM dégradé, Three.js n'est jamais chargé.
    const FALLBACK = PREF_RM || IS_TOUCH || innerWidth < 768 || !hasWebGL();
    if (FALLBACK) {
      console.log('[hero3d] mode fallback (mobile / reduced-motion / no-webgl)');
      initMobileFallback();
      const ld = document.getElementById('loader');
      if (ld) ld.classList.add('gone');
      return;
    }

    await initThree();
    console.log('[hero3d] Three.js initialized');

    if (!EMBEDDED) {
      // Lenis + reset scroll : seulement en preview standalone. En embarqué
      // on garde le scroll natif de la landing (évite tout conflit avec sa
      // navigation, sec-nav et ancres existantes).
      await initLenis();
      initGyro();
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
      if (lenis) lenis.scrollTo(0, { immediate: true });
    }

    // Langue initiale depuis <html data-lang> (système bilingue de la landing)
    currentLang = document.documentElement.dataset.lang === 'fr' ? 'fr' : 'en';

    // Initial overlay setup
    setOverlayContent(0, currentLang);
    currentSceneIdx = 0;
    animateOverlayIn();

    // Re-render l'overlay quand la langue de la landing change (toggle EN/FR)
    if (EMBEDDED) {
      new MutationObserver(() => {
        const lng = document.documentElement.dataset.lang === 'fr' ? 'fr' : 'en';
        if (lng !== currentLang) { currentLang = lng; setOverlayContent(currentSceneIdx, currentLang); }
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
    }

    // Expose debugging hooks
    window.__hero3d = {
      THREE, renderer, scene, camera, composer, bloomPass, rgbShift,
      iphone, lenis,
      evaluateTimeline, getScrollProgress, SCENES,
      forceRender: () => composer.render(),
      forceLoop: (t) => loop(t),
      scrollTo: (idx) => {
        const y = idx * innerHeight;
        if (lenis) lenis.scrollTo(y, { duration: 0.001 });
        else window.scrollTo({ top: y });
      }
    };

    // Start loop
    scheduleNext(loop);
    console.log('[hero3d] RAF loop scheduled');

    // Hide loader after first paint (absent en embarqué → garde null)
    setTimeout(() => {
      document.getElementById('loader')?.classList.add('gone');
    }, 600);
  } catch (err) {
    console.error('[hero3d] bootstrap error', err);
  }
})();
