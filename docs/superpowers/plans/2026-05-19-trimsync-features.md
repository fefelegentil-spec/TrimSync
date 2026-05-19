# TrimSync — 4 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Nouveau pricing 3 plans, booking TrimSync, dashboard interne SaaS, fond animé étendu.

**Architecture:** Tout dans `trimsync/` — fichiers autonomes HTML/CSS/JS vanilla. Zéro framework front. Motion@11 via CDN pour les animations. Supabase Auth pour le dashboard.

**Tech Stack:** HTML/CSS/JS vanilla, Motion@11 (CDN), Bricolage Grotesque + Figtree (Google Fonts), Supabase JS@2 (CDN pour dashboard), Tabler Icons (CDN).

---

### Tâche 1 — Nouveau pricing (trimsync/index.html)

**Files:**
- Modify: `trimsync/index.html` (section pricing lignes ~192-210 CSS + lignes 478-529 HTML)

- [ ] Ajouter le CSS des pricing cards dans le `<style>` (après `.vs-row:last-child`)
- [ ] Remplacer la section `<!-- PRICING -->` (id=pricing) par : setup banner €300 + grille 3 plans + ROI table conservée
- [ ] Mettre à jour le lien "Book a free demo" dans #cta vers `trimsync-booking.html`
- [ ] Commit

### Tâche 2 — Fond hero étendu (trimsync/index.html)

**Files:**
- Modify: `trimsync/index.html`

- [ ] Rendre `.feat{background}` semi-transparent (oklch var(--bg)/.0 → transparent)
- [ ] Ajouter opacité variable des orbes par section via JS scroll
- [ ] Vérifier que aucune section n'a fond noir uni opaque
- [ ] Commit

### Tâche 3 — trimsync-booking.html

**Files:**
- Create: `trimsync/trimsync-booking.html`

- [ ] Structure HTML : splash TrimSync → stepper 3 étapes (Créneau/Infos/Confirmation)
- [ ] CSS : couleurs teal (--a oklch(0.76 0.13 193)), Bricolage Grotesque + Figtree
- [ ] Calendrier + créneaux : lun-ven 9h-18h, 30min, 15min step, pas de paiement
- [ ] Formulaire contact : prénom, email, téléphone, entreprise, note
- [ ] Succès + Google Calendar + mise à jour lien dans trimsync/index.html
- [ ] Commit

### Tâche 4 — trimsync-dashboard.html

**Files:**
- Create: `trimsync/trimsync-dashboard.html`

- [ ] Login Supabase Auth (email/password) avec modal
- [ ] Sidebar nav : Dashboard, Clients, Paiements, Salons, Paramètres
- [ ] KPIs : clients actifs, MRR, démos bookées, taux conversion
- [ ] CRM : tableau clients avec plan (Starter/Pro/Max), onboarding, statut
- [ ] Paiements : tableau mensuel par client
- [ ] Salons : statut connexion webhook Meta
- [ ] Commit
