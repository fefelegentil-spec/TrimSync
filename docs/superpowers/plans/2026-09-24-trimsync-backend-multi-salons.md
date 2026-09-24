# TrimSync — Backend multi-salons (plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à TrimSync une API multi-salons : inscription, essai de 30 jours, prestations, horaires, agenda, clients, liste d'attente, page de réservation publique, notifications et back-office de Félix.

**Architecture:** Le backend existant `trimsync/backend/server.js` (devis + chat) devient un point d'entrée qui monte des routeurs Express, un par domaine (`routes/*.js`), sur des modules sans état (`lib/*.js`). Base Postgres unique ; chaque table métier porte `salon_id`, et le salon d'une requête vient toujours du jeton, jamais du corps. Sans `DATABASE_URL`, le serveur démarre quand même (devis et chat restent en ligne) et les routes produit répondent 503.

**Tech Stack:** Node ≥ 18, Express 4, `pg`, `web-push`, `resend`, `node:test` pour le moteur de créneaux, un script de scénarios HTTP (`test-scenarios.mjs`) contre un serveur réel et un Postgres jetable, GitHub Actions.

Spec : `docs/superpowers/specs/2026-09-24-trimsync-inscription-dashboard-design.md`.
Plan B (écrans : dashboard, page publique, landing, back-office) viendra ensuite.

---

## Carte des fichiers

```
backend/
  server.js                 point d'entrée : CORS, devis, chat, montage des routeurs, démarrage
  package.json              + pg, web-push ; scripts test
  README.md                 commandes locales
  lib/db.js                 pool, uid(), schéma idempotent, transaction()
  lib/dates.js              nowParis, creneauPasse, decaleJours, estDate, estHeure, jourLisible
  lib/telephone.js          normalizePhone, telValide, telAStocker (copie de FCUTZ)
  lib/texte.js              sanitizeText, escHtml, normaliserNom, slugifier
  lib/http.js               erreurServeur, ipDe, quota()
  lib/dispo.js              moteur de créneaux pur (creneaux, chevauche)
  lib/dispo.test.js         tests unitaires du moteur
  lib/auth.js               scrypt, jetons HMAC, exigerCompte, exigerAdmin, exigerEcriture
  lib/jetons.js             jetons à usage unique (vérification, reset), stockés hachés
  lib/salon.js              statutEffectif, reservable, vueSalon, PRIX_PLANS
  lib/slug.js               slugLibre
  lib/boite.js              boîte d'envoi en mémoire, seulement en mode test
  lib/emails.js             envois Resend
  lib/push.js               notifierSalon (web-push)
  lib/contexte.js           contexteDispo : horaires + fermetures + RDV d'une période
  lib/clients.js            trouverOuCreerClient (nom ET téléphone)
  lib/notifs.js             signalerPlaceLibre
  lib/taches.js             fin d'essai et rappels J-7 / J-1
  routes/comptes.js         inscription, connexion, /api/moi, vérification, mot de passe
  routes/salon.js           profil, slug, demande de bot, suppression
  routes/push.js            abonnements push du barbier
  routes/prestations.js
  routes/horaires.js        horaires de la semaine + fermetures
  routes/rdv.js             agenda du barbier
  routes/clients.js
  routes/attente.js
  routes/public.js          page publique : salon, jours, dispo, réserver, annuler, attente
  routes/admin.js           back-office de Félix
  routes/test.js            GET /api/test/boite (monté seulement si TRIMSYNC_TEST=1)
  test-scenarios.mjs        scénarios T1…T12
.github/workflows/tests.yml
```

## Lancer les tests en local

Base jetable (le Postgres local de FCUTZ sert, sur une base à part) :

```bash
cd backend
node -e "const {Client}=require('pg');const c=new Client({connectionString:'postgres://postgres:MDP@localhost:5432/postgres'});c.connect().then(()=>c.query('DROP DATABASE IF EXISTS trimsync_test')).then(()=>c.query('CREATE DATABASE trimsync_test')).then(()=>c.end())"
```

Serveur de test (dans un terminal à part) :

```bash
DATABASE_URL=postgres://postgres:MDP@localhost:5432/trimsync_test TRIMSYNC_SECRET=test ADMIN_PASSWORD=test TRIMSYNC_TEST=1 QUOTA_FACTEUR=100 PORT=3998 node server.js
```

Scénarios : `API=http://localhost:3998 ADMIN_PASSWORD=test node test-scenarios.mjs`.
Les emails et salons sont suffixés par l'horodatage du lancement : la suite se
rejoue sur la même base.

---

### Task 1: Base de données et squelette du serveur

**Files:**
- Modify: `backend/package.json`
- Create: `backend/lib/db.js`
- Modify: `backend/server.js` (réécrit : les routes devis et chat sont conservées à l'identique, sauf l'instanciation de Resend)

- [ ] **Step 1: Ajouter les dépendances**

```bash
cd backend && npm install pg@^8.11.3 web-push@^3.6.7
```

Puis dans `package.json`, remplacer `"scripts"` par :

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node --test lib/dispo.test.js",
    "test:scenarios": "node test-scenarios.mjs"
  },
```

- [ ] **Step 2: Écrire `lib/db.js`**

```js
/* ── Base Postgres : pool partagé, identifiants, schéma idempotent ── */
const crypto = require('crypto');
const { Pool, types } = require('pg');

// NUMERIC et COUNT(*) arrivent en texte par défaut : on les veut en nombres.
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

// Ids non devinables : l'id d'un objet ne doit jamais servir à deviner le suivant.
function uid(prefixe) {
  return prefixe + Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
}

