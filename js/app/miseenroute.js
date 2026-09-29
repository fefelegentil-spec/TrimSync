/* ── Mise en route obligatoire ──
   Au premier accès, un parcours plein écran qu'on ne peut pas fermer :
   salon → prestations → horaires → lien de réservation. « Terminer » appelle
   POST /api/salon/mise-en-route, que le serveur refuse tant qu'il n'y a ni
   prestation active ni jour ouvert : la page de réservation a toujours de quoi
   fonctionner quand le pro arrive sur son dashboard. */

const MER = { etape: 0, prestations: [], semaine: [] };
const MER_ETAPES = ['Ton salon', 'Tes prestations', 'Tes horaires', 'Ton lien'];
const MER_DUREES = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180];

function ouvrirMiseEnRoute() {
  let o = document.getElementById('mer');
  if (!o) {
    o = document.createElement('div');
    o.id = 'mer';
    o.className = 'mer';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-label', 'Mise en route de ton salon');
    document.body.appendChild(o);
  }
  document.body.style.overflow = 'hidden';
  MER.etape = 0;
  rendreMer();
}

function fermerMiseEnRoute() {
  document.getElementById('mer')?.remove();
  document.body.style.overflow = '';
}

function merCadre(contenu, { suivant = 'Continuer', retour = true } = {}) {
  const i = MER.etape;
  return `<div class="mer-carte">
    <div class="mer-haut">
      <div class="mer-marque">Trim<span>Sync</span></div>
      <div class="mer-etapes">${MER_ETAPES.map((t, k) => `<span class="${k < i ? 'fait' : k === i ? 'actif' : ''}"></span>`).join('')}</div>
      <div class="mer-compteur">Étape ${i + 1} sur ${MER_ETAPES.length} · ${MER_ETAPES[i]}</div>
    </div>
    <div class="mer-corps">${contenu}</div>
    <div class="cx-erreur" id="mer-erreur" role="alert"></div>
    <div class="mer-actions">
      ${retour && i > 0 ? '<button class="btn btn-ghost" onclick="merRetour()"><i class="ti ti-arrow-left"></i>Retour</button>' : '<span></span>'}
      <button class="btn btn-gold" id="mer-suivant" onclick="merSuivant()">${suivant}<i class="ti ti-arrow-right"></i></button>
    </div>
  </div>`;
}

