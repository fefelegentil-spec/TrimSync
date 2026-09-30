# Graph Report - TrimSync  (2026-09-30)

## Corpus Check
- Large corpus: 160 files · ~511,760 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 906 nodes · 1843 edges · 49 communities (46 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Hero 3D — scènes de la landing|Hero 3D — scènes de la landing]]
- [[_COMMUNITY_Agenda du salon (app barbier)|Agenda du salon (app barbier)]]
- [[_COMMUNITY_Page de réservation publique|Page de réservation publique]]
- [[_COMMUNITY_Dashboard multi-tenant (préview)|Dashboard multi-tenant (préview)]]
- [[_COMMUNITY_Outils dashboard — DB et nettoyage|Outils dashboard — DB et nettoyage]]
- [[_COMMUNITY_Disponibilités et créneaux publics|Disponibilités et créneaux publics]]
- [[_COMMUNITY_Boîte à idées et emails (Resend)|Boîte à idées et emails (Resend)]]
- [[_COMMUNITY_Authentification des comptes salons|Authentification des comptes salons]]
- [[_COMMUNITY_Jetons et réinitialisation|Jetons et réinitialisation]]
- [[_COMMUNITY_Salons — plans et statut d'abonnement|Salons — plans et statut d'abonnement]]
- [[_COMMUNITY_Fiches clients partagées|Fiches clients partagées]]
- [[_COMMUNITY_Formatage dates et montants|Formatage dates et montants]]
- [[_COMMUNITY_Réglages du salon|Réglages du salon]]
- [[_COMMUNITY_Noyau de l'app barbier|Noyau de l'app barbier]]
- [[_COMMUNITY_Dates à l'heure de Paris|Dates à l'heure de Paris]]
- [[_COMMUNITY_Routes rendez-vous (RDV)|Routes rendez-vous (RDV)]]
- [[_COMMUNITY_Slugs et textes sains|Slugs et textes sains]]
- [[_COMMUNITY_Administration et plans Stripe|Administration et plans Stripe]]
- [[_COMMUNITY_Fiche client et édition RDV|Fiche client et édition RDV]]
- [[_COMMUNITY_Parcours d'inscription et Stripe|Parcours d'inscription et Stripe]]
- [[_COMMUNITY_Landing — section des questions|Landing — section des questions]]
- [[_COMMUNITY_Notifications push des salons|Notifications push des salons]]
- [[_COMMUNITY_Tâches planifiées du backend|Tâches planifiées du backend]]
- [[_COMMUNITY_Liste d'attente|Liste d'attente]]
- [[_COMMUNITY_Prestations du salon|Prestations du salon]]
- [[_COMMUNITY_Module TrimSync 25|Module TrimSync 25]]
- [[_COMMUNITY_Module TrimSync 26|Module TrimSync 26]]
- [[_COMMUNITY_Module TrimSync 27|Module TrimSync 27]]
- [[_COMMUNITY_Module TrimSync 28|Module TrimSync 28]]
- [[_COMMUNITY_Module TrimSync 29|Module TrimSync 29]]
- [[_COMMUNITY_Module TrimSync 30|Module TrimSync 30]]
- [[_COMMUNITY_Module TrimSync 31|Module TrimSync 31]]
- [[_COMMUNITY_Module TrimSync 32|Module TrimSync 32]]
- [[_COMMUNITY_Module TrimSync 33|Module TrimSync 33]]
- [[_COMMUNITY_Module TrimSync 34|Module TrimSync 34]]
- [[_COMMUNITY_Module TrimSync 35|Module TrimSync 35]]
- [[_COMMUNITY_Module TrimSync 36|Module TrimSync 36]]
- [[_COMMUNITY_Module TrimSync 37|Module TrimSync 37]]
- [[_COMMUNITY_Module TrimSync 38|Module TrimSync 38]]
- [[_COMMUNITY_Module TrimSync 39|Module TrimSync 39]]
- [[_COMMUNITY_Module TrimSync 40|Module TrimSync 40]]
- [[_COMMUNITY_Module TrimSync 41|Module TrimSync 41]]
- [[_COMMUNITY_Module TrimSync 42|Module TrimSync 42]]
- [[_COMMUNITY_Module TrimSync 43|Module TrimSync 43]]
- [[_COMMUNITY_Module TrimSync 44|Module TrimSync 44]]

