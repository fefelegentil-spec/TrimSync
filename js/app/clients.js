/* ── Clients ──
   Liste reprise du dashboard FCUTZ (.client-row) : initiales, visites,
   dépense. Visites et dépense viennent du serveur (jours de venue réels). */

let cliTri = 'depense';
let cliFiche = null;

async function renderClients() {
  const page = document.getElementById('page-clients');
  if (!page.dataset.pret) {
    page.dataset.pret = '1';
    page.innerHTML = `<div class="card">
      <div class="search-wrap cli-search"><i class="ti ti-search"></i>
        <input class="input" id="cli-search" type="search" placeholder="Rechercher un nom ou un numéro…" oninput="afficherClients()"></div>
      <div class="cli-barre">
        <div class="tabs cli-tri">
          <div class="tab" data-tri="depense" onclick="cliSetTri('depense')">Dépenses</div>
          <div class="tab" data-tri="visites" onclick="cliSetTri('visites')">Visites</div>
          <div class="tab" data-tri="recent" onclick="cliSetTri('recent')">Récents</div>
        </div>
        <button class="btn btn-out btn-sm cli-nouveau" onclick="ouvrirNouveauClient()"><i class="ti ti-user-plus"></i>Nouveau</button>
      </div>
      <div id="clients-list"></div>
    </div>`;
  }
  try { await chargerClients(); } catch (e) { toast(messageErreur(e), 'danger'); return; }
  afficherClients();
}

function cliSetTri(t) { cliTri = t; afficherClients(); }

function initiales(nom) { return String(nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join('').toUpperCase(); }

function afficherClients() {
  document.querySelectorAll('.cli-tri .tab').forEach(t => t.classList.toggle('active', t.dataset.tri === cliTri));
  const q = (document.getElementById('cli-search').value || '').trim().toLowerCase();
  const liste = DB.clients
    .filter(c => !q || c.nom.toLowerCase().includes(q) || (c.telephone || '').includes(q.replace(/\s/g, '')))
    .sort((a, b) => cliTri === 'visites' ? b.visites - a.visites
      : cliTri === 'recent' ? String(b.derniere_venue || '').localeCompare(String(a.derniere_venue || ''))
      : b.depense - a.depense);
  document.getElementById('clients-list').innerHTML = liste.length
    ? liste.map(c => `<div class="client-row" onclick="ouvrirFiche('${esc(c.id)}')">
        <div class="client-av">${esc(initiales(c.nom))}</div>
        <div class="client-info">
          <div class="client-name"><span class="client-nom">${esc(c.nom)}</span></div>
          <div class="client-meta">${c.visites} visite${c.visites !== 1 ? 's' : ''}${c.telephone ? ' · ' + esc(c.telephone) : ''}${c.notes ? ' · <i class="ti ti-notes"></i> ' + esc(c.notes) : ''}</div>
        </div>
        <div class="client-amount">${fmtMoney(c.depense)}</div>
      </div>`).join('')
    : `<div class="ts-vide">${q ? 'Aucun client ne correspond.' : 'Tes clients apparaîtront ici dès leur première réservation.'}</div>`;
}

function ouvrirNouveauClient() {
  cliFiche = null;
  document.getElementById('cli-titre').textContent = 'Nouveau client';
  ['cli-nom', 'cli-tel', 'cli-email', 'cli-notes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('cli-stats').innerHTML = '';
  document.getElementById('cli-historique').innerHTML = '';
  document.getElementById('cli-contact').classList.add('hidden');
  openModal('modal-client');
}

async function ouvrirFiche(id) {
  let r;
  try { r = await api('GET', '/api/clients/' + id); } catch (e) { toast(messageErreur(e), 'danger'); return; }
  const c = r.client;
  cliFiche = c.id;
  document.getElementById('cli-titre').textContent = c.nom;
  document.getElementById('cli-nom').value = c.nom;
  document.getElementById('cli-tel').value = c.telephone || '';
  document.getElementById('cli-email').value = c.email || '';
  document.getElementById('cli-notes').value = c.notes || '';
  document.getElementById('cli-stats').innerHTML = `
    <div><strong>${c.visites}</strong><span>visite${c.visites !== 1 ? 's' : ''}</span></div>
    <div><strong>${fmtMoney(c.depense)}</strong><span>dépensés</span></div>
    <div><strong>${esc(c.habituelle || '—')}</strong><span>habituellement</span></div>
    <div><strong>${c.derniere_venue ? esc(new Date(c.derniere_venue + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) : '—'}</strong><span>dernière venue</span></div>`;
  const statut = { confirme: '', annule: ' <em>annulé</em>', noshow: ' <em>absent</em>' };
  document.getElementById('cli-historique').innerHTML = r.historique.length
    ? r.historique.map(h => `<div class="ts-ligne${h.statut !== 'confirme' ? ' barre' : ''}">
        <i class="ti ti-scissors"></i>
        <div class="ts-ligne-txt"><strong>${esc(new Date(h.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }))} · ${h.heure}</strong>
          <span>${esc(h.prestation_nom)} · ${fmtMoney(h.prix)}${statut[h.statut] || ''}${h.note ? ' · ' + esc(h.note) : ''}</span></div>
      </div>`).join('')
    : '<div class="ts-vide">Aucun rendez-vous pour l\'instant.</div>';
  const contact = document.getElementById('cli-contact');
  if (c.telephone) {
    document.getElementById('cli-appel').href = 'tel:' + c.telephone;
    document.getElementById('cli-sms').href = 'sms:' + c.telephone;
    contact.classList.remove('hidden');
  } else contact.classList.add('hidden');
  openModal('modal-client');
}

async function enregistrerClient() {
  const corps = {
    nom: document.getElementById('cli-nom').value.trim(),
    telephone: document.getElementById('cli-tel').value.trim(),
    email: document.getElementById('cli-email').value.trim(),
    notes: document.getElementById('cli-notes').value.trim(),
  };
  if (!corps.nom) { toast('Indique le nom du client', 'warning'); return; }
  try {
    if (cliFiche) await api('PATCH', '/api/clients/' + cliFiche, corps);
    else await api('POST', '/api/clients', corps);
    toast('Client enregistré ✓', 'success');
    closeModal('modal-client');
    renderClients();
  } catch (e) { toast(messageErreur(e), 'danger'); }
}

// Depuis la fiche : un RDV pour ce client, pré-rempli.
function rdvPourClient() {
  const c = DB.clients.find(x => x.id === cliFiche);
  closeModal('modal-client');
  resetRdvModal();
  if (c) {
    document.getElementById('rdv-client').value = c.nom;
    document.getElementById('rdv-client-id').value = c.id;
    document.getElementById('rdv-phone').value = c.telephone || '';
  }
  openModal('modal-rdv-new');
}

PAGES.clients = { titre: 'Clients', sous: 'Tes clients, leurs visites et leurs habitudes', rendu: renderClients };
