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

// L'iPhone change de CÔTÉ à chaque scène (px ±1.0). Le texte d'overlay
// fait l'inverse (géré par CSS .overlay.is-right + toggle JS). Toutes les
// py restent ≤ -0.05 → on ne touche jamais la nav fixe (68px).
//
//   pair (0,2,4) → iPhone DROITE  (px = +1.0), texte à GAUCHE
//   impair (1,3) → iPhone GAUCHE  (px = -1.0), texte à DROITE
const SCENES = [
  {
    eyebrow: { en: '01 · The lost DM',         fr: '01 · Le DM oublié' },
    title:   { en: 'Your chair fills itself.', fr: 'Ta chaise se remplit toute seule.' },
    sub:     { en: 'While you sleep, the DMs that used to die in your inbox become booked appointments.',
               fr: 'Pendant que tu dors, les DMs qui mouraient dans ta boîte deviennent des RDV pris.' },
    bg: [0.12, 0.008, 222],
    iphone: { px:  1.00, py: -0.10, pz: 0.0, rx: -0.05, ry: -0.18, rz: 0.04, scale: 0.80 },
    rim: 0.4,
    cta: false
  },
  {
    eyebrow: { en: '02 · AI replies',          fr: '02 · L\'IA répond' },
    title:   { en: 'Trained on barber DMs.',   fr: 'Entraînée sur des DMs de barbiers.' },
    sub:     { en: 'Not on web text. Real conversations, real slang, real bookings.',
               fr: 'Pas sur du texte web. De vraies conversations, du vrai slang, de vrais RDV.' },
    bg: [0.30, 0.10, 200],
    iphone: { px: -1.00, py: -0.08, pz: 0.4, rx: -0.10, ry:  0.22, rz: 0.02, scale: 0.86 },
    rim: 0.7,
    cta: false
  },
  {
    eyebrow: { en: '03 · Booked',              fr: '03 · Réservé' },
    title:   { en: 'Booked. Synced. Done.',    fr: 'Pris. Synchro. Bouclé.' },
    sub:     { en: 'No reply needed. The slot lands in your agenda — and on the client\'s calendar.',
               fr: 'Pas besoin de répondre. Le créneau atterrit dans ton agenda et dans le calendrier du client.' },
    bg: [0.55, 0.13, 193],
    iphone: { px:  1.00, py: -0.05, pz: 0.6, rx:  0.00, ry:  0.00, rz: 0.0,  scale: 0.90 },
    rim: 1.0,
    cta: false
  },
  {
    eyebrow: { en: '04 · Your week, autopiloted', fr: '04 · Ta semaine en pilote auto' },
    title:   { en: 'Open the dashboard. Smile.',  fr: 'Ouvre le dashboard. Souris.' },
    sub:     { en: 'Every slot already booked, every client tracked, every euro counted.',
               fr: 'Chaque créneau déjà pris, chaque client suivi, chaque euro compté.' },
    bg: [0.48, 0.13, 60],
    iphone: { px: -1.00, py: -0.15, pz: 0.2, rx:  0.12, ry:  0.55, rz: -0.05, scale: 0.84 },
    rim: 0.8,
    cta: false
  },
  {
    eyebrow: { en: '05 · ROI',                 fr: '05 · Le retour' },
    title:   { en: '€340 a month, back.',      fr: '340 € par mois, récupérés.' },
    sub:     { en: 'That\'s the average barber saves with TrimSync. Ten minutes to set up.',
               fr: 'C\'est ce que récupère le barbier moyen avec TrimSync. Dix minutes pour l\'installer.' },
    bg: [0.88, 0.04, 200],
    iphone: { px:  1.00, py: -0.10, pz: -0.4, rx: -0.05, ry: -0.30, rz: 0.0, scale: 0.74 },
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

// Palette TrimSync — alignée sur les tokens CSS du site (--a, --bg, --bg2…).
const C = {
  teal:     '#5fbfc3',
  tealDim:  '#9bd6d8',
  tealDark: '#3a8589',
  bg:       '#0e0f13',
  bg2:      '#1c1e22',
  bg3:      '#262a30',
  text:     '#eaf1f3',
  text2:    '#9bb0b5',
  text3:    '#6a7a80',
  igBubble: '#262626',
  igInput:  '#1a1a1a',
  white:    '#ffffff'
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Status bar iOS authentique : 9:41 SF-Pro à gauche, signal/wifi/batterie à
// droite. Tout en chemins canvas, pas d'emoji ni glyphes système (qui
// rendaient mal selon les polices disponibles). La Dynamic Island est gérée
// par le mesh 3D capsule — on laisse le centre vide ici.
function drawStatusBar(ctx, light = false) {
  const fg = light ? '#0a0a0a' : '#ffffff';
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;

  // Heure 9:41 (système iOS) — gauche
  ctx.font = '700 30px -apple-system, "SF Pro Display", "Bricolage Grotesque", system-ui';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('9:41', 50, 62);

  // Bloc de droite : signal (4 barres) + wifi (3 arcs) + batterie (96)
  let rx = SCREEN_W - 50;   // bord droit, on remplit vers la gauche

  // Batterie : capsule arrondie + terminal + remplissage
  const bw = 50, bh = 24, by = 62 - bh / 2;
  const bx = rx - bw;
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.globalAlpha = 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Terminal +
  ctx.fillRect(bx + bw + 2, by + 7, 3, 10);
  // Remplissage 96%
  const fill = 0.96;
  roundRect(ctx, bx + 3, by + 3, (bw - 6) * fill, bh - 6, 3);
  ctx.fill();
  rx = bx - 12;

  // Wi-Fi : 3 arcs concentriques + dot central
  const wx = rx - 14, wy = 62;
  for (let i = 0; i < 3; i++) {
    const r = 6 + i * 5;
    ctx.beginPath();
    ctx.arc(wx, wy + 4, r, -2.2, -0.94);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wx, wy + 4, 2.2, 0, Math.PI * 2);
  ctx.fill();
  rx = wx - 18;

  // Signal cellulaire : 4 barres croissantes (toutes pleines = full signal)
  const barW = 4, gap = 3, barBase = 72;
  for (let i = 0; i < 4; i++) {
    const h = 6 + i * 4;
    const x = rx - (4 - i) * (barW + gap);
    ctx.fillRect(x, barBase - h, barW, h);
  }
}

// Avatar Instagram du client (cercle dégradé orange→rose→violet IG).
function drawIGAvatar(ctx, cx, cy, r) {
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, '#fcb045');
  grad.addColorStop(0.5, '#fd1d1d');
  grad.addColorStop(1, '#833ab4');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Initiale blanche
  ctx.fillStyle = '#fff';
  ctx.font = '700 26px -apple-system, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('K', cx, cy + 1);
}

// Header Instagram DM — back arrow + avatar + nom + status + call/video icons
function drawIGHeader(ctx, name = '_kev.cuts', status = 'Active 12m ago') {
  // Fine ligne séparation sous le header
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 240); ctx.lineTo(SCREEN_W, 240); ctx.stroke();

  // Back arrow ‹
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(46, 148); ctx.lineTo(28, 168); ctx.lineTo(46, 188);
  ctx.stroke();

  // Avatar + halo dégradé IG (story ring)
  drawIGAvatar(ctx, 100, 168, 28);

  // Nom + statut
  ctx.fillStyle = '#fff';
  ctx.font = '700 24px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 142, 158);
  ctx.fillStyle = '#8e9498';
  ctx.font = '500 18px -apple-system, "Figtree", system-ui';
  ctx.fillText(status, 142, 184);

  // Icônes call (téléphone) + video (caméra), à droite
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4;
  // Téléphone
  const phx = SCREEN_W - 100, phy = 168;
  ctx.beginPath();
  ctx.moveTo(phx - 11, phy - 11);
  ctx.quadraticCurveTo(phx - 14, phy - 14, phx - 6, phy - 6);
  ctx.lineTo(phx - 2, phy - 2);
  ctx.quadraticCurveTo(phx + 1, phy + 1, phx + 1, phy + 4);
  ctx.quadraticCurveTo(phx + 4, phy + 14, phx + 14, phy + 11);
  ctx.stroke();
  // Caméra (rectangle + triangle)
  const cmx = SCREEN_W - 50, cmy = 168;
  roundRect(ctx, cmx - 14, cmy - 9, 22, 18, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cmx + 8, cmy - 5);
  ctx.lineTo(cmx + 16, cmy - 9);
  ctx.lineTo(cmx + 16, cmy + 9);
  ctx.lineTo(cmx + 8, cmy + 5);
  ctx.closePath();
  ctx.stroke();
}

function drawIGInputBar(ctx, placeholder = 'Message…') {
  const y = SCREEN_H - 130;
  // Camera button rond gauche (teal IG → on garde le bleu IG natif)
  ctx.fillStyle = '#0095f6';
  ctx.beginPath();
  ctx.arc(70, y + 35, 26, 0, Math.PI * 2);
  ctx.fill();
  // Icône caméra dedans
  ctx.fillStyle = '#fff';
  roundRect(ctx, 56, y + 25, 28, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#0095f6';
  ctx.beginPath();
  ctx.arc(70, y + 35, 6, 0, Math.PI * 2);
  ctx.fill();

  // Champ texte pilule
  ctx.fillStyle = C.igInput;
  roundRect(ctx, 110, y, SCREEN_W - 130, 70, 35);
  ctx.fill();
  ctx.fillStyle = '#777';
  ctx.font = '500 22px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(placeholder, 138, y + 35);
  // Mic + gallery + sticker à droite du placeholder
  ctx.fillStyle = '#888';
  ctx.beginPath();
  ctx.arc(SCREEN_W - 110, y + 35, 4, 0, Math.PI * 2);
  ctx.arc(SCREEN_W - 88, y + 35, 4, 0, Math.PI * 2);
  ctx.arc(SCREEN_W - 66, y + 35, 4, 0, Math.PI * 2);
  ctx.fill();
}

// Scene 0 — DM Instagram réel à 2h47, banner TrimSync qui descend du haut.
function drawScreen0(ctx, t) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawStatusBar(ctx);
  drawIGHeader(ctx, '_kev.cuts', 'Active 12m ago');

  // Timestamp centré
  ctx.fillStyle = '#666';
  ctx.font = '600 18px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TODAY  ·  2:47 AM', SCREEN_W / 2, 290);

  // Bulle entrante du client (gris foncé IG, coin bas-gauche arrondi moins)
  const bx = 40, by = 340, bw = 360, bh = 110;
  ctx.fillStyle = C.igBubble;
  ctx.beginPath();
  ctx.moveTo(bx + 26, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, 26);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, 26);
  ctx.arcTo(bx, by + bh, bx, by, 8);   // coin bas-gauche petit = pointe vers avatar
  ctx.arcTo(bx, by, bx + bw, by, 26);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = '500 24px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Yo frérot tu peux me prendre', bx + 26, by + 38);
  ctx.fillText('demain matin stp ?', bx + 26, by + 72);

  // Bulle typing animée (3 dots) — montre que c'est en train de répondre
  const tBubX = bx, tBubY = by + bh + 18;
  ctx.fillStyle = C.igBubble;
  roundRect(ctx, tBubX, tBubY, 100, 56, 28);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const phase = (t * 3) - i * 0.4;
    const yOff = Math.sin(phase) * 4;
    const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(phase));
    ctx.fillStyle = `rgba(180, 190, 200, ${alpha})`;
    ctx.beginPath();
    ctx.arc(tBubX + 26 + i * 22, tBubY + 28 + yOff, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  drawIGInputBar(ctx, 'Message…');

  // Banner notification TrimSync qui slide depuis le haut (sous la DI)
  const slideT = clamp(t * 1.8 - 0.1, 0, 1);
  const notifY = -150 + slideT * 280;
  if (notifY > -120) {
    const a = clamp(slideT * 2, 0, 1);
    ctx.globalAlpha = a;
    // Card glass effect
    ctx.fillStyle = 'rgba(20, 22, 26, 0.92)';
    roundRect(ctx, 30, notifY, SCREEN_W - 60, 130, 28);
    ctx.fill();
    // Liseré teal en haut (subtil)
    ctx.fillStyle = C.teal;
    roundRect(ctx, 30, notifY, SCREEN_W - 60, 3, 28);
    ctx.fill();
    // Mark TrimSync (carré teal arrondi avec T)
    ctx.fillStyle = C.teal;
    roundRect(ctx, 54, notifY + 28, 50, 50, 12);
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.font = '800 28px "Bricolage Grotesque", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', 79, notifY + 54);
    // Texte
    ctx.fillStyle = '#fff';
    ctx.font = '700 20px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('TrimSync', 122, notifY + 42);
    ctx.fillStyle = '#a0aab0';
    ctx.font = '500 18px -apple-system, "Figtree", system-ui';
    ctx.fillText('now', SCREEN_W - 50 - ctx.measureText('now').width, notifY + 42);
    ctx.fillStyle = '#dcdfe2';
    ctx.font = '500 22px -apple-system, "Figtree", system-ui';
    ctx.fillText('New DM — drafting reply…', 122, notifY + 78);
    ctx.globalAlpha = 1;
  }
}

