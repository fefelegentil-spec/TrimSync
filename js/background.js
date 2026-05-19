/* ═════════════════════════════════════════════════════════════
   FCUTZ ANIMATED BACKGROUND — WebGL Shader (Three.js)
   Courbes topographiques animées
   Dashboard : palette violet (#A78BFA)
   Booking   : palette or (#C8A85A)
   ═════════════════════════════════════════════════════════════ */

(function () {
  if (typeof THREE === 'undefined') {
    console.warn('background.js: Three.js non chargé');
    return;
  }

  // Détection de la page courante (data-page OU URL)
  const path = window.location.pathname;
  const isBooking = document.body.dataset.page === 'booking'
    || path === '/'
    || path.startsWith('/booking');

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
    uniform vec3  uAccent;
    varying vec2  vUv;

    void main() {
      // UV normalisés centrés
      vec2 uv = (2.0 * vUv * iResolution - iResolution) / min(iResolution.x, iResolution.y);

      float t = iTime * 0.28; // très lent — ambiant

      // Distorsion itérative → courbes topo organiques animées
      for (float i = 1.0; i < 8.0; i++) {
        uv.x += 0.55 / i * cos(i * 2.30 * uv.y + t);
        uv.y += 0.55 / i * cos(i * 1.40 * uv.x + t);
      }

      // "Lignes" : proche de 0 = on est sur un contour
      float s = abs(sin(t - uv.y - uv.x));
      s = max(s, 0.022); // évite la division par zéro / surexposition

      vec3 dark = vec3(0.024, 0.027, 0.039);

      float intensity = clamp(0.060 / s, 0.0, 0.22);
      vec3 color = dark + uAccent * intensity;

      // Vignette bords
      float cx = vUv.x - 0.50;
      float cy = vUv.y - 0.45;
      float d  = sqrt(cx * cx + cy * cy);
      color *= 0.68 + 0.32 * smoothstep(1.0, 0.35, d * 2.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  // ── Setup ──────────────────────────────────────────────────

  let renderer, animId;

  function init() {
    // Renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (e) {
      console.warn('WebGL non disponible', e);
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio);

    const canvas = renderer.domElement;
    // inset:0 + position:fixed = le navigateur étire le canvas sur toute la surface physique
    // (safe-area incluse) sans dépendre de window.innerHeight ni de env()
    canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);

    // Scene + Camera
    const scene  = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock  = new THREE.Clock();

    // Couleur accent selon la page
    // Dashboard → violet #A78BFA = (0.655, 0.545, 0.980)
    // Booking   → or    #C8A85A = (0.784, 0.659, 0.353)
    const accent = isBooking
      ? new THREE.Vector3(0.784, 0.659, 0.353)
      : new THREE.Vector3(0.655, 0.545, 0.980);

    // Uniforms
    const uniforms = {
      iTime:       { value: 0 },
      iResolution: { value: new THREE.Vector2() },
      uAccent:     { value: accent },
    };

    // Mesh
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    // setSize(w, h, false) : fixe la résolution de rendu sans écraser le style CSS.
    // Le CSS inset:0 laisse le navigateur étirer le canvas sur toute la surface (safe-area incluse).
    // Légère distorsion CSS imperceptible sur un shader de fond organique.
    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.iResolution.value.set(w, h);
    }
    window.addEventListener('resize', onResize);
    onResize();

    // prefers-reduced-motion : animation figée
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Loop
    renderer.setAnimationLoop(() => {
      if (!reduced) uniforms.iTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    });

    // Cleanup si destroy() appelé
    window._bgDestroy = function () {
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
})();
