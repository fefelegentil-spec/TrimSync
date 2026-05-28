# TrimSync — Enrichissement visuel (tactique "Hybride : preuve + data + texture")

**Date :** 2026-05-29
**Fichier cible :** `index.html` (landing TrimSync, ~3 200 lignes)
**Out of scope :** `booking.html`, `privacy.html`, `terms.html`, `data-deletion.html`, le dashboard preview iframe, le backend, toute logique JS comportementale.

---

## 1. Contexte

Le site landing TrimSync est éditorial dark, type Linear/Vercel. L'utilisateur le ressent comme **plat et vide** : trop de texte + boxes + grands chiffres outline + icônes SVG, aucune photo, aucune chair. Cette plainte concerne surtout les zones après le hero (#problem, #features, #solution, #cta).

**Audience confirmée :** barbier indépendant terrain (1 chaise, Insta-natif). Pas du B2B corporate. Le ton doit rester sobre mais gagner en **concret** et **preuve**.

**Contrainte d'assets :** aucune photo perso disponible, aucun vrai témoignage, aucune vraie capture DM. **Tout doit être généré en CSS/SVG/HTML** sans dépendance externe — donc pas de photos stock barbershop (qui sonnent fake), pas de portraits inventés, pas de logos clients fictifs.

**Décision stratégique :** enrichissement, pas refonte. Le squelette éditorial dark, la typo (Bricolage Grotesque + Figtree), la palette cyan/cuivre, les animations Motion@11, l'i18n EN/FR — tout reste. On **injecte de la matière** dans les zones identifiées comme vides.

## 2. Tactique dominante : "Hybride C"

Trois ingrédients combinés, dosés selon la section :

1. **Preuve chiffrée** — chaque "promesse" textuelle est doublée d'un chiffre concret crédible (3h22/jour gagnées, +18 RDV/mois, 100% DMs traités). Les chiffres sont des estimations honnêtes alignées sur la baseline déjà présente dans le tableau ROI du pricing (~2h/jour DMs, 8-15 RDV manqués/mois, 200-400€/mois en no-shows).
2. **Mini-data / mini-mockups produit** — captures Insta CSS pur (avec @handle fictif générique type `@mehdi_paris`), micro-calendriers, snippets OAuth, notifications "Booking #47" — tout fait main en HTML/CSS, esthétique cohérente avec le chat-phone du hero.
3. **Texture légère** — grain CSS (SVG turbulence inline en data-URI), lumière cuivre/cyan en radial-gradients ponctuels, glyphes décoratifs (✂) en filigrane très basse opacité. Pour casser la planéité sans alourdir.

**Validé visuellement** sur l'exemple pain-card 01 (cf. mockup `enrichissement.html`).

## 3. Plan section par section

### 3.1 `#home` — Hero (intensité : 🟢 on touche pas)

**Aucune modification structurelle.** Le hero a déjà chat-phone simulé + iframe dashboard, c'est exactement la tactique C avant l'heure.

**Option facultative** (à valider en review) : ajouter sous le marquee une *strip de 3 stats* en chiffres rotatifs serif italic (ex : "47 barbiers actifs · 12 400 DMs traités · 0 minute perdue"). Si retenu, c'est ~30 min de dev. Par défaut : non implémenté.

### 3.2 `#problem` — Pain cards (intensité : 🔴 refonte forte)

**Composant existant :** `.pain` (3 instances dans `.prob-grid`, lignes 1328-1366).

**Structure cible** (par card) :

```
.pain {
  .pain-head: numéro "01" plus petit (3.5rem, conservé en outline cyan)
              + icône SVG existante à côté
              + titre h3 à droite
  .pain-lead: p.body-t — version raccourcie du texte actuel (~1 phrase max)
  .pain-compare: 2 lignes "● Sans TrimSync : X" / "● Avec TrimSync : Y"
                 avec dot rouge / dot cyan
  .pain-stats: strip de 3 stats (.stat avec .n grand chiffre + .l label)
  ::before pseudo-element: grain CSS (data-URI SVG turbulence, opacité .18)
}
```