// Scene 1 — Toujours dans Instagram, mais l'IA TrimSync compose la réponse.
// Le client voit une vraie conversation IG ; le barbier voit la magie opérer.
function drawScreen1(ctx, t) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawStatusBar(ctx);
  drawIGHeader(ctx, '_kev.cuts', 'TrimSync replying for you');

  // Timestamp
  ctx.fillStyle = '#666';
  ctx.font = '600 18px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TODAY  ·  2:47 AM', SCREEN_W / 2, 290);

  // Bulle entrante du client (statique)
  let bx = 40, by = 330, bw = 360, bh = 64;
  ctx.fillStyle = C.igBubble;
  roundRect(ctx, bx, by, bw, bh, 22);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '500 22px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Yo tu peux me prendre demain ?', bx + 26, by + 32);

  // Bulle sortante TrimSync (bleu IG = bulle "envoyée par toi")
  const aT = clamp(t * 1.4, 0, 1);
  if (aT > 0) {
    ctx.globalAlpha = aT;
    const ax = 100, ay = 420, aw = SCREEN_W - 140, ah = 130;
    // Gradient bleu IG (style bulle envoyée)
    const grad = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah);
    grad.addColorStop(0, '#3897f0');
    grad.addColorStop(1, '#0095f6');
    ctx.fillStyle = grad;
    // Coin bas-droite plus pointu (vers l'avatar utilisateur implicite)
    ctx.beginPath();
    ctx.moveTo(ax + 24, ay);
    ctx.arcTo(ax + aw, ay, ax + aw, ay + ah, 24);
    ctx.arcTo(ax + aw, ay + ah, ax, ay + ah, 8);
    ctx.arcTo(ax, ay + ah, ax, ay, 24);
    ctx.arcTo(ax, ay, ax + aw, ay, 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '500 23px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Yo ! Demain j\'ai 3 créneaux libres :', ax + 22, ay + 36);
    ctx.fillText('10h, 14h ou 18h. Tu préfères ?', ax + 22, ay + 70);
    ctx.font = '600 17px -apple-system, "Figtree", system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText('Delivered · 2:47 AM', ax + 22, ay + 110);
    ctx.globalAlpha = 1;
  }

  // Quick reply chips IG (3 horloges) — apparition staggerée
  const slots = ['10:00', '14:00', '18:00'];
  const chipY = 600;
  slots.forEach((s, i) => {
    const lT = clamp((t - 0.4 - i * 0.18) * 2.2, 0, 1);
    if (lT <= 0) return;
    const x = 50 + i * 152;
    const yOff = (1 - lT) * 16;
    ctx.globalAlpha = lT;
    // Chip bleu IG
    ctx.fillStyle = 'rgba(0, 149, 246, 0.15)';
    ctx.strokeStyle = '#0095f6';
    ctx.lineWidth = 2;
    roundRect(ctx, x, chipY + yOff, 142, 68, 34);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px "Bricolage Grotesque", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x + 71, chipY + yOff + 38);
    ctx.globalAlpha = 1;
  });

  // Petit toast TrimSync en bas — "AI is typing in your voice"
  const toastY = SCREEN_H - 280;
  ctx.fillStyle = 'rgba(95, 191, 195, 0.12)';
  ctx.strokeStyle = C.teal;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 40, toastY, SCREEN_W - 80, 70, 18);
  ctx.fill();
  ctx.stroke();
  // Mark T
  ctx.fillStyle = C.teal;
  roundRect(ctx, 58, toastY + 16, 38, 38, 9);
  ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.font = '800 22px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', 77, toastY + 36);
  ctx.fillStyle = C.tealDim;
  ctx.font = '600 20px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('TrimSync replying in your voice', 112, toastY + 35);

  drawIGInputBar(ctx, 'AI is typing…');
}

