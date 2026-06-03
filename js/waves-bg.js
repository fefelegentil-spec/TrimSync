/* ═════════════════════════════════════════════════════════════
   TRIMSYNC ANIMATED BACKGROUND — WebGL Shader (Three.js)
   Ondes fluides organiques — palette teal oklch(0.76 0.13 193)

   ESM : importe Three.js via l'importmap définie dans index.html.
   Avant ce fichier était wrappé en IIFE et utilisait le THREE global
   du script UMD `three.min.js`. Résultat : Three.js était chargé DEUX
   fois (UMD pour waves-bg + ESM pour hero3d) → warning "Multiple
   instances of Three.js" + ~600 KB perdus en mémoire.
   ═════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

// Pas d'animation si l'utilisateur préfère le mouvement réduit
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Shaders ────────────────────────────────────────────────

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;
  uniform vec2  iResolution;
  uniform float iTime;
  varying vec2  vUv;

  void main() {
    // UV normalisés centrés
    vec2 uv = (2.0 * vUv * iResolution - iResolution) / min(iResolution.x, iResolution.y);

    float t = iTime * 0.28; // très lent — ambiant

    // Distorsion itérative : ondes fluides (10 itérations)
    for (float i = 1.0; i < 10.0; i++) {
      uv.x += 0.6 / i * cos(i * 2.5 * uv.y + t);
      uv.y += 0.6 / i * cos(i * 1.5 * uv.x + t);
    }

    // Lignes topo : proche de 0 = on est sur un contour
    float s = abs(sin(t - uv.y - uv.x));
    s = max(s, 0.022); // évite division par zéro / surexposition

    // Palette TrimSync — fond très sombre + accent teal
    vec3 dark = vec3(0.024, 0.027, 0.039);
    vec3 teal = vec3(0.23, 0.75, 0.80); // oklch(0.76 0.13 193)

    float intensity = clamp(0.060 / s, 0.0, 0.22);
    vec3 color = dark + teal * intensity;

    // Vignette douce sur les bords
    float cx = vUv.x - 0.50;
    float cy = vUv.y - 0.45;
    float d  = sqrt(cx * cx + cy * cy);
    color *= 0.68 + 0.32 * smoothstep(1.0, 0.35, d * 2.0);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Setup ──────────────────────────────────────────────────

let renderer;

function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (e) {
    console.warn('waves-bg.js: WebGL non disponible', e);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const canvas = renderer.domElement;
  // fixed + inset:0 → s'étend sur toute la surface physique (safe-area incluse)
  canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
  document.body.insertBefore(canvas, document.body.firstChild);

  const scene  = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clock  = new THREE.Clock();

  const uniforms = {
    iTime:       { value: 0 },
    iResolution: { value: new THREE.Vector2() },
  };

  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    uniforms.iResolution.value.set(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize();

  renderer.setAnimationLoop(() => {
    if (!reduced) uniforms.iTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  });

  // API publique pour détruire le renderer si nécessaire
  window._wavesBgDestroy = function () {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    material.dispose();
    renderer.dispose();
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