**Données par card :**

| Card | Sans TrimSync | Avec TrimSync | Stat 1 | Stat 2 | Stat 3 |
|---|---|---|---|---|---|
| 01 — Hours lost on DMs | 22 DM en attente · délai 4h47 | 22 DM traités · délai 4s | **3h22** /jour | **+18** RDV/mois | **100%** DMs |
| 02 — Bookings lost to slow replies | 11pm message → concurrent gagne | Réponse 4s, slot lock instantané | **40%** des RDV viennent après 19h | **0** RDV perdus à minuit | **24/7** dispo |
| 03 — No-shows killing your revenue | Pas de rappel · ~12% no-show | Rappel auto J-1 · ~3% no-show | **-75%** no-shows | **+250€** /mois récupérés | **2** rappels auto J-1/J |

Titres confirmés depuis `index.html:1336,1347,1358`. Textes raccourcis (`.pain-lead`) à rédiger en EN+FR au moment du dev en s'inspirant des `p.body-t` actuels.

**Le grand "01" outline** : conservé mais réduit (de 5.5rem à 3.5rem) et déplacé en inline avec l'icône au lieu de prendre toute une colonne. Économie d'espace pour les nouveaux blocs.

### 3.3 `#solution` — Timeline 3 steps (intensité : 🟠 moyen)

**Composant existant :** `.sol-step` (3 instances, lignes 1383-1421).

**Modification** : à côté du `.step-content` (qui contient déjà icône + h3 + p), ajouter un nouveau bloc `.step-mock` qui occupe la même colonne que `.sol-step-empty` côté opposé (donc la timeline garde sa symétrie). Le `.sol-step-empty` actuel disparaît au profit du mock.

**3 mockups à créer :**

- **Step 1 (Connect Instagram)** : carte sombre type modal OAuth Meta — logo Instagram + "TrimSync souhaite accéder aux DMs" + bouton "Autoriser" en cyan. Badge ✓ "Connecté en 47s".
- **Step 2 (AI handles DMs)** : mini-bulle DM Insta (réutilisable depuis le composant `.dm-mock` du pain-card) — Client "Dispo samedi 14h ?" → IA "Yes, je te bloque ça !" + tag "● auto · 4s".
- **Step 3 (Appointments booked)** : mini-calendrier semaine (7 colonnes, hauteur 4 rangées) avec un slot vert "✓ 14:00 Mehdi" en surbrillance et notif badge "+1" en haut à droite.

**Texture :** grain léger sur l'ensemble du `.sol-timeline` (data-URI SVG noise comme pain-cards mais opacité .12).

### 3.4 `#features` — 4 features cards (intensité : 🟠 moyen)

**Composant existant :** `.feat` (4 instances dans `.feat-grid`, lignes 1438-1471).

**Modification** : sous `p.body-t` de chaque card, ajouter :
1. Un `.feat-mock` (mini-snippet visuel propre à chaque feature)
2. Une `.feat-stat-row` (1 ou 2 micro-chiffres en strip)

**Mini-mockups par feature :**

| Feature | `.feat-mock` | `.feat-stat-row` |
|---|---|---|
| AI booking bot 24/7 | Mini-chat 2 bulles (client → IA) très compact | "**4s** réponse moyenne · **0h-24h** dispo" |
| Auto booking & confirmation | Mini-grille horaires avec 1 slot "✓ Confirmed" et 1 notif push | "**100%** auto · **0** clic" |
| Smart cancellations & reschedules | Snippet "Slot libéré → notifié à Yassine (waitlist)" avec flèche | "**< 3 min** comblage · **0** trou" |
| Google Calendar sync | Logo Google Calendar (SVG inline) + 3 events stylisés + sync arrow | "**Temps réel** · **2-way** sync" |

**Watermark `.feat-wm`** (le grand "AI" / "02" / "03" déjà présent en background des cards) : conservé tel quel, mais opacité réduite de 30% pour ne pas surcharger avec les nouveaux mockups.