// Dates en TEXT 'YYYY-MM-DD' et heures en TEXT 'HH:MM', comme dans FCUTZ :
// aucun fuseau horaire ne vient décaler un jour à la lecture.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS salons (
     id TEXT PRIMARY KEY,
     slug TEXT UNIQUE NOT NULL,
     nom TEXT NOT NULL,
     ville TEXT NOT NULL DEFAULT '',
     telephone TEXT NOT NULL DEFAULT '',
     adresse TEXT NOT NULL DEFAULT '',
     statut TEXT NOT NULL DEFAULT 'essai' CHECK (statut IN ('essai','actif','expire','suspendu')),
     essai_fin TEXT NOT NULL,
     plan TEXT CHECK (plan IN ('starter','pro','max')),
     bot_statut TEXT NOT NULL DEFAULT 'inactif' CHECK (bot_statut IN ('inactif','demande','actif')),
     rappel_j7_le TIMESTAMPTZ,
     rappel_j1_le TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS comptes (
     id TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     email TEXT UNIQUE NOT NULL,
     mdp_hash TEXT NOT NULL,
     email_verifie_le TIMESTAMPTZ,
     derniere_connexion_le TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS jetons (
     hash TEXT PRIMARY KEY,
     compte_id TEXT NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
     type TEXT NOT NULL CHECK (type IN ('verification','reset')),
     expire_le TIMESTAMPTZ NOT NULL,
     utilise_le TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS prestations (
     id TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     nom TEXT NOT NULL,
     duree_min INT NOT NULL,
     prix NUMERIC(10,2) NOT NULL,
     actif BOOLEAN NOT NULL DEFAULT TRUE,
     ordre INT NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS horaires (
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     jour INT NOT NULL CHECK (jour BETWEEN 0 AND 6),
     ouverture TEXT NOT NULL,
     fermeture TEXT NOT NULL,
     pause_debut TEXT,
     pause_fin TEXT,
     PRIMARY KEY (salon_id, jour))`,
  `CREATE TABLE IF NOT EXISTS fermetures (
     id TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     debut TEXT,
     fin TEXT,
     motif TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS clients (
     id TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     nom TEXT NOT NULL,
     telephone TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS rdv (
     id TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
     client_nom TEXT NOT NULL,
     telephone TEXT NOT NULL DEFAULT '',
     prestation_id TEXT,
     prestation_nom TEXT NOT NULL,
     prix NUMERIC(10,2) NOT NULL DEFAULT 0,
     duree_min INT NOT NULL,
     date TEXT NOT NULL,
     heure TEXT NOT NULL,
     statut TEXT NOT NULL DEFAULT 'confirme' CHECK (statut IN ('confirme','annule','noshow')),
     source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('site','dashboard','instagram')),
     jeton_annulation TEXT UNIQUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS attente (
     id TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     nom TEXT NOT NULL,
     telephone TEXT NOT NULL,
     prevenu_le TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS push_abonnements (
     endpoint TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     compte_id TEXT NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
     cles JSONB NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS rdv_salon_date ON rdv (salon_id, date)`,
  `CREATE INDEX IF NOT EXISTS clients_salon ON clients (salon_id)`,
  `CREATE INDEX IF NOT EXISTS attente_salon_date ON attente (salon_id, date)`,
];

async function initDB() {
  for (const sql of SCHEMA) await pool.query(sql);
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await fn(client);
    await client.query('COMMIT');
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, uid, initDB, transaction };
```

- [ ] **Step 3: Réécrire `server.js`**

Tout le contenu de `server.js` est remplacé par ce qui suit. Les corps des
routes `/api/devis` et `/api/chat` ne changent pas, à deux détails près : le
client Resend vient de `lib/emails.js` (créé en Task 4 ; en attendant, la
constante `emails` est protégée par un `try`), et `escHtml` vient de
`lib/texte.js` (Task 2).

```js
/* ── TrimSync Backend ──
   Devis et chat de la landing, et l'API multi-salons (comptes, agenda, page
   de réservation publique, back-office). Sans DATABASE_URL, seules les routes
   de la landing tournent : un Postgres pas encore branché ne doit pas couper
   le formulaire de devis. */
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { pool, initDB } = require('./lib/db');
const { escHtml } = require('./lib/texte');
const emails  = require('./lib/emails');

const app   = express();
const PORT  = process.env.PORT || 3001;
const ADMIN = process.env.ADMIN_EMAIL || 'felix@trimsync.tech';

const ORIGINES = (process.env.CORS_ORIGINES || 'https://trimsync.tech,https://www.trimsync.tech')
  .split(',').map(s => s.trim()).filter(Boolean);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.set('trust proxy', 1);
app.use(cors({
  origin(origine, cb) {
    if (!origine || ORIGINES.includes(origine)) return cb(null, true);
    if (process.env.NODE_ENV !== 'production' && LOCAL.test(origine)) return cb(null, true);
    cb(null, false);
  },
}));
app.use(express.json({ limit: '100kb' }));

/* ── Santé ── */
app.get('/', (_req, res) => res.json({ ok: true, service: 'trimsync-backend' }));
app.get('/api/ping', (_req, res) => res.json({
  ok: true,
  version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'local').slice(0, 7),
  base: !!pool,
}));

/* ── POST /api/devis ── (corps inchangé, sauf `const resend = emails.client();`
   en tête et un 503 si Resend n'est pas configuré) */
app.post('/api/devis', async (req, res) => {
  const resend = emails.client();
  if (!resend) return res.status(503).json({ ok: false, error: 'Email non configuré.' });
  // … reste du corps actuel, inchangé …
});

/* ── POST /api/chat ── (inchangé) */

/* ── API multi-salons ── */
const ROUTEURS = ['comptes', 'salon', 'push', 'prestations', 'horaires', 'rdv', 'clients', 'attente', 'public', 'admin'];
if (pool) {
  for (const nom of ROUTEURS) app.use(require('./routes/' + nom));
  if (process.env.TRIMSYNC_TEST === '1') app.use(require('./routes/test'));
} else {
  app.use(['/api/comptes', '/api/moi', '/api/salon', '/api/push', '/api/prestations', '/api/horaires',
    '/api/fermetures', '/api/rdv', '/api/clients', '/api/attente', '/api/public', '/api/admin'],
    (_req, res) => res.status(503).json({ error: 'Base de données non configurée' }));
}

async function demarrer() {
  if (pool) {
    await initDB();
    require('./lib/taches').demarrerTaches();
  } else {
    console.warn('⚠️  DATABASE_URL absent : seules les routes de la landing sont actives');
  }
  app.listen(PORT, () => console.log(`TrimSync backend — port ${PORT}`));
}
demarrer().catch(e => { console.error('Démarrage impossible :', e); process.exit(1); });
```

Pour ne pas bloquer le démarrage avant les tâches suivantes, créer dès
maintenant des routeurs vides (`module.exports = require('express').Router();`)
pour chaque nom de `ROUTEURS` et pour `routes/test.js`, ainsi que
`lib/taches.js` avec `module.exports = { demarrerTaches() {} };`. Chaque tâche
suivante remplace son fichier. `lib/texte.js` et `lib/emails.js` arrivent aux
Tasks 2 et 4 : les créer aussi en version minimale (`escHtml` recopiée de
l'ancien `server.js`, et `client()` qui renvoie `null` sans `RESEND_API_KEY`,
sinon `new Resend(clé)` mis en cache).

- [ ] **Step 4: Démarrer et vérifier**

Créer la base de test (voir « Lancer les tests en local »), démarrer le serveur, puis :

```bash
curl -s localhost:3998/api/ping
```

Attendu : `{"ok":true,"version":"local","base":true}`. Sans `DATABASE_URL` :
`"base":false` et `curl -s localhost:3998/api/moi` → 503.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/lib backend/routes backend/server.js
git commit -m "feat(backend): base Postgres et squelette multi-salons"
```

---

### Task 2: Utilitaires partagés

**Files:**
- Create: `backend/lib/dates.js`, `backend/lib/telephone.js`, `backend/lib/texte.js`, `backend/lib/http.js`

- [ ] **Step 1: `lib/dates.js`** (repris de `github/server.js`, `nowParis` / `creneauPasse` / `decaleJours`)

```js
/* ── Dates en heure de Paris ──
   Le serveur tourne en UTC : « +2 h » n'est vrai que la moitié de l'année. */
function nowParis(d = new Date()) {
  const f = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const p = {};
  for (const { type, value } of f) p[type] = value;
  const heure = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${heure}:${p.minute}` };
}

// Une heure qui commence maintenant compte comme passée.
function creneauPasse(date, heure, maintenant = nowParis()) {
  return date < maintenant.date || (date === maintenant.date && String(heure) <= maintenant.time);
}

// Arithmétique à midi UTC : insensible aux changements d'heure.
function decaleJours(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function estDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function estHeure(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
}

function jourLisible(ymd) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

module.exports = { nowParis, creneauPasse, decaleJours, estDate, estHeure, jourLisible };
```

- [ ] **Step 2: `lib/telephone.js`** (copie conforme de `github/server.js:43-67`)

```js
/* ── Numéros de téléphone ──
   Copie de normalizePhone() de FCUTZ : même règle partout, sinon deux fiches
   ne se rapprochent plus. Ce qui n'est ni un numéro français ni un numéro
   étranger complet n'est jamais réécrit. */
function normalizePhone(p) {
  if (!p) return '';
  const brut = String(p).trim();
  const international = /^(\+|00\d)/.test(brut);
  let d = brut.replace(/\D+/g, '');
  if (!d) return '';
  if (d.startsWith('0033')) d = d.slice(4);
  else if (d.startsWith('33') && d.length > 10) d = d.slice(2);
  if (d.length > 10 && /^0+0[1-9]\d{8}$/.test(d)) d = d.slice(d.length - 10);
  if (d.length === 9 && d[0] !== '0') d = '0' + d;
  if (/^0[1-9]\d{8}$/.test(d)) return d;
  if (international && d.length > 6) return '+' + d.replace(/^00/, '');
  return d;
}

function telValide(p) { return /^0[1-9]\d{8}$/.test(p || ''); }

// Forme normalisée si elle est composable, texte saisi sinon.
function telAStocker(p) {
  const n = normalizePhone(p || '');
  return (telValide(n) || (n[0] === '+' && n.length >= 8)) ? n : String(p || '').trim();
}

function telComposable(p) {
  const n = normalizePhone(p || '');
  return telValide(n) || (n[0] === '+' && n.length >= 8);
}

module.exports = { normalizePhone, telValide, telAStocker, telComposable };
```

- [ ] **Step 3: `lib/texte.js`**

```js
/* ── Texte saisi par les utilisateurs ── */
function sanitizeText(s, max = 200) {
  return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, max);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const sansAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Pour comparer deux noms : « Élie  MARTIN » = « elie martin ».
function normaliserNom(s) {
  return sansAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function slugifier(s) {
  return sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'salon';
}

module.exports = { sanitizeText, escHtml, normaliserNom, slugifier };
```

- [ ] **Step 4: `lib/http.js`**

```js
/* ── Réponses d'erreur et quotas anti-abus ── */
function erreurServeur(res, e, contexte = '') {
  console.error('❌', contexte || 'erreur serveur', ':', e && e.stack ? e.stack : e);
  const detail = process.env.NODE_ENV === 'production' ? undefined : (e && e.message);
  return res.status(500).json({ error: 'Erreur serveur', ...(detail ? { detail } : {}) });
}

function ipDe(req) {
  return req.ip || req.socket?.remoteAddress || 'inconnue';
}

// Un seau par usage : dans FCUTZ, lectures et annulations partageaient le même,
// et quelques ouvertures du site suffisaient à bloquer l'annulation.
// QUOTA_FACTEUR élargit tous les seaux (tests).
function quota(max, fenetreMs) {
  const plafond = max * (Number(process.env.QUOTA_FACTEUR) || 1);
  const seaux = new Map();
  return (req, res, next) => {
    const maintenant = Date.now();
    if (seaux.size > 5000) {
      for (const [cle, s] of seaux) if (maintenant - s.debut > fenetreMs) seaux.delete(cle);
    }
    const ip = ipDe(req);
    let s = seaux.get(ip);
    if (!s || maintenant - s.debut > fenetreMs) { s = { n: 0, debut: maintenant }; seaux.set(ip, s); }
    if (++s.n > plafond) return res.status(429).json({ error: 'Trop de demandes, réessaie dans quelques minutes.' });
    next();
  };
}

module.exports = { erreurServeur, ipDe, quota };
```

- [ ] **Step 5: Vérifier**

```bash
cd backend && node -e "const t=require('./lib/telephone');const d=require('./lib/dates');const x=require('./lib/texte');console.log(t.normalizePhone('+33 6 22 33 44 55'), d.decaleJours('2026-03-28',2), d.estDate('2026-02-30'), x.slugifier('Barber Élite — Lyon'))"
```

Attendu : `0622334455 2026-03-30 false barber-elite-lyon`

- [ ] **Step 6: Commit**

```bash
git add backend/lib && git commit -m "feat(backend): utilitaires dates, téléphone, texte, quotas"
```

---

### Task 3: Moteur de créneaux (TDD)

**Files:**
- Create: `backend/lib/dispo.test.js`
- Create: `backend/lib/dispo.js`

- [ ] **Step 1: Écrire les tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { creneaux, chevauche } = require('./dispo');

// 2026-10-06 est un mardi (jour 2).
const MARDI = '2026-10-06';
const H = [{ jour: 2, ouverture: '09:00', fermeture: '10:00', pause_debut: null, pause_fin: null }];
const base = { horaires: H, fermetures: [], rdv: [], duree: 30, date: MARDI, maintenant: null };

test('jour sans horaires : aucun créneau', () => {
  assert.deepEqual(creneaux({ ...base, date: '2026-10-05' }), []);
});

test('pas de 15 min, la prestation doit tenir avant la fermeture', () => {
  assert.deepEqual(creneaux(base), ['09:00', '09:15', '09:30']);
});

test('une prestation plus longue finit plus tôt', () => {
  assert.deepEqual(creneaux({ ...base, duree: 45 }), ['09:00', '09:15']);
});

test('la pause est exclue, bord à bord autorisé', () => {
  const h = [{ jour: 2, ouverture: '09:00', fermeture: '11:00', pause_debut: '09:30', pause_fin: '10:00' }];
  assert.deepEqual(creneaux({ ...base, horaires: h }), ['09:00', '10:00', '10:15', '10:30']);
});

test('fermeture à la journée', () => {
  assert.deepEqual(creneaux({ ...base, fermetures: [{ date: MARDI, debut: null, fin: null }] }), []);
});

test('fermeture en plage', () => {
  const f = [{ date: MARDI, debut: '09:15', fin: '09:30' }];
  assert.deepEqual(creneaux({ ...base, fermetures: f }), ['09:30']);
});

test("une fermeture d'un autre jour ne compte pas", () => {
  assert.deepEqual(creneaux({ ...base, fermetures: [{ date: '2026-10-07', debut: null, fin: null }] }).length, 3);
});

test('un rdv confirmé bloque, annulé et no-show libèrent', () => {
  const rdv = s => [{ id: 'r1', date: MARDI, heure: '09:00', duree_min: 30, statut: s }];
  assert.deepEqual(creneaux({ ...base, rdv: rdv('confirme') }), ['09:30']);
  assert.deepEqual(creneaux({ ...base, rdv: rdv('annule') }).length, 3);
  assert.deepEqual(creneaux({ ...base, rdv: rdv('noshow') }).length, 3);
});

test('une heure déjà arrivée ne se propose plus', () => {
  assert.deepEqual(creneaux({ ...base, maintenant: { date: MARDI, time: '09:15' } }), ['09:30']);
  assert.deepEqual(creneaux({ ...base, maintenant: { date: '2026-10-07', time: '08:00' } }), []);
});

test('chevauche : ignore le rdv lui-même et les annulés', () => {
  const rdv = [
    { id: 'r1', date: MARDI, heure: '09:00', duree_min: 30, statut: 'confirme' },
    { id: 'r2', date: MARDI, heure: '10:00', duree_min: 30, statut: 'annule' },
  ];
  assert.equal(chevauche(rdv, MARDI, '09:15', 30), true);
  assert.equal(chevauche(rdv, MARDI, '09:30', 30), false);
  assert.equal(chevauche(rdv, MARDI, '09:15', 30, 'r1'), false);
  assert.equal(chevauche(rdv, MARDI, '10:00', 30), false);
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && node --test lib/dispo.test.js`
Expected: FAIL — `Cannot find module './dispo'`

- [ ] **Step 3: Écrire `lib/dispo.js`**

```js
/* ── Moteur de créneaux ──
   Fonction pure : ni base ni horloge. Toute règle de disponibilité vit ici,
   la page publique et le futur bot l'appellent au lieu d'en avoir une à eux. */
const PAS_MIN = 15;

const enMinutes = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const enHeure = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const jourSemaine = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();

// Seuls les RDV confirmés occupent l'agenda : annulé et no-show libèrent.
const occupants = (rdv, date) => rdv.filter(r => r.date === date && r.statut === 'confirme');

function creneaux({ horaires, fermetures, rdv, duree, date, maintenant }) {
  const h = horaires.find(x => x.jour === jourSemaine(date));
  if (!h) return [];
  const duJour = fermetures.filter(f => f.date === date);
  if (duJour.some(f => !f.debut)) return [];
  const bloque = [
    ...(h.pause_debut && h.pause_fin ? [[enMinutes(h.pause_debut), enMinutes(h.pause_fin)]] : []),
    ...duJour.map(f => [enMinutes(f.debut), enMinutes(f.fin)]),
    ...occupants(rdv, date).map(r => [enMinutes(r.heure), enMinutes(r.heure) + r.duree_min]),
  ];
  const libres = [];
  for (let t = enMinutes(h.ouverture); t + duree <= enMinutes(h.fermeture); t += PAS_MIN) {
    const heure = enHeure(t);
    if (maintenant && (date < maintenant.date || (date === maintenant.date && heure <= maintenant.time))) continue;
    if (bloque.some(([debut, fin]) => t < fin && t + duree > debut)) continue;
    libres.push(heure);
  }
  return libres;
}

function chevauche(rdv, date, heure, duree, ignorerId) {
  const t = enMinutes(heure);
  return occupants(rdv, date).some(r =>
    r.id !== ignorerId && t < enMinutes(r.heure) + r.duree_min && t + duree > enMinutes(r.heure));
}

module.exports = { creneaux, chevauche, PAS_MIN };
```

- [ ] **Step 4: Lancer les tests**

Run: `cd backend && node --test lib/dispo.test.js`
Expected: `# pass 10`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add backend/lib/dispo.js backend/lib/dispo.test.js
git commit -m "feat(backend): moteur de créneaux et ses tests"
```

---

### Task 4: Comptes — inscription, connexion, session

**Files:**
- Create: `backend/lib/auth.js`, `backend/lib/jetons.js`, `backend/lib/salon.js`, `backend/lib/slug.js`, `backend/lib/boite.js`, `backend/lib/emails.js`
- Replace: `backend/routes/comptes.js`, `backend/routes/test.js`
- Create: `backend/test-scenarios.mjs`

- [ ] **Step 1: Écrire le début de `test-scenarios.mjs` (T1)**

```js
/* ── Scénarios TrimSync ──
   Parcours réels contre un serveur lancé avec TRIMSYNC_TEST=1 et une base
   jetable. Emails et noms de salon sont suffixés par l'horodatage : la suite
   se rejoue sur la même base. */
const API = process.env.API || 'http://localhost:3998';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test';

let echecs = 0, total = 0;
function ok(condition, message, detail) {
  total++;
  if (condition) return console.log('  ✓ ' + message);
  echecs++;
  console.log('  ✗ ' + message + (detail === undefined ? '' : ' → ' + JSON.stringify(detail).slice(0, 400)));
}

async function appel(methode, chemin, corps, jeton) {
  const r = await fetch(API + chemin, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(jeton ? { authorization: 'Bearer ' + jeton } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let d = null;
  try { d = await r.json(); } catch {}
  return { s: r.status, d };
}

const aujourdhuiParis = () => new Intl.DateTimeFormat('fr-CA',
  { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dansJours = n => {
  const d = new Date(aujourdhuiParis() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const boite = async () => (await appel('GET', '/api/test/boite')).d.boite;
async function dernierJeton(a, type) {
  const m = (await boite()).filter(x => x.a === a && x.type === type);
  return m.length ? m[m.length - 1].jeton : null;
}

const RUN = Date.now().toString(36);
const emailA = `a-${RUN}@test.fr`;
const emailB = `b-${RUN}@test.fr`;
const nomSalon = `Salon ${RUN}`;
const SEMAINE = [0, 1, 2, 3, 4, 5, 6].map(jour =>
  ({ jour, ouverture: '09:00', fermeture: '19:00', pause_debut: '12:00', pause_fin: '13:00' }));

async function main() {
  console.log('T1 — inscription et connexion');
  const insA = await appel('POST', '/api/comptes/inscription',
    { email: emailA, mdp: 'motdepasse1', salon: nomSalon, ville: 'Lyon', telephone: '06 12 34 56 78', consentement: true });
  ok(insA.s === 201 && insA.d.jeton, 'inscription A', insA);
  const A = insA.d.jeton;
  const slugA = insA.d.salon.slug;
  ok(insA.d.salon.statut === 'essai' && insA.d.salon.jours_essai_restants === 30, "essai de 30 jours", insA.d.salon);
  ok((await appel('POST', '/api/comptes/inscription',
    { email: emailA.toUpperCase(), mdp: 'motdepasse1', salon: 'X', ville: 'Y', consentement: true })).s === 409,
    'email déjà pris refusé, casse ignorée');
  ok((await appel('POST', '/api/comptes/inscription',
    { email: `c-${RUN}@test.fr`, mdp: 'motdepasse1', salon: 'X', ville: 'Y' })).s === 400, 'sans consentement refusé');
  ok((await appel('POST', '/api/comptes/inscription',
    { email: `d-${RUN}@test.fr`, mdp: 'court', salon: 'X', ville: 'Y', consentement: true })).s === 400, 'mot de passe trop court refusé');
  const insB = await appel('POST', '/api/comptes/inscription',
    { email: emailB, mdp: 'motdepasse2', salon: nomSalon, ville: 'Lyon', telephone: '0611111111', consentement: true });
  ok(insB.s === 201 && insB.d.salon.slug === slugA + '-2', 'slug dédupliqué', [slugA, insB.d.salon?.slug]);
  const B = insB.d.jeton;
  const slugB = insB.d.salon.slug;
  ok((await appel('POST', '/api/comptes/connexion', { email: emailA, mdp: 'motdepasse1' })).s === 200, 'connexion A');
  ok((await appel('POST', '/api/comptes/connexion', { email: emailA, mdp: 'mauvais!!' })).s === 401, 'mauvais mot de passe refusé');
  ok((await appel('POST', '/api/comptes/connexion', { email: 'personne@test.fr', mdp: 'motdepasse1' })).s === 401, 'email inconnu refusé');
  const moi = await appel('GET', '/api/moi', undefined, A);
  ok(moi.s === 200 && moi.d.email === emailA && moi.d.salon.slug === slugA && moi.d.email_verifie === false, '/api/moi', moi);
  ok((await appel('GET', '/api/moi')).s === 401, 'sans jeton refusé');
  ok((await appel('GET', '/api/moi', undefined, A + 'x')).s === 401, 'jeton falsifié refusé');
  ok((await boite()).some(m => m.type === 'verification' && m.a === emailA), 'email de vérification envoyé');

  // SUITE — chaque tâche suivante ajoute sa section ici.

  console.log(`\n${total - echecs}/${total} vérifications passées`);
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run (serveur de test lancé) : `cd backend && API=http://localhost:3998 node test-scenarios.mjs`
Expected: `✗ inscription A` (404), code de sortie 1.

- [ ] **Step 3: `lib/boite.js`**

```js
/* ── Boîte d'envoi de test ──
   Avec TRIMSYNC_TEST=1, chaque email et chaque notification est aussi gardé
   ici, pour que les scénarios lisent un lien de vérification sans vraie
   messagerie. Hors test, rien n'est gardé. */
const boite = [];

function deposer(message) {
  if (process.env.TRIMSYNC_TEST !== '1') return;
  boite.push({ ...message, le: new Date().toISOString() });
  if (boite.length > 500) boite.shift();
}

module.exports = { boite, deposer };
```

- [ ] **Step 4: `lib/emails.js`**

```js
/* ── Emails (Resend) ──
   Un envoi raté ne fait jamais échouer la requête qui l'a déclenché : il est
   noté dans les logs. Sans RESEND_API_KEY, rien ne part. */
const { Resend } = require('resend');
const { deposer } = require('./boite');
const { escHtml } = require('./texte');

let resend = null;
function client() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const SITE = () => process.env.SITE_URL || 'https://trimsync.tech';
const ADMIN = () => process.env.ADMIN_EMAIL || 'felix@trimsync.tech';

function gabarit(titre, paragraphes, bouton) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#222">
    <h2 style="color:#2a9ea3;margin:0 0 16px">${escHtml(titre)}</h2>
    ${paragraphes.map(p => `<p style="line-height:1.6;margin:0 0 12px">${p}</p>`).join('')}
    ${bouton ? `<p style="margin:24px 0"><a href="${escHtml(bouton.url)}" style="background:#2a9ea3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escHtml(bouton.texte)}</a></p>` : ''}
    <p style="color:#999;font-size:12px;margin-top:32px">TrimSync — ta chaise se remplit toute seule.</p>
  </div>`;
}

async function envoyer({ a, sujet, html, type, extra = {} }) {
  deposer({ canal: 'email', a, sujet, type, ...extra });
  const r = client();
  if (!r) { console.log(`[email non envoyé : pas de RESEND_API_KEY] ${type} → ${a}`); return; }
  try {
    await r.emails.send({ from: 'TrimSync <noreply@trimsync.tech>', to: a, subject: sujet, html });
  } catch (e) {
    console.error(`[email] ${type} → ${a} :`, e.message);
  }
}

function verification(a, jeton) {
  const url = `${SITE()}/connexion?verifier=${jeton}`;
  return envoyer({ a, type: 'verification', extra: { jeton }, sujet: 'Confirme ton adresse email',
    html: gabarit('Bienvenue sur TrimSync', ['Confirme ton adresse pour que je puisse te joindre au moment de brancher ton bot Instagram.'], { url, texte: 'Confirmer mon email' }) });
}

function reset(a, jeton) {
  const url = `${SITE()}/connexion?reset=${jeton}`;
  return envoyer({ a, type: 'reset', extra: { jeton }, sujet: 'Nouveau mot de passe',
    html: gabarit('Choisis un nouveau mot de passe', ['Ce lien est valable une heure. Si tu n’as rien demandé, ignore cet email.'], { url, texte: 'Choisir un mot de passe' }) });
}

function rappelEssai(a, salon, jours) {
  const quand = jours === 1 ? 'demain' : `dans ${jours} jours`;
  return envoyer({ a, type: 'rappel-essai', extra: { jours }, sujet: `Ton essai TrimSync se termine ${quand}`,
    html: gabarit(`Ton essai se termine ${quand}`, [
      `Après le ${escHtml(salon.essai_fin)}, ta page de réservation n’acceptera plus de rendez-vous et ton dashboard passera en lecture seule. Rien n’est supprimé.`,
      'Réponds à cet email pour choisir ton plan.',
    ], { url: `${SITE()}/app`, texte: 'Ouvrir mon dashboard' }) });
}

function alerteAdmin(sujet, champs) {
  const lignes = Object.entries(champs).map(([k, v]) => `<strong>${escHtml(k)} :</strong> ${escHtml(v || '—')}`);
  return envoyer({ a: ADMIN(), type: 'alerte-admin', sujet: `[TrimSync] ${sujet}`, html: gabarit(sujet, lignes) });
}

module.exports = { client, verification, reset, rappelEssai, alerteAdmin };
```

- [ ] **Step 5: `lib/jetons.js`**

```js
/* ── Jetons à usage unique (vérification d'email, nouveau mot de passe) ──
   Seule l'empreinte est stockée : une fuite de la table ne donne aucun lien
   utilisable. */
const crypto = require('crypto');

const empreinte = brut => crypto.createHash('sha256').update(String(brut || '')).digest('hex');

async function creerJeton(q, compteId, type, dureeMs) {
  const brut = crypto.randomBytes(24).toString('hex');
  await q.query(
    `INSERT INTO jetons (hash, compte_id, type, expire_le) VALUES ($1, $2, $3, NOW() + ($4 || ' milliseconds')::interval)`,
    [empreinte(brut), compteId, type, String(dureeMs)]);
  return brut;
}

// Renvoie le compte si le jeton est bon, pas encore servi et pas expiré ; le marque servi.
async function consommerJeton(q, brut, type) {
  const r = await q.query(
    `UPDATE jetons SET utilise_le = NOW()
      WHERE hash = $1 AND type = $2 AND utilise_le IS NULL AND expire_le > NOW()
      RETURNING compte_id`, [empreinte(brut), type]);
  return r.rowCount ? r.rows[0].compte_id : null;
}

module.exports = { creerJeton, consommerJeton };
```

- [ ] **Step 6: `lib/salon.js`**

```js
/* ── Ce qu'un salon est, vu de l'extérieur ── */
const { nowParis } = require('./dates');

const SITE = () => process.env.SITE_URL || 'https://trimsync.tech';
const PRIX_PLANS = { starter: 59, pro: 79, max: 99 };

// Un essai dépassé est expiré dès le lendemain, sans attendre la tâche du jour.
function statutEffectif(salon, aujourdhui = nowParis().date) {
  if (salon.statut === 'essai' && salon.essai_fin < aujourdhui) return 'expire';
  return salon.statut;
}

function reservable(salon) {
  const s = statutEffectif(salon);
  return s === 'essai' || s === 'actif';
}

function joursRestants(salon, aujourdhui = nowParis().date) {
  const ms = new Date(salon.essai_fin + 'T12:00:00Z') - new Date(aujourdhui + 'T12:00:00Z');
  return Math.max(0, Math.round(ms / 86400000));
}

function vueSalon(salon) {
  const statut = statutEffectif(salon);
  return {
    id: salon.id,
    slug: salon.slug,
    nom: salon.nom,
    ville: salon.ville,
    telephone: salon.telephone,
    adresse: salon.adresse,
    statut,
    essai_fin: salon.essai_fin,
    jours_essai_restants: statut === 'essai' ? joursRestants(salon) : null,
    plan: salon.plan,
    bot_statut: salon.bot_statut,
    lien_public: `${SITE()}/r/${salon.slug}`,
  };
}

module.exports = { statutEffectif, reservable, vueSalon, PRIX_PLANS };
```

- [ ] **Step 7: `lib/slug.js`**

```js
const { slugifier } = require('./texte');

// Premier slug libre : « barber-lyon », puis « barber-lyon-2 »…
async function slugLibre(q, base, ignorerSalonId = '') {
  const racine = slugifier(base);
  for (let i = 1; i < 1000; i++) {
    const essai = i === 1 ? racine : `${racine}-${i}`;
    const r = await q.query('SELECT 1 FROM salons WHERE slug = $1 AND id <> $2', [essai, ignorerSalonId]);
    if (!r.rowCount) return essai;
  }
  throw new Error('Aucun slug libre pour ' + racine);
}

module.exports = { slugLibre };
```

- [ ] **Step 8: `lib/auth.js`**

```js
/* ── Mots de passe et sessions ──
   Jeton de session = charge JSON signée HMAC (TRIMSYNC_SECRET), 30 jours.
   Le salon d'une requête est relu en base à partir du compte : jamais pris
   dans le corps, l'URL ou le jeton lui-même. */
const crypto = require('crypto');
const { pool } = require('./db');
const { statutEffectif } = require('./salon');
const { erreurServeur } = require('./http');

function hacherMdp(mdp) {
  const sel = crypto.randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${crypto.scryptSync(String(mdp), sel, 64).toString('hex')}`;
}

function verifierMdp(mdp, stocke) {
  const [, selHex, hashHex] = String(stocke || '').split('$');
  if (!selHex || !hashHex) return false;
  const calcule = crypto.scryptSync(String(mdp), Buffer.from(selHex, 'hex'), 64);
  const attendu = Buffer.from(hashHex, 'hex');
  return calcule.length === attendu.length && crypto.timingSafeEqual(calcule, attendu);
}

function secret() {
  if (!process.env.TRIMSYNC_SECRET) throw new Error('TRIMSYNC_SECRET manquant');
  return process.env.TRIMSYNC_SECRET;
}

function signer(charge) {
  const corps = Buffer.from(JSON.stringify(charge)).toString('base64url');
  return corps + '.' + crypto.createHmac('sha256', secret()).update(corps).digest('base64url');
}

function lireJeton(jeton) {
  const [corps, signature] = String(jeton || '').split('.');
  if (!corps || !signature) return null;
  const attendue = crypto.createHmac('sha256', secret()).update(corps).digest('base64url');
  if (signature.length !== attendue.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(attendue))) return null;
  try {
    const charge = JSON.parse(Buffer.from(corps, 'base64url').toString());
    return charge.exp > Date.now() ? charge : null;
  } catch { return null; }
}

const TRENTE_JOURS = 30 * 24 * 3600 * 1000;
const jetonCompte = compte => signer({ t: 'compte', c: compte.id, exp: Date.now() + TRENTE_JOURS });
const jetonAdmin = () => signer({ t: 'admin', exp: Date.now() + 12 * 3600 * 1000 });
const porteur = req => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };

async function exigerCompte(req, res, next) {
  let charge;
  try { charge = lireJeton(porteur(req)); } catch (e) { return erreurServeur(res, e, 'exigerCompte'); }
  if (!charge || charge.t !== 'compte') return res.status(401).json({ error: 'Connexion requise' });
  try {
    const r = await pool.query(
      `SELECT s.*, c.email, c.email_verifie_le FROM comptes c JOIN salons s ON s.id = c.salon_id WHERE c.id = $1`,
      [charge.c]);
    if (!r.rowCount) return res.status(401).json({ error: 'Compte introuvable' });
    req.compteId = charge.c;
    req.salon = r.rows[0];
    req.salonId = r.rows[0].id;
    next();
  } catch (e) { erreurServeur(res, e, 'exigerCompte'); }
}

function exigerAdmin(req, res, next) {
  let charge;
  try { charge = lireJeton(porteur(req)); } catch (e) { return erreurServeur(res, e, 'exigerAdmin'); }
  if (!charge || charge.t !== 'admin') return res.status(401).json({ error: 'Accès réservé' });
  next();
}

// Après l'essai : on lit tout, on n'écrit plus rien.
function exigerEcriture(req, res, next) {
  const statut = statutEffectif(req.salon);
  if (statut === 'expire' || statut === 'suspendu') {
    return res.status(402).json({ error: 'Ton essai est terminé : choisis un plan pour continuer.', statut });
  }
  next();
}

module.exports = { hacherMdp, verifierMdp, jetonCompte, jetonAdmin, exigerCompte, exigerAdmin, exigerEcriture };
```

- [ ] **Step 9: `routes/comptes.js`**

```js
/* ── Comptes : inscription, connexion, email, mot de passe ── */
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { hacherMdp, verifierMdp, jetonCompte, exigerCompte } = require('../lib/auth');
const { creerJeton, consommerJeton } = require('../lib/jetons');
const { slugLibre } = require('../lib/slug');
const { nowParis, decaleJours } = require('../lib/dates');
const { telAStocker } = require('../lib/telephone');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur, quota } = require('../lib/http');
const { vueSalon } = require('../lib/salon');
const emails = require('../lib/emails');

const router = express.Router();
const quotaComptes = quota(10, 15 * 60 * 1000);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUREE_ESSAI_JOURS = 30;
const HEURE_MS = 3600 * 1000;
// Pour ne pas partir d'une page vide : tout est modifiable ensuite.
const PRESTATIONS_DEPART = [['Coupe', 30, 20], ['Barbe', 20, 10], ['Coupe + barbe', 45, 28]];
// Même durée de réponse, que l'email existe ou non.
const MDP_LEURRE = hacherMdp('leurre-' + Math.random());

const lireEmail = v => String(v || '').trim().toLowerCase();

router.post('/api/comptes/inscription', quotaComptes, async (req, res) => {
  const b = req.body || {};
  const email = lireEmail(b.email);
  const mdp = String(b.mdp || '');
  const nom = sanitizeText(b.salon, 80);
  const ville = sanitizeText(b.ville, 60);
  const telephone = telAStocker(sanitizeText(b.telephone, 30));
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });
  if (mdp.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  if (!nom) return res.status(400).json({ error: 'Le nom du salon est obligatoire' });
  if (b.consentement !== true) return res.status(400).json({ error: 'Tu dois accepter les conditions pour créer ton compte' });
  try {
    const r = await transaction(async q => {
      if ((await q.query('SELECT 1 FROM comptes WHERE email = $1', [email])).rowCount) return null;
      const salonId = uid('s');
      const compteId = uid('u');
      const slug = await slugLibre(q, `${nom} ${ville}`);
      await q.query(
        `INSERT INTO salons (id, slug, nom, ville, telephone, essai_fin) VALUES ($1, $2, $3, $4, $5, $6)`,
        [salonId, slug, nom, ville, telephone, decaleJours(nowParis().date, DUREE_ESSAI_JOURS)]);
      await q.query(
        `INSERT INTO comptes (id, salon_id, email, mdp_hash, derniere_connexion_le) VALUES ($1, $2, $3, $4, NOW())`,
        [compteId, salonId, email, hacherMdp(mdp)]);
      for (const [ordre, [n, duree, prix]] of PRESTATIONS_DEPART.entries()) {
        await q.query(
          `INSERT INTO prestations (id, salon_id, nom, duree_min, prix, ordre) VALUES ($1, $2, $3, $4, $5, $6)`,
          [uid('p'), salonId, n, duree, prix, ordre]);
      }
      for (let jour = 2; jour <= 6; jour++) {
        await q.query(`INSERT INTO horaires (salon_id, jour, ouverture, fermeture) VALUES ($1, $2, '09:00', '19:00')`, [salonId, jour]);
      }
      const jeton = await creerJeton(q, compteId, 'verification', 24 * HEURE_MS);
      const salon = (await q.query('SELECT * FROM salons WHERE id = $1', [salonId])).rows[0];
      return { compteId, salon, jeton };
    });
    if (!r) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    emails.verification(email, r.jeton);
    emails.alerteAdmin(`Nouveau salon inscrit : ${r.salon.nom}`, {
      Salon: r.salon.nom, Ville: r.salon.ville, Email: email, Téléphone: r.salon.telephone, Page: vueSalon(r.salon).lien_public,
    });
    res.status(201).json({ jeton: jetonCompte({ id: r.compteId }), salon: vueSalon(r.salon) });
  } catch (e) {
    if (e.constraint === 'comptes_email_key') return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    erreurServeur(res, e, 'inscription');
  }
});

router.post('/api/comptes/connexion', quotaComptes, async (req, res) => {
  const email = lireEmail(req.body?.email);
  const mdp = String(req.body?.mdp || '');
  try {
    const compte = (await pool.query('SELECT id, mdp_hash FROM comptes WHERE email = $1', [email])).rows[0];
    const bon = verifierMdp(mdp, compte ? compte.mdp_hash : MDP_LEURRE);
    if (!compte || !bon) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    await pool.query('UPDATE comptes SET derniere_connexion_le = NOW() WHERE id = $1', [compte.id]);
    res.json({ jeton: jetonCompte(compte) });
  } catch (e) { erreurServeur(res, e, 'connexion'); }
});

router.get('/api/moi', exigerCompte, (req, res) => {
  res.json({ email: req.salon.email, email_verifie: !!req.salon.email_verifie_le, salon: vueSalon(req.salon) });
});

router.post('/api/comptes/verifier', quotaComptes, async (req, res) => {
  try {
    const compteId = await consommerJeton(pool, req.body?.jeton, 'verification');
    if (!compteId) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    await pool.query('UPDATE comptes SET email_verifie_le = NOW() WHERE id = $1', [compteId]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'verifier'); }
});

router.post('/api/comptes/renvoyer-verification', quotaComptes, exigerCompte, async (req, res) => {
  try {
    if (req.salon.email_verifie_le) return res.json({ ok: true, deja: true });
    const jeton = await creerJeton(pool, req.compteId, 'verification', 24 * HEURE_MS);
    emails.verification(req.salon.email, jeton);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'renvoyer-verification'); }
});

// Même réponse que l'email existe ou non : on ne sert pas d'annuaire.
router.post('/api/comptes/mot-de-passe-oublie', quotaComptes, async (req, res) => {
  const email = lireEmail(req.body?.email);
  try {
    const compte = (await pool.query('SELECT id FROM comptes WHERE email = $1', [email])).rows[0];
    if (compte) emails.reset(email, await creerJeton(pool, compte.id, 'reset', HEURE_MS));
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'mot-de-passe-oublie'); }
});

router.post('/api/comptes/reinitialiser', quotaComptes, async (req, res) => {
  const mdp = String(req.body?.mdp || '');
  if (mdp.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  try {
    const compteId = await consommerJeton(pool, req.body?.jeton, 'reset');
    if (!compteId) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    await pool.query('UPDATE comptes SET mdp_hash = $2 WHERE id = $1', [compteId, hacherMdp(mdp)]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'reinitialiser'); }
});

router.post('/api/comptes/mot-de-passe', quotaComptes, exigerCompte, async (req, res) => {
  const nouveau = String(req.body?.nouveau || '');
  if (nouveau.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  try {
    const { mdp_hash } = (await pool.query('SELECT mdp_hash FROM comptes WHERE id = $1', [req.compteId])).rows[0];
    if (!verifierMdp(String(req.body?.actuel || ''), mdp_hash)) return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
    await pool.query('UPDATE comptes SET mdp_hash = $2 WHERE id = $1', [req.compteId, hacherMdp(nouveau)]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'mot-de-passe'); }
});

module.exports = router;
```

- [ ] **Step 10: `routes/test.js`**

```js
/* Monté seulement quand TRIMSYNC_TEST=1 (voir server.js) : jamais en production. */
const express = require('express');
const { boite } = require('../lib/boite');

const router = express.Router();
router.get('/api/test/boite', (_req, res) => res.json({ boite }));
module.exports = router;
```

- [ ] **Step 11: Relancer le serveur et les scénarios**

Run: redémarrer le serveur de test, puis `API=http://localhost:3998 node test-scenarios.mjs`
Expected: toutes les lignes T1 en ✓, `15/15 vérifications passées`.

- [ ] **Step 12: Commit**

```bash
git add backend && git commit -m "feat(backend): inscription, connexion et session des barbiers"
```

---

### Task 5: Profil du salon, demande de bot, suppression, push

**Files:**
- Replace: `backend/routes/salon.js`, `backend/routes/push.js`
- Create: `backend/lib/push.js`
- Modify: `backend/test-scenarios.mjs` (sections T9 et T11 ; T11 plus tard, voir Task 9)

- [ ] **Step 1: Ajouter T9 aux scénarios** (à la place du commentaire `// SUITE`, en le laissant en dessous)

```js
  console.log('T9 — profil et demande de bot');
  const renomme = await appel('PATCH', '/api/salon', { adresse: '12 rue du Test', slug: `Mon Salon ${RUN}` }, A);
  ok(renomme.s === 200 && renomme.d.salon.slug === `mon-salon-${RUN}` && renomme.d.salon.adresse === '12 rue du Test', 'profil modifié', renomme);
  ok((await appel('PATCH', '/api/salon', { slug: slugB }, A)).s === 409, 'slug déjà pris refusé');
  const slugA2 = renomme.d.salon.slug;
  ok((await appel('POST', '/api/salon/demande-bot', undefined, A)).s === 403, 'demande de bot refusée sans email vérifié');
  const jv = await dernierJeton(emailA, 'verification');
  ok((await appel('POST', '/api/comptes/verifier', { jeton: jv })).s === 200, 'email vérifié');
  ok((await appel('POST', '/api/comptes/verifier', { jeton: jv })).s === 400, 'lien de vérification à usage unique');
  const bot = await appel('POST', '/api/salon/demande-bot', undefined, A);
  ok(bot.s === 200 && bot.d.bot_statut === 'demande', 'demande de bot enregistrée', bot);
  ok((await boite()).some(m => m.type === 'alerte-admin' && /bot/i.test(m.sujet)), 'Félix prévenu de la demande');
  ok((await appel('POST', '/api/push/abonnement', { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } }, A)).s === 200, 'abonnement push enregistré');
  ok((await appel('POST', '/api/push/abonnement', { endpoint: 'pas-une-url', keys: {} }, A)).s === 400, 'abonnement push invalide refusé');
```

Et, dans toute la suite, utiliser `slugA2` pour la page publique de A.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `API=http://localhost:3998 node test-scenarios.mjs`
Expected: `✗ profil modifié` (404).

- [ ] **Step 3: `lib/push.js`**

```js
/* ── Notifications push vers le téléphone du barbier ── */
const webpush = require('web-push');
const { pool } = require('./db');
const { deposer } = require('./boite');

let pret = false;
function configurer() {
  if (pret) return true;
  const { VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails('mailto:' + (process.env.ADMIN_EMAIL || 'felix@trimsync.tech'), VAPID_PUBLIC, VAPID_PRIVATE);
  pret = true;
  return true;
}

// Jamais bloquant : une notification ratée ne doit pas faire échouer une réservation.
async function notifierSalon(salonId, { type, titre, corps, url = '/app' }) {
  deposer({ canal: 'push', salonId, type, titre, corps });
  if (!configurer()) return;
  try {
    const abonnes = (await pool.query('SELECT endpoint, cles FROM push_abonnements WHERE salon_id = $1', [salonId])).rows;
    await Promise.all(abonnes.map(async a => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: a.cles }, JSON.stringify({ title: titre, body: corps, url }));
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await pool.query('DELETE FROM push_abonnements WHERE endpoint = $1', [a.endpoint]);
        } else {
          console.error('[push]', e.statusCode || '', e.message);
        }
      }
    }));
  } catch (e) { console.error('[push]', e.message); }
}

module.exports = { notifierSalon };
```

- [ ] **Step 4: `routes/push.js`**

```js
const express = require('express');
const { pool } = require('../lib/db');
const { exigerCompte } = require('../lib/auth');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

router.get('/api/push/cle-publique', (_req, res) => res.json({ cle: process.env.VAPID_PUBLIC || null }));

// Un même navigateur ne sert qu'un salon : le dernier compte connecté le récupère.
router.post('/api/push/abonnement', exigerCompte, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!/^https:\/\/\S+$/.test(String(endpoint || '')) || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Abonnement invalide' });
  }
  try {
    await pool.query(
      `INSERT INTO push_abonnements (endpoint, salon_id, compte_id, cles) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET salon_id = $2, compte_id = $3, cles = $4`,
      [endpoint, req.salonId, req.compteId, { p256dh: String(keys.p256dh), auth: String(keys.auth) }]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'push/abonnement'); }
});

router.delete('/api/push/abonnement', exigerCompte, async (req, res) => {
  try {
    await pool.query('DELETE FROM push_abonnements WHERE endpoint = $1 AND salon_id = $2', [String(req.body?.endpoint || ''), req.salonId]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'push/desabonnement'); }
});

module.exports = router;
```

- [ ] **Step 5: `routes/salon.js`**

```js
/* ── Profil du salon, demande de bot, suppression du compte ── */
const express = require('express');
const { pool } = require('../lib/db');
const { exigerCompte } = require('../lib/auth');
const { vueSalon } = require('../lib/salon');
const { sanitizeText, slugifier } = require('../lib/texte');
const { telAStocker } = require('../lib/telephone');
const { erreurServeur } = require('../lib/http');
const emails = require('../lib/emails');

const router = express.Router();

router.get('/api/salon', exigerCompte, (req, res) => res.json({ salon: vueSalon(req.salon) }));

router.patch('/api/salon', exigerCompte, async (req, res) => {
  const b = req.body || {};
  const champs = {};
  if (b.nom !== undefined) {
    const nom = sanitizeText(b.nom, 80);
    if (!nom) return res.status(400).json({ error: 'Le nom du salon est obligatoire' });
    champs.nom = nom;
  }
  if (b.ville !== undefined) champs.ville = sanitizeText(b.ville, 60);
  if (b.adresse !== undefined) champs.adresse = sanitizeText(b.adresse, 160);
  if (b.telephone !== undefined) champs.telephone = telAStocker(sanitizeText(b.telephone, 30));
  try {
    if (b.slug !== undefined) {
      if (!String(b.slug).trim()) return res.status(400).json({ error: 'Adresse de page vide' });
      const slug = slugifier(b.slug);
      if (slug.length < 3) return res.status(400).json({ error: 'Adresse de page trop courte' });
      const pris = await pool.query('SELECT 1 FROM salons WHERE slug = $1 AND id <> $2', [slug, req.salonId]);
      if (pris.rowCount) return res.status(409).json({ error: 'Cette adresse est déjà prise' });
      champs.slug = slug;
    }
    const cles = Object.keys(champs); // clés fixées ci-dessus : jamais issues de la requête
    if (!cles.length) return res.json({ salon: vueSalon(req.salon) });
    const r = await pool.query(
      `UPDATE salons SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.salonId, ...cles.map(k => champs[k])]);
    res.json({ salon: vueSalon(r.rows[0]) });
  } catch (e) {
    if (e.constraint === 'salons_slug_key') return res.status(409).json({ error: 'Cette adresse est déjà prise' });
    erreurServeur(res, e, 'salon/modifier');
  }
});

// Félix ne doit pas appeler une adresse bidon : email vérifié d'abord.
router.post('/api/salon/demande-bot', exigerCompte, async (req, res) => {
  if (!req.salon.email_verifie_le) {
    return res.status(403).json({ error: "Confirme d'abord ton adresse email (lien reçu à l'inscription)." });
  }
  if (req.salon.bot_statut !== 'inactif') return res.json({ bot_statut: req.salon.bot_statut });
  try {
    await pool.query(`UPDATE salons SET bot_statut = 'demande' WHERE id = $1`, [req.salonId]);
    emails.alerteAdmin(`Demande de bot : ${req.salon.nom}`, {
      Salon: req.salon.nom, Ville: req.salon.ville, Email: req.salon.email, Téléphone: req.salon.telephone,
    });
    res.json({ bot_statut: 'demande' });
  } catch (e) { erreurServeur(res, e, 'demande-bot'); }
});

// Irréversible : tout part avec le salon (ON DELETE CASCADE).
router.delete('/api/salon', exigerCompte, async (req, res) => {
  if (String(req.body?.confirmation || '').trim() !== req.salon.nom) {
    return res.status(400).json({ error: 'Recopie exactement le nom du salon pour confirmer' });
  }
  try {
    await pool.query('DELETE FROM salons WHERE id = $1', [req.salonId]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'salon/supprimer'); }
});

module.exports = router;
```

- [ ] **Step 6: Relancer serveur et scénarios**

Expected: T1 et T9 entièrement ✓.

- [ ] **Step 7: Commit**

```bash
git add backend && git commit -m "feat(backend): profil du salon, demande de bot, suppression, push"
```

---

### Task 6: Prestations et horaires

**Files:**
- Replace: `backend/routes/prestations.js`, `backend/routes/horaires.js`
- Modify: `backend/test-scenarios.mjs` (section T3a)

- [ ] **Step 1: Ajouter aux scénarios (section T3a)**

```js
  console.log('T3a — prestations et horaires');
  const prestasA = (await appel('GET', '/api/prestations', undefined, A)).d.prestations;
  ok(prestasA.length === 3 && typeof prestasA[0].prix === 'number', 'prestations de départ', prestasA);
  const coupe = prestasA.find(p => p.nom === 'Coupe');
  const barbe = prestasA.find(p => p.nom === 'Barbe');
  const np = await appel('POST', '/api/prestations', { nom: 'Dégradé', duree_min: 40, prix: 25 }, A);
  ok(np.s === 201 && np.d.prestation.ordre === 3, 'prestation ajoutée en dernier', np);
  ok((await appel('POST', '/api/prestations', { nom: 'X', duree_min: 7, prix: 25 }, A)).s === 400, 'durée hors pas de 5 min refusée');
  ok((await appel('PATCH', `/api/prestations/${np.d.prestation.id}`, { actif: false }, A)).d.prestation.actif === false, 'prestation désactivée');
  const ordre = [np.d.prestation.id, ...prestasA.map(p => p.id)];
  ok((await appel('PUT', '/api/prestations/ordre', { ids: ordre }, A)).s === 200, 'prestations réordonnées');
  ok((await appel('GET', '/api/prestations', undefined, A)).d.prestations[0].id === np.d.prestation.id, 'nouvel ordre lu');
  ok((await appel('PUT', '/api/horaires', { semaine: [{ jour: 1, ouverture: '10:00', fermeture: '09:00' }] }, A)).s === 400, 'horaires incohérents refusés');
  ok((await appel('PUT', '/api/horaires', { semaine: [{ jour: 1, ouverture: '09:00', fermeture: '18:00', pause_debut: '17:00', pause_fin: '19:00' }] }, A)).s === 400, 'pause hors horaires refusée');
  ok((await appel('PUT', '/api/horaires', { semaine: SEMAINE }, A)).s === 200, 'horaires réglés');
  ok((await appel('GET', '/api/horaires', undefined, A)).d.semaine.length === 7, 'horaires relus');
  const J = dansJours(3);
  const f = await appel('POST', '/api/fermetures', { date: J, debut: '15:00', fin: '16:00', motif: 'perso' }, A);
  ok(f.s === 201 && f.d.fermeture.id, 'fermeture en plage créée', f);
  ok((await appel('POST', '/api/fermetures', { date: J, debut: '15:00' }, A)).s === 400, 'plage incomplète refusée');
  const f2 = await appel('POST', '/api/fermetures', { date: dansJours(4), motif: 'congé' }, A);
  ok(f2.s === 201, 'fermeture à la journée créée');
  ok((await appel('DELETE', `/api/fermetures/${f2.d.fermeture.id}`, undefined, A)).s === 200, 'fermeture supprimée');
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Expected: `✗ prestations de départ`.

- [ ] **Step 3: `routes/prestations.js`**

```js
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

// partiel = modification : seuls les champs présents sont vérifiés.
function lireChamps(b, partiel) {
  const c = {};
  if (!partiel || b.nom !== undefined) {
    const nom = sanitizeText(b.nom, 60);
    if (!nom) return { erreur: 'Donne un nom à la prestation' };
    c.nom = nom;
  }
  if (!partiel || b.duree_min !== undefined) {
    const d = Number(b.duree_min);
    if (!Number.isInteger(d) || d < 5 || d > 480 || d % 5) return { erreur: 'Durée invalide (de 5 min à 8 h, par pas de 5 min)' };
    c.duree_min = d;
  }
  if (!partiel || b.prix !== undefined) {
    const p = Number(b.prix);
    if (!Number.isFinite(p) || p < 0 || p > 10000) return { erreur: 'Prix invalide' };
    c.prix = Math.round(p * 100) / 100;
  }
  if (partiel && b.actif !== undefined) c.actif = !!b.actif;
  return { c };
}

router.get('/api/prestations', exigerCompte, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM prestations WHERE salon_id = $1 ORDER BY ordre, nom', [req.salonId]);
    res.json({ prestations: r.rows });
  } catch (e) { erreurServeur(res, e, 'prestations'); }
});

router.post('/api/prestations', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, false);
  if (erreur) return res.status(400).json({ error: erreur });
  try {
    const r = await pool.query(
      `INSERT INTO prestations (id, salon_id, nom, duree_min, prix, ordre)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(ordre) + 1, 0) FROM prestations WHERE salon_id = $2))
       RETURNING *`, [uid('p'), req.salonId, c.nom, c.duree_min, c.prix]);
    res.status(201).json({ prestation: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'prestations/creer'); }
});

router.patch('/api/prestations/:id', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, true);
  if (erreur) return res.status(400).json({ error: erreur });
  const cles = Object.keys(c);
  try {
    const r = cles.length
      ? await pool.query(
        `UPDATE prestations SET ${cles.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND salon_id = $2 RETURNING *`,
        [req.params.id, req.salonId, ...cles.map(k => c[k])])
      : await pool.query('SELECT * FROM prestations WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Prestation introuvable' });
    res.json({ prestation: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'prestations/modifier'); }
});

router.put('/api/prestations/ordre', exigerCompte, exigerEcriture, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
  if (!ids) return res.status(400).json({ error: 'Liste attendue' });
  try {
    await transaction(async q => {
      for (const [ordre, id] of ids.entries()) {
        await q.query('UPDATE prestations SET ordre = $3 WHERE id = $1 AND salon_id = $2', [id, req.salonId, ordre]);
      }
    });
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'prestations/ordre'); }
});

module.exports = router;
```

- [ ] **Step 4: `routes/horaires.js`**

```js
/* ── Horaires de la semaine et fermetures ── */
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { estDate, estHeure, nowParis } = require('../lib/dates');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

// Comparer des 'HH:MM' comme des chaînes est juste : même longueur, zéros en tête.
function lireJour(j) {
  const jour = Number(j?.jour);
  if (!Number.isInteger(jour) || jour < 0 || jour > 6) return { erreur: 'Jour invalide' };
  if (!estHeure(j.ouverture) || !estHeure(j.fermeture) || j.ouverture >= j.fermeture) {
    return { erreur: "L'heure d'ouverture doit précéder celle de fermeture" };
  }
  const avecPause = j.pause_debut || j.pause_fin;
  if (avecPause && (!estHeure(j.pause_debut) || !estHeure(j.pause_fin)
    || j.pause_debut >= j.pause_fin || j.pause_debut < j.ouverture || j.pause_fin > j.fermeture)) {
    return { erreur: 'La pause doit tomber pendant les heures d’ouverture' };
  }
  return { j: { jour, ouverture: j.ouverture, fermeture: j.fermeture, pause_debut: avecPause ? j.pause_debut : null, pause_fin: avecPause ? j.pause_fin : null } };
}

router.get('/api/horaires', exigerCompte, async (req, res) => {
  try {
    const [semaine, fermetures] = await Promise.all([
      pool.query('SELECT jour, ouverture, fermeture, pause_debut, pause_fin FROM horaires WHERE salon_id = $1 ORDER BY jour', [req.salonId]),
      pool.query('SELECT * FROM fermetures WHERE salon_id = $1 AND date >= $2 ORDER BY date, debut NULLS FIRST', [req.salonId, nowParis().date]),
    ]);
    res.json({ semaine: semaine.rows, fermetures: fermetures.rows });
  } catch (e) { erreurServeur(res, e, 'horaires'); }
});

// Remplace toute la semaine : un jour absent de la liste est un jour fermé.
router.put('/api/horaires', exigerCompte, exigerEcriture, async (req, res) => {
  const liste = Array.isArray(req.body?.semaine) ? req.body.semaine : null;
  if (!liste) return res.status(400).json({ error: 'Semaine attendue' });
  const jours = [];
  for (const brut of liste) {
    const { j, erreur } = lireJour(brut);
    if (erreur) return res.status(400).json({ error: erreur });
    if (jours.some(x => x.jour === j.jour)) return res.status(400).json({ error: 'Un jour apparaît deux fois' });
    jours.push(j);
  }
  try {
    await transaction(async q => {
      await q.query('DELETE FROM horaires WHERE salon_id = $1', [req.salonId]);
      for (const j of jours) {
        await q.query(
          'INSERT INTO horaires (salon_id, jour, ouverture, fermeture, pause_debut, pause_fin) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.salonId, j.jour, j.ouverture, j.fermeture, j.pause_debut, j.pause_fin]);
      }
    });
    res.json({ semaine: jours.sort((a, b) => a.jour - b.jour) });
  } catch (e) { erreurServeur(res, e, 'horaires/modifier'); }
});

router.post('/api/fermetures', exigerCompte, exigerEcriture, async (req, res) => {
  const b = req.body || {};
  if (!estDate(b.date)) return res.status(400).json({ error: 'Date invalide' });
  const plage = b.debut || b.fin;
  if (plage && (!estHeure(b.debut) || !estHeure(b.fin) || b.debut >= b.fin)) {
    return res.status(400).json({ error: 'Plage horaire invalide' });
  }
  try {
    const r = await pool.query(
      'INSERT INTO fermetures (id, salon_id, date, debut, fin, motif) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uid('f'), req.salonId, b.date, plage ? b.debut : null, plage ? b.fin : null, sanitizeText(b.motif, 120)]);
    res.status(201).json({ fermeture: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'fermetures/creer'); }
});

router.delete('/api/fermetures/:id', exigerCompte, exigerEcriture, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM fermetures WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Fermeture introuvable' });
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'fermetures/supprimer'); }
});

module.exports = router;
```

- [ ] **Step 5: Relancer** — Expected : T1, T9, T3a en ✓.

- [ ] **Step 6: Commit**

```bash
git add backend && git commit -m "feat(backend): prestations, horaires et fermetures"
```

---

### Task 7: Page publique — salon, créneaux, réservation, annulation, attente

**Files:**
- Create: `backend/lib/contexte.js`, `backend/lib/clients.js`, `backend/lib/notifs.js`
- Replace: `backend/routes/public.js`
- Modify: `backend/test-scenarios.mjs` (sections T3b, T4, T5, T12)

- [ ] **Step 1: Ajouter aux scénarios**

```js
  console.log('T3b — créneaux vus de la page publique');
  const dispo = async (date = J, presta = coupe.id) =>
    (await appel('GET', `/api/public/salons/${slugA2}/dispo?prestation=${presta}&date=${date}`)).d.heures;
  let h = await dispo();
  ok(h[0] === '09:00' && h.includes('11:30') && !h.includes('11:45') && !h.includes('12:00') && h.includes('13:00'), 'pause respectée', h);
  ok(!h.includes('15:00') && !h.includes('14:45') && h.includes('14:30') && h.includes('16:00') && h[h.length - 1] === '18:30', 'fermeture en plage respectée', h);
  const pub = await appel('GET', `/api/public/salons/${slugA2}`);
  ok(pub.s === 200 && pub.d.reservable === true && pub.d.prestations.length === 3 && pub.d.email === undefined, 'infos publiques (prestation désactivée masquée)', pub.d);
  ok((await appel('GET', '/api/public/salons/inexistant-zz')).s === 404, 'salon inconnu : 404');
  const jours = (await appel('GET', `/api/public/salons/${slugA2}/jours?prestation=${coupe.id}`)).d.jours;
  ok(jours.length === 30 && jours.find(x => x.date === J).libres === h.length, 'vue des 30 prochains jours', jours?.slice(0, 4));

  console.log('T4 — réservation publique et annulation');
  const reserver = (heure, nom = 'Karim Test', tel = '+33 6 22 33 44 55', date = J) => appel('POST', `/api/public/salons/${slugA2}/reserver`,
    { prestation_id: coupe.id, date, heure, nom, telephone: tel, consentement: true });
  const resa = await reserver('10:00');
  ok(resa.s === 201 && /^[0-9a-f]{48}$/.test(resa.d.annulation), 'réservation', resa);
  h = await dispo();
  ok(!h.includes('10:00') && !h.includes('09:45') && h.includes('10:30'), 'le créneau pris disparaît', h);
  ok((await reserver('10:00', 'Autre', '0700000000')).s === 409, 'même heure refusée');
  ok((await reserver('10:07')).s === 400, 'heure hors grille refusée');
  ok((await appel('POST', `/api/public/salons/${slugA2}/reserver`, { prestation_id: coupe.id, date: J, heure: '11:00', nom: 'X', telephone: '12', consentement: true })).s === 400, 'téléphone invalide refusé');
  ok((await reserver('09:00', 'Loin', '0600000000', dansJours(45))).s === 400, 'au-delà de 30 jours refusé');
  const clientsA = (await appel('GET', '/api/clients', undefined, A)).d?.clients || [];
  ok(clientsA.some(c => c.nom === 'Karim Test' && c.telephone === '0622334455'), 'fiche client créée, numéro normalisé', clientsA);
  const re = await reserver('16:00', 'karim  TEST', '06 22 33 44 55');
  ok(re.s === 201, 'deuxième réservation du même client');
  const clientsA2 = (await appel('GET', '/api/clients', undefined, A)).d?.clients || [];
  ok(clientsA2.filter(c => c.telephone === '0622334455').length === 1, 'même nom et même numéro : une seule fiche');
  const frere = await reserver('16:30', 'Yanis Test', '06 22 33 44 55');
  const clientsA3 = (await appel('GET', '/api/clients', undefined, A)).d?.clients || [];
  ok(frere.s === 201 && clientsA3.filter(c => c.telephone === '0622334455').length === 2, 'même numéro, autre prénom : deux fiches');
  ok((await boite()).some(m => m.canal === 'push' && m.type === 'nouveau-rdv'), 'barbier notifié du rdv');

  console.log("T12 — liste d'attente");
  const at = await appel('POST', `/api/public/salons/${slugA2}/attente`, { date: J, nom: 'Patient', telephone: '0688888888', consentement: true });
  ok(at.s === 201, "inscription en liste d'attente", at);
  ok((await appel('POST', `/api/public/salons/${slugA2}/attente`, { date: J, nom: 'Patient', telephone: '0688888888', consentement: true })).s === 201, 'doublon accepté sans nouvelle ligne');

  const vue = await appel('GET', `/api/public/rdv/${resa.d.annulation}`);
  ok(vue.s === 200 && vue.d.rdv.heure === '10:00' && vue.d.rdv.annulable === true && vue.d.salon.slug === slugA2, 'rdv lisible par son jeton', vue.d);
  ok((await appel('POST', '/api/public/annuler', { jeton: 'f'.repeat(48) })).s === 404, 'mauvais jeton refusé');
  ok((await appel('POST', '/api/public/annuler', { jeton: resa.d.annulation })).s === 200, 'annulation');
  ok((await dispo()).includes('10:00'), "l'annulation libère le créneau");
  ok((await appel('POST', '/api/public/annuler', { jeton: resa.d.annulation })).s === 409, 'double annulation refusée');
  const pushs = (await boite()).filter(m => m.canal === 'push');
  ok(pushs.some(m => m.type === 'annulation') && pushs.some(m => m.type === 'place-libre'), 'barbier prévenu : annulation et place libre avec attente');

  console.log('T5 — deux réservations simultanées');
  const [x, y] = await Promise.all(['Un', 'Deux'].map((nom, i) => reserver('14:00', nom, `065555555${i}`)));
  ok([x.s, y.s].sort().join() === '201,409', 'une seule passe', [x.s, y.s]);
```

- [ ] **Step 2: Lancer, vérifier l'échec** — Expected : `✗ pause respectée`.

- [ ] **Step 3: `lib/contexte.js`**

```js
// Tout ce que le moteur de créneaux doit savoir d'un salon sur une période.
async function contexteDispo(q, salonId, du, au) {
  const [horaires, fermetures, rdv] = await Promise.all([
    q.query('SELECT jour, ouverture, fermeture, pause_debut, pause_fin FROM horaires WHERE salon_id = $1', [salonId]),
    q.query('SELECT date, debut, fin FROM fermetures WHERE salon_id = $1 AND date BETWEEN $2 AND $3', [salonId, du, au]),
    q.query(`SELECT id, date, heure, duree_min, statut FROM rdv
              WHERE salon_id = $1 AND date BETWEEN $2 AND $3 AND statut = 'confirme'`, [salonId, du, au]),
  ]);
  return { horaires: horaires.rows, fermetures: fermetures.rows, rdv: rdv.rows };
}

module.exports = { contexteDispo };
```

- [ ] **Step 4: `lib/clients.js`**

```js
/* ── Rapprochement des fiches clients ──
   Un numéro ne désigne pas une personne : le client, son frère et son père le
   partagent (leçon de FCUTZ). On ne réutilise une fiche que si le NOM et le
   NUMÉRO correspondent. */
const { uid } = require('./db');
const { telAStocker } = require('./telephone');
const { normaliserNom } = require('./texte');

async function trouverOuCreerClient(q, salonId, { nom, telephone, email = '' }) {
  const tel = telAStocker(telephone);
  if (tel) {
    const r = await q.query('SELECT id, nom FROM clients WHERE salon_id = $1 AND telephone = $2 ORDER BY created_at', [salonId, tel]);
    const meme = r.rows.find(c => normaliserNom(c.nom) === normaliserNom(nom));
    if (meme) return meme.id;
  }
  const id = uid('c');
  await q.query('INSERT INTO clients (id, salon_id, nom, telephone, email) VALUES ($1, $2, $3, $4, $5)', [id, salonId, nom, tel, email]);
  return id;
}

module.exports = { trouverOuCreerClient };
```

- [ ] **Step 5: `lib/notifs.js`**

```js
const { pool } = require('./db');
const { notifierSalon } = require('./push');
const { nowParis, jourLisible } = require('./dates');

// Une place se libère un jour où des gens attendent : le barbier les prévient
// lui-même (pas de SMS dans ce périmètre).
async function signalerPlaceLibre(salonId, date) {
  if (date < nowParis().date) return;
  try {
    const n = (await pool.query(
      'SELECT COUNT(*) AS n FROM attente WHERE salon_id = $1 AND date = $2 AND prevenu_le IS NULL', [salonId, date])).rows[0].n;
    if (!n) return;
    notifierSalon(salonId, {
      type: 'place-libre',
      titre: 'Une place se libère',
      corps: `${jourLisible(date)} : ${n} personne${n > 1 ? 's' : ''} en liste d'attente`,
    });
  } catch (e) { console.error('[place-libre]', e.message); }
}

module.exports = { signalerPlaceLibre };
```

- [ ] **Step 6: `routes/public.js`**

```js
/* ── Page de réservation publique d'un salon ──
   Rien d'autre ne sort que le nom, la ville, l'adresse, le téléphone, les
   prestations actives et les heures libres : pas de liste des RDV (les
   créneaux se calculent ici, pas dans le navigateur). */
const crypto = require('crypto');
const express = require('express');
const { pool, uid, transaction } = require('../lib/db');
const { creneaux } = require('../lib/dispo');
const { contexteDispo } = require('../lib/contexte');
const { trouverOuCreerClient } = require('../lib/clients');
const { signalerPlaceLibre } = require('../lib/notifs');
const { notifierSalon } = require('../lib/push');
const { reservable } = require('../lib/salon');
const { nowParis, decaleJours, estDate, estHeure, creneauPasse, jourLisible } = require('../lib/dates');
const { telAStocker, telComposable } = require('../lib/telephone');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur, quota } = require('../lib/http');