// Stepper TrimSync (3 étapes). Reproduit le composant .step / .step-sep
// du booking trimsync (Slot · Info · Done).
function drawTrimsyncStepper(ctx, doneCount = 3) {
  const cy = 168;
  const labels = ['Slot', 'Info', 'Done'];
  const positions = [110, 270, 430];
  // Ligne reliant les steps
  ctx.strokeStyle = '#2a2e34';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(positions[0] + 20, cy);
  ctx.lineTo(positions[2] - 20, cy);
  ctx.stroke();
  // Ligne teal pour les portions complétées
  ctx.strokeStyle = C.teal;
  ctx.beginPath();
  if (doneCount >= 2) { ctx.moveTo(positions[0] + 20, cy); ctx.lineTo(positions[Math.min(doneCount - 1, 2)] - 20, cy); }
  ctx.stroke();
  // Cercles
  labels.forEach((lab, i) => {
    const x = positions[i];
    const isDone = i < doneCount - 1;
    const isActive = i === doneCount - 1;
    ctx.fillStyle = isDone || isActive ? C.teal : C.bg2;
    ctx.strokeStyle = isDone || isActive ? C.teal : '#3a3e44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (isDone) {
      // checkmark blanc
      ctx.strokeStyle = C.bg;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 8, cy);
      ctx.lineTo(x - 2, cy + 6);
      ctx.lineTo(x + 9, cy - 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = isActive ? C.bg : C.text3;
      ctx.font = '800 18px "Bricolage Grotesque", system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, cy + 1);
    }
    // Label
    ctx.fillStyle = isActive ? C.teal : (isDone ? C.text2 : C.text3);
    ctx.font = '700 14px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(lab.toUpperCase(), x, cy + 48);
  });
}

