// Le décor du film : le fond (la fumée du site), les téléphones, la fenêtre du dashboard,
// et les deux écrans dessinés ici faute d'exister dans TrimSync : l'écran verrouillé
// (repris du téléphone de la landing) et la messagerie d'Instagram.
import { $, $$, borne, mix, pad5, av, E, pose } from './outils.mjs';

export function decor({ CLIPS, attentes, AMB }) {
  /* ── le fond : le shader de js/reservation/background.js, piloté par t ── */
  const gl = $('#fond').getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}'));
  // Mêmes volutes que le site ; s'y ajoutent une caméra (uCam, uZoom) et une lumière (uGain, uSombre).
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `
    precision highp float;
    uniform vec2 uRes; uniform float uT; uniform vec3 uAccent; uniform float uGain; uniform vec2 uCam; uniform float uZoom; uniform float uSombre;
    varying vec2 vUv;
    void main(){
      float ech = 760.0 * uZoom;
      vec2 uv = (2.0 * vUv * uRes - uRes) / ech + uCam;
      float t = uT * 0.28;
      for (float i = 1.0; i < 8.0; i++) {
        uv.x += 0.55 / i * cos(i * 2.30 * uv.y + t);
        uv.y += 0.55 / i * cos(i * 1.40 * uv.x + t);
      }
      float s = max(abs(sin(t - uv.y - uv.x)), 0.022);
      vec3 sombre = vec3(0.016, 0.022, 0.030);
      vec3 c = sombre + uAccent * clamp(0.060 / s, 0.0, 0.22) * uGain;
      float d = length(vec2(vUv.x - 0.5, vUv.y - 0.46));
      c *= 0.58 + 0.42 * smoothstep(1.0, 0.30, d * 2.0);
      // tramage : un grain fixe d'un niveau et demi, pour que les dégradés sombres ne fassent pas de bandes une fois encodés
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      gl_FragColor = vec4(c * (1.0 - uSombre) + grain * (3.0 / 255.0), 1.0);
    }`));
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(['uRes', 'uT', 'uAccent', 'uGain', 'uCam', 'uZoom', 'uSombre'].map(n => [n, gl.getUniformLocation(prog, n)]));
  const LF = $('#fond').width, HF = $('#fond').height;   // 1920 × 1080 pour le film, 1080 × 1920 pour le court
  gl.viewport(0, 0, LF, HF); gl.uniform2f(U.uRes, LF, HF);
  function fond(t, cam) {
    gl.uniform1f(U.uT, 11 + t * 0.85);
    gl.uniform3fv(U.uAccent, AMB.teinte);
    gl.uniform1f(U.uGain, AMB.gain); gl.uniform1f(U.uSombre, AMB.sombre); gl.uniform1f(U.uZoom, AMB.zoom);
    gl.uniform2f(U.uCam, cam.x * 0.0011, -cam.y * 0.0011);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  { // le grain : tiré une fois, toujours le même
    const c = $('#grain').getContext('2d'), d = c.createImageData($('#grain').width, $('#grain').height); let g = 7;
    for (let i = 0; i < d.data.length; i += 4) { g = (g * 1103515245 + 12345) % 2147483648; const v = g / 2147483648 * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    c.putImageData(d, 0, 0);
  }

  /* ── le téléphone ── */
  const ETAT = `<span><i class="ti ti-antenna-bars-5"></i><i class="ti ti-wifi"></i><i class="ti ti-battery-3"></i></span>`;
  /** mode : 'safari' (une page du site dans le navigateur), 'appli' (l'appli installée), 'libre' (écran dessiné ici).
      `sur` : ce qui vient par-dessus l'écran filmé (une feuille, une bannière). */
  function telephone(parent, { mode = 'libre', url = '', heure = '9:41', clip = null, html = '', sur = '' }) {
    const el = document.createElement('div'); el.className = 'tel';
    let tranches = ''; for (let k = 1; k <= 8; k++) tranches += `<div class="tel-tr" style="transform:translateZ(${-2 * k}px)"></div>`;
    const bas = mode === 'safari' ? `<div class="tel-bas tel-safari"><div class="rond"><i class="ti ti-chevron-left"></i></div><div class="url"><i class="ti ti-lock"></i>${url}</div><div class="rond"><i class="ti ti-dots"></i></div></div>`
      : mode === 'appli' ? `<div class="tel-bas tel-appli"></div>` : '';
    el.innerHTML = `<div class="tel-lueur"></div><div class="tel-ombre"></div>${tranches}<div class="tel-face"><div class="tel-ecran">
        ${mode === 'libre' ? html : `<img class="tel-vue" alt="">`}${sur}
        <div class="tel-etat"><b>${heure}</b>${ETAT}</div><div class="tel-ile"></div>${bas}<div class="tel-trait"></div>
        <div class="tel-couvre"></div><div class="tel-onde"></div><div class="tel-doigt"></div><div class="tel-reflet"></div></div></div>`;
    parent.appendChild(el);
    const img = $('.tel-vue', el), doigt = $('.tel-doigt', el), onde = $('.tel-onde', el), reflet = $('.tel-reflet', el), couvre = $('.tel-couvre', el);
    const couches = $$('.tel-lueur,.tel-ombre,.tel-tr,.tel-face', el);
    const T = { el, ecran: $('.tel-ecran', el), img, meta: null, nom: null, idx: -1, heureEl: $('.tel-etat b', el) };
    T.clip = nom => { if (T.nom === nom) return; T.nom = nom; T.meta = CLIPS[nom]; T.idx = -1; img.style.height = T.meta.hauteur + 'px'; };
    if (clip) T.clip(clip);
    /** Place le téléphone. `o` s'applique couche par couche : une opacité de groupe aplatirait la 3D. */
    T.pose = ({ x = 0, y = 0, z = 0, s = 1, rx = 0, ry = 0, rz = 0, o = 1, nuit = 0 }) => {
      el.style.display = o <= 0.002 ? 'none' : '';
      if (o <= 0.002) return;
      el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${s.toFixed(4)})`;
      const op = o >= 0.998 ? '' : o.toFixed(3);
      for (const c of couches) c.style.opacity = op;
      reflet.style.transform = `translateX(${(-ry * 5).toFixed(1)}px)`;
      couvre.style.opacity = nuit > 0.002 ? nuit.toFixed(3) : '0';
    };
    /** Montre l'image du clip à l'instant tc (secondes depuis le début du clip), et le doigt s'il touche. */
    T.temps = (tc, plus = []) => {
      const m = T.meta, i = borne(Math.round(tc * m.fps), 0, m.images - 1);
      if (i !== T.idx) { T.idx = i; img.src = `clips/${T.nom}/${pad5(i)}.jpg`; attentes.push(img.decode().catch(() => {})); }
      // les touchers du clip sont comptés dans la page (sous la barre d'état) ; `plus` : ceux d'un élément dessiné par-dessus
      T.toucher(tc, [...m.touchers.map(k => ({ ...k, y: k.y + 47 })), ...plus]);
    };
    /** Le doigt : il arrive, appuie (le site réagit de lui-même), repart ; une onde le suit. */
    T.toucher = (tc, touchers) => {
      let vu = false;
      for (const k of touchers) {
        const u = tc - k.t;
        if (u < -0.24 || u > k.d + 0.5) continue;
        vu = true;
        const arrive = av(u, -0.24, 0.22, E.doux), appui = u >= 0 && u < k.d ? 1 : 0, part = u >= k.d ? borne((u - k.d) / 0.22) : 0;
        doigt.style.transform = `translate(${k.x.toFixed(1)}px,${k.y.toFixed(1)}px) scale(${(mix(1.5, 1, arrive) * (appui ? 0.84 : 1) * (1 + 0.12 * part)).toFixed(3)})`;
        doigt.style.opacity = (0.9 * arrive * (1 - part)).toFixed(3);
        const w = borne(u / 0.5);
        onde.style.transform = `translate(${k.x.toFixed(1)}px,${k.y.toFixed(1)}px) scale(${(0.8 + 1.7 * E.sort(w)).toFixed(3)})`;
        onde.style.opacity = u >= 0 ? (0.7 * (1 - w)).toFixed(3) : '0';
      }
      if (!vu) { doigt.style.opacity = '0'; onde.style.opacity = '0'; }
    };
    return T;
  }

  /* ── la fenêtre du dashboard (ordinateur) ── */
  function dalle(parent, clip, sur = '') {
    const m = CLIPS[clip], el = document.createElement('div'); el.className = 'dalle';
    el.style.cssText = `width:${m.largeur}px;height:${m.hauteur}px;margin:${-m.hauteur / 2}px 0 0 ${-m.largeur / 2}px`;
    el.innerHTML = `<div class="dalle-ombre"></div><div class="dalle-face"><img alt="">${sur}</div>`;
    parent.appendChild(el);
    const img = $('img', el), couches = $$('.dalle-ombre,.dalle-face', el);
    const D = { el, meta: m, idx: -1, face: $('.dalle-face', el) };
    D.pose = ({ x = 0, y = 0, z = 0, s = 1, rx = 0, ry = 0, rz = 0, o = 1 }) => {
      el.style.display = o <= 0.002 ? 'none' : '';
      if (o <= 0.002) return;
      el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${s.toFixed(4)})`;
      for (const c of couches) c.style.opacity = o >= 0.998 ? '' : o.toFixed(3);
    };
    D.temps = tc => { const i = borne(Math.round(tc * m.fps), 0, m.images - 1); if (i !== D.idx) { D.idx = i; img.src = `clips/${clip}/${pad5(i)}.jpg`; attentes.push(img.decode().catch(() => {})); } };
    return D;
  }

  /* ── l'écran verrouillé ── */
  const notif = (classe, { ic = 'ig', app = 'Instagram', heure = '', titre, texte, perdu = false }) => {
    const icone = ic === 'ig' ? '<div class="ic ig"><i class="ti ti-brand-instagram"></i></div>' : ic === 'ok' ? '<div class="ic ok"><i class="ti ti-check"></i></div>' : '<div class="ic ts">TS</div>';
    return `<div class="${classe}${perdu ? ' perdu' : ''}">${icone}<div class="tx"><small><span>${app}</span><span>${heure}</span></small><b>${titre}</b><p>${texte}</p></div></div>`;
  };
  const verrou = (id, date, heure, notifs) => `<div class="verrou"><div class="verrou-date">${date}</div><div class="verrou-heure" id="${id}-heure">${heure}</div>
      <div class="verrou-pile" id="${id}-pile">${notifs.map(n => notif('notif', n)).join('')}</div>
      <div class="verrou-btn" style="left:38px"><i class="ti ti-bolt"></i></div><div class="verrou-btn" style="right:38px"><i class="ti ti-camera"></i></div>
      <div class="abs" id="${id}-soir" style="inset:0;background:#000;opacity:0"></div></div>`;
  /** Empile les notifications de l'écran verrouillé : chacune pousse les précédentes vers le haut. */
  function empiler(cartes, u, arrivees, { retire = Infinity } = {}) {
    cartes.forEach((n, i) => {
      const k = av(u, arrivees[i], 0.5), rang = arrivees.reduce((s, tm, j) => s + (j > i ? av(u, tm, 0.45) : 0), 0), q = u >= retire ? E.part(borne((u - retire - i * 0.05) / 0.35)) : 0;
      pose(n, { x: 430 * q, y: -rang * 86 + 40 * (1 - k), s: 1 - 0.03 * Math.min(rang, 3), o: borne(k * 2) * (rang > 2.5 ? borne(3.5 - rang) : 1) * (1 - q) });
    });
  }

  /* ── la messagerie Instagram ── */
  // messages : [{ qui: 'elle' | 'bot', texte, t (apparition), ecrit (début des points, pour le bot) }]
  const dm = (id, { nom, initiale, couleur, jour }, messages) => `<div class="dm" id="${id}">
      <div class="dm-tete"><i class="ti ti-chevron-left"></i><div class="dm-av" style="background:${couleur}">${initiale}</div><div><b>${nom}</b><small>En ligne</small></div><div class="dr"><i class="ti ti-phone"></i><i class="ti ti-video"></i></div></div>
      <div class="dm-fil"><div class="dm-jour" style="top:12px">${jour}</div>${messages.map((m, i) => m.qui === 'bot'
        ? `<div class="saisie envoi" data-i="${i}"><i></i><i></i><i></i></div><div class="bulle envoi" data-i="${i}">${m.texte}</div><div class="auto" data-i="${i}"><i class="ti ti-bolt"></i>le bot · ${m.delai || '4 s'}</div>`
        : `<div class="bulle recu" data-i="${i}">${m.texte}</div>`).join('')}</div>
      <div class="dm-pied"><div class="cam"><i class="ti ti-camera"></i></div>Votre message…<div class="dr"><i class="ti ti-microphone"></i><i class="ti ti-photo"></i></div></div></div>`;
  /** Calcule où tombe chaque bulle (à faire une fois, polices chargées). */
  function poserFil(racine, messages) {
    let y = 44;
    messages.forEach((m, i) => {
      const b = $(`.bulle[data-i="${i}"]`, racine);
      b.style.top = y + 'px';
      const s = $(`.saisie[data-i="${i}"]`, racine), a = $(`.auto[data-i="${i}"]`, racine);
      if (s) s.style.top = y + 'px';
      y += b.offsetHeight;
      if (a) { a.style.top = (y + 5) + 'px'; y += 22; }
      y += messages[i + 1] && messages[i + 1].qui !== m.qui ? 16 : 6;
    });
  }
  function jouerFil(racine, messages, u) {
    messages.forEach((m, i) => {
      const b = $(`.bulle[data-i="${i}"]`, racine), k = av(u, m.t, 0.42);
      pose(b, { y: 12 * (1 - k), s: mix(0.86, 1, k), o: borne(k * 2) });
      const s = $(`.saisie[data-i="${i}"]`, racine), a = $(`.auto[data-i="${i}"]`, racine);
      if (s) {
        const vu = m.ecrit !== undefined && u >= m.ecrit && u < m.t + 0.06;
        s.style.opacity = vu ? (av(u, m.ecrit, 0.2) * (1 - av(u, m.t - 0.08, 0.14, E.lin))).toFixed(3) : '0';
        $$('i', s).forEach((p, j) => { p.style.transform = `translateY(${(-Math.max(0, Math.sin((u - m.ecrit) * 9.5 - j * 0.9)) * 5).toFixed(1)}px)`; });
      }
      if (a) a.style.opacity = av(u, m.t + 0.25, 0.4).toFixed(3);
    });
  }

  return { fond, telephone, dalle, notif, verrou, empiler, dm, poserFil, jouerFil };
}