const router = express.Router();
const DIX_MIN = 10 * 60 * 1000;
const quotaLecture = quota(300, DIX_MIN);
const quotaEcriture = quota(30, DIX_MIN);
const quotaAnnulation = quota(30, DIX_MIN);
const HORIZON_JOURS = 30;

async function salonDuSlug(slug) {
  const r = await pool.query('SELECT * FROM salons WHERE slug = $1', [String(slug || '').toLowerCase()]);
  return r.rows[0] || null;
}

async function prestationActive(salonId, id) {
  const r = await pool.query('SELECT * FROM prestations WHERE id = $1 AND salon_id = $2 AND actif', [String(id || ''), salonId]);
  return r.rows[0] || null;
}

const INDISPONIBLE = salon => ({ error: 'Réservation en ligne indisponible, appelle le salon', telephone: salon.telephone });

function lireClient(b) {
  const nom = sanitizeText(b.nom, 80);
  const telephone = telAStocker(sanitizeText(b.telephone, 30));
  if (!nom) return { erreur: 'Indique ton nom' };
  if (!telComposable(telephone)) return { erreur: 'Numéro de téléphone invalide' };
  if (b.consentement !== true) return { erreur: 'Tu dois accepter que le salon garde tes coordonnées' };
  return { nom, telephone, email: sanitizeText(b.email, 120) };
}

