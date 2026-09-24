# TrimSync — backend

Express + Postgres, hébergé sur Railway (`trimsync-backend-production.up.railway.app`),
déployé automatiquement depuis `main`.

Deux rôles :

- **La landing** : `/api/devis` (formulaire de devis, via Resend) et `/api/chat`.
- **L'API multi-salons** : comptes, salon, prestations, horaires, agenda, clients,
  liste d'attente, page de réservation publique (`/api/public/...`), push et
  back-office (`/api/admin/...`). Spec :
  `docs/superpowers/specs/2026-09-24-trimsync-inscription-dashboard-design.md`.

**Sans `DATABASE_URL`, le serveur démarre quand même** : la landing reste en
ligne et les routes produit répondent 503. `GET /api/ping` dit `base: true|false`
et la version du commit déployé.

## Règles à ne pas casser

- Le salon d'une requête vient **toujours** du jeton (`exigerCompte` relit le
  compte en base), jamais du corps ni de l'URL. Toute requête métier filtre sur
  `salon_id`. Verrouillé par le scénario T2.
- Toute règle de disponibilité vit dans `lib/dispo.js` (fonction pure). La page
  publique, et demain le bot, l'appellent ; aucun n'a de règle à lui.
- Visites et dépenses se calculent à la lecture (`routes/clients.js`) : une
  visite est un **jour** avec un RDV confirmé passé. Rien n'est stocké, donc
  rien à recalculer.
- Une fiche client n'est réutilisée que si **nom et numéro** correspondent :
  un numéro sert à toute une famille.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Postgres. Absente : routes produit en 503. |
| `TRIMSYNC_SECRET` | Signe les jetons de session. Obligatoire avec la base. |
| `ADMIN_PASSWORD` | Mot de passe du back-office. |
| `ADMIN_EMAIL` | Reçoit les alertes (nouveau salon, demande de bot). Défaut `felix@trimsync.tech`. |
| `RESEND_API_KEY` | Envoi des emails. Absente : rien ne part, c'est noté dans les logs. |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | Notifications push (propres à TrimSync, jamais celles de FCUTZ). |
| `SITE_URL` | Base des liens dans les emails. Défaut `https://trimsync.tech`. |
| `CORS_ORIGINES` | Origines autorisées, séparées par des virgules. Défaut trimsync.tech et www. |
| `NODE_ENV` | `production` sur Railway (SSL Postgres, erreurs sans détail). |
| `TRIMSYNC_TEST` | Tests seulement : expose `GET /api/test/boite`. **Jamais en production.** |
| `QUOTA_FACTEUR` | Tests seulement : multiplie les quotas anti-abus. |

## Tests

Unitaires (moteur de créneaux, sans base) :

```bash
npm test
```

Scénarios (serveur réel, base jetable). La suite suffixe emails et salons par
l'horodatage : elle se rejoue sur la même base.

```bash
DATABASE_URL=postgres://postgres:MDP@localhost:5432/trimsync_test TRIMSYNC_SECRET=test ADMIN_PASSWORD=test TRIMSYNC_TEST=1 QUOTA_FACTEUR=100 PORT=3998 node server.js &
API=http://localhost:3998 node test-scenarios.mjs
```

La CI (`.github/workflows/tests.yml`) lance les deux sur chaque push `main` et
chaque PR.
