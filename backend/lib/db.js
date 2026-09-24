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
