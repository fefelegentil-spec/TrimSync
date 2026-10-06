// Scènes 4 à 6 : « Le bot. » sur l'aplat teal, le brancher, le régler.
import { $, $$, borne, mix, av, E, pose, entre, lignes, reveler, dansEcran } from './outils.mjs';

export function scenes2(K) {
  const { C, S, AMB, telephone } = K;
  const SC = {};

  /* ── 4. Le bot : un aplat teal traverse l'écran (le panneau « Le bot » de la landing) ── */
  {
    const B = C.bot, d = S.bot.d, a = $('#aplat');
    SC.bot = {
      avant: 0.6, apres: 0.6,
      sons: [[-0.46, 'aspire', 0.42], [B.bot - 0.06, 'basse', 0.6], [B.repond, 'tic', 0.5], [B.reserve, 'tic', 0.5], [d - 0.5, 'fouet', 0.46]],
      init() {
        a.innerHTML = `<i class="ti ti-message-chatbot schema abs" id="b-fond" style="right:-50px;top:250px"></i>
          <div class="abs" id="b-bloc" style="left:150px;top:214px;width:1560px">
            <div class="sous-aplat" id="b-k" style="font-size:46px;letter-spacing:-.02em">Et pour tes messages Instagram…</div>
            <div style="display:flex;align-items:flex-start;gap:30px;margin-top:8px"><div class="geant" id="b-g">${lignes('Le bot.')}</div><div class="beta" id="b-beta" style="margin-top:104px">bêta</div></div>
            <div class="sous-aplat" id="b-s" style="margin-top:20px">Une IA qui <b id="b-m1">répond<i></i></b> et <b id="b-m2">réserve<i></i></b> à ta place.</div>
          </div>`;
      },
      cacher() { a.style.display = 'none'; },
      rendre(u) {
        a.style.display = 'block';
        // la bande entre par la droite, couvre tout, puis continue sa course et découvre la scène suivante
        const kin = E.va(borne((u + 0.46) / 0.9)), kout = E.va(borne((u - (d - 0.46)) / 0.9));
        const x1 = mix(1920 + 340, -340, kin), x2 = mix(1920 + 700, -340, kout);
        a.style.clipPath = `polygon(${x1.toFixed(1)}px 0,${x2.toFixed(1)}px 0,${(x2 - 320).toFixed(1)}px 1080px,${(x1 - 320).toFixed(1)}px 1080px)`;
        const glisse = 150 * (1 - kin) - 220 * kout;
        $('#b-bloc').style.transform = `translateX(${glisse.toFixed(1)}px)`;
        $('#b-fond').style.transform = `translateX(${(glisse * 1.6).toFixed(1)}px) rotate(-8deg)`;
        entre($('#b-k'), u, B.messages - 0.15, { y: 20 });
        reveler($('#b-g'), u, B.bot - 0.3, { d: 0.7 });
        entre($('#b-beta'), u, B.bot + 0.25, { y: 0, x: -18, s: 0.9 });
        entre($('#b-s'), u, B.ia - 0.15, { y: 26 });
        // « répond », « réserve » : un cache d'encre passe sous le mot quand la voix le dit, le mot vire au teal clair
        for (const [id, q] of [['#b-m1', B.repond], ['#b-m2', B.reserve]]) {
          const k = av(u, q - 0.06, 0.42);
          $(id + ' i').style.transform = `scaleX(${k.toFixed(3)})`;
          $(id).style.color = k > 0.5 ? 'oklch(0.90 0.09 190)' : '';
        }
      },
    };
  }

  /* ── 5. Le brancher : la vraie carte « Bot Instagram » de l'appli, et l'autorisation d'Instagram ── */
  {
    const L = C.lien, d = S.lien.d;
    SC.lien = {
      avant: 1.4,
      sons: [[L.activer, 'clic', 0.5], [L.activer + 0.3, 'pop', 0.32], [L.feuille, 'balaye', 0.38], [L.autoriser, 'clic', 0.5], [L.actif + 0.05, 'reussi', 0.5], [L.officielle - 0.1, 'pop', 0.3], [L.motdepasse - 0.1, 'pop', 0.3],
        [d - 0.03, 'montee', 0.42]],
      titres: () => `<div class="abs" style="left:150px;top:218px;width:880px">
          <div class="kicker" id="l-k"><b>03</b>Le bot · le brancher</div>
          <div class="titre" id="l-t" style="margin-top:26px">${lignes('Tu connectes|ton <em>Instagram.</em>')}</div>
          <div style="margin-top:66px;display:flex;flex-direction:column;gap:26px">
            <div class="coche" id="l-c1"><i class="ti ti-phone-call"></i>Activé avec toi, lors d’un appel</div>
            <div class="coche" id="l-c2"><i class="ti ti-shield-check"></i>Connexion officielle de Meta</div>
            <div class="coche" id="l-c3"><i class="ti ti-lock"></i>Aucun mot de passe à donner</div></div></div>`,
      init(pl) {
        this.tel = telephone(pl, { mode: 'appli', heure: '18:20', clip: 'bot-carte', sur: `<div class="abs" id="l-voile" style="inset:0;background:#000;opacity:0;z-index:8"></div>
          <div class="feuille" id="l-feuille"><div class="poignee"></div>
            <div class="ig" style="background:linear-gradient(45deg,#f9a03f 5%,#e1306c 50%,#7b3fe4 95%)"><i class="ti ti-brand-instagram"></i></div>
            <h4>Autoriser TrimSync à gérer<br>tes messages ?</h4>
            <div class="cpt"><div class="dm-av" style="background:linear-gradient(140deg,#60c4c8,#2f7f88);color:#05242b">SN</div><div><b>studio.nova</b><small>Compte professionnel</small></div><i class="ti ti-circle-check" style="margin-left:auto;font-size:23px;color:#0095f6"></i></div>
            <div class="perm"><i class="ti ti-message-circle"></i>Lire tes messages</div>
            <div class="perm"><i class="ti ti-send"></i>Y répondre de ta part</div>
            <div class="oui" id="l-oui">Autoriser</div><div class="non">Annuler</div>
            <div class="meta"><i class="ti ti-shield-lock"></i>Connexion sécurisée par Meta</div></div>` });
        const b = dansEcran($('#l-oui'), this.tel.ecran);
        this.doigt = [{ t: L.autoriser - L.clip, x: b.x, y: b.y, d: 0.1 }];
      },
      rendre(u) {
        const sort = av(u, d - 0.42, 0.45, E.part);
        this.tel.pose({ x: 1380, y: 548 + Math.sin(u * 0.8) * 5, s: 1.13, rx: 4, ry: -14 + Math.sin(u * 0.5) * 1.2 });
        this.tel.temps(u - L.clip, this.doigt);
        // la feuille d'Instagram monte par-dessus l'appli, puis redescend une fois l'accord donné
        const monte = av(u, L.feuille, 0.55, E.tiroir), descend = av(u, L.autoriser + 0.32, 0.36, E.part);
        $('#l-feuille').style.transform = `translateY(${((1 - monte + descend) * 590).toFixed(1)}px)`;
        $('#l-voile').style.opacity = (0.6 * monte * (1 - descend)).toFixed(3);
        const oui = $('#l-oui'), fait = u > L.autoriser + 0.08;
        oui.textContent = fait ? 'Autorisé ✓' : 'Autoriser'; oui.style.background = fait ? '#1faa59' : '';
        // les titres
        entre($('#l-k'), u, 0.2, { y: 14 });
        reveler($('#l-t'), u, 0.2);
        [['#l-c1', L.activer + 0.45], ['#l-c2', L.officielle - 0.15], ['#l-c3', L.motdepasse - 0.15]].forEach(([s, q]) => entre($(s), u, q, { x: -26, y: 0 }));
        AMB.gain = 0.9;
      },
    };
  }

  /* ── 6. Le régler : le vrai formulaire du bot, et ce que ça change dans sa façon de répondre ── */
  {
    const O = C.perso, d = S.perso.d;
    const TONS = [['Détendu', 'Hello ! Samedi 16h c’est libre, je te le bloque ?'], ['Sérieux', 'Bonjour, samedi à 16 h est disponible. Je vous le réserve ?'], ['Girly', 'Coucou ma belle ✨ samedi 16h c’est dispo, je te le garde ?']];
    // l'ordre des touchers du clip : Détendu au départ, puis Sérieux, Girly, Détendu ; enfin, le style appris
    const ETAPES = [[-9, 0], [O.ton + 0.05, 1], [O.ton2, 2], [O.ton3, 0], [O.apprend + 0.35, 3]];
    const APPRIS = 'Coucouu ✨ samedi 16h c’est libre, je te le note ?';
    const EXEMPLES = ['Coucouu ✨', 'Top, c’est noté !', 'À samedi 🤍'];
    const RANGS = [['Tes prestations', ['Pose gel', 'Semi-permanent', 'Nail art'], O.prestations], ['Tes prix', ['45 €'], O.prix], ['Tes horaires', ['Mardi → samedi'], O.horaires]];
    SC.perso = {
      sons: [[-0.02, 'basse', 0.6], [O.salon, 'clic', 0.4], ...RANGS.map(r => [r[2], 'pop', 0.32]), [O.prestations + 0.1, 'clic', 0.45], [O.prix - 0.05, 'clic', 0.4], [O.horaires + 0.1, 'clic', 0.45],
        [O.ton + 0.05, 'clic', 0.5], [O.ton2, 'clic', 0.5], [O.ton3, 'clic', 0.5], [O.max, 'souffle', 0.24], ...EXEMPLES.map((_, i) => [O.max + 0.35 + i * 0.16, 'bulle', 0.26]), [O.apprend + 0.35, 'reussi', 0.45]],
      titres: () => `<div class="abs" style="left:930px;top:132px;width:900px">
          <div class="kicker" id="o-k"><b>03</b>Le bot · le régler</div>
          <div class="titre" id="o-t" style="margin-top:26px">${lignes('Tu le règles|<em>à ta façon.</em>')}</div>
          <div class="abs" id="o-a" style="left:0;top:330px;width:900px">${RANGS.map(([nom, puces], i) => `<div id="o-r${i}" style="margin-bottom:30px"><div class="ligne2" style="font-size:44px"><b>${nom}</b></div>
            <div style="display:flex;gap:12px;margin-top:14px">${puces.map(p => `<span class="pastille">${p}</span>`).join('')}</div></div>`).join('')}</div>
          <div class="abs" id="o-b" style="left:0;top:330px;width:900px">
            <div class="ligne2" id="o-son" style="font-size:44px"><b>Son ton</b></div>
            <div class="tons" id="o-tons" style="margin-top:18px">${TONS.map(([n]) => `<span class="ton">${n}</span>`).join('')}</div>
            <div class="ligne2 abs" id="o-max" style="left:0;top:0;font-size:44px;white-space:nowrap"><span class="pastille" style="vertical-align:.12em;margin-right:16px">Offre Max</span><b>Il apprend à écrire comme toi.</b></div>
            <div class="apercu" id="o-ap" style="left:0;top:162px"><span id="o-txt"></span></div>
            <div class="note abs" id="o-note" style="left:4px;top:404px;font-size:24px">Tes vrais messages :</div>
            ${EXEMPLES.map((x, i) => `<div class="exemple" id="o-e${i}" style="left:${[0, 228, 520][i]}px;top:448px">${x}</div>`).join('')}
          </div></div>`,
      init(pl) { this.tel = telephone(pl, { mode: 'safari', url: 'trimsync.tech', heure: '18:31', clip: 'reglage' }); },
      rendre(u) {
        this.tel.pose({ x: 520, y: 548 + Math.sin(u * 0.8) * 5, s: 1.13, rx: 4, ry: 14 + Math.sin(u * 0.5) * 1.2 });
        this.tel.temps(u - O.clip);
        entre($('#o-k'), u, 0.25, { y: 14 });
        reveler($('#o-t'), u, 0.25);
        // ce que tu lui donnes : chaque ligne arrive quand la voix la dit, avec ce qui vient d'être saisi
        const bascule = O.ton - 0.5;
        RANGS.forEach(([, , q], i) => entre($('#o-r' + i), u, q - 0.2, { x: 30, y: 0, sortie: bascule + i * 0.04 }));
        const troisieme = $$('#o-r0 .pastille')[2]; entre(troisieme, u, O.prestations + 0.2, { y: 0, x: -14, s: 0.9 });
        // son ton : la même réponse, récrite à chaque choix
        entre($('#o-son'), u, bascule + 0.3, { x: 30, y: 0, sortie: O.max - 0.3 });
        entre($('#o-tons'), u, bascule + 0.38, { x: 30, y: 0, sortie: O.max - 0.26 });
        let etape = 0; ETAPES.forEach(([q], i) => { if (u >= q) etape = i; });
        const [depuis, lequel] = ETAPES[etape], suivant = ETAPES[etape + 1] ? ETAPES[etape + 1][0] : Infinity;
        $$('#o-tons .ton').forEach((el, i) => el.classList.toggle('on', lequel === i));
        const venu = borne((u - depuis) / 0.2), parti = borne((suivant - u) / 0.09);
        const txt = $('#o-txt'); txt.textContent = lequel === 3 ? APPRIS : TONS[lequel][1];
        txt.style.opacity = Math.min(venu, parti).toFixed(3); txt.style.filter = venu < 0.98 ? `blur(${((1 - venu) * 9).toFixed(1)}px)` : '';
        txt.style.display = 'inline-block'; txt.style.transform = `translateY(${((1 - venu) * 8).toFixed(1)}px)`;
        entre($('#o-ap'), u, bascule + 0.5, { y: 30, s: 0.94 });
        // l'offre Max : il lit tes vrais messages, et sa réponse prend ta voix
        entre($('#o-max'), u, O.max - 0.05, { x: 30, y: 0 });
        entre($('#o-note'), u, O.max + 0.25, { y: 12, sortie: O.apprend + 0.3 });
        EXEMPLES.forEach((_, i) => {
          const el = $('#o-e' + i), k = av(u, O.max + 0.35 + i * 0.16, 0.5), bu = av(u, O.apprend + 0.05 + i * 0.07, 0.42, E.part);
          pose(el, { y: 22 * (1 - k) - 190 * bu, x: ([170, 30, -180][i]) * bu, s: mix(0.9, 1, k) * (1 - 0.35 * bu), o: borne(k * 2) * (1 - bu), flou: 8 * bu });
        });
        const choc = Math.sin(Math.PI * borne((u - O.apprend - 0.3) / 0.5));
        $('#o-ap').style.boxShadow = `0 30px 70px rgba(0,0,0,.4),0 0 ${(70 * choc).toFixed(0)}px oklch(0.76 0.13 193/${(0.55 * choc).toFixed(3)})`;
        const coupDeBeat = u < 0 ? 0 : Math.exp(-u * 3);
        AMB.gain = 0.92 + 0.9 * coupDeBeat; AMB.zoom = 1 + 0.2 * coupDeBeat;
      },
    };
  }

  return SC;
}
