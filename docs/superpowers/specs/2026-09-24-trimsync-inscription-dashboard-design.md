# TrimSync — Inscription, essai gratuit et dashboard barbier

Date : 24/09/2026
Statut : proposé

## Pourquoi

La landing (`index.html`) vend un produit qui n'existe pas encore pour un autre
barbier que Félix : ses deux boutons mènent à `trimsync-booking.html`, un
formulaire pour réserver une démo. Le bot Instagram fonctionne, mais seulement
dans FCUTZ, câblé pour un seul salon.

Ce spec rend la landing vraie : un barbier s'inscrit seul, obtient 30 jours
gratuits, un dashboard et sa page de réservation publique. Le bot, lui, est
activé par Félix après un appel d'onboarding (setup à 300 € déjà dans la grille)
— c'est le « pilote accompagné ».

## Découpage du chantier

| # | Morceau | Ce spec ? |
|---|---------|-----------|
| 1 | Compte et salon (inscription, connexion, isolation par salon) | oui |
| 2 | Agenda, prestations, clients, page de réservation publique | oui |
| 3 | Instagram et bot multi-salons (porter `github/instagram.js`) | **non**, spec suivant |
| 4 | Paiement (Stripe) | **non** ; seul l'essai de 30 jours et sa fin sont traités ici |

À la fin de ce spec, « Activer le bot Instagram » dans le dashboard enregistre
une **demande** et prévient Félix ; l'activation réelle arrive avec le morceau 3.

## Choix d'architecture

**Un backend TrimSync neuf, multi-salons dès le départ, qui reprend les règles
de FCUTZ sans partager son code.**

Écartés :
- *Rendre `github/server.js` multi-salons* : `salon_id` à ajouter dans ~5 200
  lignes qui font tourner le salon de Félix ; une fuite entre salons ou une
  régression coûte directement ses clients.
- *Une copie de FCUTZ par salon* : rapide pour deux pilotes, mais l'inscription
  ne peut plus être automatique et chaque correctif se reporte N fois.

**FCUTZ n'est pas modifié.** Les règles éprouvées y sont reprises (réécrites,
pas importées) : statuts `annule`/`noshow` exclus des disponibilités, créneau
déjà passé refusé, `normalizePhone()`, dates de Paris via `dateParis()`,
téléphone sans contrainte d'unicité, case de consentement décochée, erreurs
serveur jamais détaillées au client.

### Où ça vit

- **Backend** : `trimsync/backend/`, service Railway existant
  (`trimsync-backend-production.up.railway.app`), avec une base **Postgres
  Railway** ajoutée au service. `supabase-schema.sql` devient caduc et est
  supprimé : une seule base, un seul mécanisme d'authentification.