## God Nodes (most connected - your core abstractions)
1. `messageErreur()` - 38 edges
2. `saveDB()` - 30 edges
3. `apiCall()` - 27 edges
4. `toast()` - 22 edges
5. `renderDashboard()` - 22 edges
6. `renderAgenda()` - 20 edges
7. `renderAccueil()` - 19 edges
8. `renderParametres()` - 19 edges
9. `goStep()` - 18 edges
10. `TODAY()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Page publique de réservation — trimsync.tech/r/salon` --references--> `Route publique — les créneaux passés ne se réservent plus`  [INFERRED]
  reserver.html → backend/routes/public.js
- `Toutes les dates à l'heure de Paris — le serveur en UTC` --semantically_similar_to--> `Agenda — les libellés API traduits une fois au chargement`  [INFERRED] [semantically similar]
  backend/lib/dates.js → js/app/agenda.js
- `Hero 3D — scènes WebGL du DM Instagram au rendez-vous` --rationale_for--> `L'IA répond aux DM Instagram et réserve les clientes`  [EXTRACTED]
  js/hero3d/main.js → PRODUCT.md
- `Dashboard multi-tenant — Supabase JWT + salon_id` --references--> `Backend multi-salons — Express + PostgreSQL`  [EXTRACTED]
  js/dashboard-template.js → backend/README.md
- `renderAccueil()` --calls--> `initiales()`  [INFERRED]
  js/app/accueil.js → js/app/clients.js

## Hyperedges (group relationships)
- **La chaîne complète — DM, IA, agenda du salon, page publique** — product_ia_repond_dms, app_pwa_barbier, reservation_page_publique, backend_multi_salons [INFERRED 0.85]

## Communities (49 total, 3 thin omitted)

### Community 0 - "Hero 3D — scènes de la landing"
Cohesion: 0.06
Nodes (50): animateOverlayIn(), C, clamp(), cursorDot, drawIGAvatar(), drawIGHeader(), drawIGInputBar(), drawScreen0() (+42 more)

### Community 1 - "Agenda du salon (app barbier)"
Cohesion: 0.06
Nodes (53): agDate, agNext(), agOpenDay(), agPrev(), agSetView(), agToday(), annulerRdv(), box (+45 more)

### Community 2 - "Page de réservation publique"
Cohesion: 0.08
Nodes (59): addToCalendar(), adresseSalon(), api(), appliquerCouleur(), apresCreneau(), attenteRejointe(), calChange(), calMonth (+51 more)

### Community 3 - "Dashboard multi-tenant (préview)"
Cohesion: 0.04
Nodes (41): ADDONS, agDate, applyPlanGating(), backdrop, _bootAfterAuth(), BROADCAST_PRESETS, cart, ch (+33 more)

### Community 4 - "Outils dashboard — DB et nettoyage"
Cohesion: 0.07
Nodes (36): crypto, { erreurServeur }, exigerAdmin(), exigerCompte(), exigerEcriture(), hacherMdp(), jetonAdmin(), jetonCompte() (+28 more)

### Community 5 - "Disponibilités et créneaux publics"
Cohesion: 0.06
Nodes (29): contexteDispo(), dansHeures(), auPlusTot(), client, { contexteDispo }, { creneaux }, crypto, date (+21 more)

### Community 6 - "Boîte à idées et emails (Resend)"
Cohesion: 0.14
Nodes (35): addClosedDay(), apiCall(), broadcastToClients(), clearTestAppointments(), closeModal(), deduplicateClients(), deleteRdv(), getOrCreateClient() (+27 more)

### Community 7 - "Authentification des comptes salons"
Cohesion: 0.18
Nodes (31): boite, deposer(), jourLisible(), abonnementActive(), ADMIN(), alerteAdmin(), bouton(), C (+23 more)

### Community 8 - "Jetons et réinitialisation"
Cohesion: 0.07
Nodes (28): consommerJeton(), creerJeton(), crypto, empreinte(), bon, compteId, { creerJeton, consommerJeton }, email (+20 more)

### Community 9 - "Salons — plans et statut d'abonnement"
Cohesion: 0.16
Nodes (27): chargerReglages(), messageErreur(), ajouterFermeture(), ajouterPresta(), carte(), cartePersonnalisation(), changerMdp(), choisirCouleur() (+19 more)

### Community 10 - "Fiches clients partagées"
Cohesion: 0.1
Nodes (25): { normaliserNom }, { telAStocker }, trouverOuCreerClient(), { uid }, uid(), normalizePhone(), telAStocker(), telComposable() (+17 more)