// Scene 2 — Booking confirmé. Reproduit l'étape 3 (Done) du booking
// TrimSync : stepper full-green + mark + titre + card RDV.
function drawScreen2(ctx, t) {
  // Background TrimSync dark teal (matche --bg du site)
  const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  grad.addColorStop(0, C.bg);
  grad.addColorStop(1, '#16181d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawStatusBar(ctx);

  // Stepper en haut — 3 étapes toutes complétées
  drawTrimsyncStepper(ctx, 3);

  // Splash mark TrimSync (carré teal "T" avec halo)
  const cx = SCREEN_W / 2, cy = 420;
  const popT = clamp(t * 2.5, 0, 1);
  const ease3 = ease(popT);
  const size = 90 * (0.6 + 0.4 * ease3);
  // Halo teal pulsé
  const haloR = 70 + 30 * ease3 + Math.sin(t * 2) * 6;
  const haloAlpha = 0.35 * ease3;
  const haloGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, haloR + 80);
  haloGrad.addColorStop(0, `rgba(95, 191, 195, ${haloAlpha})`);
  haloGrad.addColorStop(1, 'rgba(95, 191, 195, 0)');
  ctx.fillStyle = haloGrad;
  ctx.fillRect(cx - 200, cy - 200, 400, 400);
  // Carré teal
  ctx.fillStyle = C.teal;
  roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.22);
  ctx.fill();
  // T blanc à l'intérieur
  ctx.fillStyle = C.bg;
  ctx.font = `800 ${Math.round(size * 0.55)}px "Bricolage Grotesque", system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', cx, cy + size * 0.04);

  // Titre "Demo confirmed!" (matche la H2 du booking step 3)
  const titleT = clamp((t - 0.25) * 2, 0, 1);
  ctx.globalAlpha = titleT;
  ctx.fillStyle = C.text;
  ctx.font = '800 42px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Demo confirmed!', cx, 580);
  ctx.fillStyle = C.text2;
  ctx.font = '500 22px -apple-system, "Figtree", system-ui';
  ctx.fillText('Saturday 28 · 2:00 PM', cx, 622);
  ctx.globalAlpha = 1;

  // Card détails (mime .success-info-grid du booking)
  const cardT = clamp((t - 0.4) * 2, 0, 1);
  if (cardT > 0) {
    ctx.globalAlpha = cardT;
    const cardX = 50, cardY = 690, cardW = SCREEN_W - 100, cardH = 260;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(95, 191, 195, 0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.stroke();

    // 3 lignes d'info icone + label + value
    const rows = [
      { ic: 'cal', label: 'Date',   val: 'Sat · Mar 28' },
      { ic: 'usr', label: 'Client', val: '@_kev.cuts' },
      { ic: 'eur', label: 'Service', val: 'Coupe Premium · 35 €' }
    ];
    rows.forEach((r, i) => {
      const ry = cardY + 30 + i * 72;
      // Icône stylisée (cercle teal pâle + glyph)
      ctx.fillStyle = 'rgba(95, 191, 195, 0.15)';
      ctx.beginPath();
      ctx.arc(cardX + 36, ry + 22, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.teal;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (r.ic === 'cal') {
        roundRect(ctx, cardX + 28, ry + 13, 16, 18, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cardX + 32, ry + 11); ctx.lineTo(cardX + 32, ry + 16); ctx.moveTo(cardX + 40, ry + 11); ctx.lineTo(cardX + 40, ry + 16); ctx.stroke();
      } else if (r.ic === 'usr') {
        ctx.beginPath(); ctx.arc(cardX + 36, ry + 18, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cardX + 36, ry + 32, 8, Math.PI, 0); ctx.stroke();
      } else {
        ctx.fillStyle = C.teal;
        ctx.font = '800 18px -apple-system, "Bricolage Grotesque", system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('€', cardX + 36, ry + 22);
      }
      // Labels
      ctx.fillStyle = C.text3;
      ctx.font = '600 13px -apple-system, "Figtree", system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.label.toUpperCase(), cardX + 70, ry + 14);
      ctx.fillStyle = C.text;
      ctx.font = '600 22px -apple-system, "Figtree", system-ui';
      ctx.fillText(r.val, cardX + 70, ry + 38);
    });
    ctx.globalAlpha = 1;
  }

  // Bouton CTA bas
  const btnT = clamp((t - 0.6) * 2.5, 0, 1);
  if (btnT > 0) {
    ctx.globalAlpha = btnT;
    const by = SCREEN_H - 180;
    ctx.fillStyle = C.teal;
    roundRect(ctx, 50, by, SCREEN_W - 100, 80, 16);
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.font = '700 22px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add to Google Calendar  →', SCREEN_W / 2, by + 40);
    ctx.globalAlpha = 1;
  }
}

// Scene 3 — Dashboard TrimSync : vue agenda semaine. Match les tokens
// du dashboard réel (palette dark teal, fonts Bricolage + Figtree).
function drawScreen3(ctx, t) {
  // Fond TrimSync dark
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawStatusBar(ctx);

  // Header app : logo + nom + bouton "Today"
  ctx.fillStyle = C.teal;
  roundRect(ctx, 50, 140, 44, 44, 11);
  ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.font = '800 22px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', 72, 163);
  ctx.fillStyle = C.text;
  ctx.font = '800 26px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('TrimSync', 110, 163);
  // Pill "Today" à droite
  ctx.fillStyle = C.bg2;
  roundRect(ctx, SCREEN_W - 140, 145, 90, 36, 18);
  ctx.fill();
  ctx.fillStyle = C.text2;
  ctx.font = '700 14px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Today', SCREEN_W - 95, 165);

  // Section title + stats inline
  ctx.fillStyle = C.text;
  ctx.font = '700 32px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('This week', 50, 240);
  ctx.fillStyle = C.tealDim;
  ctx.font = '600 18px -apple-system, "Figtree", system-ui';
  ctx.fillText('17 bookings  ·  720 € revenue', 50, 274);

  // KPI row : 2 small cards
  const kx = 50, ky = 310, kw = (SCREEN_W - 110) / 2;
  ['+12 h freed', '7-day full'].forEach((lbl, i) => {
    const x = kx + i * (kw + 10);
    ctx.fillStyle = C.bg2;
    roundRect(ctx, x, ky, kw, 80, 14);
    ctx.fill();
    ctx.fillStyle = C.teal;
    ctx.font = '800 26px "Bricolage Grotesque", system-ui';
    ctx.fillText(lbl.split(' ')[0], x + 16, ky + 36);
    ctx.fillStyle = C.text2;
    ctx.font = '500 15px -apple-system, "Figtree", system-ui';
    ctx.fillText(lbl.split(' ').slice(1).join(' '), x + 16, ky + 60);
  });

  // Headers jours
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const todayIdx = 2;   // mercredi en surbrillance
  const gridX = 50;
  const colW = (SCREEN_W - 100) / 6;
  const gridTop = 430;

  days.forEach((d, i) => {
    const cx = gridX + i * colW + colW / 2;
    const isToday = i === todayIdx;
    if (isToday) {
      ctx.fillStyle = C.teal;
      ctx.beginPath();
      ctx.arc(cx, gridTop, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = isToday ? C.teal : C.text3;
    ctx.font = '700 13px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(d, cx, gridTop + 22);
  });

  // Grille agenda avec blocs
  const gridY = gridTop + 50;
  const gridH = SCREEN_H - gridY - 180;
  // Lignes horizontales très subtiles (heures)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let h = 0; h <= 4; h++) {
    const y = gridY + (gridH * h) / 4;
    ctx.beginPath(); ctx.moveTo(gridX, y); ctx.lineTo(SCREEN_W - 50, y); ctx.stroke();
  }

  const blocks = [
    { day: 0, start: 0.10, dur: 0.10, lbl: '10:00' },
    { day: 0, start: 0.30, dur: 0.09, lbl: '12h' },
    { day: 1, start: 0.18, dur: 0.10, lbl: '11h' },
    { day: 1, start: 0.40, dur: 0.12, lbl: '14h' },
    { day: 1, start: 0.62, dur: 0.10, lbl: '17h' },
    { day: 2, start: 0.08, dur: 0.10, lbl: '09h' },
    { day: 2, start: 0.30, dur: 0.14, lbl: '13h' },
    { day: 2, start: 0.55, dur: 0.10, lbl: '16h' },
    { day: 2, start: 0.72, dur: 0.10, lbl: '18h' },
    { day: 3, start: 0.20, dur: 0.10, lbl: '11h' },
    { day: 3, start: 0.42, dur: 0.12, lbl: '14h' },
    { day: 4, start: 0.12, dur: 0.10, lbl: '10h' },
    { day: 4, start: 0.34, dur: 0.14, lbl: '13h' },
    { day: 4, start: 0.60, dur: 0.12, lbl: '16h' },
    { day: 5, start: 0.08, dur: 0.10, lbl: '09h' },
    { day: 5, start: 0.28, dur: 0.12, lbl: '12h' },
    { day: 5, start: 0.50, dur: 0.10, lbl: '15h' }
  ];
  blocks.forEach((b, i) => {
    const lT = clamp(t * 2.8 - i * 0.05, 0, 1);
    if (lT <= 0) return;
    const x = gridX + colW * b.day + 4;
    const w = colW - 8;
    const y = gridY + b.start * gridH;
    const h = b.dur * gridH;
    ctx.globalAlpha = lT;
    // Bloc teal avec liseré gauche plus saturé
    ctx.fillStyle = 'rgba(95, 191, 195, 0.22)';
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = C.teal;
    ctx.fillRect(x, y, 3, h);
    ctx.globalAlpha = 1;
  });

  // Nouveau RDV highlight (le dernier bloc, samedi 15h)
  const newT = clamp((t - 0.55) * 3, 0, 1);
  if (newT > 0) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 5);
    const lb = blocks[blocks.length - 1];
    const x = gridX + colW * lb.day + 4;
    const w = colW - 8;
    const y = gridY + lb.start * gridH;
    const h = lb.dur * gridH;
    ctx.strokeStyle = `rgba(95, 191, 195, ${newT * pulse})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 8);
    ctx.stroke();
    // Toast "Just booked"
    ctx.globalAlpha = newT;
    ctx.fillStyle = C.teal;
    roundRect(ctx, 50, SCREEN_H - 230, SCREEN_W - 100, 56, 14);
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.font = '700 19px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+ Just booked — Sat 15:00 · @_kev.cuts', SCREEN_W / 2, SCREEN_H - 202);
    ctx.globalAlpha = 1;
  }

  // Bottom tab bar iOS-style
  const tbY = SCREEN_H - 130;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, tbY, SCREEN_W, 130);
  const tabs = ['Home', 'Agenda', 'Clients', 'Stats'];
  const activeT = 1;   // agenda
  tabs.forEach((tab, i) => {
    const tx = (SCREEN_W / 4) * i + (SCREEN_W / 8);
    ctx.fillStyle = i === activeT ? C.teal : C.text3;
    ctx.beginPath();
    ctx.arc(tx, tbY + 32, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${i === activeT ? '700' : '500'} 14px -apple-system, "Figtree", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab, tx, tbY + 64);
  });
  // Home indicator (bas iOS)
  ctx.fillStyle = '#fff';
  roundRect(ctx, SCREEN_W / 2 - 70, SCREEN_H - 22, 140, 5, 3);
  ctx.fill();
}