- **Frontend** : `trimsync.tech` (Cloudflare Pages), HTML/CSS/JS vanilla comme
  la landing, pas de bundler.
  - `/inscription`, `/connexion` → `app.html` (même fichier, deux vues)
  - `/app` → `app.html` (dashboard barbier)
  - `/r/<slug>` → `reserver.html` (page publique d'un salon), réécrite par
    `_redirects` en 200.

### Découpage du backend

`server.js` actuel (devis, chat) reste le point d'entrée et monte des modules.
Chaque fichier a une seule responsabilité :

```
backend/
  server.js            point d'entrée, monte les routes
  lib/db.js            pool pg + initDB() idempotent
  lib/auth.js          hash scrypt, jeton HMAC, middleware exigerCompte / exigerAdmin
  lib/dates.js         dateParis(), nowParis(), creneauPasse()
  lib/telephone.js     normalizePhone() (copie conforme de FCUTZ)
  lib/dispo.js         moteur de créneaux (pur, sans SQL : testable seul)
  lib/emails.js        envois Resend (vérification, reset, rappels d'essai, alertes Félix)
  lib/push.js          web-push par salon
  routes/comptes.js    inscription, connexion, vérification email, mot de passe oublié
  routes/salon.js      profil du salon, slug, suppression du compte, demande de bot
  routes/prestations.js
  routes/horaires.js   horaires de la semaine + fermetures
  routes/rdv.js        agenda du barbier
  routes/clients.js
  routes/public.js     page publique : infos salon, dispo, réserver, annuler, liste d'attente
  routes/admin.js      back-office de Félix
  test-scenarios.mjs
```

## Données

Toutes les tables métier portent `salon_id`. **Le salon d'une requête vient
toujours du jeton (`req.salonId`), jamais du corps ni de l'URL** ; toute
requête SQL métier filtre sur `salon_id = $1`. Côté public, le salon vient du
slug, résolu une fois par `salonDuSlug()`.

```
salons        id, slug UNIQUE, nom, ville, telephone, adresse,
              statut ('essai'|'actif'|'expire'|'suspendu'), essai_fin DATE,
              plan ('starter'|'pro'|'max') NULL, bot_statut ('inactif'|'demande'|'actif'),
              created_at
comptes       id, salon_id, email UNIQUE (minuscules), mdp_hash, email_verifie_le, created_at
jetons        hash PRIMARY KEY, compte_id, type ('verification'|'reset'), expire_le, utilise_le
prestations   id, salon_id, nom, duree_min, prix NUMERIC, actif, ordre
horaires      salon_id, jour (0=dim..6=sam), ouverture, fermeture,
              pause_debut NULL, pause_fin NULL          PK (salon_id, jour)
fermetures    id, salon_id, date, debut NULL, fin NULL, motif   -- NULL/NULL = journée
clients       id, salon_id, nom, telephone, email, notes, created_at
rdv           id, salon_id, client_id, client_nom, telephone, prestation_id,
              prestation_nom, prix, duree_min, date, heure,
              statut ('confirme'|'annule'|'noshow'), source ('site'|'dashboard'|'instagram'),
              jeton_annulation, created_at
attente       id, salon_id, date, nom, telephone, prevenu_le, created_at
push_abonnements  endpoint PRIMARY KEY, salon_id, compte_id, cles JSONB
```

IDs : `TEXT` générés par `uid()` comme dans FCUTZ. Argent : `NUMERIC`.
Dates `YYYY-MM-DD`, heures `HH:MM`, fuseau `Europe/Paris` pour tous les salons
(marché France ; le Royaume-Uni attendra un vrai besoin).

**Visites et dépenses sont calculées à la lecture**, pas stockées : une visite
est un **jour** où le client a un RDV passé ni `annule` ni `noshow` ;
la dépense est la somme des prix de ces RDV. Pas de compteur à recalculer à
chaque changement de statut — c'est la source de toute la complexité de
`recomputeClientStatsFromPayments()` dans FCUTZ, qu'on évite ici. La
prestation habituelle est la plus fréquente parmi ces RDV.

## Parcours

### 1. Inscription (landing → dashboard)

Les CTA de la landing deviennent « Essai gratuit 30 jours » → `/inscription`.
Le lien « Réserver une démo » reste en secondaire vers `trimsync-booking.html`.

Formulaire : email, mot de passe (8 caractères min.), nom du salon, ville,
téléphone du salon, case CGU/confidentialité **décochée**. À la validation :

1. compte + salon créés dans une transaction, `statut='essai'`,
   `essai_fin = aujourd'hui + 30 j` ;
2. slug généré depuis `nom-ville` (minuscules, sans accents, tirets), suffixé
   `-2`, `-3`… si pris ; modifiable ensuite dans les réglages ;
3. prestations de départ créées (Coupe 30 min 20 €, Barbe 20 min 10 €,
   Coupe + barbe 45 min 28 €) et horaires préréglés (mardi–samedi 9 h–19 h) —
   tout est modifiable, c'est juste pour ne pas partir d'une page vide ;
4. email de vérification envoyé ; jeton de session renvoyé, le barbier entre
   directement dans son dashboard ;
5. Félix reçoit un email « nouveau salon inscrit ».

L'email non vérifié n'empêche pas d'utiliser le dashboard ; un bandeau le
rappelle. Il bloque seulement la **demande d'activation du bot** (Félix ne doit
pas appeler une adresse bidon).

### 2. Premier lancement : trois étapes guidées

