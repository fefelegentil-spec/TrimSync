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
     statut TEXT NOT NULL DEFAULT 'confirme' CHECK (statut IN ('confirme','annule','noshow','en_attente')),
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
  // Ajouts après la première mise en ligne : toujours en ALTER idempotent.
  `ALTER TABLE rdv ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS stripe_client TEXT`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS stripe_abonnement TEXT`,
  // Mise en route obligatoire : les salons déjà inscrits au moment de l'ajout
  // sont tenus pour « faits » (DEFAULT NOW() remplit les lignes existantes une
  // seule fois), les nouveaux partent à NULL et passent par le parcours guidé.
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS mise_en_route_le TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE salons ALTER COLUMN mise_en_route_le DROP DEFAULT`,
  // Personnalisation de la page de réservation.
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS instagram TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS couleur TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS logo_maj TIMESTAMPTZ`,
  `ALTER TABLE prestations ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
  // Règles de réservation réglées par le pro, et options activées par Félix
  // salon par salon (back-office) : { validation, prix_masques }.
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS delai_min_h INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS annulation_h INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS rappel_veille BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE rdv ADD COLUMN IF NOT EXISTS rappel_le TIMESTAMPTZ`,
  `ALTER TABLE salons ADD COLUMN IF NOT EXISTS objectif_mensuel INTEGER NOT NULL DEFAULT 0`,
  // « en_attente » : RDV pris sur la page d'un salon qui valide lui-même ses RDV.
  `ALTER TABLE rdv DROP CONSTRAINT IF EXISTS rdv_statut_check`,
  `ALTER TABLE rdv ADD CONSTRAINT rdv_statut_check CHECK (statut IN ('confirme','annule','noshow','en_attente'))`,
  // Plan « essentiel » (19 €/mois, page de réservation + rappels, sans bot) : la
  // contrainte en ligne de la table d'origine ne le connaissait pas.
  `ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_plan_check`,
  `ALTER TABLE salons ADD CONSTRAINT salons_plan_check CHECK (plan IN ('essentiel','starter','pro','max'))`,
  // Acompte anti no-show : montant demandé par prestation, payé par le client sur
  // Stripe juste après la réservation. Sur le RDV : copie au moment de la prise
  // (le montant demandé ne doit pas bouger si le pro change sa prestation après).
  `ALTER TABLE prestations ADD COLUMN IF NOT EXISTS acompte NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE rdv ADD COLUMN IF NOT EXISTS acompte NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE rdv ADD COLUMN IF NOT EXISTS acompte_paye_le TIMESTAMPTZ`,
  // Une ligne par paiement d'acompte, retrouvable et remboursable à la main :
  // le backend n'a pas de clé Stripe secrète, seul le webhook écrit ici.
  `CREATE TABLE IF NOT EXISTS acomptes (
     id TEXT PRIMARY KEY,
     rdv_id TEXT NOT NULL REFERENCES rdv(id) ON DELETE CASCADE,
     stripe_session TEXT NOT NULL,
     montant NUMERIC(10,2) NOT NULL,
     statut TEXT NOT NULL DEFAULT 'paye' CHECK (statut IN ('paye','a_rembourser','rembourse')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  // Le logo vit à part : salons est lu à chaque requête authentifiée (SELECT s.*),
  // une image de 60 Ko y serait relue pour rien.
  `CREATE TABLE IF NOT EXISTS salon_logos (
     salon_id TEXT PRIMARY KEY REFERENCES salons(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     image BYTEA NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS rdv_salon_date ON rdv (salon_id, date)`,
  `CREATE INDEX IF NOT EXISTS clients_salon ON clients (salon_id)`,
  `CREATE INDEX IF NOT EXISTS attente_salon_date ON attente (salon_id, date)`,
  `CREATE INDEX IF NOT EXISTS acomptes_rdv ON acomptes (rdv_id)`,
  // Le badge « Réservation par TrimSync » des pages /r/ : un clic = une ligne.
  // Rien sur le client (pas d'IP, pas de cookie) : juste le salon d'origine.
  `CREATE TABLE IF NOT EXISTS badge_clics (
     id TEXT PRIMARY KEY,
     salon_id TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS badge_clics_salon ON badge_clics (salon_id)`,
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