### Community 11 - "Formatage dates et montants"
Cohesion: 0.1
Nodes (21): joursRestants(), { nowParis }, PRIX_PLANS, reservable(), SITE(), statutEffectif(), vueSalon(), BOT (+13 more)

### Community 12 - "Réglages du salon"
Cohesion: 0.12
Nodes (21): creneauPasse(), decaleJours(), estDate(), estHeure(), nowParis(), emails, { nowParis, decaleJours }, { pool } (+13 more)

### Community 13 - "Noyau de l'app barbier"
Cohesion: 0.14
Nodes (18): A_L_OUVERTURE, afficherSalon(), api(), cxConnexion(), cxInscription(), cxOnglet(), cxOubli(), deconnecter() (+10 more)

### Community 14 - "Dates à l'heure de Paris"
Cohesion: 0.09
Nodes (21): apres, au, { chevauche }, CHEVAUCHEMENT, client, crypto, du, emails (+13 more)

### Community 15 - "Routes rendez-vous (RDV)"
Cohesion: 0.13
Nodes (23): _caForPrefix(), dashSubtitle(), exportDB(), fidelityLevel(), fmtDateFR(), fmtMoney(), formatNotifDate(), renderCAChart() (+15 more)

### Community 16 - "Slugs et textes sains"
Cohesion: 0.1
Nodes (19): c, champs, cles, emails, { erreurServeur }, { exigerCompte, exigerEcriture }, express, image (+11 more)

### Community 17 - "Administration et plans Stripe"
Cohesion: 0.17
Nodes (19): carteAbonnement(), copierLienAccueil(), DEMANDES, dessinerGrapheCA(), ETAPES_CLE(), etapesFaites(), JOURS_LONGS, lienPaiement() (+11 more)

### Community 18 - "Fiche client et édition RDV"
Cohesion: 0.18
Nodes (18): applyTemplate(), clientById(), clientName(), editStock(), getBirthdayClients(), getInactiveClients(), getNewClients(), getVipClients() (+10 more)

### Community 19 - "Parcours d'inscription et Stripe"
Cohesion: 0.16
Nodes (13): crypto, { Pool, types }, SCHEMA, transaction(), { notifierSalon }, { nowParis, jourLisible }, { pool }, signalerPlaceLibre() (+5 more)

### Community 20 - "Landing — section des questions"
Cohesion: 0.26
Nodes (15): fermerMiseEnRoute(), MER, MER_DUREES, MER_ETAPES, merAjouterPresta(), merBasculerJour(), merCadre(), merErreur() (+7 more)

### Community 21 - "Notifications push des salons"
Cohesion: 0.2
Nodes (11): chevauche(), creneaux(), enHeure(), enMinutes(), occupants(), assert, base, { creneaux, chevauche } (+3 more)

### Community 22 - "Tâches planifiées du backend"
Cohesion: 0.15
Nodes (12): app, cors, dateStr, demarrer(), emails, { escHtml }, express, ORIGINES (+4 more)

### Community 23 - "Liste d'attente"
Cohesion: 0.18
Nodes (10): crypto, emails, express, { notifierSalon }, paiementRecu(), PLAN_PAR_MONTANT, planDuMontant(), { pool } (+2 more)

### Community 24 - "Prestations du salon"
Cohesion: 0.18
Nodes (13): clearNotifs(), confirmCheckout(), encaisser(), finalizePayment(), markNotifsRead(), NOW_HHMM(), openNotifRdv(), pushNotif() (+5 more)

### Community 25 - "Module TrimSync 25"
Cohesion: 0.17
Nodes (12): adjustStock(), agOpenDay(), cliSetSort(), _closeSidebar(), deleteStock(), loadSettingsForm(), nav(), renderClientsList() (+4 more)

### Community 26 - "Module TrimSync 26"
Cohesion: 0.22
Nodes (11): agNext(), agPrev(), agSetView(), agToday(), buildAgendaDay(), buildAgendaGrid(), buildAgendaWeek(), initAgendaDnD() (+3 more)

### Community 27 - "Module TrimSync 27"
Cohesion: 0.35
Nodes (10): abonnementActuel(), activerNotifications(), carteNotifications(), cleVapid(), estInstallee(), estIOS(), inscrirePush(), notifsPlusTard() (+2 more)

### Community 28 - "Module TrimSync 28"
Cohesion: 0.38
Nodes (9): appel(), aujourdhuiParis(), boite(), dansJours(), dernierJeton(), main(), ok(), RUN (+1 more)