router.get('/api/public/salons/:slug', quotaLecture, async (req, res) => {
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const p = await pool.query(
      'SELECT id, nom, duree_min, prix FROM prestations WHERE salon_id = $1 AND actif ORDER BY ordre, nom', [salon.id]);
    res.json({
      nom: salon.nom, ville: salon.ville, adresse: salon.adresse, telephone: salon.telephone, slug: salon.slug,
      reservable: reservable(salon), horizon_jours: HORIZON_JOURS, prestations: p.rows,
    });
  } catch (e) { erreurServeur(res, e, 'public/salon'); }
});

// Nombre d'heures libres pour chacun des 30 prochains jours (jours complets grisés).
router.get('/api/public/salons/:slug/jours', quotaLecture, async (req, res) => {
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const presta = await prestationActive(salon.id, req.query.prestation);
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    const maintenant = nowParis();
    const fin = decaleJours(maintenant.date, HORIZON_JOURS - 1);
    const ctx = await contexteDispo(pool, salon.id, maintenant.date, fin);
    const jours = [];
    for (let i = 0; i < HORIZON_JOURS; i++) {
      const date = decaleJours(maintenant.date, i);
      jours.push({ date, libres: creneaux({ ...ctx, duree: presta.duree_min, date, maintenant }).length });
    }
    res.json({ jours });
  } catch (e) { erreurServeur(res, e, 'public/jours'); }
});