// Scene 4 — ROI mensuel. Cards style TrimSync (palette dark conservée, on
// inverse en clair pour matcher la transition bg→light de la dernière scène).
function drawScreen4(ctx, t) {
  // Fond clair (matche la dernière scène bg [0.88, 0.04, 200])
  const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  grad.addColorStop(0, '#f1f4f6');
  grad.addColorStop(1, '#e1e8eb');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  drawStatusBar(ctx, true);

  // Header app (logo + nom) en mode light
  ctx.fillStyle = C.teal;
  roundRect(ctx, 50, 140, 44, 44, 11);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 22px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', 72, 163);
  ctx.fillStyle = '#0e0f13';
  ctx.font = '800 26px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Your month', 110, 163);

  // Compteur géant +€340 (counts up)
  const target = 340;
  const countT = ease(clamp(t * 1.2, 0, 1));
  const value = Math.round(target * countT);
  ctx.fillStyle = C.teal;
  ctx.font = '800 160px "Bricolage Grotesque", system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('+€' + value, 50, 400);
  // Underline subtle
  ctx.fillStyle = 'rgba(95, 191, 195, 0.18)';
  ctx.fillRect(50, 408, 380, 6);

  ctx.fillStyle = '#3a4348';
  ctx.font = '600 22px -apple-system, "Figtree", system-ui';
  ctx.fillText('Recovered from DMs that used', 50, 460);
  ctx.fillText('to die unanswered.', 50, 492);

  // Bar chart : DMs ratés par semaine, déclinant
  const barY = 550;
  const barH = 180;
  const barW = (SCREEN_W - 100) / 8;
  const bars = [42, 38, 35, 28, 22, 14, 8, 2];
  ctx.fillStyle = '#5a6469';
  ctx.font = '600 14px -apple-system, "Figtree", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('DMs missed per week (TrimSync ON week 6)', 50, barY - 16);

  bars.forEach((bv, i) => {
    const lT = clamp(t * 2 - i * 0.06, 0, 1);
    const h = (bv / 42) * barH * lT;
    const x = 50 + i * barW + 4;
    const y = barY + barH - h;
    // Couleur : gris pour les 6 premiers (avant TrimSync), teal après
    ctx.fillStyle = i < 6 ? '#c3ccd0' : C.teal;
    roundRect(ctx, x, y, barW - 10, h, 4);
    ctx.fill();
  });
  // Légende W1...W8
  ['W1','W2','W3','W4','W5','W6','W7','W8'].forEach((lab, i) => {
    ctx.fillStyle = '#8a9498';
    ctx.font = '500 12px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(lab, 50 + i * barW + barW / 2 - 5, barY + barH + 20);
  });

  // 3 cards stats du bas (12h gained, 64 bookings, 7×ROI)
  const cy = 920;
  const cw = (SCREEN_W - 100 - 24) / 3;
  const stats = [
    { big: '12h', sub: 'time saved' },
    { big: '64',  sub: 'bookings'   },
    { big: '7×',  sub: 'ROI'        }
  ];
  stats.forEach((s, i) => {
    const cx = 50 + i * (cw + 12);
    ctx.fillStyle = '#0e0f13';
    roundRect(ctx, cx, cy, cw, 100, 14);
    ctx.fill();
    ctx.fillStyle = C.teal;
    ctx.font = '800 38px "Bricolage Grotesque", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.big, cx + cw / 2, cy + 38);
    ctx.fillStyle = '#a8b3b8';
    ctx.font = '500 14px -apple-system, "Figtree", system-ui';
    ctx.fillText(s.sub, cx + cw / 2, cy + 74);
  });

  // Bouton CTA bas
  const btnT = clamp((t - 0.55) * 2.5, 0, 1);
  if (btnT > 0) {
    ctx.globalAlpha = btnT;
    const by = SCREEN_H - 130;
    ctx.fillStyle = C.teal;
    roundRect(ctx, 50, by, SCREEN_W - 100, 70, 14);
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.font = '700 20px -apple-system, "Figtree", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Start free — 10 min setup  →', SCREEN_W / 2, by + 35);
    ctx.globalAlpha = 1;
  }
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

  // Pose : on tient à gauche/droite pendant [0..0.25], on traverse pendant
  // [0.25..0.75] (50% du transit — étalé pour ne plus être "flash"), puis
  // on tient à la nouvelle place [0.75..1]. Texte hidden dans [0.20..0.80]
  // → disparait AVANT que l'iPhone bouge et revient APRÈS qu'il se pose.
  const poseT = smoothstep(0.25, 0.75, localT);

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

  // iPhone 15 Pro — bundle Sketchfab CC-BY-4.0 (Sketcher / jnanbr07).
  // glTF non-binaire : scene.gltf + scene.bin + textures/ (PBR baseColor +
  // metallicRoughness + normal + emissive). On garde un fallback sur l'ancien
  // .glb si jamais le nouveau pack disparaît.
  let gltf;
  try {
    gltf = await loader.loadAsync(new URL('public/3d/iphone15/scene.gltf', document.baseURI).href);
  } catch (e) {
    console.warn('[hero3d] iphone15/scene.gltf KO → fallback iphone.glb', e);
    gltf = await loader.loadAsync(new URL('public/3d/iphone.glb', document.baseURI).href);
  }
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

  // 3) Orienter l'ÉCRAN vers la caméra (+Z) via sa NORMALE.
  //    Détection robuste de l'écran sur DEUX modèles différents :
  //      a) ancien .glb : matériau "Screen_BG"
  //      b) nouveau Sketchfab : matériau "pIJKfZsazmcpEiU" (baseColor noir +
  //         emissiveMap = wallpaper). On garde aussi un filet général "tout
  //         matériau avec emissiveMap = candidat écran" et on retient le plus
  //         grand (les objectifs caméra peuvent avoir un emissive parasite).
  function findScreenMesh(root) {
    let best = null, bestArea = 0;
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const isScreen = mats.some(m => m && (
        m.emissiveMap ||
        /screen_bg/i.test(m.name || '') ||
        /pIJKfZsazmcpEiU/i.test(m.name || '')
      ));
      if (!isScreen) return;
      o.geometry.computeBoundingBox();
      const sz = o.geometry.boundingBox.getSize(new THREE.Vector3());
      // surface max parmi les trois faces : on garde le mesh "plat et large"
      const area = Math.max(sz.x * sz.y, sz.x * sz.z, sz.y * sz.z);
      if (area > bestArea) { bestArea = area; best = o; }
    });
    return best;
  }
  holder.updateMatrixWorld(true);
  let disp = findScreenMesh(holder);
  if (disp && disp.geometry.attributes.normal) {
    const na = disp.geometry.attributes.normal;
    const nrm = new THREE.Vector3(na.getX(0), na.getY(0), na.getZ(0))
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(disp.matrixWorld)).normalize();
    if (nrm.z < 0) { holder.rotation.y += Math.PI; holder.updateMatrixWorld(true); }
  }
  rb = new THREE.Box3().setFromObject(holder); rs = rb.getSize(new THREE.Vector3());

  // 4) Échelle cible. La nav fixe en haut fait 68px sur ~900px de viewport
  //    (≈7.5%). Au scale max (0.90) en scène 3, la hauteur écran-monde devient
  //    1.9 * 0.90 = 1.71. Sur un viewport-monde de ~3.5 (FOV 28°, dist 7), le
  //    haut du téléphone arrive à 0.86 du centre = 25% de la hauteur viewport
  //    → marge confortable de 17% au-dessus avant la nav. Réglable d'un coup.
  const group = new THREE.Group();
  group.add(holder);
  group.scale.setScalar(1);
  group.updateMatrixWorld(true);
  const TARGET_H = 1.9;

  // 5) Matériaux : tuning studio.
  //    Règle : on RESPECTE les textures PBR si elles existent (le modèle
  //    Sketchfab a baseColor + metallicRoughness + normal → on ne casse pas
  //    l'auteur). On override uniquement metalness/roughness sur les
  //    matériaux SANS map (héritage de l'ancien .glb plastique). Et on
  //    pousse `envMapIntensity` partout pour faire chanter la HDRI studio.
  model.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      const hasPBRMap = !!(m.metalnessMap || m.roughnessMap || m.map);
      const isMetal = (m.metalness !== undefined && m.metalness >= 0.35);
      if (hasPBRMap) {
        // Modèle PBR-textured : on fait confiance à l'asset, juste un boost env.
        m.envMapIntensity = 1.4;
      } else {
        // Pas de texture → ancien régime "force titane" pour éviter le plastique.
        if (isMetal) { m.metalness = 1.0; m.roughness = 0.30; m.envMapIntensity = 1.6; }
        else         { m.envMapIntensity = 1.1; }
      }
      // Anisotropie titane : le reflet allongé qui GLISSE quand le téléphone
      // tourne — c'est CE détail qui transforme un métal "réaliste" en métal
      // "buttermax". MeshPhysicalMaterial.anisotropy (Three.js r152+).
      if (isMetal && 'anisotropy' in m) {
        m.anisotropy = 0.85;
        m.anisotropyRotation = 0;   // brossage vertical (long axis du téléphone)
      }
      if (/screen_bg|screen_glass|pIJKfZsazmcpEiU/i.test(m.name || '')) {
        if (m.color) m.color.setHex(0x000000);
      }
      m.needsUpdate = true;
    });
  });

  // 6) Écran : on mappe NOTRE texture DIRECTEMENT sur le mesh d'affichage réel
  //    (Screen_BG), coplanaire avec la dalle → vrai écran incrusté, qui tourne
  //    avec le téléphone, ZÉRO offset/parallaxe/superposition. On recalcule des
  //    UV planaires (les UV d'origine = atlas baké → rendu noir).
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 540; screenCanvas.height = 1170;
  const screenCtx = screenCanvas.getContext('2d');
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 8;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  const disp2 = findScreenMesh(model);
  if (disp2) {
    // UV en ESPACE MONDE : on projette chaque vertex via matrixWorld, puis on
    // mappe U = (worldX - xMin)/xRange et V = (worldY - yMin)/yRange. Comme
    // toutes les rotations de redressage ont déjà été appliquées au holder,
    // le monde a +X = droite du téléphone et +Y = haut du téléphone.
    // Avec CanvasTexture.flipY=true (défaut), canvas(0,0) → texture(u=0,v=1),
    // donc V=1 (max Y monde) = haut du téléphone = top du canvas. Déterministe
    // peu importe l'orientation locale du mesh dans le GLTF d'origine.
    group.updateMatrixWorld(true);
    const g = disp2.geometry;
    const pos = g.attributes.position;
    const wm = disp2.matrixWorld;
    const tmp = new THREE.Vector3();
    let wMinX = Infinity, wMinY = Infinity, wMaxX = -Infinity, wMaxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(wm);
      if (tmp.x < wMinX) wMinX = tmp.x;
      if (tmp.y < wMinY) wMinY = tmp.y;
      if (tmp.x > wMaxX) wMaxX = tmp.x;
      if (tmp.y > wMaxY) wMaxY = tmp.y;
    }
    const sw = (wMaxX - wMinX) || 1, sh = (wMaxY - wMinY) || 1;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(wm);
      uv[i * 2]     = (tmp.x - wMinX) / sw;
      uv[i * 2 + 1] = (tmp.y - wMinY) / sh;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    disp2.material = screenMat;
    disp2.renderOrder = 2;
  } else {
    const wb = new THREE.Box3().setFromObject(holder); const sz = wb.getSize(new THREE.Vector3());
    const ov = new THREE.Mesh(new THREE.PlaneGeometry(sz.x * 0.9, sz.y * 0.94), screenMat);
    ov.position.set(0, 0, wb.max.z + 0.2);
    group.add(ov);
  }

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
  scene.add(new THREE.AmbientLight(0xffffff, 0.06));   // ambient bas → contraste studio

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);   // doux : l'HDRI + softbox font le gros
  keyLight.position.set(3, 5, 6);
  scene.add(keyLight);

  // Softbox (RectAreaLight) : grands panneaux qui créent le reflet rectangulaire
  // net qui GLISSE sur le titane — la signature d'un rendu produit.
  const softTop = new THREE.RectAreaLight(0xffffff, 4.5, 3.6, 7.5);
  softTop.position.set(-2.6, 2.4, 3.4);
  softTop.lookAt(0, 0, 0);
  scene.add(softTop);

  const softSide = new THREE.RectAreaLight(0xbfeff0, 2.6, 5.0, 4.0);
  softSide.position.set(3.2, -1.2, 2.6);
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

  // Backdrop SHADER : radial gradient + glow teal qui dérive lentement +
  // grain de film + vignette. Donne de la vie au fond (l'ancien canvas
  // statique faisait "produit blanc sur table morte"). Tout en WebGL, zéro
  // texture chargée.
  const backdropMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTime:   { value: 0 },
      uBase:   { value: new THREE.Color(0x05080b) },   // noir bleuté (extérieur)
      uCenter: { value: new THREE.Color(0x1c2a36) },   // gris bleu (centre)
      uAccent: { value: new THREE.Color(0x60c4c8) }    // teal marque (glow drift)
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uBase, uCenter, uAccent;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 p = vUv - 0.5;

        // Radial gradient : centre éclairci → bord sombre (vignette intégrée)
        float r = length(p);
        vec3 col = mix(uCenter, uBase, smoothstep(0.05, 0.75, r));

        // Glow teal qui dérive en Lissajous lent (jamais au repos)
        vec2 glowCenter = vec2(sin(uTime * 0.13) * 0.22, cos(uTime * 0.10) * 0.16);
        float glowD = length(p - glowCenter);
        float glow = exp(-glowD * 5.5);
        col = mix(col, uAccent, glow * 0.22);

        // Second halo plus diffus, contre-rotation, légèrement violet-shifté
        vec2 g2 = vec2(cos(uTime * 0.08 + 1.7) * 0.30, sin(uTime * 0.11 + 2.3) * 0.20);
        float glow2 = exp(-length(p - g2) * 3.5);
        col += vec3(0.10, 0.18, 0.24) * glow2 * 0.18;

        // Grain de film subtil — anti-banding et "filmic feel"
        float grain = hash(vUv * 1024.0 + uTime * 60.0) - 0.5;
        col += grain * 0.012;

        // Vignette finale (en plus du gradient) pour ancrer les coins
        col *= 1.0 - r * 0.55;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), backdropMat);
  backdrop.position.set(0, 0, -7);
  scene.add(backdrop);
  // Exposé pour que la boucle d'anim mette à jour uTime chaque frame.
  scene.userData.backdropMat = backdropMat;

  /* — Post-processing : Bloom (B2 rim emissive) + RGBShift léger (B1 glitch) — */
  // Render target MULTISAMPLE (MSAA ×4) : bords nets dans le post-processing
  // (sans ça, le composer bypass l'antialias du canvas → crénelage "cheap").
  const _dpr = renderer.getDrawingBufferSize(new THREE.Vector2());
  const _rt = new THREE.WebGLRenderTarget(_dpr.x, _dpr.y, { samples: 4, type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, _rt);
  composer.addPass(new RenderPass(scene, camera));

  // Bloom très discret + seuil haut : on ne veut PAS de halo flou autour du
  // téléphone (c'est le tell "rendu 3D cheap"), juste un léger éclat sur l'écran.
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.5, 0.85);
  bloomPass.threshold = 0.85;
  bloomPass.strength = 0.12;
  bloomPass.radius = 0.5;
  composer.addPass(bloomPass);

  // RGB shift retiré à la demande — plus d'effet glitch sur les transitions.
  // L'instance reste pour ne pas casser les références (loop, debug), mais elle
  // n'est PAS ajoutée au composer → aucun coût visuel.
  rgbShift = new ShaderPass(RGBShiftShader);
  rgbShift.uniforms.amount.value = 0.0;

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