### Community 29 - "Module TrimSync 29"
Cohesion: 0.24
Nodes (5): Default(), GlowCard(), GlowCardProps, glowColorMap, sizeMap

### Community 30 - "Module TrimSync 30"
Cohesion: 0.27
Nodes (8): afficherClients(), cliSetTri(), enregistrerClient(), initiales(), ouvrirFiche(), renderClients(), esc(), showConfirm()

### Community 31 - "Module TrimSync 31"
Cohesion: 0.24
Nodes (7): bodyObserver, handleModalOpened(), modalObserver, onPointerDown(), spawnModalBubble(), spawnRipple(), VOID_TAGS

### Community 32 - "Module TrimSync 32"
Cohesion: 0.31
Nodes (3): cn(), seaColors, WavyBackground()

### Community 33 - "Module TrimSync 33"
Cohesion: 0.22
Nodes (9): Hero 3D — scènes WebGL du DM Instagram au rendez-vous, Landing bilingue EN/FR — attributs data-en/data-fr, Fond animé wavy — WebGL2 sans dépendance, Intégrations — Meta Instagram API, OpenAI, Stripe, Google Calendar, Cluster légal — confidentialité, CGV, suppression de données, Le salon responsable de traitement, TrimSync sous-traitant, Abonnement unique 99 €/mois, sans engagement, L'IA répond aux DM Instagram et réserve les clientes (+1 more)

### Community 34 - "Module TrimSync 34"
Cohesion: 0.39
Nodes (6): { slugifier }, slugLibre(), escHtml(), normaliserNom(), sansAccents(), slugifier()

### Community 35 - "Module TrimSync 35"
Cohesion: 0.43
Nodes (7): biometricUnlock(), pinGet(), pinPress(), registerBiometric(), renderPinDots(), unlock(), verifyPinBuffer()

### Community 36 - "Module TrimSync 36"
Cohesion: 0.38
Nodes (5): applyAll(), init(), injectFilter(), isBooking, TARGETS

### Community 37 - "Module TrimSync 37"
Cohesion: 0.38
Nodes (5): applyAll(), init(), injectFilter(), isBooking, TARGETS

### Community 38 - "Module TrimSync 38"
Cohesion: 0.33
Nodes (6): addToCart(), refreshClientsDatalist(), removeCartLine(), renderCart(), renderEncaissement(), resetCart()

### Community 39 - "Module TrimSync 39"
Cohesion: 0.53
Nodes (5): compiler(), f(), fragmentShader(), init(), SEA_COLORS

### Community 40 - "Module TrimSync 40"
Cohesion: 0.33
Nodes (6): Agenda — les libellés API traduits une fois au chargement, Notifications — guide d'installation PWA intégré aux réglages, PWA du salon — agenda, clients, stats, réglages, Toutes les dates à l'heure de Paris — le serveur en UTC, Route publique — les créneaux passés ne se réservent plus, Page publique de réservation — trimsync.tech/r/salon

### Community 41 - "Module TrimSync 41"
Cohesion: 0.4
Nodes (5): Backend multi-salons — Express + PostgreSQL, Web Push — notifier les salons depuis le serveur, Routes RDV — décalage de jours, sanitisation des textes, Téléphones normalisés à la saisie — un format unique, Dashboard multi-tenant — Supabase JWT + salon_id

## Knowledge Gaps
- **296 isolated node(s):** `d`, `app`, `config`, `express`, `cors` (+291 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `renderClients()` connect `Module TrimSync 30` to `Agenda du salon (app barbier)`, `Boîte à idées et emails (Resend)`, `Salons — plans et statut d'abonnement`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `runDeduplicateClients()` connect `Boîte à idées et emails (Resend)` to `Dashboard multi-tenant (préview)`, `Module TrimSync 30`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `messageErreur()` connect `Salons — plans et statut d'abonnement` to `Agenda du salon (app barbier)`, `Noyau de l'app barbier`, `Administration et plans Stripe`, `Landing — section des questions`, `Module TrimSync 27`, `Module TrimSync 30`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `messageErreur()` (e.g. with `renderAccueil()` and `modifierObjectif()`) actually correct?**
  _`messageErreur()` has 33 INFERRED edges - model-reasoned connections that need verification._
- **What connects `d`, `app`, `config` to the rest of the system?**
  _296 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Hero 3D — scènes de la landing` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Agenda du salon (app barbier)` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._