Au premier accès, le dashboard affiche une carte « Mise en route » :
1. Vérifie tes prestations et tes prix
2. Règle tes horaires
3. Ouvre ta page de réservation (`trimsync.tech/r/<slug>`, bouton copier)

Chaque étape se coche d'elle-même quand elle est faite. La carte disparaît quand
les trois le sont.

### 3. Dashboard barbier (`/app`)

Mobile d'abord, barre du bas sur téléphone, couleurs et polices de la marque
(teal, Bricolage Grotesque + Figtree).

- **Agenda** : jour et semaine ; créer un RDV (client existant ou nouveau),
  déplacer, annuler, marquer no-show. Le dashboard peut saisir un RDV dans le
  passé ou hors horaires (le barbier sait ce qu'il fait) ; il est seulement
  prévenu d'un chevauchement.
- **Clients** : liste avec recherche, fiche (visites, dépense, prestation
  habituelle, dernière venue, historique des RDV, notes), création et
  modification. Pas de fusion automatique par téléphone : un numéro peut servir
  à une famille.
- **Prestations** : ajouter, modifier, désactiver, réordonner.
- **Horaires** : grille de la semaine avec pause facultative ; fermetures
  (journée ou plage) avec motif.
- **Liste d'attente** : demandes par jour, bouton « prévenu ».
- **Réglages** : infos du salon et slug, lien de la page publique,
  notifications push (activer sur ce téléphone), « Activer le bot Instagram »,
  état de l'essai, mot de passe, supprimer mon compte.

Notifications push au barbier : nouveau RDV pris sur sa page, annulation par le
client, inscription en liste d'attente. Clés VAPID **propres à TrimSync**
(variables d'environnement, pas de valeur en dur).

### 4. Page publique (`/r/<slug>`)

Prestation → jour (30 jours d'horizon, jours fermés ou complets non cliquables)
→ heure → prénom + nom, téléphone, email facultatif, consentement décoché →
confirmation. La confirmation affiche un **lien d'annulation** porteur de
`jeton_annulation` ; le client peut annuler jusqu'à l'heure du RDV.

Jour complet : proposition de s'inscrire en liste d'attente. Quand un RDV de ce
jour est annulé, le barbier est notifié qu'une place se libère et qu'il y a du
monde en attente (il prévient lui-même : pas de SMS dans ce périmètre).

Rien du salon n'est exposé au-delà du nom, de la ville, de l'adresse, du
téléphone, des prestations et des créneaux libres : la liste publique des RDV
n'existe pas (contrairement à FCUTZ, le calcul des créneaux se fait côté serveur).

### 5. Moteur de créneaux (`lib/dispo.js`)

Fonction pure : `creneaux({ horaires, fermetures, rdv, duree, date, maintenant })`
→ liste d'heures. Pas de 15 min. Un créneau est proposé si la prestation entière
tient dans les horaires du jour, hors pause, hors fermeture, sans chevaucher un
RDV `confirme`, et s'il n'est pas déjà passé (heure de Paris). Les RDV `annule`
et `noshow` ne bloquent rien.

`POST /api/public/<slug>/reserver` refait la vérification **dans une
transaction verrouillée par salon** (`pg_advisory_xact_lock` sur le salon) :
deux clients qui cliquent la même heure en même temps ne l'obtiennent pas tous
les deux.

### 6. Fin de l'essai

- J-7 et J-1 : email au barbier (« ton essai se termine le … ») et bandeau dans
  le dashboard.
- À `essai_fin` (tâche quotidienne) : `statut='expire'`. Le dashboard passe en
  **lecture seule** avec un bandeau « Choisis ton plan » (bouton de contact avec
  Félix tant que Stripe n'existe pas). La page publique n'accepte plus de
  réservation et affiche « Réservation en ligne indisponible, appelle le
  salon » avec le téléphone. Rien n'est supprimé.
- Félix passe un salon en `actif` (et choisit le plan) depuis son back-office.

### 7. Demande d'activation du bot

Bouton dans les réglages → `bot_statut='demande'`, email à Félix avec nom,
salon, téléphone, email. Le dashboard affiche « Demande envoyée, Félix
t'appelle pour la mise en route ». Félix voit la demande dans son back-office.

### 8. Back-office de Félix

`trimsync-dashboard.html` existe mais repose sur Supabase et des données
fictives. Il est rebranché sur `/api/admin/*`, protégé par `ADMIN_PASSWORD`
(jeton admin distinct des jetons barbier) : liste des salons (statut, fin
d'essai, nombre de RDV sur 30 j, dernière connexion), demandes de bot, passer
en actif / suspendre / prolonger l'essai. Les KPI réels : salons en essai,
actifs, revenu mensuel (somme des plans actifs), demandes de bot en attente.

## Sécurité

- Mots de passe : `crypto.scrypt` (sel par compte), comparaison à temps
  constant. Jeton de session : HMAC signé par `TRIMSYNC_SECRET`, porte
  `compte_id`, `salon_id`, expiration 30 j.
- Jetons de vérification et de reset : aléatoires, stockés **hachés**, usage
  unique, expiration 24 h (vérification) / 1 h (reset). « Mot de passe oublié »
  répond pareil que l'email existe ou non.
- Quotas (`express-rate-limit`) : inscription et connexion par IP, réservation
  publique par IP, lectures publiques plus larges — leçon de FCUTZ : ne pas
  mettre l'annulation dans le même seau que les lectures.
- CORS restreint à `https://trimsync.tech` (et `localhost` hors production).
- Erreurs serveur : détail dans les logs, message générique au client.
- Suppression du compte : efface salon, compte, clients, RDV, attente,
  abonnements push. Irréversible, confirmée par la saisie du nom du salon.
- RGPD : `privacy.html` précise que TrimSync est **sous-traitant** des données
  des clients du salon, le barbier en est responsable.

## Tests

`backend/test-scenarios.mjs`, sur le modèle de FCUTZ : serveur réel + Postgres
jetable, lancé en CI (GitHub Actions, `.github/workflows/tests.yml`) à chaque
push `main` et PR. Scénarios :

- T1 inscription → connexion → session ; email déjà pris refusé ; slug dédupliqué
- T2 **isolation** : le salon A ne lit, ne modifie ni ne supprime rien du salon B
  (RDV, clients, prestations, horaires), même en passant l'id à la main
- T3 moteur de créneaux : horaires, pause, fermeture journée et plage,
  prestation qui déborde de la fermeture, créneau passé, annulé/no-show libèrent
- T4 réservation publique + annulation par jeton ; mauvais jeton refusé ;
  annulation après l'heure refusée
- T5 double réservation simultanée : une seule passe
- T6 visites : deux RDV le même jour = une visite ; annulé et no-show ne comptent pas
- T7 essai expiré : réservation publique refusée, écritures du dashboard refusées,
  lectures autorisées
- T8 reset mot de passe : jeton à usage unique, expiré refusé
- T9 demande de bot bloquée tant que l'email n'est pas vérifié
- T10 routes admin refusées sans jeton admin, et un jeton barbier ne suffit pas

`lib/dispo.js` a aussi ses tests unitaires (`node --test`), sans base.

## Mise en production

Déploiement automatique depuis `main` (Cloudflare Pages pour le front, Railway
pour le backend). Étapes manuelles de Félix, une seule fois :
1. ajouter un Postgres au projet Railway TrimSync ;
2. variables : `DATABASE_URL`, `TRIMSYNC_SECRET`, `ADMIN_PASSWORD`,
   `VAPID_PUBLIC`, `VAPID_PRIVATE`, `RESEND_API_KEY` (déjà là), `ADMIN_EMAIL`,
   `NODE_ENV=production`.

Vérification après déploiement : `GET /api/ping` répond avec la version du
commit ; une inscription de test de bout en bout sur `trimsync.tech`, puis
suppression du compte de test.

## Hors périmètre

Bot Instagram multi-salons (spec suivant), paiement Stripe, plusieurs barbiers
par salon, SMS, fidélité, encaissements et statistiques de CA (plan Max),
séries de RDV, acompte, fuseaux horaires autres que Paris, import de clients.
