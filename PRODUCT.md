# TrimSync — Product Context

## Product Purpose
TrimSync est un SaaS B2B pour les pros de la beauté indépendants (ongles/nail art, coiffure, cils, esthétique) : il automatise les réservations Instagram DM via IA, et fournit un dashboard de gestion (agenda, clients, stats). La landing page (`index.html`) vend l'abonnement ; `trimsync-booking.html` est le tunnel de démo ; `trimsync-dashboard.html` est la préview produit.

## Register
brand

## Users
- **Pros de la beauté indépendants** (prothésistes ongulaires, coiffeurs, techniciennes cils, esthéticiennes) : 1–3 places, gèrent seuls leurs RDV via Instagram. Cherchent à économiser du temps et ne plus rater de clients.
- **Gérants de salons / instituts** : 2–10 places, veulent un outil pro, pas un bricolage.
- **Profil décideur** : 20–45 ans, à l'aise avec les apps mobiles, sceptique vis-à-vis des promesses SaaS, convaincu par la preuve concrète (ROI chiffré, démo live).

## Brand
- Nom : TrimSync
- Univers : SaaS premium taillé pour les indépendants de la beauté — professionnel mais pas corporate, technologique mais pas froid
- Couleur accent : teal profond (`oklch(0.76 0.13 193)` / `#60c4c8`) sur fond quasi-noir (`oklch(0.12 0.008 222)`)
- Polices : Bricolage Grotesque (display/titles) + Figtree (body/labels)
- Ton : direct, confiant, factuel — jamais vendeur ou bullshit-marketing
- Tagline courante : "Your schedule fills itself." / « Ton agenda se remplit tout seul. »

## Strategic Principles
1. La preuve avant la promesse : chaque claim est soutenu par un chiffre ou une démo concrète
2. Le ROI est le seul argument qui compte pour un pro indépendant : montrer €200–400/mois récupérés
3. Friction zéro : setup en 10 minutes, pas de carte bancaire, 7 jours d'essai gratuit
4. Bilingue EN/FR avec switch en tête de nav (marché France + UK)
5. Mobile-first : les pros voient la landing sur téléphone
6. Jamais « barbier » / « barbershop » dans ce que voit un visiteur : le produit vise tous les métiers de la beauté (décision de Félix, 29/09/2026)

## Pricing (actuel)
- Starter : €59/mois (bot Instagram 24/7, DMs illimités, confirmations auto)
- Pro : €79/mois (+ dashboard, CRM, WhatsApp)
- Max : €99/mois (+ page réservation native, stats, fidélité, SumUp)
- Setup fee unique : €300 (accès plateforme + appel onboarding)

## Anti-references
- Pas de design SaaS générique (bleu navy + blanc + illustrations vecteur Storyset)
- Pas de hero-metric avec grand chiffre isolé sur fond dégradé
- Pas de glassmorphism décoratif
- Pas de grilles de cards identiques
- Pas de gradients de texte
- Pas de jargon "AI-powered" sans explication concrète

## Stack technique (landing)
- HTML/CSS/JS vanilla, inline (pas de bundler)
- `motion@11` (Framer Motion web) pour les animations
- Three.js pour le background shader hero
- Bilingue via `data-en`/`data-fr` + `applyLang()`
- Backend : `trimsync-backend-production.up.railway.app` (formulaire devis `/api/devis`)