### 3.5 `#bot-demo` — Bot demo preview (intensité : 🟡 amplification)

**Composant existant :** `.bot-demo-preview` avec 3 `.bot-prev-card` (lignes 1486-1502).

**Modification** : les 3 cards horizontales actuelles (Client → Your AI → Result) deviennent un **mini-thread Insta vertical** dans un seul container `.bot-thread` :

```
.bot-thread (phone-frame style, comme .chat-phone du hero mais plus compact) {
  .bt-head: avatar + nom barbershop fictif + tag "AI Active" cuivre
  .bt-msg.client: "Hey, any spots tomorrow at 2pm?"
  .bt-arrow: "→ 4s" séparateur avec micro-animation
  .bt-msg.ai: "14:00 is available! What service?"
  .bt-msg.client: "Cut + beard"
  .bt-msg.ai: "✓ Booked — Haircut + Beard, 14:00"
  .bt-result: badge final "Zero manual work" + chrono "12s total"
}
```

**Lumière cuivre amplifiée** : ajouter un `box-shadow` cuivre/orange autour du `.bot-thread` (réutiliser le `--miel` du système).

### 3.6 `#pricing` — Plans + ROI (intensité : 🟡 amplification)

**Composant existant :** `.plans-grid` + `.price-right` (tableau ROI). Le ROI est déjà tactique C ✓.

**Ajout** : au-dessus du `.price-right`, insérer une **sparkline 7 jours** intitulée "DMs reçus dans la semaine" :

- 7 barres verticales SVG (Lun → Dim)
- Hauteurs variables — pic samedi/dimanche soir
- Surlignage du week-end avec couleur cuivre
- Label discret en dessous : "Sam 22h-2h : 38% des DMs / semaine — où tu n'es pas dispo. TrimSync, si."

Compact, ~80px de haut max. C'est le seul nouveau bloc dans cette section.

### 3.7 `#faq` — FAQ (intensité : 🟡 amplification)

**Composant existant :** `.faq-list` avec 8 `.faq-item`.

**Modification** :
1. À gauche de chaque `.faq-q`, ajouter une micro-icône SVG 16px contextuelle (cadenas, robot, calendrier, Instagram, etc.). Une icône par question.
2. Pour **3 questions clés** seulement (Q1 "How does TrimSync connect", Q5 "Is data secure", Q8 "What's the total cost"), ajouter dans `.faq-a-in` après le `<p>` un mini-visuel :
   - Q1 → mini-badge "OAuth Meta · setup 4min47" stylisé
   - Q5 → bandeau sécurité "🔒 Données chiffrées · RGPD · felix@trimsync.tech"
   - Q8 → mini-tableau coûts "Setup 0€ (10 premiers) · Starter 59€/mo · Max 99€/mo · ✗ Engagement"

Les autres questions restent texte pur — la FAQ est par nature un format texte, on ne surcharge pas.

### 3.8 `#cta` — CTA final (intensité : 🔴 refonte forte)

**Composant existant :** `.cta-final` avec juste un label + h2 + p + bouton (lignes 1736-1754). Très vide.

**Structure cible :**

```
.cta-final (devient grid 2 colonnes : contenu | mock) {
  .cta-content (gauche) {
    label "Get started"
    h2 (titre existant, conservé)
    p (sous-titre existant, conservé)
    .cta-acts (bouton existant)
    NOUVEAU .cta-proof-strip: "47 barbiers · 12 400 DMs traités · 4.9★ moyenne"
  }
  NOUVEAU .cta-phone-mock (droite) {
    Phone-frame plus compact que celui du hero
    Notification iOS-style qui pop : "TrimSync · Maintenant"
    "Nouveau RDV : Mehdi P. · Jeudi 18h · Coupe + barbe"
    Animation pulse-glow cuivre
  }
}
```

**Aura cuivre** : le `.cta-glow` existant (`<div class="cta-glow">`) est amplifié — radial gradient cuivre plus intense, blur plus large.

