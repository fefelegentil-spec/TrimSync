/* ═════════════════════════════════════════════════════════════
   FCUTZ ANIMATED BACKGROUND — WebGL brut (sans three.js)
   Courbes topographiques animées
   Dashboard : palette violet (#A78BFA)
   Booking   : palette or (#DAB149)

   Réécrit sans dépendance : l'ancienne version chargeait three.js
   (656 Ko) pour un simple quad plein écran + shader. Même rendu.
   ═════════════════════════════════════════════════════════════ */

(function () {
  // Détection de la page courante (data-page OU URL)
  const path = window.location.pathname;
  const isBooking = document.body.dataset.page === 'booking'
    || path === '/'
    || path.startsWith('/booking');

  const vertexShader = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  // Fragment shader identique à la version three.js
  const fragmentShader = `
    precision mediump float;
    uniform vec2  iResolution;
    uniform float iTime;
    uniform vec3  uAccent;
    varying vec2  vUv;

    void main() {
      // L'echelle du motif ne suit plus la fenetre. Diviser par le petit cote
      // faisait grandir chaque courbe avec l'ecran : sur un telephone on voyait
      // des lignes topographiques fines, sur un ordinateur la meme image etiree
      // ne montrait plus que deux ou trois taches floues — le fond passait de
      // matiere a salissure. Plafonnee a 520 px, une boucle garde partout la
      // meme taille a l'oeil ; un grand ecran en montre simplement davantage.
      float ech = min(min(iResolution.x, iResolution.y), 520.0);
      vec2 uv = (2.0 * vUv * iResolution - iResolution) / ech;

      float t = iTime * 0.28; // très lent — ambiant

      for (float i = 1.0; i < 8.0; i++) {
        uv.x += 0.55 / i * cos(i * 2.30 * uv.y + t);
        uv.y += 0.55 / i * cos(i * 1.40 * uv.x + t);
      }

      float s = abs(sin(t - uv.y - uv.x));
      s = max(s, 0.022);

      vec3 dark = vec3(0.024, 0.027, 0.039);

      float intensity = clamp(0.060 / s, 0.0, 0.22);
      vec3 color = dark + uAccent * intensity;

      float cx = vUv.x - 0.50;
      float cy = vUv.y - 0.45;
      float d  = sqrt(cx * cx + cy * cy);
      color *= 0.68 + 0.32 * smoothstep(1.0, 0.35, d * 2.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function init() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false })
            || canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
    if (!gl) { console.warn('WebGL non disponible'); return; }

    // width/height:100% sont INDISPENSABLES ici, et inset:0 ne les remplace pas :
    // un <canvas> est un element remplace. Pour un element remplace en position
    // fixed avec width:auto, la specification impose de resoudre la largeur sur
    // la taille INTRINSEQUE (les attributs width/height, 300x150 par defaut) puis
    // d'ignorer `right` — le canvas ne s'etire donc pas, il reste une boite en
    // haut a gauche. Pire, onResize ecrit ensuite les attributs a partir de cette
    // boite : la taille intrinseque change, la boite CSS avec, et le fond anime
    // finissait fige sur ~450x225 px en haut de l'ecran. Tout le reste de la page
    // — le bas, donc la zone de la barre — n'etait plus que l'aplat de html :
    // c'est la « grosse zone grise » du bas, et non un probleme de zone sure.
    // Avec 100%/100% la boite vaut le bloc conteneur initial (le viewport), sans
    // dependre de la taille intrinseque : plus de boucle de retroaction non plus.
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('shader:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }
    const vs = compile(gl.VERTEX_SHADER, vertexShader);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShader);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // Quad plein écran (triangle strip)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'iTime');
    const uRes  = gl.getUniformLocation(prog, 'iResolution');
    const uAcc  = gl.getUniformLocation(prog, 'uAccent');

    // Couleur accent selon la page. Le dashboard laisse l'utilisateur choisir sa
    // teinte (Paramètres) : on expose donc un point d'entrée pour la repeindre
    // sans relancer le contexte WebGL. La couleur choisie est déjà posée sur
    // :root par applyAccent() avant ce script, on la relit de là — comme ça le
    // fond démarre à la bonne teinte au lieu de flasher en violet.
    function accentDepuisCss(){
      const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb');
      const p = v.split(',').map(n => parseFloat(n.trim()));
      return (p.length === 3 && p.every(n => Number.isFinite(n))) ? p.map(n => n / 255) : null;
    }
    const accentDefaut = isBooking ? [0.855, 0.694, 0.286] : [0.655, 0.545, 0.980];
    gl.uniform3fv(uAcc, (!isBooking && accentDepuisCss()) || accentDefaut);
    window._bgSetAccent = function(r, g, b){
      gl.useProgram(prog);
      gl.uniform3fv(uAcc, [r / 255, g / 255, b / 255]);
      // Rendu figé (reduced-motion) : sans redraw, la nouvelle teinte
      // n'apparaîtrait qu'au prochain redimensionnement.
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };

    // DPR plafonné à 1.5 : sur un fond organique flou, indiscernable du 3x,
    // mais ~4× moins de pixels à calculer par frame (batterie mobile).
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function onResize() {
      // Taille reelle du canvas, pas celle de la fenetre : innerHeight
      // exclut la zone sure et l'image serait etiree verticalement.
      const r = canvas.getBoundingClientRect();
      canvas.width  = Math.round((r.width  || window.innerWidth)  * dpr);
      canvas.height = Math.round((r.height || window.innerHeight) * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }
    window.addEventListener('resize', onResize);
    onResize();

    const t0 = performance.now();
    let animId = null;
    function frame() {
      gl.uniform1f(uTime, (performance.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(frame);
    }

    // prefers-reduced-motion : UN rendu figé, pas de boucle (0 % CPU/GPU
    // ensuite — l'ancienne version continuait de rendre la même frame).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gl.uniform1f(uTime, 12.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      frame();
    }

    // Cleanup si destroy() appelé
    window._bgDestroy = function () {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