router.get('/api/public/salons/:slug/dispo', quotaLecture, async (req, res) => {
  const date = String(req.query.date || '');
  if (!estDate(date)) return res.status(400).json({ error: 'Date invalide' });
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const presta = await prestationActive(salon.id, req.query.prestation);
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    const ctx = await contexteDispo(pool, salon.id, date, date);
    res.json({ heures: creneaux({ ...ctx, duree: presta.duree_min, date, maintenant: nowParis() }) });
  } catch (e) { erreurServeur(res, e, 'public/dispo'); }
});

router.post('/api/public/salons/:slug/reserver', quotaEcriture, async (req, res) => {
  const b = req.body || {};
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    if (!reservable(salon)) return res.status(403).json(INDISPONIBLE(salon));
    const client = lireClient(b);
    if (client.erreur) return res.status(400).json({ error: client.erreur });
    if (!estDate(b.date) || !estHeure(b.heure)) return res.status(400).json({ error: 'Créneau invalide' });
    if (b.date > decaleJours(nowParis().date, HORIZON_JOURS - 1)) {
      return res.status(400).json({ error: `On ne réserve pas plus de ${HORIZON_JOURS} jours à l'avance` });
    }
    const presta = await prestationActive(salon.id, b.prestation_id);
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    const libres = await contexteDispo(pool, salon.id, b.date, b.date)
      .then(ctx => creneaux({ ...ctx, duree: presta.duree_min, date: b.date, maintenant: nowParis() }));
    if (!libres.includes(b.heure)) {
      // Heure hors de la grille (10:07) ou déjà prise : on distingue les deux.
      const grille = await contexteDispo(pool, salon.id, b.date, b.date)
        .then(ctx => creneaux({ ...ctx, rdv: [], duree: presta.duree_min, date: b.date, maintenant: null }));
      if (!grille.includes(b.heure)) return res.status(400).json({ error: "Cette heure n'est pas proposée" });
    }
    // Verrou par salon : deux clients qui cliquent la même heure au même instant
    // ne l'obtiennent pas tous les deux.
    const rdv = await transaction(async q => {
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [salon.id]);
      const ctx = await contexteDispo(q, salon.id, b.date, b.date);
      if (!creneaux({ ...ctx, duree: presta.duree_min, date: b.date, maintenant: nowParis() }).includes(b.heure)) return null;
      const clientId = await trouverOuCreerClient(q, salon.id, client);
      const nouveau = { id: uid('r'), jeton: crypto.randomBytes(24).toString('hex') };
      await q.query(
        `INSERT INTO rdv (id, salon_id, client_id, client_nom, telephone, prestation_id, prestation_nom, prix, duree_min, date, heure, source, jeton_annulation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'site', $12)`,
        [nouveau.id, salon.id, clientId, client.nom, client.telephone, presta.id, presta.nom, presta.prix, presta.duree_min, b.date, b.heure, nouveau.jeton]);
      return nouveau;
    });
    if (!rdv) return res.status(409).json({ error: "Ce créneau vient d'être pris, choisis-en un autre" });
    notifierSalon(salon.id, {
      type: 'nouveau-rdv', titre: 'Nouveau rendez-vous',
      corps: `${client.nom} — ${presta.nom}, ${jourLisible(b.date)} à ${b.heure}`,
    });
    res.status(201).json({ rdv: { date: b.date, heure: b.heure, prestation: presta.nom, prix: presta.prix }, annulation: rdv.jeton });
  } catch (e) { erreurServeur(res, e, 'public/reserver'); }
});

