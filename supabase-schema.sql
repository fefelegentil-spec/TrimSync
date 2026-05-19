-- ═══════════════════════════════════════════════════════════
-- TRIMSYNC — Schéma Supabase
-- À exécuter dans l'éditeur SQL de ton projet Supabase
-- ═══════════════════════════════════════════════════════════

-- Table principale des salons TrimSync
CREATE TABLE IF NOT EXISTS salons (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL,
  slug         text UNIQUE,
  logo_url     text,
  plan         text CHECK (plan IN ('starter','pro','max')) DEFAULT 'starter',
  owner_email  text,
  booking_mode text CHECK (booking_mode IN ('redirect','native')) DEFAULT 'native',
  booking_url  text,
  created_at   timestamptz DEFAULT now()
);

-- Lie un utilisateur Supabase Auth à un salon
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  salon_id   uuid REFERENCES salons(id),
  created_at timestamptz DEFAULT now()
);

-- RLS : un user ne voit que son salon
ALTER TABLE salons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Politique : le user voit seulement le salon lié à son profil
CREATE POLICY "salon_owner" ON salons
  FOR ALL USING (
    id = (SELECT salon_id FROM profiles WHERE id = auth.uid())
  );

-- Politique : le user voit seulement son propre profil
CREATE POLICY "own_profile" ON profiles
  FOR ALL USING (id = auth.uid());
