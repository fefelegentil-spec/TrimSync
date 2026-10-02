/* ────────────────────────────────────────────────────────────────────────────
   TrimSync — CTA iPhone 3D
   Remplace la maquette 2D du bas de page (#cta) par un VRAI iPhone 3D :
   modèle glTF « iPhone 15 Pro » (Sketchfab, Sketcher, CC-BY 4.0), éclairage
   studio HDRI, softboxes RectAreaLight, écran verrouillé iOS dessiné en canvas
   et incrusté sur la dalle.

   Pas de halo ni de plan additif derrière : le téléphone se détache sur la
   page uniquement par son éclairage (aucun rectangle visible).

   Contraintes :
   - Le 2D reste le fallback : rien n'est masqué tant que la 3D n'a pas dit
     qu'elle était prête (classe .has-3d sur .cta-phone-mock).
   - Chargement paresseux : Three.js (~600 Ko) + le modèle (~11 Mo) ne sont
     téléchargés que quand la section approche du viewport.
   - prefers-reduced-motion : on rend une frame fixe, sans animation.
   - Zéro bundler : Three.js vient du CDN via l'importmap posé dans index.html.
   ──────────────────────────────────────────────────────────────────────────── */

const MODEL_GLTF = new URL('public/3d/iphone15/scene.gltf', document.baseURI).href;
const MODEL_GLB  = new URL('public/3d/iphone.glb', document.baseURI).href;
const HDR_URL    = new URL('public/3d/studio.hdr', document.baseURI).href;

const SCREEN_W = 540;
const SCREEN_H = 1170;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Barre d'état iOS — heure 9:41 à gauche, signal / Wi-Fi / batterie à droite */
function drawStatusBar(ctx, light = false) {
  const fg = light ? '#0a0a0a' : '#ffffff';
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;

  ctx.font = '700 30px -apple-system, "SF Pro Display", "Figtree", system-ui';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('9:41', 50, 62);

  let rx = SCREEN_W - 50;

  // Batterie
  const bw = 50, bh = 24, by = 62 - bh / 2;
  const bx = rx - bw;
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.globalAlpha = 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillRect(bx + bw + 2, by + 7, 3, 10);
  roundRect(ctx, bx + 3, by + 3, (bw - 6) * 0.96, bh - 6, 3);
  ctx.fill();
  rx = bx - 12;

  // Wi-Fi
  const wx = rx - 14, wy = 62;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(wx, wy + 4, 6 + i * 5, -2.2, -0.94);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wx, wy + 4, 2.2, 0, Math.PI * 2);
  ctx.fill();
  rx = wx - 18;

  // Signal cellulaire
  const barW = 4, gap = 3, barBase = 72;
  for (let i = 0; i < 4; i++) {
    const h = 6 + i * 4;
    ctx.fillRect(rx - (4 - i) * (barW + gap), barBase - h, barW, h);
  }
}

/* Notification iOS : matériau translucide, icône d'app, nom de l'app + heure,
   titre en gras, corps. Géométrie calquée sur une vraie bannière iOS. */
function drawNotif(ctx, y, icoText, c1, c2, icoFg, meta, title, msg) {
  const x = 40, w = SCREEN_W - 80, h = 152, r = 50;

  ctx.save();
  // Verre dépoli : fond translucide + liseré clair 1px
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, r);
  ctx.stroke();

  // Icône d'app (vrai dégradé canvas — une chaîne CSS ne s'applique pas)
  const is = 58, ix = x + 30, iy = y + (h - is) / 2;
  const grad = ctx.createLinearGradient(ix, iy, ix + is, iy + is);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  roundRect(ctx, ix, iy, is, is, 14);
  ctx.fill();

  ctx.fillStyle = icoFg;
  ctx.font = '800 30px "Bricolage Grotesque", "Figtree", -apple-system, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icoText, ix + is / 2, iy + is / 2 + 2);

  // Textes
  const tx = ix + is + 22;
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.font = '600 21px "Figtree", -apple-system, system-ui';
  ctx.fillText(meta, tx, y + 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 27px "Figtree", -apple-system, system-ui';
  ctx.fillText(title, tx, y + 82);

  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.font = '500 23px "Figtree", -apple-system, system-ui';
  ctx.fillText(msg, tx, y + 116);

  ctx.restore();
}