router.post('/api/public/salons/:slug/attente', quotaEcriture, async (req, res) => {
  const b = req.body || {};
  try {
    const salon = await salonDuSlug(req.params.slug);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    if (!reservable(salon)) return res.status(403).json(INDISPONIBLE(salon));
    const client = lireClient(b);
    if (client.erreur) return res.status(400).json({ error: client.erreur });
    const auj = nowParis().date;
    if (!estDate(b.date) || b.date < auj || b.date > decaleJours(auj, HORIZON_JOURS - 1)) {
      return res.status(400).json({ error: 'Date invalide' });
    }
    const deja = await pool.query('SELECT 1 FROM attente WHERE salon_id = $1 AND date = $2 AND telephone = $3', [salon.id, b.date, client.telephone]);
    if (!deja.rowCount) {
      await pool.query('INSERT INTO attente (id, salon_id, date, nom, telephone) VALUES ($1, $2, $3, $4, $5)',
        [uid('a'), salon.id, b.date, client.nom, client.telephone]);
      notifierSalon(salon.id, { type: 'attente', titre: "Liste d'attente", corps: `${client.nom} attend une place ${jourLisible(b.date)}` });
    }
    res.status(201).json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'public/attente'); }
});

const JETON = /^[0-9a-f]{48}$/;

router.get('/api/public/rdv/:jeton', quotaAnnulation, async (req, res) => {
  if (!JETON.test(req.params.jeton)) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  try {
    const r = (await pool.query(
      `SELECT r.*, s.nom AS salon_nom, s.telephone AS salon_tel, s.slug FROM rdv r JOIN salons s ON s.id = r.salon_id WHERE r.jeton_annulation = $1`,
      [req.params.jeton])).rows[0];
    if (!r) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    res.json({
      salon: { nom: r.salon_nom, telephone: r.salon_tel, slug: r.slug },
      rdv: { date: r.date, heure: r.heure, prestation: r.prestation_nom, prix: r.prix, statut: r.statut,
        annulable: r.statut === 'confirme' && !creneauPasse(r.date, r.heure) },
    });
  } catch (e) { erreurServeur(res, e, 'public/rdv'); }
});

router.post('/api/public/annuler', quotaAnnulation, async (req, res) => {
  const jeton = String(req.body?.jeton || '');
  if (!JETON.test(jeton)) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  try {
    const r = (await pool.query('SELECT * FROM rdv WHERE jeton_annulation = $1', [jeton])).rows[0];
    if (!r) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    if (r.statut !== 'confirme') return res.status(409).json({ error: 'Ce rendez-vous est déjà annulé' });
    if (creneauPasse(r.date, r.heure)) {
      return res.status(409).json({ error: "L'heure du rendez-vous est passée : il ne s'annule plus en ligne" });
    }
    const maj = await pool.query(`UPDATE rdv SET statut = 'annule' WHERE id = $1 AND statut = 'confirme'`, [r.id]);
    if (!maj.rowCount) return res.status(409).json({ error: 'Ce rendez-vous est déjà annulé' });
    notifierSalon(r.salon_id, { type: 'annulation', titre: 'Rendez-vous annulé', corps: `${r.client_nom} a annulé ${jourLisible(r.date)} à ${r.heure}` });
    signalerPlaceLibre(r.salon_id, r.date);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'public/annuler'); }
});

