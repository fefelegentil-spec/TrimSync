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
let THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, RGBShiftShader, RectAreaLightUniformsLib, GLTFLoader, RGBELoader, DRACOLoader;
async function loadThree() {
  THREE = await import('three');
  ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
  ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
  ({ UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'));
  ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
  ({ ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js'));
  ({ RGBShiftShader } = await import('three/addons/shaders/RGBShiftShader.js'));
  ({ RectAreaLightUniformsLib } = await import('three/addons/lights/RectAreaLightUniformsLib.js'));
  ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
  ({ RGBELoader } = await import('three/addons/loaders/RGBELoader.js'));
  ({ DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js'));
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

  // Bevel fin = arête de châssis nette (et écran posé devant la face avant).
  const extrudeSettings = { depth: d, bevelEnabled: true, bevelSegments: segments, steps: 1, bevelSize: 0.02, bevelThickness: 0.01, curveSegments: segments };
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.translate(0, 0, -d / 2);
  geom.computeVertexNormals();
  return geom;
}

// Plan à coins arrondis (bezel, verre, plateau caméra). Matériau uni →
// les UV de ShapeGeometry n'ont pas d'importance ici.
function makeRoundedPlane(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 24);
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
    // Proportions iPhone 15 Pro, coins squircle (R généreux)
    const W = 1.40, H = 2.88, D = 0.135, R = 0.30;
    const frontZ = D / 2 + 0.01;   // face avant du châssis (bevelThickness 0.01)
    const backZ  = -(D / 2 + 0.01);

    /* — Châssis titane (dos + rail) : métal poli, reflets nets — */
    const body = new THREE.Mesh(
      makeRoundedBox(W, H, D, R, 18),
      new THREE.MeshPhysicalMaterial({
        color: 0x1c1e22, metalness: 1.0, roughness: 0.26,
        envMapIntensity: 1.0, clearcoat: 0.35, clearcoatRoughness: 0.25
      })
    );
    this.group.add(body);

    /* — Bezel noir : masque la face avant titane et cadre l'écran — */
    const bezel = new THREE.Mesh(
      makeRoundedPlane(W - 0.05, H - 0.05, R - 0.03),
      new THREE.MeshPhysicalMaterial({
        color: 0x050609, metalness: 0.0, roughness: 0.4,
        clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 0.5
      })
    );
    bezel.position.z = frontZ + 0.002;
    this.group.add(bezel);

    /* — Écran (CanvasTexture dynamique), encastré sous le verre — */
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 540;
    this.screenCanvas.height = 1170;  // ratio 19.5:9
    this.screenCtx = this.screenCanvas.getContext('2d', { willReadFrequently: false });
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 8;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.13, H - 0.15),   // bezel fin uniforme
      new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false })
    );
    screen.position.z = frontZ + 0.006;
    this.group.add(screen);

    /* — Verre avant affleurant : glossy, réfléchit le softbox (le vrai
         "tell" du produit photo). Pas de transmission (ça éteignait l'écran),
         juste une fine couche spéculaire très réfléchissante. — */
    const glass = new THREE.Mesh(
      makeRoundedPlane(W - 0.015, H - 0.015, R - 0.012),
      new THREE.MeshPhysicalMaterial({
        transparent: true, opacity: 0.05, color: 0xffffff,
        metalness: 0.0, roughness: 0.03, clearcoat: 0.5, clearcoatRoughness: 0.03,
        ior: 1.5, reflectivity: 0.6, envMapIntensity: 0.9, depthWrite: false
      })
    );
    glass.position.z = frontZ + 0.012;
    this.group.add(glass);

    /* — Dynamic Island — */
    const diGeom = new THREE.CapsuleGeometry(0.052, 0.17, 6, 16);
    diGeom.rotateZ(Math.PI / 2);
    const di = new THREE.Mesh(diGeom, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    di.position.set(0, H / 2 - 0.22, frontZ + 0.014);
    this.group.add(di);

    /* — Bosse caméra au dos (haut-gauche) : plateau + 3 objectifs — */
    const camCX = -W / 2 + 0.40, camCY = H / 2 - 0.42;
    const plate = new THREE.Mesh(
      makeRoundedPlane(0.64, 0.64, 0.20),
      new THREE.MeshPhysicalMaterial({ color: 0x1a1c21, metalness: 1.0, roughness: 0.35, envMapIntensity: 1.1 })
    );
    plate.position.set(camCX, camCY, backZ - 0.012);
    plate.rotation.y = Math.PI;   // face vers l'arrière
    this.group.add(plate);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x33373d, metalness: 1.0, roughness: 0.3 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x070809, metalness: 0.6, roughness: 0.08, clearcoat: 1.0, envMapIntensity: 1.6 });
    [[-0.13, 0.13], [0.13, 0.13], [0, -0.14]].forEach(([lx, ly]) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 28), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(camCX + lx, camCY + ly, backZ - 0.04);
      this.group.add(ring);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 28), lensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(camCX + lx, camCY + ly, backZ - 0.05);
      this.group.add(lens);
    });

    /* — Boutons latéraux (titane) — */
    const btnMat = new THREE.MeshPhysicalMaterial({ color: 0x232529, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.2 });
    const power = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.34, 0.07), btnMat);
    power.position.set(W / 2 + 0.004, 0.42, 0); this.group.add(power);
    const volU = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.07), btnMat);
    volU.position.set(-W / 2 - 0.004, 0.62, 0); this.group.add(volU);
    const volD = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.07), btnMat);
    volD.position.set(-W / 2 - 0.004, 0.30, 0); this.group.add(volD);

    /* — Back-rim glow (teal) : halo derrière, n'éclaire pas l'écran — */
    this.glowLight = new THREE.PointLight(0x60c4c8, 1.2, 4.0, 2);
    this.glowLight.position.set(0, 0, backZ - 0.35);
    this.group.add(this.glowLight);

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