/* Bouton rond du bas d'un écran verrouillé iOS (lampe torche / appareil photo) */
function drawLockBtn(ctx, cx, cy, r, kind) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3.2;
  ctx.lineJoin = 'round';
  if (kind === 'flash') {
    // Lampe torche : tête large + corps plus fin
    roundRect(ctx, cx - 13, cy - 15, 26, 12, 4);
    ctx.fill();
    roundRect(ctx, cx - 8, cy - 3, 16, 22, 5);
    ctx.fill();
  } else {
    // Appareil photo : boîtier + objectif + viseur
    roundRect(ctx, cx - 17, cy - 10, 34, 24, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 7.5, 0, Math.PI * 2);
    ctx.stroke();
    roundRect(ctx, cx - 6, cy - 15, 12, 6, 3);
    ctx.stroke();
  }
  ctx.restore();
}

/* Écran verrouillé iOS : date, horloge, notifications, boutons du bas,
   indicateur home. C'est la véritable interface d'un iPhone. */
function drawLockScreen(ctx) {
  ctx.fillStyle = '#04070a';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Fond d'écran : dégradé radial teal profond
  const g = ctx.createRadialGradient(SCREEN_W * 0.5, 190, 60, SCREEN_W * 0.5, 340, 820);
  g.addColorStop(0, '#153d45');
  g.addColorStop(0.45, '#0a1c22');
  g.addColorStop(1, '#04070a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawStatusBar(ctx);

  // Date + horloge (horloge arrondie épaisse, comme iOS 17+)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '600 34px "Figtree", -apple-system, system-ui';
  ctx.fillText('Thursday, June 12', SCREEN_W / 2, 256);

  ctx.fillStyle = '#ffffff';
  ctx.font = '500 204px "SF Pro Rounded", "SF Pro Display", -apple-system, "Bricolage Grotesque", system-ui';
  ctx.fillText('9:41', SCREEN_W / 2, 382);

  // Notifications
  drawNotif(ctx, 604, 'TS', '#60c4c8', '#2f7f88', '#05242b', 'TrimSync · now', 'New booking · #47', 'Inès M. · Thu 6pm · Gel nails');
  drawNotif(ctx, 772, '✓', '#7fe0b0', '#3f9f74', '#06301f', 'TrimSync · now', 'Reminder scheduled', 'SMS D-1 · 9pm');

  // Boutons lampe torche + appareil photo
  drawLockBtn(ctx, 96, SCREEN_H - 148, 44, 'flash');
  drawLockBtn(ctx, SCREEN_W - 96, SCREEN_H - 148, 44, 'cam');

  // Indicateur home
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  roundRect(ctx, SCREEN_W / 2 - 62, SCREEN_H - 24, 124, 6, 3);
  ctx.fill();
}

async function loadTHREE() {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const { RectAreaLightUniformsLib } = await import('three/addons/lights/RectAreaLightUniformsLib.js');
  return { THREE, GLTFLoader, RGBELoader, DRACOLoader, RectAreaLightUniformsLib };
}

/* Charge le GLTF, le redresse / centre / cadre, retune les matériaux pour le
   studio, et incruste notre écran canvas sur la dalle réelle.
   (Porté depuis js/hero3d/main.js — même modèle, même rig.) */
async function buildPhone(THREE, GLTFLoader, DRACOLoader, targetH) {
  const loader = new GLTFLoader();
  try {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
  } catch (e) { /* draco optionnel */ }

  let gltf;
  try {
    gltf = await loader.loadAsync(MODEL_GLTF);
  } catch (e) {
    console.warn('[cta3d] iphone15/scene.gltf KO → fallback iphone.glb', e);
    gltf = await loader.loadAsync(MODEL_GLB);
  }
  const model = gltf.scene;

  // 1) Centrer
  model.updateMatrixWorld(true);
  const pre = new THREE.Box3().setFromObject(model);
  const preSize = pre.getSize(new THREE.Vector3());
  const center = pre.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const holder = new THREE.Group();
  holder.add(model);

  // 2) Redresser : épaisseur → Z, hauteur → Y
  const dims = [preSize.x, preSize.y, preSize.z];
  const shortest = dims.indexOf(Math.min(...dims));
  if (shortest === 1)      holder.rotation.x = -Math.PI / 2;
  else if (shortest === 0) holder.rotation.y =  Math.PI / 2;
  holder.updateMatrixWorld(true);
  let rb = new THREE.Box3().setFromObject(holder);
  let rs = rb.getSize(new THREE.Vector3());
  if (rs.x > rs.y) {
    holder.rotation.z += Math.PI / 2;
    holder.updateMatrixWorld(true);
    rb = new THREE.Box3().setFromObject(holder);
    rs = rb.getSize(new THREE.Vector3());
  }

  // 3) Écran vers la caméra (+Z) via sa normale
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

  const group = new THREE.Group();
  group.add(holder);
  group.updateMatrixWorld(true);

  // 4) Matériaux studio
  model.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      const hasPBRMap = !!(m.metalnessMap || m.roughnessMap || m.map);
      const isMetal = (m.metalness !== undefined && m.metalness >= 0.35);
      if (hasPBRMap) {
        m.envMapIntensity = 1.45;
      } else {
        if (isMetal) { m.metalness = 1.0; m.roughness = 0.30; m.envMapIntensity = 1.6; }
        else         { m.envMapIntensity = 1.1; }
      }
      if (isMetal && 'anisotropy' in m) {
        m.anisotropy = 0.85;
        m.anisotropyRotation = 0;
      }
      if (/screen_bg|screen_glass|pIJKfZsazmcpEiU/i.test(m.name || '')) {
        if (m.color) m.color.setHex(0x000000);
      }
      m.needsUpdate = true;
    });
  });

  // 5) Écran : texture canvas collée sur le mesh d'affichage (UV planaires monde)
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SCREEN_W;
  screenCanvas.height = SCREEN_H;
  const screenCtx = screenCanvas.getContext('2d');
  drawLockScreen(screenCtx);

  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 8;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });

  const disp2 = findScreenMesh(model);
  if (disp2) {
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
  }

  // 6) Échelle finale fiable
  group.updateMatrixWorld(true);
  const realH = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y || 1;
  const baseScale = targetH / realH;
  group.scale.setScalar(baseScale);

  return { group, baseScale };
}