module.exports = router;
```

Note : le test `fiche client créée` dépend de `GET /api/clients` (Task 8). Tant
que la Task 8 n'est pas faite, ces trois vérifications échouent ; c'est attendu.

- [ ] **Step 7: Relancer** — Expected : tout en ✓ sauf les trois vérifications de fiches clients.

- [ ] **Step 8: Commit**

```bash
git add backend && git commit -m "feat(backend): page de réservation publique, annulation, liste d'attente"
```

---

### Task 8: Agenda, clients et liste d'attente du barbier

**Files:**
- Replace: `backend/routes/rdv.js`, `backend/routes/clients.js`, `backend/routes/attente.js`
- Modify: `backend/test-scenarios.mjs` (sections T6 et T2)

- [ ] **Step 1: Ajouter aux scénarios**

```js
  console.log('T6 — agenda du barbier et visites');
  const hier = dansJours(-1);
  const passe = await appel('POST', '/api/rdv', { client_nom: 'Ancien', telephone: '0600000001', prestation_id: coupe.id, date: hier, heure: '10:00' }, A);
  ok(passe.s === 201 && passe.d.rdv.source === 'dashboard', 'le dashboard saisit un rdv passé', passe);
  ok((await appel('POST', '/api/public/annuler', { jeton: passe.d.rdv.jeton_annulation })).s === 409, "annulation en ligne après l'heure refusée");
  const onze = await appel('POST', '/api/rdv', { client_nom: 'Midi', telephone: '0600000002', prestation_id: coupe.id, date: J, heure: '11:00' }, A);
  ok(onze.s === 201 && !(await dispo()).includes('11:00'), 'rdv du dashboard bloque la page publique');
  ok((await appel('POST', '/api/rdv', { client_nom: 'Collé', telephone: '0600000003', prestation_id: coupe.id, date: J, heure: '11:15' }, A)).s === 409, 'chevauchement signalé');
  ok((await appel('POST', '/api/rdv', { client_nom: 'Collé', telephone: '0600000003', prestation_id: coupe.id, date: J, heure: '11:15', forcer: true }, A)).s === 201, 'chevauchement forcé accepté');
  ok((await appel('PATCH', `/api/rdv/${onze.d.rdv.id}`, { statut: 'noshow' }, A)).d.rdv.statut === 'noshow', 'no-show enregistré');
  ok((await appel('PATCH', `/api/rdv/${onze.d.rdv.id}`, { statut: 'parti' }, A)).s === 400, 'statut inconnu refusé');
  const deplace = await appel('PATCH', `/api/rdv/${passe.d.rdv.id}`, { date: J, heure: '17:00' }, A);
  ok(deplace.s === 200 && deplace.d.rdv.date === J && !(await dispo()).includes('17:00'), 'rdv déplacé');
  const agenda = await appel('GET', `/api/rdv?du=${J}&au=${J}`, undefined, A);
  ok(agenda.s === 200 && agenda.d.rdv.some(r => r.heure === '17:00') && agenda.d.rdv.every(r => r.date === J), 'agenda du jour', agenda.d);

  const cl = await appel('POST', '/api/clients', { nom: 'Fidèle', telephone: '06 77 77 77 77', notes: 'dégradé bas' }, A);
  ok(cl.s === 201 && cl.d.client.telephone === '0677777777', 'client créé', cl);
  const cid = cl.d.client.id;
  const d2 = dansJours(-2), d3 = dansJours(-3), d4 = dansJours(-4);
  await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d2, heure: '10:00' }, A);
  await appel('POST', '/api/rdv', { client_id: cid, prestation_id: barbe.id, date: d2, heure: '10:30' }, A);
  await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d4, heure: '15:00' }, A);
  const an = await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d3, heure: '10:00' }, A);
  await appel('PATCH', `/api/rdv/${an.d.rdv.id}`, { statut: 'annule' }, A);
  const ns = await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: d3, heure: '14:00' }, A);
  await appel('PATCH', `/api/rdv/${ns.d.rdv.id}`, { statut: 'noshow' }, A);
  const fiche = await appel('GET', `/api/clients/${cid}`, undefined, A);
  ok(fiche.s === 200 && fiche.d.client.visites === 2, 'deux rdv le même jour = une visite ; annulé et no-show ne comptent pas', fiche.d?.client);
  ok(fiche.d.client.depense === 50 && fiche.d.client.derniere_venue === d2, 'dépense et dernière venue', fiche.d?.client);
  ok(fiche.d.client.habituelle === 'Coupe' && fiche.d.historique.length === 5, 'prestation habituelle et historique', fiche.d);
  ok((await appel('PATCH', `/api/clients/${cid}`, { notes: 'dégradé haut' }, A)).d.client.notes === 'dégradé haut', 'notes modifiées');
  ok((await appel('GET', '/api/clients?q=fid', undefined, A)).d.clients.some(c => c.id === cid), 'recherche par nom');
  ok((await appel('GET', '/api/clients?q=0677', undefined, A)).d.clients.some(c => c.id === cid), 'recherche par numéro');
  const la = await appel('GET', '/api/attente', undefined, A);
  ok(la.d.attente.length === 1 && la.d.attente[0].nom === 'Patient', "liste d'attente visible, sans doublon", la.d);
  ok((await appel('PATCH', `/api/attente/${la.d.attente[0].id}`, { prevenu: true }, A)).d.attente.prevenu_le, 'marqué prévenu');

  console.log('T2 — isolation entre salons');
  ok((await appel('GET', `/api/clients/${cid}`, undefined, B)).s === 404, 'B ne lit pas un client de A');
  ok((await appel('PATCH', `/api/clients/${cid}`, { nom: 'Pirate' }, B)).s === 404, 'B ne modifie pas un client de A');
  ok((await appel('PATCH', `/api/prestations/${coupe.id}`, { prix: 1 }, B)).s === 404, 'B ne modifie pas une prestation de A');
  ok((await appel('PATCH', `/api/rdv/${passe.d.rdv.id}`, { statut: 'annule' }, B)).s === 404, 'B ne touche pas un rdv de A');
  ok((await appel('DELETE', `/api/fermetures/${f.d.fermeture.id}`, undefined, B)).s === 404, 'B ne supprime pas une fermeture de A');
  ok((await appel('PATCH', `/api/attente/${la.d.attente[0].id}`, { prevenu: false }, B)).s === 404, "B ne touche pas l'attente de A");
  ok((await appel('POST', '/api/rdv', { client_id: cid, prestation_id: coupe.id, date: J, heure: '18:00' }, B)).s === 404, 'B ne réserve pas avec une prestation de A');
  const prestaB0 = (await appel('GET', '/api/prestations', undefined, B)).d.prestations[0];
  ok((await appel('POST', '/api/rdv', { client_id: cid, prestation_id: prestaB0.id, date: J, heure: '18:00' }, B)).s === 404, 'B ne réserve pas pour un client de A');
  ok(!(await appel('GET', '/api/clients', undefined, B)).d.clients.some(c => c.id === cid), 'la liste de B ne contient rien de A');
  ok((await appel('GET', `/api/rdv?du=${dansJours(-10)}&au=${dansJours(10)}`, undefined, B)).d.rdv.length === 0, "l'agenda de B est vide");
  ok((await appel('GET', '/api/attente', undefined, B)).d.attente.length === 0, "l'attente de B est vide");
```

- [ ] **Step 2: Lancer, vérifier l'échec** — Expected : `✗ le dashboard saisit un rdv passé`.

- [ ] **Step 3: `routes/rdv.js`**

```js
/* ── Agenda du barbier ──
   Le barbier sait ce qu'il fait : il peut saisir un RDV passé ou hors
   horaires. Il est seulement prévenu d'un chevauchement (forcer: true). */
const crypto = require('crypto');
const express = require('express');
const { pool, uid } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { chevauche } = require('../lib/dispo');
const { trouverOuCreerClient } = require('../lib/clients');
const { signalerPlaceLibre } = require('../lib/notifs');
const { estDate, estHeure, nowParis, decaleJours } = require('../lib/dates');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();
const STATUTS = ['confirme', 'annule', 'noshow'];
const CHEVAUCHEMENT = { error: 'Ce créneau chevauche un autre rendez-vous', chevauchement: true };

const rdvDuJour = (salonId, date) =>
  pool.query(`SELECT id, date, heure, duree_min, statut FROM rdv WHERE salon_id = $1 AND date = $2`, [salonId, date]).then(r => r.rows);

router.get('/api/rdv', exigerCompte, async (req, res) => {
  const du = String(req.query.du || nowParis().date);
  const au = String(req.query.au || decaleJours(du, 6));
  if (!estDate(du) || !estDate(au) || au < du) return res.status(400).json({ error: 'Période invalide' });
  try {
    const r = await pool.query(
      'SELECT * FROM rdv WHERE salon_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, heure', [req.salonId, du, au]);
    res.json({ rdv: r.rows });
  } catch (e) { erreurServeur(res, e, 'rdv'); }
});