async function rendreMer() {
  const o = document.getElementById('mer');
  if (!o) return;
  const s = SESSION.salon;
  try {
    if (MER.etape === 0) {
      o.innerHTML = merCadre(`
        <h2>Bienvenue ! On prépare ton salon</h2>
        <p class="mer-intro">Quatre étapes, deux minutes. Ces infos apparaissent sur ta page de réservation et dans les confirmations envoyées à tes clients.</p>
        <label class="mer-champ"><span>Nom du salon</span><input class="input" id="mer-nom" value="${esc(s.nom)}" maxlength="80" required></label>
        <label class="mer-champ"><span>Téléphone</span><input class="input" id="mer-tel" type="tel" inputmode="tel" value="${esc(s.telephone || '')}" placeholder="06 12 34 56 78" required></label>
        <label class="mer-champ"><span>Adresse <em>(facultatif si tu te déplaces)</em></span><input class="input" id="mer-adresse" value="${esc(s.adresse || '')}" maxlength="160" placeholder="12 rue de la République"></label>
        <label class="mer-champ"><span>Ville</span><input class="input" id="mer-ville" value="${esc(s.ville || '')}" maxlength="60"></label>`, { retour: false });
    } else if (MER.etape === 1) {
      if (!MER.prestations.length) MER.prestations = (await api('GET', '/api/prestations')).prestations.filter(p => p.actif !== false);
      const ligne = (p, k) => `<div class="mer-presta" data-k="${k}">
        <input class="input" data-champ="nom" value="${esc(p.nom)}" maxlength="60" aria-label="Nom de la prestation">
        <select class="input" data-champ="duree_min" aria-label="Durée">${MER_DUREES.concat(MER_DUREES.includes(p.duree_min) ? [] : [p.duree_min])
          .sort((a, b) => a - b).map(d => `<option value="${d}" ${d === p.duree_min ? 'selected' : ''}>${d} min</option>`).join('')}</select>
        <div class="mer-prix"><input class="input" data-champ="prix" type="number" min="0" step="1" value="${Math.round(p.prix)}" aria-label="Prix"><span>€</span></div>
        <button class="btn btn-ghost btn-sm" onclick="merRetirerPresta(${k})" aria-label="Retirer"><i class="ti ti-trash"></i></button>
      </div>`;
      o.innerHTML = merCadre(`
        <h2>Tes prestations</h2>
        <p class="mer-intro">C'est ce que tes clients choisissent en réservant. Ajuste les noms, durées et prix à ta carte.</p>
        <div class="mer-prestas">${MER.prestations.map(ligne).join('') || '<div class="ts-vide">Aucune prestation pour l\'instant.</div>'}</div>
        <button class="btn btn-out btn-sm" onclick="merAjouterPresta()"><i class="ti ti-plus"></i>Ajouter une prestation</button>`);
    } else if (MER.etape === 2) {
      if (!MER.semaine.length) {
        const parJour = Object.fromEntries((await api('GET', '/api/horaires')).semaine.map(j => [j.jour, j]));
        MER.semaine = JOURS_ORDRE.map(jour => ({ jour, ouvert: !!parJour[jour], ouverture: parJour[jour]?.ouverture || '09:00', fermeture: parJour[jour]?.fermeture || '19:00' }));
      }
      o.innerHTML = merCadre(`
        <h2>Tes horaires</h2>
        <p class="mer-intro">Ta page ne propose que ces heures. Tu pourras ajouter une pause et des fermetures plus tard, dans « Disponibilités ».</p>
        <div class="mer-jours">${MER.semaine.map((j, k) => `<div class="mer-jour${j.ouvert ? '' : ' ferme'}" data-k="${k}">
          <label class="switch"><input type="checkbox" ${j.ouvert ? 'checked' : ''} onchange="merBasculerJour(${k}, this.checked)"><span class="slider"></span></label>
          <span class="mer-jour-nom">${JOURS_NOMS[j.jour]}</span>
          <input class="input" type="time" step="900" data-champ="ouverture" value="${j.ouverture}" ${j.ouvert ? '' : 'disabled'} aria-label="Ouverture">
          <span class="ts-a">à</span>
          <input class="input" type="time" step="900" data-champ="fermeture" value="${j.fermeture}" ${j.ouvert ? '' : 'disabled'} aria-label="Fermeture">
        </div>`).join('')}</div>`);
    } else {
      o.innerHTML = merCadre(`
        <h2>Ta page de réservation est prête</h2>
        <p class="mer-intro">Voici ton lien. Mets-le dans ta bio Instagram : tes clients réservent seuls, tu reçois chaque rendez-vous.</p>
        <div class="mer-lien"><strong>${esc(s.lien_public.replace(/^https:\/\//, ''))}</strong>
          <div class="ts-boutons"><button class="btn btn-gold btn-sm" onclick="merCopierLien()"><i class="ti ti-copy"></i>Copier le lien</button>
          <a class="btn btn-out btn-sm" href="${esc(s.lien_public)}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i>Voir ma page</a></div></div>
        <ol class="mer-insta">
          <li>Ouvre Instagram, va sur ton profil</li>
          <li>Touche <strong>Modifier le profil</strong>, puis <strong>Liens</strong></li>
          <li><strong>Ajouter un lien externe</strong> : colle ton lien, titre « Réserver »</li>
        </ol>`, { suivant: 'Terminer' });
    }
    o.scrollTop = 0;
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

function merErreur(msg) { const el = document.getElementById('mer-erreur'); if (el) el.textContent = msg || ''; }

function merLirePrestas() {
  document.querySelectorAll('.mer-presta').forEach(l => {
    const p = MER.prestations[Number(l.dataset.k)];
    p.nom = l.querySelector('[data-champ=nom]').value.trim();
    p.duree_min = Number(l.querySelector('[data-champ=duree_min]').value);
    p.prix = Number(l.querySelector('[data-champ=prix]').value);
  });
}
function merLireJours() {
  document.querySelectorAll('.mer-jour').forEach(l => {
    const j = MER.semaine[Number(l.dataset.k)];
    j.ouverture = l.querySelector('[data-champ=ouverture]').value;
    j.fermeture = l.querySelector('[data-champ=fermeture]').value;
  });
}
function merAjouterPresta() {
  merLirePrestas();
  MER.prestations.push({ nouveau: true, nom: '', duree_min: 30, prix: 20 });
  rendreMer().then(() => document.querySelector('.mer-presta:last-child [data-champ=nom]')?.focus());
}
function merRetirerPresta(k) {
  merLirePrestas();
  const [p] = MER.prestations.splice(k, 1);
  if (!p.nouveau) (MER.retirees = MER.retirees || []).push(p.id);
  rendreMer();
}
function merBasculerJour(k, ouvert) { merLireJours(); MER.semaine[k].ouvert = ouvert; rendreMer(); }
function merRetour() {
  if (MER.etape === 1) merLirePrestas();
  if (MER.etape === 2) merLireJours();
  MER.etape = Math.max(0, MER.etape - 1);
  rendreMer();
}
async function merCopierLien() {
  try { await navigator.clipboard.writeText(SESSION.salon.lien_public); toast('Lien copié : colle-le dans ta bio Instagram ✓', 'success'); }
  catch (_) { toast(SESSION.salon.lien_public, ''); }
  marquerEtape('lien');
}

async function merSuivant() {
  const bouton = document.getElementById('mer-suivant');
  merErreur('');
  bouton.disabled = true;
  try {
    if (MER.etape === 0) {
      const nom = valeur('mer-nom'), telephone = valeur('mer-tel');
      if (!nom) throw new Error('Donne un nom à ton salon');
      if (telephone.replace(/\D/g, '').length < 9) throw new Error('Ajoute un numéro de téléphone : tes clients en ont besoin pour te joindre');
      const r = await api('PATCH', '/api/salon', { nom, telephone, adresse: valeur('mer-adresse'), ville: valeur('mer-ville') });
      SESSION.salon = r.salon;
      afficherSalon();
    } else if (MER.etape === 1) {
      merLirePrestas();
      if (!MER.prestations.length) throw new Error('Ajoute au moins une prestation');
      if (MER.prestations.some(p => !p.nom)) throw new Error('Chaque prestation a besoin d\'un nom');
      for (const id of MER.retirees || []) await api('PATCH', '/api/prestations/' + id, { actif: false });
      MER.retirees = [];
      for (const p of MER.prestations) {
        const corps = { nom: p.nom, duree_min: p.duree_min, prix: p.prix };
        if (p.nouveau) { Object.assign(p, (await api('POST', '/api/prestations', corps)).prestation); delete p.nouveau; }
        else await api('PATCH', '/api/prestations/' + p.id, corps);
      }
      marquerEtape('prestations');
    } else if (MER.etape === 2) {
      merLireJours();
      const ouverts = MER.semaine.filter(j => j.ouvert);
      if (!ouverts.length) throw new Error('Ouvre au moins un jour');
      await api('PUT', '/api/horaires', { semaine: ouverts.map(({ jour, ouverture, fermeture }) => ({ jour, ouverture, fermeture })) });
      marquerEtape('horaires');
    } else {
      const r = await api('POST', '/api/salon/mise-en-route');
      SESSION.salon = r.salon;
      marquerEtape('lien');
      fermerMiseEnRoute();
      toast('Ton salon est prêt ✓ Partage ton lien pour recevoir tes premiers rendez-vous.', 'success');
      if (typeof chargerReglages === 'function') chargerReglages().catch(() => {});
      nav('dashboard');
      return;
    }
    MER.etape++;
    rendreMer();
  } catch (e) {
    merErreur(messageErreur(e));
    bouton.disabled = false;
  }
}