const overlayEl      = document.getElementById('overlay');
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
  // (avant, arrière, ou saut via la timeline). L'opacité est désormais
  // pilotée par le scroll DANS LA BOUCLE (cf. plus bas) → on swap le
  // contenu IMMÉDIATEMENT, c'est l'opacity scroll-driven qui rend le
  // changement invisible pendant la fenêtre [0.45, 0.55] de la traversée.
  // Plus de setTimeout 200ms qui se désynchronisait à la moindre
  // variation de vitesse de scroll.
  if (dominantIdx === currentSceneIdx) return;
  currentSceneIdx = dominantIdx;
  setOverlayContent(dominantIdx, currentLang);
  if (overlayEl) overlayEl.classList.toggle('is-right', dominantIdx % 2 === 1);
  // Per-char reveal du nouveau titre : se joue sous le voile de l'overlay
  // (opacity scroll-driven) et finit d'animer pendant que l'overlay
  // redevient visible. Le pop par-lettre reste perceptible pour ceux qui
  // s'arrêtent juste après la transition.
  animateOverlayIn();
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
// Cursor drift lerp state — voir la boucle pour le détail (style Buttermax).
let smoothMouseRx = 0, smoothMouseRy = 0;
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
// Entrance scroll-driven : appliquée pendant les premiers ~6% du scroll
// de la section hero. Permet à l'utilisateur de contrôler la vitesse de
// l'apparition au lieu d'une animation aveugle au scroll.
const INTRO_PROGRESS = 0.06;
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
  const finalPose = { ...state.pose };

  // ANIMATIONS AUTONOMES — amplitudes appuyées pour que le téléphone vive.
  // Fréquences volontairement irrationnelles entre elles → la boucle ne se
  // répète jamais à l'identique, l'œil ne capte pas de pattern.
  //   py : flottement vertical (±0.14)
  //   pz : respiration avant/arrière (±0.25, bias +0.06 → légèrement vers nous)
  //   px : dérive latérale légère (±0.08)
  //   rx/ry/rz : micro-rotations multi-axes désync
  finalPose.py += Math.sin(t * 0.55) * 0.10;
  finalPose.pz += Math.sin(t * 0.38) * 0.22 + 0.06;
  // px : swing autonome RÉDUIT (0.08 → 0.035) pour que l'iPhone ne dérive
  // jamais assez à gauche/droite pour chevaucher le bloc texte au repos.
  finalPose.px += Math.sin(t * 0.28 + 0.7) * 0.035;
  finalPose.ry += Math.sin(t * 0.22) * 0.07;
  finalPose.rx += Math.sin(t * 0.31 + 1.3) * 0.05;
  finalPose.rz += Math.sin(t * 0.43 + 2.1) * 0.035;

  // CURSOR DRIFT — amplitude doublée et lerp légèrement plus rapide. Le
  // téléphone te SUIT visiblement maintenant (±10° sur Y, ±7° sur X), pas
  // juste un détail subliminal. Reste smooth grâce au lerp 0.08.
  const tgtRy = ((mouseX / innerWidth)  - 0.5) * 0.36;   // ±0.18 rad max (~10°)
  const tgtRx = ((mouseY / innerHeight) - 0.5) * 0.24;   // ±0.12 rad max (~7°)
  smoothMouseRy = lerp(smoothMouseRy, tgtRy, 0.08);
  smoothMouseRx = lerp(smoothMouseRx, tgtRx, 0.08);
  finalPose.ry += smoothMouseRy;
  finalPose.rx += -smoothMouseRx;
  // Parallaxe magnétique RÉDUITE sur px (0.10 → 0.04) pour ne jamais
  // chevaucher le texte ; py garde son swing complet.
  finalPose.px += ((mouseX / innerWidth)  - 0.5) * 0.04;
  finalPose.py += ((mouseY / innerHeight) - 0.5) * -0.06;

  // Easter egg : "non" rotation if triggered
  if (easterPhase > 0) {
    easterPhase = Math.max(0, easterPhase - 0.04);
    finalPose.ry += Math.sin(t * 14) * 0.3 * easterPhase;
  }

  // SPIN sur CHAQUE transition, CONCENTRÉ dans la fenêtre [0.40, 0.60] —
  // synchronisé avec le snap de pose. Direction alignée sur le sens du
  // déplacement (CW à droite, CCW à gauche). Pop forward Z dans la même
  // fenêtre étroite → le téléphone avance vers nous EXACTEMENT pendant
  // qu'il traverse, recule en atterrissant à sa nouvelle place.
  if (state.idx < SCENE_COUNT - 1) {
    // CHAQUE TRANSITION A SA PERSONNALITÉ. Plus de "spin Y" répétitif sur
    // toutes les scènes — on alterne les axes pour casser la monotonie.
    //
    //   0→1 : spin Y + arc + roulis (classique, comme une page qui tourne)
    //   1→2 : TUMBLE X (avance vers nous en faisant la roulade)
    //   2→3 : spin Z (in-plane, comme une aiguille d'horloge) + ZOOM in+out
    //   3→4 : spin Y inverse + arc HAUT (l'iPhone saute par-dessus)
    // spin{X,Y,Z} : nombre de TOURS COMPLETS. TOUJOURS un nombre entier
    // (1, 2, …) pour garantir qu'à la fin de la transition le téléphone
    // soit FACE caméra. Les demi-tours (0.5) laissaient le dos visible
    // → bug visible sur la scène Booked. La variété vient désormais
    // de l'axe + arc + pop Z + roll, pas de l'angle de rotation.
    //   0→1 : tour Y (page qui tourne) + arc + roll dans le virage
    //   1→2 : tour X (roulade avant) + pop Z doux
    //   2→3 : tour Y + GROS pop Z (zoom rentrant)
    //   3→4 : tour Y + ARC HAUT (saute par-dessus)
    const TRANSITIONS = [
      { spinX: 0, spinY: 1, spinZ: 0, arcY: 0.18, popZ: 0.65, roll: 0.12 },
      { spinX: 1, spinY: 0, spinZ: 0, arcY: 0.08, popZ: 0.45, roll: 0.00 },
      { spinX: 0, spinY: 1, spinZ: 0, arcY: 0.05, popZ: 1.10, roll: 0.04 },
      { spinX: 0, spinY: 1, spinZ: 0, arcY: 0.32, popZ: 0.40, roll: 0.20 }
    ];
    const tr = TRANSITIONS[state.idx];
    const direction = (SCENES[state.idx + 1].iphone.px - SCENES[state.idx].iphone.px) >= 0 ? 1 : -1;

    // Spin sur l'axe défini — fenêtre élargie [0.25, 0.75] (50% du localT)
    // pour étaler la rotation et qu'elle ne soit plus "flash".
    const spinT = smoothstep(0.25, 0.75, state.localT);
    const spinAmount = spinT * Math.PI * 2;
    finalPose.rx += spinAmount * tr.spinX;
    finalPose.ry += spinAmount * tr.spinY * direction;
    finalPose.rz += spinAmount * tr.spinZ * direction;

    // Arc + pop Z + roulis : cloche sin centrée sur localT=0.5, fenêtre
    // [0.25, 0.75] (même que pose/spin) → tout est synchronisé.
    const popPhase = clamp((state.localT - 0.25) / 0.50, 0, 1);
    const bell = Math.sin(popPhase * Math.PI);
    finalPose.py += bell * tr.arcY;
    finalPose.pz += bell * tr.popZ;
    finalPose.rz += bell * tr.roll * direction;
  }

  // INTRO scroll-driven : tant que progress < INTRO_PROGRESS (6%), on lerp
  // depuis la pose "drama" (loin, profil, petit) vers la pose scène 0.
  // L'utilisateur contrôle la vitesse — il scroll lentement, l'iPhone se
  // matérialise lentement. Il scroll vite, ça pop direct.
  const introT = clamp(progress / INTRO_PROGRESS, 0, 1);
  if (introT < 1) {
    const e = ease(introT);   // ease-out-cubic
    const intro = { px: finalPose.px * 0.4, py: finalPose.py - 0.45, pz: -3.5,
                    rx: finalPose.rx, ry: -Math.PI / 2, rz: finalPose.rz,
                    scale: finalPose.scale * 0.35 };
    finalPose.px    = lerp(intro.px,    finalPose.px,    e);
    finalPose.py    = lerp(intro.py,    finalPose.py,    e);
    finalPose.pz    = lerp(intro.pz,    finalPose.pz,    e);
    finalPose.ry    = lerp(intro.ry,    finalPose.ry,    e);
    finalPose.scale = lerp(intro.scale, finalPose.scale, e);
  }

  iphone.pose(finalPose);
  iphone.setRimIntensity(state.rim);

  // Backdrop shader — tick le temps pour faire dériver le glow teal et grainer.
  if (scene.userData.backdropMat) {
    scene.userData.backdropMat.uniforms.uTime.value = t;
  }

  /* — Bloom intensity follows rim — */
  // Bloom adouci : l'ancien réglage cramait l'écran clair (scène ROI)
  // et faisait disparaître l'iPhone sur fond blanc.
  bloomPass.strength = 0.04 + state.rim * 0.06;   // minimal : pas de halo autour du châssis

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
    // BRUSH WIPE — la scène suivante apparaît sous un masque vertical dont
    // le bord est PERTURBÉ par deux sinus (basse fréquence + haute) → look
    // de coup de pinceau encreur. La bande balaye depuis la gauche avec une
    // marge généreuse pour que l'entrée et la sortie soient propres. On
    // ajoute en bonus une fine ligne teal le long du bord pour "l'encre
    // fraîche".
    const wipeT = (localT - 0.7) / 0.3;
    SCREEN_RENDERERS[state.idx](ctx, 1.0);

    const nextIdx = Math.min(state.idx + 1, SCENE_COUNT - 1);
    const easeWipe = ease(wipeT);
    // wipeX traverse [-margin, SCREEN_W + margin] pour entrer/sortir clean
    const margin = 140;
    const wipeX = -margin + easeWipe * (SCREEN_W + margin * 2);
    const phase = screenT * 0.8 + state.idx;

    ctx.save();
    ctx.beginPath();
    // Bord du pinceau, point par point sur la hauteur
    const STEP = 8;
    for (let y = 0; y <= SCREEN_H + STEP; y += STEP) {
      const lowFreq  = Math.sin(y * 0.011 + phase * 1.2)  * 55;
      const highFreq = Math.sin(y * 0.062 + phase * 2.7)  * 18;
      const tiny     = Math.sin(y * 0.18  + phase * 5.0)  * 6;
      const x = wipeX + lowFreq + highFreq + tiny;
      if (y === 0) ctx.moveTo(x, -10);
      else ctx.lineTo(x, y);
    }
    // Fermeture vers la gauche (hors écran)
    ctx.lineTo(-margin * 2, SCREEN_H + 10);
    ctx.lineTo(-margin * 2, -10);
    ctx.closePath();
    ctx.clip();
    SCREEN_RENDERERS[nextIdx](ctx, 0.05);
    ctx.restore();

    // Liseré "encre" le long du bord (sans clip cette fois)
    ctx.save();
    ctx.strokeStyle = `rgba(95, 191, 195, ${0.55 * (1 - Math.abs(wipeT - 0.5) * 1.6)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let y = 0; y <= SCREEN_H; y += STEP) {
      const lowFreq  = Math.sin(y * 0.011 + phase * 1.2)  * 55;
      const highFreq = Math.sin(y * 0.062 + phase * 2.7)  * 18;
      const tiny     = Math.sin(y * 0.18  + phase * 5.0)  * 6;
      const x = wipeX + lowFreq + highFreq + tiny;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
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

  /* — Overlay text fade : scroll-driven. CACHÉ pendant la fenêtre étroite
     [0.45, 0.55] où l'iPhone traverse, fade rapide aux bords, full visible
     en dehors de [0.35, 0.65]. Le contenu est swappé par maybeSwapScene
     juste avant que l'opacity passe sous 0 — l'utilisateur ne voit jamais
     le changement de texte. Différent de la dernière scène où il n'y a
     plus de transit (idx === SCENE_COUNT - 1 OR aucune transition). */
  if (overlayEl) {
    let opacity;
    if (state.idx >= SCENE_COUNT - 1) {
      opacity = 1;
    } else {
      // Hidden dans [0.20, 0.80] (englobe la fenêtre de pose élargie
      // [0.25, 0.75]) avec fade aux bords [0.15, 0.20] et [0.80, 0.85].
      // Le texte disparaît AVANT que l'iPhone bouge et revient APRÈS
      // qu'il se soit posé. Visible 30% du localT (50vh sur 100vh par
      // scène) — assez pour lire confortablement.
      const dist = Math.abs(state.localT - 0.5);
      opacity = clamp((dist - 0.20) / 0.05, 0, 1);
    }
    overlayEl.style.opacity = opacity.toFixed(3);
  }

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

  // La 1re scène est révélée IMMÉDIATEMENT (avant qu'on ait pu scroller). Sans
  // ça l'utilisateur arrivait sur du contenu invisible (opacity 0) — "pas
  // d'animations" venait de là.
  if (sections[0]) sections[0].classList.add('m-in');

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
    }, { rootMargin: '-30% 0px -30% 0px', threshold: 0 });
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