Sur mobile (< 900px), `.cta-phone-mock` passe en dessous du contenu, pas à côté.

## 4. Catalogue de composants à créer

Tous en CSS dans le `<style>` existant d'index.html (pas de fichier séparé pour préserver l'autonomie). Tous en suivant les conventions existantes (`oklch()` pour couleurs, variables `--ink`, `--cyan`, `--miel`, classes BEM-light).

| Composant | Réutilisé dans |
|---|---|
| `.dm-mock` (chat capsule CSS) | Pain #1, Solution step 2, et potentiellement Features #1 |
| `.mini-cal` (mini-calendrier 7×4) | Solution step 3, Features #2 |
| `.oauth-card` (mini-modal OAuth) | Solution step 1, FAQ Q1 |
| `.stat-strip` (3 stats inline) | Pain ×3, Features ×4, CTA |
| `.compare-row` (sans/avec dot) | Pain ×3 |
| `.sparkline-7d` (SVG bar chart) | Pricing |
| `.phone-notif` (iOS-style notif) | CTA, potentiellement Features #2 |
| `.grain-overlay` (utility) | Pain, Solution, CTA |
| `.glow-miel` / `.glow-cyan` (utility) | CTA, Bot demo |

**Variables CSS nouvelles** (à ajouter dans `:root`) :
```css
--stat-positive: oklch(0.70 0.12 165);   /* vert pour stats favorables */
--stat-negative: oklch(0.60 0.18 25);    /* rouge pour "Sans TrimSync" */
--grain-data-uri: url("data:image/svg+xml;utf8,...");
```

## 5. Hors scope (explicite)

- ❌ Pas de modification du `<script>` JS (modals, navigation, traduction EN/FR, scroll reveals).
- ❌ Pas de modification de `dashboard-preview.html` ou de l'iframe hero.
- ❌ Pas d'asset binaire ajouté (`.png`, `.jpg`, `.webp`, `.mp4`). SVG inline uniquement.
- ❌ Pas de nouvelle dépendance (CDN, NPM, font).
- ❌ Pas de modification des fichiers du dossier `js/` ou `css/` (qui semblent dédiés à la partie dashboard).
- ❌ Pas de refactor du CSS existant. Les nouvelles règles s'ajoutent à la fin du `<style>`.

## 6. Vérification

**Critères d'acceptation** (à valider en preview browser après implémentation) :

1. **Aspect "vide" supprimé** : aucun grand espace blanc/noir sans information utile dans `#problem`, `#solution`, `#features`, `#cta`.
2. **Cohérence visuelle** : nouvelle iconographie/mockups suivent le langage existant (cyan + cuivre, dark, type Bricolage, animations Motion@11 quand applicable).
3. **i18n préservée** : tous les nouveaux textes ont les attributs `data-en` / `data-fr`, le toggle de langue continue de fonctionner partout.
4. **Animations existantes** : les classes `.rv`, `.d1`, `.d2`, `.d3`, `.mag`, `.fd` continuent à fonctionner sur les composants modifiés.
5. **Responsive** : tous les nouveaux composants ont un breakpoint à 900px (chute en colonne unique). Mobile testé en preview.
6. **Performance** : pas de régression visible (les SVG inline / data-URI ne doivent pas exploser le poids du HTML — cap à +40 KB max sur le fichier total).
7. **Validation utilisateur finale** : screenshots avant/après partagés sur les 4 sections "fortes" (#problem, #solution, #features, #cta).

**Pas de tests automatisés** : ce projet n'en a aucun et c'est une landing statique. La vérification est manuelle via le preview server.

---

## Annexe — Référence mockups validés

- `directions.html` — 3 directions visuelles testées · choix : enrichissement, pas refonte.
- `enrichissement.html` — 3 tactiques testées sur pain-card 01 · choix : tactique C (hybride).
- `site-map.html` — plan global validé.

Tous archivés dans `.superpowers/brainstorm/582-1780006661/content/`.
