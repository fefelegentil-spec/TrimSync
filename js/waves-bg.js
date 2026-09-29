/* ═════════════════════════════════════════════════════════════
   TRIMSYNC — FOND ANIMÉ « WAVY » (WebGL2, sans dépendance)
   Portage vanilla du composant React components/ui/wavy.tsx :
   bruit fractal (fbm) déformé par des ondes et un tourbillon,
   palette de 20 teintes teal → cyan → vert d'eau, la plus sombre transparente.

   Avant : shader d'ondes via Three.js (~600 Ko chargés depuis un CDN).
   Maintenant : WebGL2 natif, rien à télécharger.
   ═════════════════════════════════════════════════════════════ */

// ── Réglages (mêmes valeurs que wavy.tsx) ─────────────────────
const ZOOM_FACTOR = 0.3;
const BASE_WAVE_AMPLITUDE = 0.2;
const RANDOM_WAVE_FACTOR = 0.15;
const WAVE_FREQUENCY = 4.0;
const TIME_FACTOR = 0.25;
const BASE_SWIRL_STRENGTH = 1.2;
const SWIRL_TIME_MULT = 5.0;
const NOISE_SWIRL_FACTOR = 0.2;
const FBM_OCTAVES = 10;
// Palette aux couleurs du site (cyan de la marque #3bbfcc, teal, vert d'eau)
// au lieu des bleus d'origine du composant ; le plus sombre reste transparent.
const SEA_COLORS = [
  [0.00, 0.02, 0.03], [0.00, 0.04, 0.06], [0.01, 0.06, 0.09], [0.01, 0.09, 0.12],
  [0.02, 0.12, 0.16], [0.03, 0.16, 0.21], [0.04, 0.21, 0.26], [0.05, 0.26, 0.31],
  [0.07, 0.32, 0.37], [0.09, 0.38, 0.43], [0.11, 0.45, 0.49], [0.14, 0.52, 0.55],
  [0.17, 0.59, 0.61], [0.20, 0.66, 0.67], [0.23, 0.72, 0.72], [0.28, 0.77, 0.74],
  [0.36, 0.82, 0.76], [0.46, 0.87, 0.80], [0.60, 0.91, 0.86], [0.76, 0.95, 0.92],
];

// Propre à la landing :
// - rendu à mi-résolution puis étiré par le CSS : le motif est un bruit doux,
//   la différence ne se voit pas, et 10 octaves de fbm plein écran en Retina
//   feraient chauffer un téléphone ;
// - opacité réduite pour que les textes posés dessus restent lisibles.
const ECHELLE_RENDU = 0.5;
const OPACITE = 0.35;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const f = n => Number(n).toFixed(4); // littéraux GLSL toujours flottants

function fragmentShader() {
  const couleurs = SEA_COLORS.map(c => `vec3(${c.map(f).join(', ')})`).join(',\n  ');
  return `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
#define NUM_COLORS ${SEA_COLORS.length}
vec3 seaColors[NUM_COLORS] = vec3[](
  ${couleurs}
);

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float noise2D(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.792843 - 0.853734 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 st) {
  float value = 0.0, amplitude = 0.5, freq = 1.0;
  for (int i = 0; i < ${Math.floor(FBM_OCTAVES)}; i++) {
    value += amplitude * noise2D(st * freq);
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  uv *= ${f(ZOOM_FACTOR)};
  float t = uTime * ${f(TIME_FACTOR)};
  float waveAmp = ${f(BASE_WAVE_AMPLITUDE)} + ${f(RANDOM_WAVE_FACTOR)} * noise2D(vec2(t, 27.7));
  uv.x += waveAmp * sin(uv.y * ${f(WAVE_FREQUENCY)} + t);
  uv.y += waveAmp * sin(uv.x * ${f(WAVE_FREQUENCY)} - t);
  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float swirlStrength = ${f(BASE_SWIRL_STRENGTH)} * (1.0 - smoothstep(0.0, 1.0, r));
  angle += swirlStrength * sin(uTime + r * ${f(SWIRL_TIME_MULT)});
  uv = vec2(cos(angle), sin(angle)) * r;
  float n = fbm(uv);
  n += ${f(NOISE_SWIRL_FACTOR)} * sin(t + n * 3.0);
  float noiseVal = 0.5 * (n + 1.0);
  float idx = clamp(noiseVal, 0.0, 1.0) * float(NUM_COLORS - 1);
  int iLow = int(floor(idx));
  int iHigh = int(min(float(iLow + 1), float(NUM_COLORS - 1)));
  vec3 color = mix(seaColors[iLow], seaColors[iHigh], fract(idx));
  outColor = (iLow == 0 && iHigh == 0) ? vec4(color, 0.0) : vec4(color, 1.0);
}`;
}

const VERTEX = `#version 300 es
precision mediump float;
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

function compiler(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('waves-bg.js: shader', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function init() {
  const canvas = document.createElement('canvas');
  // Fixe, SOUS le bandeau (--nav-h) : Safari 26 teinte la zone de l'encoche /
  // barre d'état d'après les éléments fixes qui touchent le haut de l'écran ;
  // un canvas transparent collé en haut y laissait voir la page.
  canvas.style.cssText = `position:fixed;left:0;right:0;bottom:0;top:var(--nav-h,68px);width:100%;height:calc(100% - var(--nav-h,68px));z-index:-1;pointer-events:none;opacity:${OPACITE};`;
  canvas.setAttribute('aria-hidden', 'true');

  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return; // pas de WebGL2 : le fond uni de la page suffit
  document.body.insertBefore(canvas, document.body.firstChild);

  const vs = compiler(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compiler(gl, gl.FRAGMENT_SHADER, fragmentShader());
  if (!vs || !fs) { canvas.remove(); return; }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('waves-bg.js: programme', gl.getProgramInfoLog(program));
    canvas.remove();
    return;
  }
  gl.useProgram(program);
  gl.clearColor(0, 0, 0, 0);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const aPosition = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
  const uResolution = gl.getUniformLocation(program, 'uResolution');
  const uTime = gl.getUniformLocation(program, 'uTime');

  function dimensionner() {
    const w = Math.max(1, Math.round(canvas.clientWidth * ECHELLE_RENDU));
    const h = Math.max(1, Math.round(canvas.clientHeight * ECHELLE_RENDU));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const depart = performance.now();
  let raf = 0;
  function dessiner() {
    dimensionner();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    // Mouvement réduit demandé : une image fixe, pas d'animation.
    gl.uniform1f(uTime, reduced ? 4 : (performance.now() - depart) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!reduced) raf = requestAnimationFrame(dessiner);
  }
  const auRedimensionnement = () => { if (reduced) dessiner(); };
  window.addEventListener('resize', auRedimensionnement);
  dessiner();

  window._wavesBgDestroy = function () {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', auRedimensionnement);
    gl.deleteProgram(program);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    canvas.remove();
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