router.post('/api/rdv', exigerCompte, exigerEcriture, async (req, res) => {
  const b = req.body || {};
  if (!estDate(b.date) || !estHeure(b.heure)) return res.status(400).json({ error: 'Date ou heure invalide' });
  try {
    const presta = (await pool.query('SELECT * FROM prestations WHERE id = $1 AND salon_id = $2', [String(b.prestation_id || ''), req.salonId])).rows[0];
    if (!presta) return res.status(404).json({ error: 'Prestation introuvable' });
    let client;
    if (b.client_id) {
      client = (await pool.query('SELECT id, nom, telephone FROM clients WHERE id = $1 AND salon_id = $2', [String(b.client_id), req.salonId])).rows[0];
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
    } else {
      const nom = sanitizeText(b.client_nom, 80);
      if (!nom) return res.status(400).json({ error: 'Indique le nom du client' });
      const id = await trouverOuCreerClient(pool, req.salonId, { nom, telephone: sanitizeText(b.telephone, 30) });
      client = (await pool.query('SELECT id, nom, telephone FROM clients WHERE id = $1', [id])).rows[0];
    }
    if (!b.forcer && chevauche(await rdvDuJour(req.salonId, b.date), b.date, b.heure, presta.duree_min)) {
      return res.status(409).json(CHEVAUCHEMENT);
    }
    const r = await pool.query(
      `INSERT INTO rdv (id, salon_id, client_id, client_nom, telephone, prestation_id, prestation_nom, prix, duree_min, date, heure, source, jeton_annulation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'dashboard', $12) RETURNING *`,
      [uid('r'), req.salonId, client.id, client.nom, client.telephone, presta.id, presta.nom, presta.prix, presta.duree_min,
        b.date, b.heure, crypto.randomBytes(24).toString('hex')]);
    res.status(201).json({ rdv: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'rdv/creer'); }
});

router.patch('/api/rdv/:id', exigerCompte, exigerEcriture, async (req, res) => {
  const b = req.body || {};
  try {
    const avant = (await pool.query('SELECT * FROM rdv WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId])).rows[0];
    if (!avant) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    const apres = {
      date: b.date !== undefined ? b.date : avant.date,
      heure: b.heure !== undefined ? b.heure : avant.heure,
      statut: b.statut !== undefined ? b.statut : avant.statut,
    };
    if (!estDate(apres.date) || !estHeure(apres.heure)) return res.status(400).json({ error: 'Date ou heure invalide' });
    if (!STATUTS.includes(apres.statut)) return res.status(400).json({ error: 'Statut inconnu' });
    const bouge = apres.date !== avant.date || apres.heure !== avant.heure;
    if (bouge && apres.statut === 'confirme' && !b.forcer
      && chevauche(await rdvDuJour(req.salonId, apres.date), apres.date, apres.heure, avant.duree_min, avant.id)) {
      return res.status(409).json(CHEVAUCHEMENT);
    }
    const r = await pool.query(
      'UPDATE rdv SET date = $3, heure = $4, statut = $5 WHERE id = $1 AND salon_id = $2 RETURNING *',
      [avant.id, req.salonId, apres.date, apres.heure, apres.statut]);
    // L'ancienne place se libère si le RDV est annulé, marqué no-show ou déplacé.
    if (avant.statut === 'confirme' && (apres.statut !== 'confirme' || bouge)) signalerPlaceLibre(req.salonId, avant.date);
    res.json({ rdv: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'rdv/modifier'); }
});

module.exports = router;
```

- [ ] **Step 4: `routes/clients.js`**

```js
/* ── Fiches clients ──
   Visites et dépense sont calculées à la lecture, jamais stockées : une visite
   est un JOUR où le client a un RDV confirmé déjà passé. Rien à recalculer
   quand un statut change. */
const express = require('express');
const { pool, uid } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { nowParis } = require('../lib/dates');
const { telAStocker } = require('../lib/telephone');
const { sanitizeText } = require('../lib/texte');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

// $2 = date du jour, $3 = heure actuelle (Paris).
const VENU = `r.statut = 'confirme' AND (r.date < $2 OR (r.date = $2 AND r.heure <= $3))`;
const STATS = `
  COUNT(DISTINCT r.date) FILTER (WHERE ${VENU}) AS visites,
  COALESCE(SUM(r.prix) FILTER (WHERE ${VENU}), 0) AS depense,
  MAX(r.date) FILTER (WHERE ${VENU}) AS derniere_venue`;

function lireChamps(b, partiel) {
  const c = {};
  if (!partiel || b.nom !== undefined) {
    const nom = sanitizeText(b.nom, 80);
    if (!nom) return { erreur: 'Indique le nom du client' };
    c.nom = nom;
  }
  if (b.telephone !== undefined) c.telephone = telAStocker(sanitizeText(b.telephone, 30));
  if (b.email !== undefined) c.email = sanitizeText(b.email, 120);
  if (b.notes !== undefined) c.notes = sanitizeText(b.notes, 1000);
  return { c };
}

router.get('/api/clients', exigerCompte, async (req, res) => {
  const { date, time } = nowParis();
  const q = String(req.query.q || '').trim().slice(0, 60);
  try {
    const r = await pool.query(
      `SELECT c.*, ${STATS}
         FROM clients c LEFT JOIN rdv r ON r.client_id = c.id AND r.salon_id = c.salon_id
        WHERE c.salon_id = $1 AND ($4 = '' OR c.nom ILIKE '%' || $4 || '%' OR c.telephone LIKE '%' || $4 || '%')
        GROUP BY c.id ORDER BY c.nom`, [req.salonId, date, time, q]);
    res.json({ clients: r.rows });
  } catch (e) { erreurServeur(res, e, 'clients'); }
});

router.get('/api/clients/:id', exigerCompte, async (req, res) => {
  const { date, time } = nowParis();
  try {
    const r = await pool.query(
      `SELECT c.*, ${STATS}
         FROM clients c LEFT JOIN rdv r ON r.client_id = c.id AND r.salon_id = c.salon_id
        WHERE c.salon_id = $1 AND c.id = $4 GROUP BY c.id`, [req.salonId, date, time, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Client introuvable' });
    const [habituelle, historique] = await Promise.all([
      pool.query(
        `SELECT r.prestation_nom FROM rdv r WHERE r.salon_id = $1 AND r.client_id = $4 AND ${VENU}
          GROUP BY r.prestation_nom ORDER BY COUNT(*) DESC, MAX(r.date) DESC, r.prestation_nom LIMIT 1`,
        [req.salonId, date, time, req.params.id]),
      pool.query('SELECT * FROM rdv WHERE salon_id = $1 AND client_id = $2 ORDER BY date DESC, heure DESC LIMIT 100', [req.salonId, req.params.id]),
    ]);
    res.json({ client: { ...r.rows[0], habituelle: habituelle.rows[0]?.prestation_nom || null }, historique: historique.rows });
  } catch (e) { erreurServeur(res, e, 'clients/fiche'); }
});

// Création explicite depuis le dashboard : pas de rapprochement automatique.
router.post('/api/clients', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, false);
  if (erreur) return res.status(400).json({ error: erreur });
  try {
    const r = await pool.query(
      'INSERT INTO clients (id, salon_id, nom, telephone, email, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uid('c'), req.salonId, c.nom, c.telephone || '', c.email || '', c.notes || '']);
    res.status(201).json({ client: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'clients/creer'); }
});

router.patch('/api/clients/:id', exigerCompte, exigerEcriture, async (req, res) => {
  const { c, erreur } = lireChamps(req.body || {}, true);
  if (erreur) return res.status(400).json({ error: erreur });
  const cles = Object.keys(c);
  try {
    const r = cles.length
      ? await pool.query(
        `UPDATE clients SET ${cles.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND salon_id = $2 RETURNING *`,
        [req.params.id, req.salonId, ...cles.map(k => c[k])])
      : await pool.query('SELECT * FROM clients WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Client introuvable' });
    res.json({ client: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'clients/modifier'); }
});

module.exports = router;
```

- [ ] **Step 5: `routes/attente.js`**

```js
const express = require('express');
const { pool } = require('../lib/db');
const { exigerCompte, exigerEcriture } = require('../lib/auth');
const { nowParis } = require('../lib/dates');
const { erreurServeur } = require('../lib/http');

const router = express.Router();

router.get('/api/attente', exigerCompte, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM attente WHERE salon_id = $1 AND date >= $2 ORDER BY date, created_at', [req.salonId, nowParis().date]);
    res.json({ attente: r.rows });
  } catch (e) { erreurServeur(res, e, 'attente'); }
});

router.patch('/api/attente/:id', exigerCompte, exigerEcriture, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE attente SET prevenu_le = CASE WHEN $3 THEN NOW() ELSE NULL END WHERE id = $1 AND salon_id = $2 RETURNING *`,
      [req.params.id, req.salonId, !!req.body?.prevenu]);
    if (!r.rowCount) return res.status(404).json({ error: 'Demande introuvable' });
    res.json({ attente: r.rows[0] });
  } catch (e) { erreurServeur(res, e, 'attente/modifier'); }
});

router.delete('/api/attente/:id', exigerCompte, exigerEcriture, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM attente WHERE id = $1 AND salon_id = $2', [req.params.id, req.salonId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Demande introuvable' });
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e, 'attente/supprimer'); }
});

module.exports = router;
```

- [ ] **Step 6: Relancer** — Expected : tout en ✓ jusqu'à T2 compris.

- [ ] **Step 7: Commit**

```bash
git add backend && git commit -m "feat(backend): agenda, fiches clients et liste d'attente du barbier"
```

---

### Task 9: Back-office de Félix, fin d'essai, mot de passe oublié, suppression

**Files:**
- Replace: `backend/routes/admin.js`, `backend/lib/taches.js`
- Modify: `backend/test-scenarios.mjs` (sections T7, T8, T10, T11)

- [ ] **Step 1: Ajouter aux scénarios**

```js
  console.log("T7 — fin de l'essai");
  ok((await appel('POST', '/api/admin/connexion', { mdp: 'mauvais' })).s === 401, 'mauvais mot de passe admin refusé');
  const adm = await appel('POST', '/api/admin/connexion', { mdp: ADMIN_PASSWORD });
  ok(adm.s === 200 && adm.d.jeton, 'connexion admin');
  const ADM = adm.d.jeton;
  const salonB = insB.d.salon.id;
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { essai_fin: '2020-01-01' }, ADM)).s === 200, "l'admin avance la fin d'essai");
  ok((await appel('GET', '/api/moi', undefined, B)).d.salon.statut === 'expire', 'statut expiré');
  ok((await appel('POST', '/api/prestations', { nom: 'Test', duree_min: 30, prix: 10 }, B)).s === 402, "écriture refusée après l'essai");
  ok((await appel('GET', '/api/prestations', undefined, B)).s === 200, "lecture autorisée après l'essai");
  const pubB = await appel('GET', `/api/public/salons/${slugB}`);
  ok(pubB.d.reservable === false, 'page publique fermée');
  ok((await appel('POST', `/api/public/salons/${slugB}/reserver`, { prestation_id: prestaB0.id, date: dansJours(3), heure: '10:00', nom: 'X', telephone: '0600000000', consentement: true })).s === 403, 'réservation publique refusée');
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { statut: 'actif' }, ADM)).s === 400, 'activer sans plan refusé');
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { statut: 'actif', plan: 'pro' }, ADM)).s === 200, "l'admin active le salon");
  ok((await appel('POST', '/api/prestations', { nom: 'Test', duree_min: 30, prix: 10 }, B)).s === 201, 'écriture de nouveau possible');

  console.log('T8 — mot de passe oublié');
  ok((await appel('POST', '/api/comptes/mot-de-passe-oublie', { email: 'inconnu@test.fr' })).s === 200, 'email inconnu : même réponse');
  ok((await appel('POST', '/api/comptes/mot-de-passe-oublie', { email: emailA })).s === 200, 'demande de nouveau mot de passe');
  const jr = await dernierJeton(emailA, 'reset');
  ok(!!jr, 'email envoyé');
  ok((await appel('POST', '/api/comptes/reinitialiser', { jeton: jr, mdp: 'nouveaumdp1' })).s === 200, 'mot de passe changé');
  ok((await appel('POST', '/api/comptes/reinitialiser', { jeton: jr, mdp: 'encoreun11' })).s === 400, 'lien à usage unique');
  ok((await appel('POST', '/api/comptes/connexion', { email: emailA, mdp: 'nouveaumdp1' })).s === 200, 'connexion avec le nouveau mot de passe');
  ok((await appel('POST', '/api/comptes/mot-de-passe', { actuel: 'faux', nouveau: 'autremdp11' }, A)).s === 403, 'changement refusé sans le mot de passe actuel');
  ok((await appel('POST', '/api/comptes/mot-de-passe', { actuel: 'nouveaumdp1', nouveau: 'autremdp11' }, A)).s === 200, 'changement de mot de passe');

  console.log('T10 — back-office');
  ok((await appel('GET', '/api/admin/salons')).s === 401, 'sans jeton refusé');
  ok((await appel('GET', '/api/admin/salons', undefined, A)).s === 401, 'un jeton barbier ne suffit pas');
  const sal = await appel('GET', '/api/admin/salons', undefined, ADM);
  const ligneA = sal.d?.salons?.find(s => s.slug === slugA2);
  ok(sal.s === 200 && ligneA && ligneA.bot_statut === 'demande' && ligneA.email === emailA && ligneA.rdv_30j >= 5, 'liste des salons', ligneA);
  const kpi = await appel('GET', '/api/admin/kpi', undefined, ADM);
  ok(kpi.s === 200 && kpi.d.demandes_bot >= 1 && kpi.d.mrr >= 79 && kpi.d.essai >= 1, 'indicateurs', kpi.d);
  ok((await appel('PATCH', `/api/admin/salons/${salonB}`, { plan: 'gratuit' }, ADM)).s === 400, 'plan inconnu refusé');

  console.log('T11 — suppression du compte');
  ok((await appel('DELETE', '/api/salon', { confirmation: 'pas le bon' }, B)).s === 400, 'confirmation exigée');
  ok((await appel('DELETE', '/api/salon', { confirmation: nomSalon }, B)).s === 200, 'compte supprimé');
  ok((await appel('POST', '/api/comptes/connexion', { email: emailB, mdp: 'motdepasse2' })).s === 401, 'plus de connexion');
  ok((await appel('GET', '/api/moi', undefined, B)).s === 401, 'ancien jeton inutilisable');
  ok((await appel('GET', `/api/public/salons/${slugB}`)).s === 404, 'page publique supprimée');
```

- [ ] **Step 2: Lancer, vérifier l'échec** — Expected : `✗ mauvais mot de passe admin refusé` (404).

- [ ] **Step 3: `routes/admin.js`**

```js
/* ── Back-office de Félix ──
   Jeton admin distinct des jetons barbier, obtenu avec ADMIN_PASSWORD. */
const crypto = require('crypto');
const express = require('express');
const { pool } = require('../lib/db');
const { jetonAdmin, exigerAdmin } = require('../lib/auth');
const { vueSalon, statutEffectif, PRIX_PLANS } = require('../lib/salon');
const { estDate, nowParis } = require('../lib/dates');
const { erreurServeur, quota } = require('../lib/http');

const router = express.Router();
const STATUTS = ['essai', 'actif', 'expire', 'suspendu'];
const BOT = ['inactif', 'demande', 'actif'];
const empreinte = s => crypto.createHash('sha256').update(String(s)).digest();

router.post('/api/admin/connexion', quota(10, 15 * 60 * 1000), (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD non configuré' });
  if (!crypto.timingSafeEqual(empreinte(req.body?.mdp || ''), empreinte(process.env.ADMIN_PASSWORD))) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  try { res.json({ jeton: jetonAdmin() }); } catch (e) { erreurServeur(res, e, 'admin/connexion'); }
});

async function lesSalons() {
  const r = await pool.query(`
    SELECT s.*, c.email, c.email_verifie_le, c.derniere_connexion_le,
           (SELECT COUNT(*) FROM rdv r WHERE r.salon_id = s.id AND r.created_at > NOW() - INTERVAL '30 days') AS rdv_30j
      FROM salons s LEFT JOIN comptes c ON c.salon_id = s.id
     ORDER BY s.created_at DESC`);
  return r.rows.map(s => ({
    ...vueSalon(s), email: s.email, email_verifie: !!s.email_verifie_le,
    derniere_connexion_le: s.derniere_connexion_le, rdv_30j: s.rdv_30j, created_at: s.created_at,
  }));
}

router.get('/api/admin/salons', exigerAdmin, async (_req, res) => {
  try { res.json({ salons: await lesSalons() }); } catch (e) { erreurServeur(res, e, 'admin/salons'); }
});

router.get('/api/admin/kpi', exigerAdmin, async (_req, res) => {
  try {
    const salons = await lesSalons();
    const compte = st => salons.filter(s => s.statut === st).length;
    res.json({
      essai: compte('essai'), actifs: compte('actif'), expires: compte('expire'), suspendus: compte('suspendu'),
      mrr: salons.filter(s => s.statut === 'actif' && s.plan).reduce((t, s) => t + PRIX_PLANS[s.plan], 0),
      demandes_bot: salons.filter(s => s.bot_statut === 'demande').length,
    });
  } catch (e) { erreurServeur(res, e, 'admin/kpi'); }
});

router.patch('/api/admin/salons/:id', exigerAdmin, async (req, res) => {
  const b = req.body || {};
  try {
    const salon = (await pool.query('SELECT * FROM salons WHERE id = $1', [req.params.id])).rows[0];
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    const c = {};
    if (b.statut !== undefined) {
      if (!STATUTS.includes(b.statut)) return res.status(400).json({ error: 'Statut inconnu' });
      c.statut = b.statut;
    }
    if (b.plan !== undefined) {
      if (b.plan !== null && !PRIX_PLANS[b.plan]) return res.status(400).json({ error: 'Plan inconnu' });
      c.plan = b.plan;
    }
    if (b.essai_fin !== undefined) {
      if (!estDate(b.essai_fin)) return res.status(400).json({ error: 'Date invalide' });
      c.essai_fin = b.essai_fin;
      // Prolonger l'essai d'un salon expiré le rouvre.
      if (b.statut === undefined && salon.statut === 'expire' && b.essai_fin >= nowParis().date) c.statut = 'essai';
    }
    if (b.bot_statut !== undefined) {
      if (!BOT.includes(b.bot_statut)) return res.status(400).json({ error: 'Statut de bot inconnu' });
      c.bot_statut = b.bot_statut;
    }
    if (c.statut === 'actif' && !(c.plan || salon.plan)) return res.status(400).json({ error: 'Choisis un plan pour activer ce salon' });
    const cles = Object.keys(c); // clés fixées ci-dessus
    if (!cles.length) return res.json({ salon: vueSalon(salon) });
    const r = await pool.query(
      `UPDATE salons SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [salon.id, ...cles.map(k => c[k])]);
    res.json({ salon: { ...vueSalon(r.rows[0]), statut_stocke: r.rows[0].statut, statut_effectif: statutEffectif(r.rows[0]) } });
  } catch (e) { erreurServeur(res, e, 'admin/salon'); }
});

module.exports = router;
```

- [ ] **Step 4: `lib/taches.js`**

```js
/* ── Tâches périodiques : fin d'essai et rappels ──
   Toutes les heures. Chaque rappel n'est envoyé qu'une fois (colonnes
   rappel_j7_le / rappel_j1_le posées dans le même UPDATE). */
const { pool } = require('./db');
const { nowParis, decaleJours } = require('./dates');
const emails = require('./emails');

const RAPPELS = [[7, 'rappel_j7_le'], [1, 'rappel_j1_le']];

async function tachesDuJour() {
  const auj = nowParis().date;
  await pool.query(`UPDATE salons SET statut = 'expire' WHERE statut = 'essai' AND essai_fin < $1`, [auj]);
  for (const [jours, colonne] of RAPPELS) {
    const r = await pool.query(
      `UPDATE salons s SET ${colonne} = NOW() FROM comptes c
        WHERE c.salon_id = s.id AND s.statut = 'essai' AND s.essai_fin = $1 AND s.${colonne} IS NULL
        RETURNING s.*, c.email`, [decaleJours(auj, jours)]);
    for (const salon of r.rows) emails.rappelEssai(salon.email, salon, jours);
  }
}

function demarrerTaches() {
  const tour = () => tachesDuJour().catch(e => console.error('[taches]', e.message));
  tour();
  setInterval(tour, 60 * 60 * 1000).unref();
}

module.exports = { demarrerTaches, tachesDuJour };
```

- [ ] **Step 5: Relancer** — Expected : `N/N vérifications passées`, code de sortie 0.

- [ ] **Step 6: Rejouer la suite sans recréer la base** — Expected : tout passe encore (données suffixées par lancement).

- [ ] **Step 7: Commit**

```bash
git add backend && git commit -m "feat(backend): back-office, fin d'essai et rappels"
```

---

### Task 10: CI, documentation, mise en ligne

**Files:**
- Create: `.github/workflows/tests.yml`
- Create: `backend/README.md`

- [ ] **Step 1: `.github/workflows/tests.yml`**

```yaml
name: Tests backend

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: trimsync_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    defaults:
      run:
        working-directory: backend
    env:
      DATABASE_URL: postgres://postgres:test@localhost:5432/trimsync_test
      TRIMSYNC_SECRET: test
      ADMIN_PASSWORD: test
      TRIMSYNC_TEST: '1'
      QUOTA_FACTEUR: '100'
      PORT: '3998'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - name: Scénarios
        run: |
          node server.js > serveur.log 2>&1 &
          for i in $(seq 1 30); do curl -sf localhost:3998/api/ping > /dev/null && break; sleep 1; done
          API=http://localhost:3998 node test-scenarios.mjs || (cat serveur.log; exit 1)
```

- [ ] **Step 2: `backend/README.md`** — commandes de « Lancer les tests en local » ci-dessus, liste des variables d'environnement (`DATABASE_URL`, `TRIMSYNC_SECRET`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `RESEND_API_KEY`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `SITE_URL`, `CORS_ORIGINES`, `NODE_ENV`, et pour les tests `TRIMSYNC_TEST`, `QUOTA_FACTEUR`), et la règle : **ne jamais poser `TRIMSYNC_TEST` en production** (il expose la boîte d'envoi).

- [ ] **Step 3: Commit et push**

```bash
git add .github backend/README.md && git commit -m "ci: tests du backend TrimSync" && git push origin main
```

- [ ] **Step 4: Vérifier la CI** — `gh run list --repo fefelegentil-spec/TrimSync --limit 1` → `completed success`.

- [ ] **Step 5: Vérifier le déploiement Railway**

```bash
curl -s https://trimsync-backend-production.up.railway.app/api/ping
```

Attendu : `version` = commit poussé. Tant que Félix n'a pas ajouté Postgres,
`"base":false` : les routes produit répondent 503, devis et chat fonctionnent.
Vérifier que `/api/devis` répond toujours (`curl -s -X POST … -d '{}'` → 400
« Champs requis manquants », pas 404 ni 500).