// Environnement studio procédural : fond sombre + softbox blancs + bande
// teal (marque). Donne au métal/verre des reflets francs et mobiles.
function makeStudioEnvTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#28303a');
  base.addColorStop(0.42, '#0c1014');
  base.addColorStop(1, '#04060a');
  g.fillStyle = base; g.fillRect(0, 0, 1024, 512);
  const strip = (cx, w, a) => {
    const lg = g.createLinearGradient(cx - w, 0, cx + w, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, `rgba(255,255,255,${a})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(cx - w, 0, w * 2, 512);
  };
  strip(250, 95, 0.95);
  strip(760, 55, 0.55);
  const teal = g.createLinearGradient(520, 0, 660, 0);
  teal.addColorStop(0, 'rgba(96,196,200,0)');
  teal.addColorStop(0.5, 'rgba(96,196,200,0.40)');
  teal.addColorStop(1, 'rgba(96,196,200,0)');
  g.fillStyle = teal; g.fillRect(520, 0, 140, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Charge l'iPhone GLTF réel (public/3d/iphone.glb), le redresse/centre/cadre,
// améliore ses matériaux pour le studio, et superpose NOTRE écran lumineux
// (canvas) sur la face avant — indépendant des UV du modèle. Expose la même
// interface que la classe iPhone (group, pose, setRimIntensity, screenCtx…).
async function loadPhoneModelWrapper() {
  const loader = new GLTFLoader();
  try {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
  } catch (e) { /* draco optionnel */ }

  const gltf = await loader.loadAsync(new URL('public/3d/iphone.glb', document.baseURI).href);
  const model = gltf.scene;

  // 1) Centrer le modèle à l'origine de son holder
  model.updateMatrixWorld(true);
  const pre = new THREE.Box3().setFromObject(model);
  const preSize = pre.getSize(new THREE.Vector3());
  const center = pre.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const holder = new THREE.Group();
  holder.add(model);

  // 2) Redresser : amener l'axe LE PLUS COURT (épaisseur) vers Z (face caméra)
  //    et le PLUS LONG (hauteur) vers Y. (Ce modèle : Y court, Z long → rot X.)
  const dims = [preSize.x, preSize.y, preSize.z];
  const shortest = dims.indexOf(Math.min(...dims));
  if (shortest === 1)      holder.rotation.x = -Math.PI / 2;   // Y court → Z
  else if (shortest === 0) holder.rotation.y =  Math.PI / 2;   // X court → Z
  holder.updateMatrixWorld(true);
  // si après ça le plus long n'est pas sur Y, swap via rotation Z
  let rb = new THREE.Box3().setFromObject(holder);
  let rs = rb.getSize(new THREE.Vector3());
  if (rs.x > rs.y) { holder.rotation.z += Math.PI / 2; holder.updateMatrixWorld(true); rb = new THREE.Box3().setFromObject(holder); rs = rb.getSize(new THREE.Vector3()); }

  // 3) Orienter l'ÉCRAN (mesh Screen_BG) vers la caméra (+Z) via sa NORMALE.
  //    Ne pas se baser sur tous les meshes "screen" : les 3 objectifs caméra
  //    sont aussi nommés "Screen_Glass" et faussaient le calcul (→ dos visible).
  holder.updateMatrixWorld(true);
  let disp = null;
  holder.traverse(o => { if (o.isMesh && /screen_bg/i.test(o.material && o.material.name || '')) disp = o; });
  if (disp && disp.geometry.attributes.normal) {
    const na = disp.geometry.attributes.normal;
    const nrm = new THREE.Vector3(na.getX(0), na.getY(0), na.getZ(0))
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(disp.matrixWorld)).normalize();
    if (nrm.z < 0) { holder.rotation.y += Math.PI; holder.updateMatrixWorld(true); }
  }
  rb = new THREE.Box3().setFromObject(holder); rs = rb.getSize(new THREE.Vector3());

  // 4) Échelle cible (hauteur ≈ 3 unités, comme le modèle codé)
  const group = new THREE.Group();
  group.add(holder);
  group.scale.setScalar(1);
  group.updateMatrixWorld(true);
  const TARGET_H = 2.6;   // hauteur monde visée (tient dans le viewport ~3.5 avec marge)

  // 5) Matériaux : reflets studio appuyés, écran modèle neutralisé
  model.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      m.envMapIntensity = 1.0;
      if (m.metalness !== undefined && m.metalness > 0.4 && m.roughness !== undefined) {
        m.roughness = Math.max(Math.min(m.roughness, 0.42), 0.20);   // métal lisible, sans liseré miroir cramé
      }
      if (/screen_bg|screen_glass/i.test(m.name || '')) { m.color && m.color.setHex(0x000000); }
      m.needsUpdate = true;
    });
  });

  // 6) Écran : plan lumineux dimensionné EXACTEMENT sur le mesh d'affichage
  //    réel (Screen_BG) et posé juste devant la dalle. UV propres de
  //    PlaneGeometry → contenu net et droit ; taille = écran réel → fini le
  //    carré collé surdimensionné. (Mapper sur les UV du modèle = atlas → noir.)
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 540; screenCanvas.height = 1170;
  const screenCtx = screenCanvas.getContext('2d');
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 8;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  let disp2 = null;
  model.traverse(o => { if (o.isMesh && /screen_bg/i.test(o.material && o.material.name || '')) disp2 = o; });
  let sw, sh, scx = 0, scy = 0, frontZ;
  if (disp2) {
    const wb = new THREE.Box3().setFromObject(disp2);   // group.scale=1 → world == group-local
    const c = wb.getCenter(new THREE.Vector3()); const sz = wb.getSize(new THREE.Vector3());
    sw = Math.max(sz.x, 0.01) * 0.945;   // léger bezel : on voit le châssis autour
    sh = Math.max(sz.y, 0.01) * 0.955;
    scx = c.x; scy = c.y; frontZ = wb.max.z;
  } else {
    const wb = new THREE.Box3().setFromObject(holder); const sz = wb.getSize(new THREE.Vector3());
    sw = sz.x * 0.88; sh = sz.y * 0.93; frontZ = wb.max.z;
  }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat);
  screen.position.set(scx, scy, frontZ + 0.35);   // au ras de la dalle
  group.add(screen);

  // 7) Back-rim glow teal (derrière le téléphone)
  const hbz = new THREE.Box3().setFromObject(holder);
  const glow = new THREE.PointLight(0x60c4c8, 1.4, 0, 2);
  glow.position.set(0, 0, hbz.min.z - 1.5);
  group.add(glow);

  // 8) Échelle finale FIABLE : on mesure le group ASSEMBLÉ (scale 1) → vraie
  //    hauteur. (rs/rb intermédiaires étaient faussés par les scales de nœuds
  //    internes du GLTF → le téléphone débordait du viewport.)
  group.updateMatrixWorld(true);
  const realH = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y || 1;
  const baseScale = TARGET_H / realH;
  group.scale.setScalar(baseScale);

  return {
    group, screenCanvas, screenCtx, screenTexture, _glow: glow,
    pose({ px, py, pz, rx, ry, rz, scale }) {
      group.position.set(px, py, pz);
      // rotation appliquée au group : compose avec l'orientation du holder
      group.rotation.set(rx, ry, rz);
      group.scale.setScalar(baseScale * scale);
    },
    setRimIntensity(i) { if (glow) glow.intensity = i * 2.5; },
    markScreenDirty() { screenTexture.needsUpdate = true; }
  };
}

async function initThree() {
  await loadThree();
  const canvas = document.getElementById('hero-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;   // remonté : le châssis était trop sombre/invisible

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

  /* — Éclairage studio — ambient bas + key + 2 softbox (RectAreaLight).
     Les RectAreaLight produisent le reflet rectangulaire net sur le verre
     et le métal : c'est LA signature d'un rendu produit photoréaliste. */
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
  keyLight.position.set(3, 5, 6);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x9fe8ea, 0.5);
  fillLight.position.set(-4, -1, 3);
  scene.add(fillLight);

  const softTop = new THREE.RectAreaLight(0xffffff, 2.2, 3.2, 6.5);
  softTop.position.set(-2.4, 2.6, 3.2);
  softTop.lookAt(0, 0, 0);
  scene.add(softTop);

  const softSide = new THREE.RectAreaLight(0x9fe8ea, 1.2, 4.5, 3.5);
  softSide.position.set(3.2, -1.0, 2.6);
  softSide.lookAt(0, 0, 0);
  scene.add(softSide);

  // Environment — HDRI studio RÉEL (reflets photoréalistes) via PMREM ;
  // fallback sur l'env procédural si le .hdr ne charge pas.
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    const hdr = await new RGBELoader().loadAsync(new URL('public/3d/studio.hdr', document.baseURI).href);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    console.log('[hero3d] HDRI studio chargé');
  } catch (e) {
    console.warn('[hero3d] HDRI KO → env procédural', e);
    const envTex = makeStudioEnvTexture();
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    envTex.dispose();
  }
  pmrem.dispose();

  /* — iPhone : modèle GLTF réel, fallback sur le modèle codé — */
  try {
    iphone = await loadPhoneModelWrapper();
    console.log('[hero3d] iPhone GLTF chargé');
  } catch (e) {
    console.warn('[hero3d] GLTF KO → modèle codé (fallback)', e);
    iphone = new iPhone();
  }
  scene.add(iphone.group);

  /* — Post-processing : Bloom (B2 rim emissive) + RGBShift léger (B1 glitch) — */
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.2);
  bloomPass.threshold = 0.72;   // seuil haut : seuls les vrais éclats blooment (pas tout le liseré HDRI)
  bloomPass.strength = 0.25;
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
  const isLight = false;   // fond sombre constant (morph couleur retiré à la demande)

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
  bloomPass.strength = (isLight ? 0.05 : 0.13) + state.rim * 0.2;

  /* — Fond : constant sombre (le morph de couleur a été retiré à la demande).
     scene.background est posé une seule fois dans initThree, on n'y touche plus. */

  /* — Screen content (canvas2D) — */
  // Update the iPhone screen with the current scene renderer
  // During transition we cross-fade by blending two renderers
  const screenT = t;
  const ctx = iphone.screenCtx;
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  roundRect(ctx, 0, 0, SCREEN_W, SCREEN_H, 72); ctx.clip();   // coins d'écran arrondis

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
  ctx.restore();
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
