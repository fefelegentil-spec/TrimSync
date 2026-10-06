// Scènes 0 à 3 : l'accroche, le nom, la réservation, le dashboard.
import { $, $$, borne, mix, av, E, pose, entre, lignes, reveler, mots, dire } from './outils.mjs';

export function scenes1(K) {
  const { C, S, CLIPS, AMB, POS, telephone, dalle, notif, verrou, empiler } = K;
  const SC = {};

  /* ── 0. L'accroche : pendant que tu travailles, ton téléphone n'arrête pas ── */
  {
    const A = C.accroche;
    const MSG = [
      { titre: 'ines.mrt', texte: 'Coucou ! Tu aurais une place samedi ?', heure: '14:07', t: 0.5 },
      { titre: 'lea.nails', texte: 'C’est combien la pose gel ?', heure: '14:52', t: A.travailles + 0.1 },
      { titre: 'cam.rl', texte: 'Dispo demain matin ?', heure: '15:36', t: A.telephone + 0.05 },
      { titre: 'sarah.bnl', texte: 'Tu fais aussi le nail art ?', heure: '16:20', t: A.telephone + 0.85 },
    ];
    const PERDU = { titre: 'ines.mrt', texte: 'Laisse, j’ai trouvé ailleurs 🙃', heure: '21:48', t: A.trop, perdu: true };
    SC.accroche = {
      sons: [...MSG.map(m => [m.t, 'vibre', 0.5]), ...MSG.map(m => [m.t + 0.03, 'bulle', 0.34]), [A.trop, 'vibre', 0.6], [A.trop + 0.04, 'basse', 0.42], [A.parti, 'souffle', 0.3], [A.phrase - 0.5, 'balaye', 0.34],
        [S.accroche.d - 0.03, 'montee', 0.5]],
      plateau: () => `<div id="a-cartes">${[...MSG, PERDU].map(m => notif('gnotif', m)).join('')}</div>
        <div class="perte" id="a-perte"><s>Samedi 14:30 · Pose gel</s><b>− 45 €</b></div>`,
      titres: () => `<div class="phrase abs" id="a-phrase" style="left:150px;top:330px;width:1640px"><div>${mots('Ton téléphone ne devrait pas')}</div><div>${mots('être un')}<em>${mots('deuxième job.')}</em></div></div>`,
      init(pl) {
        this.tel = telephone(pl, { heure: '14:07', html: verrou('a', 'Jeudi 8 octobre', '14:07', [...MSG, PERDU]) });
        this.cartes = $$('#a-cartes .gnotif'); this.petites = $$('#a-pile .notif');
      },
      rendre(u) {
        const sortie = A.phrase - 0.55, fin = S.accroche.d - 0.52;
        // le téléphone : il arrive, vibre à chaque message, puis s'efface devant la phrase
        const arrive = av(u, 0, 1.1), part = av(u, sortie, 0.5, E.part);
        let vib = 0;
        for (const m of [...MSG, PERDU]) { const d = u - m.t; if (d > 0 && d < 0.42) vib += Math.sin(d * 78) * (1 - d / 0.42); }
        this.tel.pose({ x: 1395 + 240 * (1 - arrive) + 380 * part + vib * 2.4, y: 548 + Math.sin(u * 0.9) * 6, z: -60 * part, s: 1.13, rx: 5, ry: -19 + 7 * (1 - arrive) + Math.sin(u * 0.55) * 1.4, rz: vib * 0.5, o: borne(arrive * 2) * (1 - part) });
        // l'heure file jusqu'au soir
        const jour = av(u, 0.6, A.soir - 0.75, E.vient), minutes = Math.round(mix(14 * 60 + 7, 21 * 60 + 48, jour));
        const h = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
        $('#a-heure').textContent = h; this.tel.heureEl.textContent = h;
        const soir = av(u, A.soir - 1.3, 1.4, E.vient);
        $('#a-soir').style.opacity = (0.34 * soir).toFixed(3);
        AMB.gain = mix(1.0, 0.5, soir); AMB.sombre = 0.12 * soir;
        empiler(this.petites, u, [...MSG, PERDU].map(m => m.t));
        // les grandes cartes, lisibles : une colonne à gauche, qui se tasse quand le soir tombe
        const tasse = av(u, A.soir - 0.9, 0.8, E.vient);
        this.cartes.slice(0, 4).forEach((c, i) => {
          const k = av(u, MSG[i].t, 0.62);
          pose(c, { x: 150 - 70 * (1 - k) - 520 * part, y: mix(140 + i * 176, 112 + i * 84, tasse), s: mix(mix(0.94, 1, k), 0.5, tasse), o: borne(k * 1.8) * mix(1, 0.42, tasse) * (1 - part), flou: 9 * (1 - k) + 5 * part });
        });
        const kp = av(u, A.trop, 0.6);
        pose(this.cartes[4], { x: 150 - 70 * (1 - kp) - 520 * part, y: 500, s: mix(0.94, 1.06, kp), o: borne(kp * 1.8) * (1 - part), flou: 9 * (1 - kp) + 5 * part });
        entre($('#a-perte'), u, A.rdv - 0.1, { bx: 168, by: 716, x: -40, y: 0, sortie, sx: -420, sy: 0, ds: 0.45 });
        $('#a-perte s').style.textDecorationColor = u > A.parti ? '' : 'transparent';
        // la phrase, mot à mot sur la voix, puis on fonce dedans : c'est l'entrée du nom
        const ph = $('#a-phrase'), fonce = av(u, fin, 0.5, E.part);
        dire(ph, u, A.mots.map(x => x - S.accroche.a));
        ph.style.transformOrigin = '38% 50%';
        pose(ph, { s: 1 + 0.9 * fonce, o: 1 - fonce, flou: 26 * fonce, y: -40 * fonce });
        if (u > A.phrase - 0.3) { const r = av(u, A.phrase - 0.3, 1.2, E.vient); AMB.gain = mix(0.5, 0.85, r) + 1.4 * fonce; AMB.sombre = 0.12 * (1 - r); AMB.zoom = 1 + 0.5 * fonce; }
      },
    };
  }

  /* ── 1. Le nom, sur l'entrée du beat ── */
  {
    const N = C.nom;
    SC.nom = {
      avant: 0.45,
      sons: [[-0.02, 'basse', 0.62], [0, 'coup', 0.3]],
      titres: () => `<div class="logo abs" id="n-logo" style="left:0;right:0;top:330px;text-align:center">${[...'Trim'].map(c => `<span class="l">${c}</span>`).join('')}<span class="s">${[...'Sync'].map(c => `<span class="l">${c}</span>`).join('')}</span></div>
        <div class="abs" id="n-slogan" style="left:0;right:0;top:640px;text-align:center;font:600 64px/1 var(--fd);letter-spacing:-.03em">${mots('Ton')}<span style="color:var(--a)">${mots('agenda')}</span>${mots('se remplit tout seul.')}</div>`,
      init() { this.lettres = $$('#n-logo .l'); },
      rendre(u) {
        // les lettres tombent de devant la caméra, sur le temps fort
        this.lettres.forEach((l, i) => { const k = av(u, -0.3 + i * 0.028, 0.56); pose(l, { s: mix(2.1, 1, k), o: borne(k * 2.2), flou: 30 * (1 - k), y: 10 * (1 - k) }); });
        dire($('#n-slogan'), u, N.slogan, { d: 0.55, y: 26 });
        const choc = u < 0 ? 0 : Math.exp(-u * 2.6);
        AMB.gain = 0.95 + 1.5 * choc; AMB.zoom = 1 + 0.42 * choc; AMB.sombre = 0;
      },
    };
  }

  /* ── 2. La réservation : la vraie page, du nom du salon au rendez-vous confirmé ── */
  const DASH_CIBLE = [1685, 897];   // où le rendez-vous atterrit dans le plateau du dashboard (sur son bloc, dans l'agenda)
  {
    const R = C.resa, d = S.resa.d;
    SC.resa = {
      apres: C.dash.arrive + 0.35,
      sons: [[0.95, 'pop', 0.3], [R.eventail, 'balaye', 0.4], [R.eventail + 0.12, 'balaye', 0.3], [R.replie, 'souffle', 0.22], [R.lien + 0.05, 'pop', 0.34],
        ...['presta', 'suite1', 'jour', 'creneau', 'suite2', 'accord', 'confirme'].map(k => [R[k], 'clic', 0.5]), [R.succes + 0.08, 'reussi', 0.5], [R.acompte - 0.5, 'souffle', 0.22], [d - 1.3, 'pop', 0.4]],
      plateau: () => `<div class="rdv-vol" id="r-vol"><i class="ti ti-calendar-check"></i>Sam. 10 oct. · 14:30<small>Inès M. · Pose gel</small></div>`,
      titres: () => `<div class="abs" style="left:150px;top:176px;width:760px">
          <div class="kicker" id="r-k"><b>01</b>La réservation</div>
          <div class="titre" id="r-t" style="margin-top:26px">${lignes('Ta page de|<em>réservation.</em>')}</div>
          <div class="abs" id="r-g1" style="left:0;top:330px"><div class="ligne2" id="r-nom"><b>À ton nom.</b></div>
            <div class="ligne2" id="r-coul" style="margin-top:20px;display:flex;align-items:center;gap:22px"><b>À tes couleurs.</b><span style="display:flex;gap:10px">${['#3bbfcc', '#f48fb1', '#ff8a65'].map(c => `<i style="display:block;width:26px;height:26px;border-radius:50%;background:${c}"></i>`).join('')}</span></div></div>
          <div class="abs" id="r-g2" style="left:0;top:330px;width:760px"><div class="ligne2" id="r-lien"><b>Un lien dans ta bio.</b></div>
            <div class="pastille" id="r-url" style="margin-top:22px"><i class="ti ti-link"></i>trimsync.tech/r/studio-nova</div>
            <div style="margin-top:44px;display:flex;flex-direction:column;gap:20px"><div class="coche" id="r-c1"><i class="ti ti-check"></i>La prestation</div><div class="coche" id="r-c2"><i class="ti ti-check"></i>Le créneau</div><div class="coche" id="r-c3"><i class="ti ti-check"></i>C’est confirmé</div></div></div>
          <div class="abs" id="r-g3" style="left:0;top:330px;width:700px"><div class="ligne2"><b>Un acompte, si tu veux.</b></div><div class="ligne2" style="margin-top:14px;font-size:38px">Contre les lapins.</div></div>
        </div>`,
      init(pl) {
        this.rose = telephone(pl, { mode: 'safari', url: 'trimsync.tech/r/lash-room', heure: '12:41', clip: 'resa-rose' });
        this.corail = telephone(pl, { mode: 'safari', url: 'trimsync.tech/r/maison-solene', heure: '12:41', clip: 'resa-corail' });
        this.tel = telephone(pl, { mode: 'safari', url: 'trimsync.tech/r/studio-nova', heure: '12:41', clip: 'resa' });
      },
      rendre(u) {
        // le téléphone du milieu : il arrive pendant le splash, se rapproche pour l'acompte
        const arrive = av(u, -0.3, 1.25), pres = av(u, R.acompte - 0.55, 0.9, E.vient);
        this.tel.pose({ x: 1330 + 300 * (1 - arrive), y: mix(548, 388, pres) + Math.sin(u * 0.8) * 5, z: -120 * (1 - arrive), s: mix(1.1, 1.36, pres), rx: 4 - 2 * pres, ry: mix(-13 + 9 * (1 - arrive), -7, pres) + Math.sin(u * 0.5) * 1.2, o: borne(arrive * 2.4) });
        this.tel.temps(u - R.clip);
        // les deux autres salons : ils se déploient sur « à ton nom », puis reculent dans l'ombre
        const ouvre = av(u, R.eventail, 0.95), recule = av(u, R.replie, 0.8, E.vient), cache = av(u, R.acompte - 0.6, 0.5, E.part);
        for (const [t, sens, clip] of [[this.rose, -1, 'resa-rose'], [this.corail, 1, 'resa-corail']]) {
          t.pose({ x: 1330 + sens * mix(60, mix(405, 470, recule), ouvre) + sens * 260 * cache, y: 560 + 26 * recule, z: mix(-90, mix(-230, -520, recule), ouvre), s: 0.94, rx: 4, ry: -13 - sens * mix(4, 21, ouvre),
            o: borne(ouvre * 2.2) * (1 - cache), nuit: 0.62 * recule });
          t.temps(u - CLIPS[clip].depart);
        }
        // les titres
        entre($('#r-k'), u, 0.35, { y: 14 });
        reveler($('#r-t'), u, R.titre - 0.5);
        const g1 = R.replie - 0.25, g2 = R.acompte - 0.7;
        entre($('#r-nom'), u, R.nom - 0.25, { sortie: g1 }); entre($('#r-coul'), u, R.couleurs - 0.25, { sortie: g1 + 0.05 });
        entre($('#r-lien'), u, R.lien - 0.3, { sortie: g2 }); entre($('#r-url'), u, R.lien + 0.05, { sortie: g2 + 0.04, y: 18 });
        [['#r-c1', R.presta], ['#r-c2', R.creneau], ['#r-c3', R.succes]].forEach(([s, tc], i) => {
          const el = $(s), fait = av(u, tc + 0.12, 0.35);
          entre(el, u, R.lien + 0.55 + i * 0.07, { sortie: g2 + 0.08 + i * 0.03, y: 18 });
          el.style.color = fait > 0.5 ? '' : 'var(--t3)';
          const ic = $('.ti', el); ic.style.background = `oklch(0.76 0.13 193/${(0.06 + 0.94 * fait).toFixed(3)})`; ic.style.color = fait > 0.5 ? 'var(--encre)' : 'transparent';
          ic.style.transform = `scale(${(1 + 0.16 * Math.sin(Math.PI * borne((u - tc - 0.12) / 0.4))).toFixed(3)})`;
        });
        entre($('#r-g3'), u, R.acompte - 0.35, { sortie: d - 0.9 });
        // le rendez-vous quitte la page : la caméra file vers l'agenda, il la rattrape et s'y pose
        const [px, py] = POS.resa, [qx, qy] = POS.dash, pose_ = d + C.dash.arrive - 0.1;
        const vol = av(u, d - 0.5, pose_ - (d - 0.5), E.vient);
        const vx = mix(1330, qx - px + DASH_CIBLE[0], vol), vy = mix(430, qy - py + DASH_CIBLE[1], vol);
        pose($('#r-vol'), { x: vx - 260, y: vy - 42, z: 60, s: mix(0.8, 1, av(u, d - 1.35, 0.4)) * mix(1, 0.36, vol), o: borne((u - (d - 1.35)) / 0.2) * (1 - av(u, pose_ - 0.1, 0.16, E.lin)) });
        $('#r-vol').style.transformOrigin = '50% 50%';
        AMB.gain = 0.92;
      },
    };
  }

  /* ── 3. Le dashboard : le rendez-vous arrive dans l'agenda, puis le tour de l'appli ── */
  {
    const D = C.dash, d = S.dash.d;
    const LISTE = ['Tes clients.', 'Ton chiffre.', 'Tes horaires.'], QUAND = [D.clients, D.chiffre, D.horaires];
    SC.dash = {
      sons: [[D.arrive - 0.02, 'pose', 0.55], [D.arrive + 0.1, 'bulle', 0.3], [D.clipAppli - 0.15, 'balaye', 0.4], ...QUAND.map(q => [q, 'clic', 0.5]), [D.appli - 0.1, 'souffle', 0.26]],
      titres: () => `<div class="abs" id="d-tete" style="left:150px;top:84px"><div class="kicker" id="d-k"><b>02</b>Le dashboard</div>
          <div class="titre" id="d-t" style="font-size:80px;margin-top:22px">${lignes('Tout arrive dans <em>ton agenda.</em>')}</div></div>
        <div class="abs" id="d-liste" style="left:150px;top:290px">${LISTE.map((x, i) => `<div class="titre" id="d-l${i}" style="font-size:108px;margin-bottom:16px">${lignes(x)}</div>`).join('')}</div>
        <div class="titre abs" id="d-fin" style="left:150px;top:340px;font-size:108px">${lignes('Tout ton salon|dans <em>une appli.</em>')}</div>`,
      init(pl) {
        const r = CLIPS.agenda.reperes.nouveau;
        this.dalle = dalle(pl, 'agenda', `<div class="anneau" id="d-anneau" style="left:${r.x - 5}px;top:${r.y - 5}px;width:${r.l + 10}px;height:${r.h + 10}px"></div>`);
        this.tel = telephone(pl, { mode: 'appli', heure: '12:43', clip: 'appli' });
      },
      rendre(u) {
        // la fenêtre de l'agenda : on s'en approche quand le rendez-vous s'y pose, puis elle laisse la place au téléphone
        const pres = av(u, D.arrive - 0.5, 1.6, E.vient), part = av(u, D.clipAppli - 0.2, 0.8, E.vient);
        this.dalle.pose({ x: mix(1240, 1190, pres) - 1500 * part, y: mix(700, 652, pres), z: -260 * part, s: mix(1, 1.07, pres), rx: 5, ry: -9 - 16 * part, o: 1 - av(u, D.clipAppli + 0.2, 0.35, E.part) });
        this.dalle.temps(u - D.clipAgenda);
        const onde = av(u, D.arrive, 1.5), an = $('#d-anneau');
        an.style.opacity = u < D.arrive ? '0' : (1 - av(u, D.arrive + 1.3, 0.6, E.lin)).toFixed(3);
        an.style.boxShadow = `0 0 0 ${(onde * 26).toFixed(1)}px oklch(0.76 0.13 193/${(0.42 * (1 - onde)).toFixed(3)}),0 0 34px oklch(0.76 0.13 193/.5)`;
        // le téléphone : l'appli, qu'on parcourt
        const vient = av(u, D.clipAppli - 0.15, 1.0), sort = av(u, d - 0.5, 0.45, E.part);
        this.tel.pose({ x: 1400 + 620 * (1 - vient), y: 548 + Math.sin(u * 0.8) * 5, z: -160 * (1 - vient), s: 1.13, rx: 4, ry: -15 + 10 * (1 - vient) + Math.sin(u * 0.5) * 1.2, o: borne(vient * 2.2) });
        this.tel.temps(u - D.clipAppli);
        // les titres
        const sortieTete = D.clipAppli - 0.35;
        entre($('#d-k'), u, 0.3, { y: 14, sortie: sortieTete });
        reveler($('#d-t'), u, 0.35, { sortie: sortieTete });
        LISTE.forEach((_, i) => {
          const el = $('#d-l' + i);
          reveler(el, u, QUAND[i] - 0.12, { d: 0.6, sortie: D.appli - 0.35 + i * 0.04 });
          el.style.color = (QUAND[i + 1] !== undefined && u > QUAND[i + 1] - 0.05) ? 'var(--t3)' : '';
        });
        reveler($('#d-fin'), u, D.appli - 0.05, { sortie: d - 0.5 });
        AMB.gain = 0.9;
      },
    };
  }

  return SC;
}
