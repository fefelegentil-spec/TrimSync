// Scènes 7 à 11 : le bot au travail (un message, une annulation, une question), le relais, les offres, la fin.
import { $, $$, borne, mix, av, E, pose, entre, lignes, reveler, mots, dire } from './outils.mjs';

export function scenes3(K) {
  const { C, S, CLIPS, AMB, telephone, verrou, empiler, dm, poserFil, jouerFil, notif } = K;
  const SC = {};

  /* ── 7 et 8. Le bot au travail : à gauche la messagerie d'Instagram, à droite l'agenda de l'appli ── */
  {
    const A = C.action, Q = C.cas, da = S.action.d, dc = S.cas.d;
    // trois conversations ; les instants de la 2e et de la 3e sont comptés depuis le début de la scène « cas »
    const F1 = [
      { qui: 'elle', texte: 'Coucou ! Tu aurais une place samedi pour une pose gel ? 🙏', t: A.message },
      { qui: 'bot', texte: 'Coucou ! Samedi il me reste 16h, ça te va ?', ecrit: A.ecrit, t: A.propose + 0.2 },
      { qui: 'elle', texte: 'Parfait, je prends !', t: A.oui + 0.1 },
      { qui: 'bot', texte: 'C’est noté : samedi 16h, pose gel ✨', ecrit: A.oui + 0.4, t: A.pose + 0.2, delai: '3 s' },
    ];
    const F2 = [
      { qui: 'elle', texte: 'Coucou, je ne pourrai pas venir mardi, désolée 😕', t: Q.annulation },
      { qui: 'bot', texte: 'Pas de souci, c’est annulé. À bientôt !', ecrit: Q.annulation + 0.3, t: Q.reponse + 0.3 },
    ];
    // (une réclamation : c'est le cas où le bot de Félix passe la main sans rien promettre)
    const F3 = [{ qui: 'elle', texte: 'Coucou, mon vernis a sauté au bout de 3 jours, tu peux regarder ? 😕', t: Q.question }];
    const LEG = [   // [texte, début, fin] en secondes de la scène « action »
      ['Il lit|ton agenda', A.regarde - 0.2, A.propose - 0.1], ['Il propose|un créneau libre', A.propose, A.pose - 0.15], ['Il pose|le rendez-vous', A.pose - 0.05, A.meme - 0.3],
      ['Il annule,|le créneau est libéré', da + Q.reponse + 0.2, da + Q.question - 0.45], ['Il ne sait pas|quoi répondre ?', da + Q.connait - 0.3, da + Q.main - 0.2], ['Il te passe|la main', da + Q.main - 0.1, da + dc + 1],
    ];
    const cible = r => `left:${r.x - 4}px;top:${r.y + 47 - 4}px;width:${r.l + 8}px;height:${r.h + 8}px`;
    SC.action = {
      apres: dc + 0.85,
      sons: [[A.message, 'bulle', 0.5], [A.regarde - 0.2, 'souffle', 0.2], [A.propose + 0.2, 'envoi', 0.42], [A.oui + 0.1, 'bulle', 0.45], [A.pose + 0.2, 'envoi', 0.42], [A.rdv, 'pose', 0.55], [A.notif, 'bulle', 0.36], [A.meme - 0.15, 'souffle', 0.24]],
      plateau: () => `<div class="pivot" id="c-pivot" style="left:960px;top:400px"><i class="ti ti-message-chatbot"></i></div>
        <div class="abs" id="c-fg" style="left:742px;top:398px;width:148px;height:4px;border-radius:2px;background:linear-gradient(90deg,transparent,oklch(0.76 0.13 193/.6))"><i class="abs" style="left:0;top:-5px;width:14px;height:14px;border-radius:50%;background:var(--a2)"></i></div>
        <div class="abs" id="c-fd" style="left:1030px;top:398px;width:148px;height:4px;border-radius:2px;background:linear-gradient(270deg,transparent,oklch(0.76 0.13 193/.6))"><i class="abs" style="left:0;top:-5px;width:14px;height:14px;border-radius:50%;background:var(--a2)"></i></div>
        ${LEG.map(([x], i) => `<div class="legende" id="c-l${i}" style="left:760px;top:505px;width:400px">${x.replace('|', '<br>')}</div>`).join('')}
        <div class="nuit" id="c-nuit" style="left:710px;top:300px;width:500px"><i class="ti ti-moon-stars" style="font-size:64px;color:var(--a)"></i><b>3:12</b><span>Tu dors. Il répond.</span></div>`,
      init(pl) {
        this.dm = telephone(pl, { heure: '3:12', html: `<div class="abs" id="c-f1w" style="inset:0">${dm('c-f1', { nom: 'louna.dcs', initiale: 'L', couleur: 'linear-gradient(140deg,#f6b7c9,#c9a7ff)', jour: 'Aujourd’hui 03:12' }, F1)}</div>
          <div class="abs" id="c-f2w" style="inset:0">${dm('c-f2', { nom: 'jade.mrl', initiale: 'J', couleur: 'linear-gradient(140deg,#ffd08a,#ff9a76)', jour: 'Aujourd’hui 18:40' }, F2)}</div>
          <div class="abs" id="c-f3w" style="inset:0">${dm('c-f3', { nom: 'emma.frr', initiale: 'E', couleur: 'linear-gradient(140deg,#a7e8b8,#7cc7e8)', jour: 'Aujourd’hui 18:52' }, F3)}
            <div class="abs" id="c-main" style="left:14px;right:14px;top:252px;padding:13px 16px;border-radius:16px;background:rgba(96,196,200,.12);border:1px solid rgba(96,196,200,.4);font:600 14.5px/1.3 var(--fb);color:#9eeceb;display:flex;gap:10px;align-items:center"><i class="ti ti-hand-stop" style="font-size:22px"></i>Le bot ne répond pas : il te passe la main.</div></div>` });
        poserFil($('#c-f1'), F1); poserFil($('#c-f2'), F2); poserFil($('#c-f3'), F3);
        const libre = CLIPS['agenda-bot'].reperes.nouveau, annule = CLIPS['agenda-annule'].reperes.annule;
        this.ag = telephone(pl, { mode: 'appli', heure: '3:12', clip: 'agenda-bot', sur: `<div class="anneau" id="c-libre" style="${cible(libre)};border-style:dashed"></div><div class="anneau" id="c-annule" style="${cible(annule)};border-color:var(--alerte)"></div>
          ${notif('banniere', { ic: 'ts', app: 'TrimSync', heure: 'maintenant', titre: 'Nouveau rendez-vous', texte: 'Louna · sam. 16:00 · Pose gel' }).replace('class="banniere"', 'class="banniere" id="c-b1"')}
          ${notif('banniere', { ic: 'ts', app: 'TrimSync', heure: 'maintenant', titre: 'Le bot te passe la main', texte: 'emma.frr : « mon vernis a sauté… »' }).replace('class="banniere"', 'class="banniere" id="c-b2"')}` });
      },
      rendre(u) {
        const v = u - da;   // temps de la scène « cas »
        const nuit = av(u, A.meme - 0.25, 0.7, E.vient) * (1 - av(u, da - 0.25, 0.5, E.vient));
        // les deux téléphones, face à face
        this.dm.pose({ x: 500, y: 548 + Math.sin(u * 0.8) * 5, s: 1.08, rx: 4, ry: 13 + Math.sin(u * 0.5) * 1.1, nuit: 0.12 * nuit });
        const change = Math.sin(Math.PI * borne((v + 0.22) / 0.44));   // l'agenda passe du samedi au mardi : un battement
        this.ag.pose({ x: 1420, y: 548 + Math.sin(u * 0.8 + 1) * 5, s: 1.08, rx: 4, ry: -13 + Math.sin(u * 0.5 + 1) * 1.1, nuit: Math.max(0.12 * nuit, 0.85 * change) });
        if (v < 0) { this.ag.clip('agenda-bot'); this.ag.temps(u - A.clip); } else { this.ag.clip('agenda-annule'); this.ag.temps(v - Q.clip); }
        
        // la messagerie : trois conversations se succèdent
        const g1 = av(v, -0.3, 0.6, E.va), g2 = av(v, Q.question - 0.75, 0.6, E.va);
        $('#c-f1w').style.transform = `translateX(${(-400 * g1).toFixed(1)}px)`;
        $('#c-f2w').style.transform = `translateX(${(400 * (1 - g1) - 400 * g2).toFixed(1)}px)`;
        $('#c-f3w').style.transform = `translateX(${(400 * (1 - g2)).toFixed(1)}px)`;
        const heure = g2 > 0.5 ? '18:52' : g1 > 0.5 ? '18:40' : '3:12';
        this.dm.heureEl.textContent = heure; this.ag.heureEl.textContent = v < 0 ? '3:12' : heure;
        jouerFil($('#c-f1'), F1, u); jouerFil($('#c-f2'), F2, v); jouerFil($('#c-f3'), F3, v);
        entre($('#c-main'), v, Q.main - 0.15, { y: 14 });
        // sur l'agenda : le créneau libre que le bot a trouvé, puis le rendez-vous qui s'y pose
        const li = $('#c-libre'), vu = av(u, A.agenda - 0.1, 0.4) * (1 - av(u, A.rdv - 0.05, 0.25, E.lin)), onde = av(u, A.rdv, 1.4);
        li.style.opacity = Math.max(vu * (0.55 + 0.45 * Math.abs(Math.sin(u * 5))), u >= A.rdv ? 1 - av(u, A.rdv + 1.1, 0.6, E.lin) : 0).toFixed(3);
        li.style.borderStyle = u >= A.rdv ? 'solid' : 'dashed';
        li.style.boxShadow = u >= A.rdv ? `0 0 0 ${(onde * 22).toFixed(1)}px oklch(0.76 0.13 193/${(0.4 * (1 - onde)).toFixed(3)}),0 0 30px oklch(0.76 0.13 193/.5)` : '';
        const b1 = av(u, A.notif, 0.5, E.tiroir) * (1 - av(u, da - 0.5, 0.3, E.part));
        $('#c-b1').style.transform = `translateY(${((1 - b1) * -170).toFixed(1)}px)`; $('#c-b1').style.opacity = b1 > 0.01 ? '1' : '0';
        // l'annulation : le bloc du mardi s'éteint
        const an = $('#c-annule');
        an.style.opacity = v < Q.reponse ? '0' : ((1 - av(v, Q.libere + 0.9, 0.6, E.lin)) * (v < Q.libere ? 0.6 + 0.4 * Math.abs(Math.sin(v * 6)) : 1)).toFixed(3);
        an.style.borderStyle = v >= Q.libere ? 'dashed' : 'solid';
        const b2 = av(v, Q.main + 0.05, 0.5, E.tiroir);
        $('#c-b2').style.transform = `translateY(${((1 - b2) * -170).toFixed(1)}px)`; $('#c-b2').style.opacity = b2 > 0.01 ? '1' : '0';
        // au milieu : le bot, et ce qu'il fait
        const pv = $('#c-pivot'), bat = Math.max(...[A.regarde, A.propose, A.pose, da + Q.reponse, da + Q.main].map(q => { const k = u - q; return k > 0 && k < 0.5 ? Math.sin(Math.PI * k / 0.5) : 0; }));
        pose(pv, { s: mix(0.8, 1, av(u, 0.35, 0.6)) * (1 + 0.1 * bat), o: av(u, 0.35, 0.5) * (1 - nuit) });
        pv.style.boxShadow = `0 0 ${(60 * bat).toFixed(0)}px oklch(0.76 0.13 193/${(0.6 * bat).toFixed(3)})`;
        // les deux faisceaux : un point y voyage quand le bot lit l'agenda ou écrit
        const voyage = (el, trajets) => {
          let k = -1; for (const [q0, sens] of trajets) { const w = (u - q0) / 0.55; if (w >= 0 && w <= 1) k = sens > 0 ? E.vient(w) : 1 - E.vient(w); }
          el.style.opacity = (0.75 * av(u, 0.5, 0.5) * (1 - nuit)).toFixed(3);
          const pt = el.firstElementChild; pt.style.opacity = k < 0 ? '0' : '1'; pt.style.transform = `translateX(${(Math.max(0, k) * 134).toFixed(1)}px)`;
        };
        voyage($('#c-fd'), [[A.regarde - 0.1, -1], [A.pose, 1], [da + Q.reponse + 0.2, 1]]);
        voyage($('#c-fg'), [[A.message + 0.05, 1], [A.propose - 0.35, -1], [A.pose - 0.3, -1], [da + Q.annulation + 0.1, 1], [da + Q.reponse - 0.2, -1], [da + Q.question + 0.1, 1]]);
        LEG.forEach(([, q0, q1], i) => entre($('#c-l' + i), u, q0, { y: 16, d: 0.45, sortie: q1, ds: 0.22 }));
        const nu = $('#c-nuit'); pose(nu, { y: 20 * (1 - nuit), s: mix(0.94, 1, nuit), o: nuit, flou: 8 * (1 - nuit) });
        AMB.gain = mix(0.9, 0.45, nuit); AMB.sombre = 0.2 * nuit;
      },
    };
    SC.cas = {
      sons: [[-0.3, 'balaye', 0.36], [Q.annulation, 'bulle', 0.5], [Q.reponse + 0.3, 'envoi', 0.42], [Q.libere, 'souffle', 0.26], [Q.question - 0.75, 'balaye', 0.34], [Q.question, 'bulle', 0.5], [Q.main + 0.05, 'bulle', 0.4], [Q.main - 0.1, 'basse', 0.3]],
      rendre() {},
    };
  }

  /* ── 9. Le relais : le même écran verrouillé qu'au début, mais ce sont des rendez-vous qui tombent ── */
  {
    const M = C.relais, d = S.relais.d;
    const NOTIFS = [
      { ic: 'ts', app: 'TrimSync', heure: '10:12', titre: 'Réponse envoyée', texte: 'louna.dcs · « Samedi il me reste 16h… »', t: M.repond },
      { ic: 'ts', app: 'TrimSync', heure: '10:13', titre: 'Nouveau rendez-vous', texte: 'Louna · sam. 16:00 · Pose gel', t: M.reserve },
      { ic: 'ok', app: 'TrimSync', heure: '10:13', titre: 'Rendez-vous confirmé', texte: 'Rappel prévu la veille', t: M.confirme },
    ];
    const LUI = ['Lui, il <em>répond.</em>', 'Il <em>réserve.</em>', 'Il <em>confirme.</em>'];
    SC.relais = {
      sons: [[M.toi - 0.1, 'coup', 0.3], ...NOTIFS.map(n => [n.t, 'bulle', 0.42]), ...NOTIFS.map(n => [n.t, 'pop', 0.3]), [M.telephone - 0.3, 'balaye', 0.4], [M.un + 0.1, 'basse', 0.4]],
      titres: () => `<div class="abs" style="left:150px;top:120px;width:1000px">
          <div class="titre" id="m-toi" style="font-size:112px">${lignes('Toi, tu fais|<em>ton métier.</em>')}</div>
          <div style="margin-top:56px">${LUI.map((x, i) => `<div class="titre" id="m-l${i}" style="font-size:84px;margin-bottom:8px;color:var(--t2)">${lignes(x)}</div>`).join('')}</div></div>
        <div class="titre abs" id="m-fin" style="left:150px;top:330px;font-size:120px;width:1100px">${lignes('Ton téléphone|redevient|<em>un téléphone.</em>')}</div>`,
      init(pl) { this.tel = telephone(pl, { heure: '9:30', html: verrou('m', 'Vendredi 9 octobre', '9:30', NOTIFS) }); this.petites = $$('#m-pile .notif'); },
      rendre(u) {
        const bascule = M.telephone - 0.4;
        const face = av(u, bascule, 1.1, E.vient);
        this.tel.pose({ x: mix(1400, 1440, face), y: 548 + Math.sin(u * 0.8) * 5, s: 1.13, rx: mix(5, 2, face), ry: mix(-17, -9, face) + Math.sin(u * 0.5) * 1.2 });
        const minutes = Math.round(mix(9 * 60 + 30, 19 * 60 + 30, av(u, 0.2, d - 1.4, E.vient)));
        const h = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
        $('#m-heure').textContent = h; this.tel.heureEl.textContent = h;
        empiler(this.petites, u, NOTIFS.map(n => n.t), { retire: bascule + 0.1 });
        reveler($('#m-toi'), u, M.toi - 0.15, { sortie: bascule });
        LUI.forEach((_, i) => reveler($('#m-l' + i), u, NOTIFS[i].t - 0.12, { d: 0.6, sortie: bascule + 0.05 + i * 0.03 }));
        reveler($('#m-fin'), u, M.telephone - 0.1, { pas: 0.16, sortie: d - 0.5 });
        AMB.gain = 0.92;
      },
    };
  }

  /* ── 10. Les offres : un escalier, chaque marche ajoute une chose ── */
  {
    const Q = C.offres, d = S.offres.d;
    const MARCHES = [
      { id: 'm1', gauche: 150, largeur: 500, hauteur: 372, nom: 'Essentiel', prix: '19', texte: '<b>Toute l’appli</b> : réservation, agenda, clients, rappels, acompte.', t: Q.appli - 0.35, fort: Q.dixneuf },
      { id: 'm2', gauche: 690, largeur: 500, hauteur: 492, nom: 'Pro', prix: '49', texte: 'Tout l’Essentiel,<br><b>+ le bot Instagram</b>, 24 h/24.', t: Q.avec - 0.35, fort: Q.quarante, reco: true },
      { id: 'm3', gauche: 1230, largeur: 540, hauteur: 612, nom: 'Max', prix: '89', texte: 'Tout le Pro,<br><b>+ ton style</b>, stories auto, créneau libéré reproposé.', t: Q.quarante + 0.6, fort: -9 },
    ];
    SC.offres = {
      apres: 0.7,
      sons: [...MARCHES.map(m => [m.t, 'balaye', 0.34]), [Q.dixneuf, 'pose', 0.5], [Q.quarante, 'pose', 0.6], [Q.sept - 0.1, 'pop', 0.4], [Q.sans - 0.1, 'pop', 0.32]],
      plateau: () => MARCHES.map(m => `<div class="marche${m.reco ? ' pro' : ''}" id="q-${m.id}" style="left:${m.gauche}px;width:${m.largeur}px;height:${m.hauteur}px">${m.reco ? '<div class="reco">Recommandé</div>' : ''}
          <h5>${m.nom}</h5><div class="prix">${m.prix} €<small>/mois</small></div><p>${m.texte}</p></div>`).join(''),
      titres: () => `<div class="abs" style="left:150px;top:84px"><div class="kicker" id="q-k"><b>04</b>Les offres</div>
          <div class="titre" id="q-t" style="font-size:86px;margin-top:22px">${lignes('Simple. Honnête.|<em>Sans surprise.</em>')}</div></div>
        <div class="abs" style="left:1230px;top:112px;width:560px">
          <div class="pastille" id="q-essai" style="height:70px;border-radius:35px;font-size:31px;padding:0 32px"><i class="ti ti-gift" style="font-size:34px"></i>7 jours d’essai gratuit</div>
          <div class="ligne2" id="q-carte" style="margin-top:22px;font-size:40px"><b>Sans carte bancaire.</b></div>
          <div class="note" id="q-note" style="margin-top:12px;font-size:25px">Mise en place du bot offerte aux 10 premiers.</div></div>`,
      rendre(u) {
        const sortie = d - 0.5;
        MARCHES.forEach((m, i) => {
          const el = $('#q-' + m.id), k = av(u, m.t, 0.85), q = av(u, sortie + i * 0.05, 0.42, E.part), fort = Math.sin(Math.PI * borne((u - m.fort + 0.05) / 0.5));
          pose(el, { y: (1 - k) * (m.hauteur + 40) + q * (m.hauteur + 60), s: 1 + 0.025 * fort, o: 1 });
          el.style.display = k <= 0.001 ? 'none' : '';
          el.style.boxShadow = m.reco ? `0 0 ${(90 * fort).toFixed(0)}px oklch(0.76 0.13 193/${(0.4 * fort).toFixed(3)})` : '';
          const prix = $('.prix', el); prix.style.color = fort > 0.05 || (m.reco && u > m.fort) ? 'var(--a2)' : '';
        });
        entre($('#q-k'), u, 0.25, { y: 14, sortie }); reveler($('#q-t'), u, 0.25, { sortie });
        entre($('#q-essai'), u, Q.sept - 0.2, { y: 18, s: 0.92, sortie }); entre($('#q-carte'), u, Q.sans - 0.2, { y: 16, sortie: sortie + 0.03 }); entre($('#q-note'), u, Q.sans + 0.45, { y: 12, sortie: sortie + 0.06 });
        AMB.gain = 0.86;
      },
    };
  }

  /* ── 11. La fin : le nom, la promesse, l'essai ── */
  {
    const F = C.fin, d = S.fin.d;
    SC.fin = {
      avant: 0.2, apres: 0.2,
      sons: [[-0.05, 'basse', 0.5], [F.bouton, 'pop', 0.4]],
      titres: () => `<div class="logo abs" id="f-logo" style="left:0;right:0;top:230px;text-align:center">${[...'Trim'].map(c => `<span class="l">${c}</span>`).join('')}<span class="s">${[...'Sync'].map(c => `<span class="l">${c}</span>`).join('')}</span></div>
        <div class="abs" id="f-slogan" style="left:0;right:0;top:530px;text-align:center;font:600 64px/1 var(--fd);letter-spacing:-.03em">${mots('Ton')}<span style="color:var(--a)">${mots('agenda')}</span>${mots('se remplit tout seul.')}</div>
        <div class="abs" id="f-bouton" style="left:0;right:0;top:690px;text-align:center"><span class="bouton">Essai gratuit 7 jours<i class="ti ti-arrow-right"></i></span></div>
        <div class="adresse abs" id="f-adresse" style="left:0;right:0;top:830px;text-align:center">trimsync.tech</div>`,
      init() { this.lettres = $$('#f-logo .l'); },
      rendre(u) {
        this.lettres.forEach((l, i) => { const k = av(u, 0.05 + i * 0.035, 0.8); pose(l, { s: mix(1.35, 1, k), o: borne(k * 2), flou: 22 * (1 - k), y: 14 * (1 - k) }); });
        dire($('#f-slogan'), u, F.slogan, { d: 0.55, y: 26 });
        entre($('#f-bouton'), u, F.bouton, { y: 26, s: 0.92 });
        entre($('#f-adresse'), u, F.bouton + 0.3, { y: 16 });
        const choc = u < 0 ? 0 : Math.exp(-u * 2.2);
        AMB.gain = 0.9 + 0.8 * choc; AMB.zoom = 1 + 0.2 * choc;
      },
    };
  }

  return SC;
}