async function init(mock) {
  const { THREE, GLTFLoader, RGBELoader, DRACOLoader, RectAreaLightUniformsLib } = await loadTHREE();

  // Conteneur + canvas
  const wrap = document.createElement('div');
  wrap.className = 'iphone3d';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  wrap.appendChild(canvas);
  mock.appendChild(wrap);

  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  // Éclairage studio
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.AmbientLight(0xffffff, 0.10));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
  keyLight.position.set(3, 5, 6);
  scene.add(keyLight);
  const softTop = new THREE.RectAreaLight(0xffffff, 5.0, 3.6, 7.5);
  softTop.position.set(-2.6, 2.4, 3.4);
  softTop.lookAt(0, 0, 0);
  scene.add(softTop);
  const softSide = new THREE.RectAreaLight(0xbfeff0, 2.8, 5.0, 4.0);
  softSide.position.set(3.2, -1.2, 2.6);
  softSide.lookAt(0, 0, 0);
  scene.add(softSide);

  // HDRI studio (reflets photoréalistes)
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    const hdr = await new RGBELoader().loadAsync(HDR_URL);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  } catch (e) {
    console.warn('[cta3d] HDRI KO → reflets sans HDRI', e);
  }
  pmrem.dispose();

  const phone = await buildPhone(THREE, GLTFLoader, DRACOLoader, 2.55);
  scene.add(phone.group);

  // Reveal : la 3D prend la place du 2D une fois la 1re frame prête
  renderer.render(scene, camera);
  mock.classList.add('has-3d');

  // Dimensionnement
  function resize() {
    const r = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (reduceMotion) renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  // Base pose : légèrement de trois-quarts pour montrer le titane
  const baseRy = -0.34, baseRx = 0.06;
  phone.group.rotation.set(baseRx, baseRy, 0);

  if (reduceMotion) {
    phone.group.rotation.set(baseRx, baseRy, 0);
    renderer.render(scene, camera);
    return;
  }

  // Parallaxe pointeur douce
  let tx = 0, ty = 0, mx = 0, my = 0;
  mock.addEventListener('pointermove', e => {
    const r = mock.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  mock.addEventListener('pointerleave', () => { tx = 0; ty = 0; });

  const t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    mx += (tx - mx) * 0.05;
    my += (ty - my) * 0.05;
    phone.group.rotation.y = baseRy + Math.sin(t * 0.45) * 0.12 + mx * 0.28;
    phone.group.rotation.x = baseRx + Math.sin(t * 0.7) * 0.03 - my * 0.16;
    phone.group.position.y = Math.sin(t * 0.85) * 0.025;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function start() {
  const mock = document.querySelector('.cta-phone-mock');
  if (!mock || !hasWebGL()) return;

  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    init(mock).catch(e => {
      // 3D KO → on laisse la maquette 2D en place, proprement.
      console.warn('[cta3d] 3D indisponible → fallback 2D', e);
      mock.classList.remove('has-3d');
    });
  }

  if (!('IntersectionObserver' in window)) { boot(); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { io.disconnect(); boot(); }
    });
  }, { rootMargin: '600px 0px' });
  io.observe(mock);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
