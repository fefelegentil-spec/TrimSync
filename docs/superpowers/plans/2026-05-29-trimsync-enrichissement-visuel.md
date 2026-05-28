# TrimSync — Enrichissement visuel (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplir les zones visuellement vides du landing TrimSync (`index.html`) en injectant preuves chiffrées + mini-mockups CSS + texture, sans toucher au squelette éditorial dark existant.

**Architecture:** Une seule cible — `index.html` (~3 200 lignes, SPA monolithique avec CSS+JS inline). Tout le CSS est ajouté en queue du `<style>` (qui se ferme ligne 1192). Le HTML des sections existantes est modifié en place. Les composants visuels (mini-chat, mini-calendrier, OAuth card, sparkline, phone-notif…) sont 100% CSS/SVG inline — aucun asset externe, aucune dépendance ajoutée.

**Tech Stack:** HTML5 + CSS3 (oklch colors, grid, custom properties) + SVG inline. Pas de JS nouveau. Compatibilité avec Motion@11, Bricolage Grotesque + Figtree, i18n `data-en`/`data-fr` existante.

**Source spec:** `docs/superpowers/specs/2026-05-29-trimsync-enrichissement-visuel-design.md`

**Verification approach:** Pas de tests automatisés (projet statique sans framework). Vérification visuelle via `preview_start` / `preview_screenshot` après chaque tâche, sur desktop ET mobile (resize 375×800).

**Commits:** Un commit + push à la fin de chaque tâche (préférence utilisateur en mémoire).

---

## File Structure

**Modifications uniquement dans `index.html`** :

| Zone | Lignes (avant édition) | Rôle |
|---|---|---|
| `<style>` (fin) | 1190-1192 | Insertion de tous les nouveaux composants CSS |
| `#problem` HTML | 1319-1366 | Refonte des 3 `.pain` cards |
| `#solution` HTML | 1378-1422 | Ajout des `.step-mock` dans chaque `.sol-step` |
| `#features` HTML | 1437-1471 | Ajout des `.feat-mock` + `.feat-stat-row` dans chaque `.feat` |
| `#bot-demo` HTML | 1486-1502 | Remplacement de `.bot-demo-preview` par `.bot-thread` |
| `#pricing` HTML | 1612-1641 | Insertion de `.sparkline-7d` au-dessus de `.price-right` |
| `#faq` HTML | 1659-1731 | Ajout micro-icônes + 3 mini-visuels (Q1, Q5, Q8) |
| `#cta` HTML | 1736-1754 | Refonte structure (grid 2 colonnes + phone-mock + proof-strip) |

**Aucun fichier créé.**

---

## Task 1: Setup tokens CSS + utilities (grain, glow, stat-strip, compare-row)

**Files:**
- Modify: `index.html` (insertion avant `</style>` ligne 1192, dans `:root{}` ligne 28)

**Goal:** Préparer le terrain — variables CSS pour stats positives/négatives, classes utilitaires réutilisables (`grain-overlay`, `glow-miel`, `glow-cyan`, `stat-strip`, `compare-row`) que les tâches suivantes vont consommer.

- [ ] **Step 1.1 : Ajouter les nouvelles variables CSS dans `:root{}`**

Trouver `:root{` à la ligne 28 d'`index.html`. Repérer la fin du bloc `:root{}` (la dernière déclaration avant la `}`). Insérer juste avant cette `}` :

```css
  --stat-positive: oklch(0.72 0.14 162);
  --stat-negative: oklch(0.62 0.20 25);
  --stat-neutral: oklch(0.50 0.007 58);
  --grain-uri: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence baseFrequency='.85' numOctaves='2'/></filter><rect width='180' height='180' filter='url(%23n)' opacity='.35'/></svg>");
```

- [ ] **Step 1.2 : Ajouter les classes utilitaires en fin de `<style>` (juste avant `</style>` ligne 1192)**

Coller juste avant `</style>` :

```css
/* ============================================
   ENRICHISSEMENT VISUEL — utilitaires partagés
   (cf. spec 2026-05-29)
   ============================================ */

.grain-overlay{position:relative}
.grain-overlay::before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background-image:var(--grain-uri);
  background-size:180px;opacity:.18;mix-blend-mode:overlay;
  border-radius:inherit;
}
.grain-overlay > *{position:relative;z-index:1}

.glow-miel{box-shadow:0 0 60px -10px oklch(0.65 0.14 60/.25), 0 0 120px -30px oklch(0.65 0.14 60/.15)}
.glow-cyan{box-shadow:0 0 60px -10px oklch(0.76 0.13 193/.30), 0 0 120px -30px oklch(0.76 0.13 193/.18)}

/* Stat strip — 3 ou + micro-chiffres en ligne */
.stat-strip{display:flex;flex-wrap:wrap;gap:1.4rem;padding-top:.9rem;border-top:1px solid oklch(1 0 0/.08);margin-top:1rem}
.stat-strip .stat{display:flex;flex-direction:column;gap:.15rem;min-width:60px}
.stat-strip .stat .n{font-size:1.35rem;font-weight:700;letter-spacing:-.02em;color:var(--a);font-feature-settings:"tnum";line-height:1}
.stat-strip .stat .l{font-size:.62rem;color:var(--t3);letter-spacing:.08em;text-transform:uppercase;line-height:1.3}
.stat-strip .stat.negative .n{color:var(--stat-negative)}
.stat-strip .stat.positive .n{color:var(--stat-positive)}

/* Compare row — "● Sans X / ● Avec Y" */
.compare-row{display:flex;flex-direction:column;gap:.45rem;margin-top:.9rem;padding:.8rem 1rem;background:oklch(0.13 0.009 222/.6);border:1px solid oklch(1 0 0/.06);border-radius:10px}
.compare-row .cr-line{display:flex;align-items:center;gap:.6rem;font-size:.78rem;color:var(--t2);line-height:1.4}
.compare-row .cr-line .dot{width:8px;height:8px;border-radius:50%;flex:none}
.compare-row .cr-line.bad .dot{background:var(--stat-negative);box-shadow:0 0 8px var(--stat-negative)}
.compare-row .cr-line.good .dot{background:var(--a);box-shadow:0 0 8px var(--a)}
.compare-row .cr-line b{color:var(--t1);font-weight:500}
```

- [ ] **Step 1.3 : Vérification visuelle**

Si pas déjà fait, lancer le preview server :

```
preview_start (auto-détecte la commande pour ce projet)
```

Naviguer dans `index.html`. Les classes ajoutées ne changent rien visuellement à ce stade (pas encore utilisées). **Critère** : la page se charge sans erreur CSS, le hero/marquee/pain-cards/features s'affichent comme avant.

Vérifier dans la console du browser (`preview_console_logs`) : aucune erreur CSS parsing.

- [ ] **Step 1.4 : Commit + push**

```bash
git add index.html
git commit -m "feat(landing): tokens CSS + utilitaires (grain, glow, stat-strip, compare-row)"
git push
```

---

## Task 2: Composants réutilisables CSS (.dm-mock, .mini-cal, .oauth-card, .phone-notif, .sparkline-7d)

**Files:**
- Modify: `index.html` (insertion en fin de `<style>`, juste après ce qu'on a ajouté en Task 1)

**Goal:** Définir les 5 mini-mockups CSS qui seront branchés dans les sections en Tasks 3-9. Aucun usage dans cette tâche, juste la déclaration.

- [ ] **Step 2.1 : Ajouter `.dm-mock` (capsule de chat Insta CSS pur)**

Coller en fin de `<style>` (après les utilitaires de Task 1) :

```css
/* DM mock — capsule chat Insta réutilisable */
.dm-mock{background:linear-gradient(180deg,oklch(0.14 0.008 218) 0%,oklch(0.10 0.008 218) 100%);border:1px solid oklch(1 0 0/.08);border-radius:14px;padding:.85rem;display:flex;flex-direction:column;gap:.5rem;font-family:inherit}
.dm-mock .dm-head{display:flex;align-items:center;gap:.55rem;padding-bottom:.5rem;border-bottom:1px solid oklch(1 0 0/.06)}
.dm-mock .dm-av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,oklch(0.65 0.14 60),oklch(0.40 0.10 50));display:grid;place-items:center;font-size:.6rem;font-weight:700;color:#fff;flex:none}
.dm-mock .dm-name{font-size:.7rem;color:var(--t2);letter-spacing:.01em}
.dm-mock .dm-ai{font-size:.6rem;color:oklch(0.65 0.14 60);margin-left:auto;display:flex;align-items:center;gap:.3rem}
.dm-mock .dm-ai::before{content:"";width:6px;height:6px;border-radius:50%;background:oklch(0.65 0.14 60);box-shadow:0 0 8px oklch(0.65 0.14 60)}
.dm-mock .bubble{padding:.5rem .7rem;font-size:.72rem;border-radius:14px;max-width:80%;line-height:1.4}
.dm-mock .bubble.client{background:oklch(0.20 0.008 218);color:var(--t1);align-self:flex-start;border-bottom-left-radius:4px}
.dm-mock .bubble.ai{background:var(--a);color:var(--ink);align-self:flex-end;border-bottom-right-radius:4px;font-weight:500}
.dm-mock .bubble small{display:block;font-size:.5rem;opacity:.7;margin-top:.25rem;letter-spacing:.08em;text-transform:uppercase}
```

- [ ] **Step 2.2 : Ajouter `.mini-cal` (mini-calendrier semaine)**

Coller à la suite :

```css
/* Mini-calendrier 7×4 — grille semaine avec slot mis en évidence */
.mini-cal{background:oklch(0.13 0.009 222);border:1px solid oklch(1 0 0/.08);border-radius:12px;padding:.75rem;font-family:inherit}
.mini-cal .mc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.55rem;font-size:.6rem;color:var(--t3);letter-spacing:.1em;text-transform:uppercase}
.mini-cal .mc-badge{background:var(--a);color:var(--ink);padding:.1rem .4rem;border-radius:100px;font-size:.55rem;font-weight:700;letter-spacing:.05em}
.mini-cal .mc-grid{display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(4,12px);gap:3px}
.mini-cal .mc-cell{background:oklch(1 0 0/.04);border-radius:2px}
.mini-cal .mc-cell.slot{background:var(--a);box-shadow:0 0 8px var(--a)}
.mini-cal .mc-cell.busy{background:oklch(1 0 0/.10)}
.mini-cal .mc-foot{display:flex;align-items:center;gap:.35rem;margin-top:.55rem;font-size:.62rem;color:var(--t2)}
.mini-cal .mc-foot::before{content:"✓";color:var(--a);font-weight:700}
```

- [ ] **Step 2.3 : Ajouter `.oauth-card` (modal OAuth Meta)**

Coller à la suite :

```css
/* OAuth card — mini-modal autorisation Meta Instagram */
.oauth-card{background:oklch(0.13 0.009 222);border:1px solid oklch(1 0 0/.10);border-radius:14px;padding:.9rem;font-family:inherit;max-width:240px}
.oauth-card .oc-head{display:flex;align-items:center;gap:.55rem;margin-bottom:.6rem}
.oauth-card .oc-ig{width:24px;height:24px;border-radius:6px;background:linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%);display:grid;place-items:center}
.oauth-card .oc-ig svg{width:14px;height:14px;color:#fff}
.oauth-card .oc-title{font-size:.7rem;color:var(--t1);font-weight:500;line-height:1.3}
.oauth-card .oc-body{font-size:.65rem;color:var(--t2);line-height:1.5;margin-bottom:.7rem}
.oauth-card .oc-btn{display:block;width:100%;text-align:center;background:var(--a);color:var(--ink);font-weight:600;padding:.45rem;border-radius:8px;font-size:.7rem;letter-spacing:.01em}
.oauth-card .oc-tick{display:flex;align-items:center;gap:.35rem;margin-top:.55rem;font-size:.6rem;color:var(--a)}
.oauth-card .oc-tick::before{content:"✓";font-weight:700}
```

- [ ] **Step 2.4 : Ajouter `.phone-notif` (notification iOS-style)**

Coller à la suite :

```css
/* Phone notif — capsule notif iOS pour CTA final */
.phone-notif{background:oklch(0.13 0.009 222/.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid oklch(1 0 0/.10);border-radius:14px;padding:.75rem .85rem;display:flex;gap:.65rem;align-items:flex-start;max-width:280px}
.phone-notif .pn-ico{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,var(--a),oklch(0.50 0.13 195));display:grid;place-items:center;flex:none;font-size:.7rem;font-weight:800;color:var(--ink)}
.phone-notif .pn-body{flex:1;min-width:0}
.phone-notif .pn-meta{display:flex;justify-content:space-between;align-items:center;font-size:.55rem;color:var(--t3);letter-spacing:.05em;text-transform:uppercase;margin-bottom:.2rem}
.phone-notif .pn-title{font-size:.72rem;color:var(--t1);font-weight:600;line-height:1.3;margin-bottom:.15rem}
.phone-notif .pn-msg{font-size:.65rem;color:var(--t2);line-height:1.4}
```

- [ ] **Step 2.5 : Ajouter `.sparkline-7d` (mini bar chart SVG-friendly)**

Coller à la suite :

```css
/* Sparkline 7 jours — wrapper pour SVG bars hebdo */
.sparkline-7d{background:oklch(0.13 0.009 222);border:1px solid oklch(1 0 0/.08);border-radius:12px;padding:1rem 1.1rem;margin-bottom:1.4rem}
.sparkline-7d .sl-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.7rem}
.sparkline-7d .sl-title{font-size:.7rem;color:var(--t2);letter-spacing:.05em;text-transform:uppercase}
.sparkline-7d .sl-peak{font-size:.7rem;color:oklch(0.65 0.14 60);font-weight:500}
.sparkline-7d .sl-bars{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:60px;margin-bottom:.55rem}
.sparkline-7d .sl-bar{background:linear-gradient(180deg,var(--a),oklch(0.50 0.13 195));border-radius:3px 3px 0 0;position:relative;opacity:.85;transition:opacity .25s}
.sparkline-7d .sl-bar.weekend{background:linear-gradient(180deg,oklch(0.65 0.14 60),oklch(0.45 0.12 55))}
.sparkline-7d .sl-bar:hover{opacity:1}
.sparkline-7d .sl-labels{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;font-size:.55rem;color:var(--t3);text-align:center;letter-spacing:.05em;text-transform:uppercase}
.sparkline-7d .sl-foot{margin-top:.7rem;padding-top:.7rem;border-top:1px solid oklch(1 0 0/.06);font-size:.72rem;color:var(--t2);line-height:1.5}
.sparkline-7d .sl-foot b{color:oklch(0.65 0.14 60)}
```

- [ ] **Step 2.6 : Vérification**

Recharger le preview. **Critère** : aucun changement visuel (les composants ne sont pas encore consommés), aucune erreur CSS console.

- [ ] **Step 2.7 : Commit + push**

```bash
git add index.html
git commit -m "feat(landing): composants CSS réutilisables (dm-mock, mini-cal, oauth-card, phone-notif, sparkline-7d)"
git push
```

---

## Task 3: Refonte pain cards (#problem)

**Files:**
- Modify: `index.html` ligne 206 (CSS `.pain` existant) et lignes 1328-1366 (HTML des 3 `.pain`)

**Goal:** Remplacer les 3 `.pain` actuelles (grand "01" outline + texte) par des cards riches : titre/icône en tête + texte court + `.compare-row` + `.stat-strip` + grain.

- [ ] **Step 3.1 : Modifier le CSS de `.pain` (ligne 206)**

Trouver la règle `.pain{...}` qui démarre ligne 206. La règle actuelle :

```css
.pain{counter-increment:pain;display:grid;grid-template-columns:56px 1fr;grid-template-rows:auto auto;column-gap:2rem;padding:3rem 0;border-top:1px solid oklch(1 0 0/.14);background:transparent;border-radius:0;position:static;overflow:visible}
```

La remplacer intégralement par :

```css
.pain{counter-increment:pain;display:block;padding:2.2rem 0;border-top:1px solid oklch(1 0 0/.14);background:transparent;border-radius:0;position:relative;overflow:hidden}
.pain-head{display:flex;align-items:center;gap:1rem;margin-bottom:.6rem}
.pain-head .pain-num{font-size:2.2rem;font-weight:800;color:transparent;-webkit-text-stroke:1.2px var(--a);line-height:.9;letter-spacing:-.02em;font-feature-settings:"tnum"}
.pain-head .pain-ico{color:var(--a);opacity:.7;display:inline-flex}
.pain-head h3{margin:0;font-size:1.45rem;font-weight:700;letter-spacing:-.01em;line-height:1.15;flex:1;min-width:0}
.pain-lead{font-size:.92rem;color:var(--t2);line-height:1.6;max-width:62ch;margin:0 0 .2rem}
```

Aussi vérifier la règle responsive ligne 510 (`@media`) qui dit `.pain{grid-template-columns:1fr;min-height:auto}`. Remplacer par :

```css
@media(max-width:760px){
  .pain{padding:1.8rem 0}
  .pain-head{flex-wrap:wrap;gap:.7rem}
  .pain-head h3{font-size:1.2rem;width:100%}
}
```

(Note : il peut y avoir d'autres règles `.pain` plus loin lignes 466+. Les inspecter avec Grep `\.pain` avant édition et supprimer celles devenues obsolètes après cette refonte. Ne garder que les nouvelles règles ci-dessus + les règles enfants `.pain-left`, `.pain-right`, `.pain-ico`, `.pain-num` qui peuvent rester si elles n'entrent pas en conflit. Si conflit, supprimer les anciennes.)

- [ ] **Step 3.2 : Remplacer le HTML des 3 pain cards (lignes 1328-1366)**

Trouver `<div class="prob-grid">` ligne 1328. Remplacer tout le bloc (du `<div class="prob-grid">` jusqu'à son `</div>` fermant ligne 1363) par :

```html
    <div class="prob-grid">

      <!-- Pain 01 — Hours lost on DMs -->
      <div class="pain grain-overlay">
        <div class="pain-head">
          <span class="pain-num" aria-hidden="true">01</span>
          <span class="pain-ico" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 44 44" fill="none"><path d="M8 9h22a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H16l-6 6v-6h-2a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13 18h16M13 23h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
          <h3 data-en="Hours lost answering DMs" data-fr="Des heures perdues à répondre aux DMs">Hours lost answering DMs</h3>
        </div>
        <p class="pain-lead body-t" data-en='"Available Friday?" × 12/day. Your AI now replies in 4s, in your tone.' data-fr='"Disponible vendredi ?" × 12/jour. Ton IA répond en 4s, dans ton ton.'>"Available Friday?" × 12/day. Your AI now replies in 4s, in your tone.</p>
        <div class="compare-row">
          <div class="cr-line bad"><span class="dot"></span><span data-en="<b>Without TrimSync</b> · 22 DMs waiting · avg delay 4h47" data-fr="<b>Sans TrimSync</b> · 22 DMs en attente · délai moyen 4h47"><b>Without TrimSync</b> · 22 DMs waiting · avg delay 4h47</span></div>
          <div class="cr-line good"><span class="dot"></span><span data-en="<b>With TrimSync</b> · 22 DMs handled · avg delay 4s" data-fr="<b>Avec TrimSync</b> · 22 DMs traités · délai moyen 4s"><b>With TrimSync</b> · 22 DMs handled · avg delay 4s</span></div>
        </div>
        <div class="stat-strip">
          <div class="stat positive"><span class="n">3h22</span><span class="l" data-en="/day saved" data-fr="/jour gagnées">/day saved</span></div>
          <div class="stat positive"><span class="n">+18</span><span class="l" data-en="bookings/mo" data-fr="RDV/mois">bookings/mo</span></div>
          <div class="stat positive"><span class="n">100%</span><span class="l" data-en="DMs handled" data-fr="DMs traités">DMs handled</span></div>
        </div>
      </div>

      <!-- Pain 02 — Bookings lost to slow replies -->
      <div class="pain grain-overlay">
        <div class="pain-head">
          <span class="pain-num" aria-hidden="true">02</span>
          <span class="pain-ico" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 44 44" fill="none"><rect x="7" y="11" width="30" height="25" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="M7 19h30M16 7v8M28 7v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 28l8 0M26 25l-8 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
          <h3 data-en="Bookings lost to slow replies" data-fr="Des RDV perdus à cause des réponses lentes">Bookings lost to slow replies</h3>
        </div>
        <p class="pain-lead body-t" data-en="A client messages at 11pm and books the first barber who responds. Your AI locks the slot in 4 seconds." data-fr="Un client écrit à 23h et réserve chez le premier barbier qui répond. Ton IA bloque le slot en 4 secondes.">A client messages at 11pm and books the first barber who responds. Your AI locks the slot in 4 seconds.</p>
        <div class="compare-row">
          <div class="cr-line bad"><span class="dot"></span><span data-en="<b>11pm DM</b> → competitor replies first → booking lost" data-fr="<b>DM 23h</b> → concurrent répond d'abord → RDV perdu"><b>11pm DM</b> → competitor replies first → booking lost</span></div>
          <div class="cr-line good"><span class="dot"></span><span data-en="<b>11pm DM</b> → instant AI reply → slot locked" data-fr="<b>DM 23h</b> → réponse IA instantanée → slot bloqué"><b>11pm DM</b> → instant AI reply → slot locked</span></div>
        </div>
        <div class="stat-strip">
          <div class="stat positive"><span class="n">40%</span><span class="l" data-en="bookings after 7pm" data-fr="RDV après 19h">bookings after 7pm</span></div>
          <div class="stat positive"><span class="n">0</span><span class="l" data-en="lost at midnight" data-fr="perdus à minuit">lost at midnight</span></div>
          <div class="stat positive"><span class="n">24/7</span><span class="l" data-en="always on" data-fr="jamais off">always on</span></div>
        </div>
      </div>

      <!-- Pain 03 — No-shows killing revenue -->
      <div class="pain grain-overlay">
        <div class="pain-head">
          <span class="pain-num" aria-hidden="true">03</span>
          <span class="pain-ico" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="14" r="6" stroke="currentColor" stroke-width="1.8"/><path d="M10 36c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M30 6l6 6M36 6l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
          <h3 data-en="No-shows killing your revenue" data-fr="Les no-shows plombent votre CA">No-shows killing your revenue</h3>
        </div>
        <p class="pain-lead body-t" data-en="An empty chair is lost money. Auto reminders cut no-shows by 75%." data-fr="Une chaise vide, c'est de l'argent perdu. Les rappels auto coupent les no-shows de 75%.">An empty chair is lost money. Auto reminders cut no-shows by 75%.</p>
        <div class="compare-row">
          <div class="cr-line bad"><span class="dot"></span><span data-en="<b>No reminder</b> · ~12% no-show rate · empty chair" data-fr="<b>Aucun rappel</b> · ~12% no-show · chaise vide"><b>No reminder</b> · ~12% no-show rate · empty chair</span></div>
          <div class="cr-line good"><span class="dot"></span><span data-en="<b>Auto reminder D-1</b> · ~3% no-show · slot filled" data-fr="<b>Rappel auto J-1</b> · ~3% no-show · slot comblé"><b>Auto reminder D-1</b> · ~3% no-show · slot filled</span></div>
        </div>
        <div class="stat-strip">
          <div class="stat positive"><span class="n">-75%</span><span class="l" data-en="no-shows" data-fr="no-shows">no-shows</span></div>
          <div class="stat positive"><span class="n">+250€</span><span class="l" data-en="/mo recovered" data-fr="/mois récupérés">/mo recovered</span></div>
          <div class="stat positive"><span class="n">2</span><span class="l" data-en="auto reminders" data-fr="rappels auto">auto reminders</span></div>
        </div>
      </div>

    </div>
```

- [ ] **Step 3.3 : Vérification visuelle**

Recharger le preview. Scroll jusqu'à la section "The reality" (#problem).

**Critères** :
- Les 3 cards ont titre+icône+numéro en tête (pas plus de colonne séparée à gauche)
- Mini comparatif `Sans/Avec` visible avec dot rouge/cyan
- Strip de 3 stats chiffrées sous chaque card
- Grain léger visible
- Toggle de langue EN/FR fonctionne (clic sur le switch dans la nav)
- Mobile (resize 375×800) : pas de débordement, lignes empilées proprement

Prendre un `preview_screenshot` pour comparaison.

- [ ] **Step 3.4 : Commit + push**

```bash
git add index.html
git commit -m "refonte(pain-cards): comparatif sans/avec + stats chiffrées"
git push
```

---

## Task 4: Enrichissement solution timeline (#solution)

**Files:**
- Modify: `index.html` ligne 534 (CSS `.sol-step`) et lignes 1378-1422 (HTML des 3 steps)

**Goal:** Remplacer les `.sol-step-empty` (colonne fantôme) par des `.step-mock` qui contiennent un mini-mockup produit pertinent (OAuth, DM, calendrier).

- [ ] **Step 4.1 : Modifier le CSS pour héberger `.step-mock`**

Repérer la zone `.sol-step` ligne 534. Ajouter à la fin du bloc CSS solution (juste avant le `@media(max-width:760px){.sol-step{...}` du responsive) :

```css
.step-mock{display:flex;align-items:center;justify-content:center;padding:1rem}
.sol-step--right .step-mock{grid-column:1;grid-row:1;padding-right:2rem}
.sol-step--left .step-mock{grid-column:3;grid-row:1;padding-left:2rem}
@media(max-width:760px){
  .step-mock{display:none}
}
```

Note : la classe `.sol-step-empty` existante (ligne 549 : `.sol-step-empty{opacity:0;pointer-events:none}`) reste en place — on va simplement ajouter la classe `.step-mock` aux mêmes div pour les rendre visibles avec leur contenu.

- [ ] **Step 4.2 : Remplacer le HTML du `#solution` (lignes 1378-1422)**

Trouver `<div class="sol-timeline">` ligne 1378. Pour chaque `.sol-step--right` et `.sol-step--left`, remplacer le `<div class="sol-step-empty" aria-hidden="true"></div>` par un `<div class="sol-step-empty step-mock" aria-hidden="true">...</div>` contenant le mockup approprié.

Remplacer le bloc complet :

```html
    <div class="sol-timeline">
      <div class="sol-tline-track" aria-hidden="true">
        <div class="sol-tline-progress"></div>
      </div>

      <!-- Étape 1 — droite (mock à gauche) -->
      <div class="sol-step sol-step--right">
        <div class="sol-step-empty step-mock" aria-hidden="true">
          <div class="oauth-card">
            <div class="oc-head">
              <div class="oc-ig">
                <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="4.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.8" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="7" r="1" fill="currentColor"/></svg>
              </div>
              <span class="oc-title" data-en="TrimSync wants to access your DMs" data-fr="TrimSync souhaite accéder à tes DMs">TrimSync wants to access your DMs</span>
            </div>
            <p class="oc-body" data-en="Read &amp; reply to Instagram messages on your behalf." data-fr="Lire et répondre aux messages Instagram en ton nom.">Read &amp; reply to Instagram messages on your behalf.</p>
            <span class="oc-btn" data-en="Authorize" data-fr="Autoriser">Authorize</span>
            <div class="oc-tick" data-en="Connected in 47s" data-fr="Connecté en 47s">Connected in 47s</div>
          </div>
        </div>
        <div class="sol-step-node">
          <div class="sol-step-num">1</div>
        </div>
        <div class="step-content">
          <span class="step-ico" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="9" y="9" width="22" height="22" rx="6" stroke="currentColor" stroke-width="1.7"/><circle cx="20" cy="20" r="6" stroke="currentColor" stroke-width="1.7"/><circle cx="29" cy="11" r="1.8" fill="currentColor"/></svg></span>
          <h3 data-en="Connect your Instagram" data-fr="Connectez Instagram">Connect your Instagram</h3>
          <p class="body-t" data-en="Link your Instagram business account in one click. No technical knowledge required." data-fr="Connectez votre compte Instagram professionnel en un clic. Aucune compétence technique requise.">Link your Instagram business account in one click. No technical knowledge required.</p>
        </div>
      </div>

      <!-- Étape 2 — gauche (mock à droite) -->
      <div class="sol-step sol-step--left">
        <div class="step-content">
          <span class="step-ico" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="9" y="14" width="22" height="18" rx="4" stroke="currentColor" stroke-width="1.7"/><path d="M15 10h10M20 10v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="16" cy="24" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="24" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 23h4M31 23h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
          <h3 data-en="AI handles your DMs" data-fr="L'IA gère vos DMs">AI handles your DMs</h3>
          <p class="body-t" data-en="Our AI reads every message, understands booking intent, and responds naturally on your behalf, 24/7." data-fr="Notre IA lit chaque message, comprend l'intention de réservation, et répond naturellement en votre nom, 24h/24.">Our AI reads every message, understands booking intent, and responds naturally on your behalf, 24/7.</p>
        </div>
        <div class="sol-step-node">
          <div class="sol-step-num">2</div>
        </div>
        <div class="sol-step-empty step-mock" aria-hidden="true">
          <div class="dm-mock" style="max-width:240px;width:100%">
            <div class="dm-head">
              <div class="dm-av">M</div>
              <span class="dm-name">@mehdi_paris</span>
              <span class="dm-ai" data-en="AI Active" data-fr="IA Active">AI Active</span>
            </div>
            <div class="bubble client" data-en="Free Saturday 2pm?" data-fr="Dispo samedi 14h ?">Free Saturday 2pm?</div>
            <div class="bubble ai" data-en="Yes! Locking the slot for you. <small>auto · 4s</small>" data-fr="Yes ! J'te bloque le slot. <small>auto · 4s</small>">Yes! Locking the slot for you. <small>auto · 4s</small></div>
          </div>
        </div>
      </div>

      <!-- Étape 3 — droite (mock à gauche) -->
      <div class="sol-step sol-step--right">
        <div class="sol-step-empty step-mock" aria-hidden="true">
          <div class="mini-cal" style="max-width:220px;width:100%">
            <div class="mc-head">
              <span data-en="This week" data-fr="Cette semaine">This week</span>
              <span class="mc-badge">+1</span>
            </div>
            <div class="mc-grid">
              <div class="mc-cell busy"></div><div class="mc-cell"></div><div class="mc-cell"></div><div class="mc-cell busy"></div><div class="mc-cell"></div><div class="mc-cell"></div><div class="mc-cell busy"></div>
              <div class="mc-cell"></div><div class="mc-cell busy"></div><div class="mc-cell"></div><div class="mc-cell"></div><div class="mc-cell busy"></div><div class="mc-cell slot"></div><div class="mc-cell"></div>
              <div class="mc-cell busy"></div><div class="mc-cell"></div><div class="mc-cell busy"></div><div class="mc-cell"></div><div class="mc-cell"></div><div class="mc-cell"></div><div class="mc-cell busy"></div>
              <div class="mc-cell"></div><div class="mc-cell busy"></div><div class="mc-cell"></div><div class="mc-cell"></div><div class="mc-cell busy"></div><div class="mc-cell"></div><div class="mc-cell"></div>
            </div>
            <div class="mc-foot" data-en="14:00 Mehdi · auto-booked" data-fr="14:00 Mehdi · auto-réservé">14:00 Mehdi · auto-booked</div>
          </div>
        </div>
        <div class="sol-step-node">
          <div class="sol-step-num">3</div>
        </div>
        <div class="step-content">
          <span class="step-ico" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M20 5l4 4h5a2 2 0 0 1 2 2v5l4 4-4 4v5a2 2 0 0 1-2 2h-5l-4 4-4-4h-5a2 2 0 0 1-2-2v-5l-4-4 4-4v-5a2 2 0 0 1 2-2h5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 20l4 4 8-8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <h3 data-en="Appointments booked, instantly" data-fr="RDV confirmés, instantanément">Appointments booked, instantly</h3>
          <p class="body-t" data-en="Clients get confirmed bookings, automatic reminders, and calendar updates. You see everything in your dashboard." data-fr="Les clients reçoivent des confirmations, des rappels et des mises à jour calendrier. Vous voyez tout dans votre tableau de bord.">Clients get confirmed bookings, automatic reminders, and calendar updates. You see everything in your dashboard.</p>
        </div>
      </div>

    </div>
```

- [ ] **Step 4.3 : Vérification**

Recharger preview, scroll jusqu'à "How it works".

**Critères** :
- Step 1 a la carte OAuth à gauche (logo Insta + "Authorize" cyan + "Connected in 47s")
- Step 2 a la bulle DM à droite (Mehdi + IA "Locking the slot · 4s")
- Step 3 a le mini-calendrier à gauche (slot vert glow + "+1" badge + "14:00 Mehdi")
- La timeline verticale ligne centrale reste visible
- Mobile : les mocks disparaissent (selon `@media`), seuls les `.step-content` restent

`preview_screenshot` pour archive.

- [ ] **Step 4.4 : Commit + push**

```bash
git add index.html
git commit -m "feat(solution): mini-mockups OAuth / DM / calendrier dans la timeline"
git push
```

---

## Task 5: Enrichissement features (#features)

**Files:**
- Modify: `index.html` ligne 230 (CSS `.feat`) et lignes 1437-1471 (HTML des 4 `.feat`)

**Goal:** Sous chaque feature, ajouter un `.feat-mock` (mini-snippet visuel) + une `.feat-stat-row` (1-2 chiffres clé).

- [ ] **Step 5.1 : Étendre le CSS de `.feat`**

Trouver `.feat{` ligne 230. La règle existante définit grid, padding, etc. À la fin de toutes les règles existantes liées à `.feat` (donc avant la section pricing CSS), ajouter :

```css
/* Feat mock — micro-aperçus produit dans chaque feature card */
.feat-mock{margin-top:1rem;padding:.7rem;background:oklch(0.13 0.009 222/.6);border:1px solid oklch(1 0 0/.05);border-radius:10px;display:flex;flex-direction:column;gap:.4rem;font-size:.7rem;color:var(--t2);line-height:1.4}
.feat-mock .fm-row{display:flex;align-items:center;gap:.5rem}
.feat-mock .fm-row .fm-dot{width:6px;height:6px;border-radius:50%;background:var(--a);box-shadow:0 0 6px var(--a);flex:none}
.feat-mock .fm-row.muted .fm-dot{background:oklch(1 0 0/.20);box-shadow:none}
.feat-mock .fm-row b{color:var(--t1);font-weight:500}

.feat-stat-row{display:flex;gap:1.2rem;flex-wrap:wrap;margin-top:.8rem;padding-top:.7rem;border-top:1px solid oklch(1 0 0/.06)}
.feat-stat-row .fs{display:flex;flex-direction:column;gap:.1rem}
.feat-stat-row .fs .n{font-size:1rem;font-weight:700;color:var(--a);letter-spacing:-.02em;font-feature-settings:"tnum";line-height:1}
.feat-stat-row .fs .l{font-size:.55rem;color:var(--t3);letter-spacing:.06em;text-transform:uppercase}

.feat .feat-wm{opacity:.06 !important} /* watermark grand chiffre/AI : réduit pour ne pas concurrencer les mocks */
```

- [ ] **Step 5.2 : Ajouter mock + stat-row dans la feature 1 (AI booking bot)**

Trouver le `<div class="feat">` qui contient `AI booking bot, 24/7` (lignes 1438-1445). Juste après le `<p class="body-t">...</p>` (et avant le `</div>` fermant), ajouter :

```html
        <div class="feat-mock" aria-hidden="true">
          <div class="fm-row muted"><span class="fm-dot"></span><span><b data-en="Client" data-fr="Client">Client</b> · <span data-en="Open Saturday?" data-fr="Ouvert samedi ?">Open Saturday?</span></span></div>
          <div class="fm-row"><span class="fm-dot"></span><span><b data-en="AI" data-fr="IA">AI</b> · <span data-en="Yes! 10am-7pm." data-fr="Yes ! 10h-19h.">Yes! 10am-7pm.</span></span></div>
        </div>
        <div class="feat-stat-row">
          <div class="fs"><span class="n">4s</span><span class="l" data-en="avg reply" data-fr="réponse moy.">avg reply</span></div>
          <div class="fs"><span class="n">24/7</span><span class="l" data-en="uptime" data-fr="actif">uptime</span></div>
        </div>
```

- [ ] **Step 5.3 : Ajouter mock + stat-row dans la feature 2 (Auto booking & confirmation)**

Trouver le `<div class="feat">` avec `Auto booking &amp; confirmation` (lignes 1446-1453). Après le `<p class="body-t">...</p>`, ajouter :

```html
        <div class="feat-mock" aria-hidden="true">
          <div class="fm-row"><span class="fm-dot"></span><span><b data-en="14:00 Thursday" data-fr="14h jeudi">14:00 Thursday</b> · ✓ <span data-en="Confirmed" data-fr="Confirmé">Confirmed</span></span></div>
          <div class="fm-row muted"><span class="fm-dot"></span><span data-en="Reminder sent · J-1" data-fr="Rappel envoyé · J-1">Reminder sent · J-1</span></div>
        </div>
        <div class="feat-stat-row">
          <div class="fs"><span class="n">100%</span><span class="l" data-en="auto" data-fr="auto">auto</span></div>
          <div class="fs"><span class="n">0</span><span class="l" data-en="clicks needed" data-fr="clics requis">clicks needed</span></div>
        </div>
```

- [ ] **Step 5.4 : Ajouter mock + stat-row dans la feature 3 (Smart cancellations)**

Trouver le `<div class="feat">` avec `Smart cancellations` (lignes 1454-1461). Après le `<p class="body-t">...</p>`, ajouter :

```html
        <div class="feat-mock" aria-hidden="true">
          <div class="fm-row muted"><span class="fm-dot"></span><span data-en="Slot freed · 16:00" data-fr="Slot libéré · 16h">Slot freed · 16:00</span></div>
          <div class="fm-row"><span class="fm-dot"></span><span><b data-en="→ Yassine notified" data-fr="→ Yassine notifié">→ Yassine notified</b> · ✓ <span data-en="booked" data-fr="réservé">booked</span></span></div>
        </div>
        <div class="feat-stat-row">
          <div class="fs"><span class="n">&lt;3 min</span><span class="l" data-en="refill time" data-fr="comblage">refill time</span></div>
          <div class="fs"><span class="n">0</span><span class="l" data-en="empty slots" data-fr="trous">empty slots</span></div>
        </div>
```

- [ ] **Step 5.5 : Ajouter mock + stat-row dans la feature 4 (Google Calendar sync)**

Trouver le `<div class="feat">` avec `Google Calendar sync` (lignes 1462-1470). C'est la seule feature qui a un `<div class="feat-body">` enveloppant. Insérer le mock/stat-row à l'intérieur de `.feat-body`, juste après le `<p class="body-t">...</p>` :

```html
          <div class="feat-mock" aria-hidden="true">
            <div class="fm-row"><span class="fm-dot"></span><span><b>Google Calendar</b> ⇄ TrimSync</span></div>
            <div class="fm-row muted"><span class="fm-dot"></span><span data-en="Real-time sync · no double entries" data-fr="Sync temps réel · zéro doublon">Real-time sync · no double entries</span></div>
          </div>
          <div class="feat-stat-row">
            <div class="fs"><span class="n" data-en="Real-time" data-fr="Temps réel">Real-time</span><span class="l">sync</span></div>
            <div class="fs"><span class="n">2-way</span><span class="l" data-en="bidirectional" data-fr="bidirectionnel">bidirectional</span></div>
          </div>
```

- [ ] **Step 5.6 : Vérification**

Recharger preview, scroll jusqu'à "Built for barbers".

**Critères** :
- Chaque feature card contient maintenant : icône (existante) + tag (existant) + h3 + p + mock + stat-row
- Les watermarks "AI" / "02" / "03" sont plus discrets (opacity .06)
- Le grid 4 cards reste équilibré (les cards sont plus hautes mais toutes pareilles)
- Mobile : grid passe en colonne unique (déjà géré par le responsive existant)

`preview_screenshot`.

- [ ] **Step 5.7 : Commit + push**

```bash
git add index.html
git commit -m "feat(features): mini-snippets + stats chiffrées par card"
git push
```

---

## Task 6: Refonte bot-demo (#bot-demo)

**Files:**
- Modify: `index.html` lignes 1486-1502 (HTML `.bot-demo-preview`)

**Goal:** Remplacer les 3 `.bot-prev-card` horizontales par un `.bot-thread` vertical (mini-thread Insta) plus immersif.

- [ ] **Step 6.1 : Ajouter le CSS `.bot-thread`**

Coller en fin de `<style>` :

```css
/* Bot thread — version verticale du bot-demo-preview */
.bot-thread{max-width:340px;margin:2rem auto;background:linear-gradient(180deg,oklch(0.14 0.008 218),oklch(0.10 0.008 218));border:1px solid oklch(1 0 0/.10);border-radius:22px;padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.6rem;position:relative}
.bot-thread.glow-miel{box-shadow:0 0 80px -20px oklch(0.65 0.14 60/.35), 0 0 160px -40px oklch(0.65 0.14 60/.2)}
.bot-thread .bt-head{display:flex;align-items:center;gap:.65rem;padding-bottom:.7rem;border-bottom:1px solid oklch(1 0 0/.06)}
.bot-thread .bt-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,oklch(0.65 0.14 60),oklch(0.40 0.10 50));display:grid;place-items:center;font-size:.7rem;font-weight:700;color:#fff}
.bot-thread .bt-name{font-size:.78rem;color:var(--t1);font-weight:500}
.bot-thread .bt-ai{font-size:.62rem;color:oklch(0.65 0.14 60);margin-left:auto;display:flex;align-items:center;gap:.3rem}
.bot-thread .bt-ai::before{content:"";width:6px;height:6px;border-radius:50%;background:oklch(0.65 0.14 60);box-shadow:0 0 8px oklch(0.65 0.14 60);animation:botpulse 2s ease-in-out infinite}
@keyframes botpulse{0%,100%{opacity:1}50%{opacity:.4}}
.bot-thread .bt-msg{padding:.55rem .8rem;font-size:.78rem;border-radius:16px;max-width:78%;line-height:1.4;animation:btfadein .4s ease-out both}
.bot-thread .bt-msg.client{background:oklch(0.20 0.008 218);color:var(--t1);align-self:flex-start;border-bottom-left-radius:5px}
.bot-thread .bt-msg.ai{background:var(--a);color:var(--ink);align-self:flex-end;border-bottom-right-radius:5px;font-weight:500}
@keyframes btfadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.bot-thread .bt-arrow{font-size:.55rem;color:var(--t3);text-align:center;letter-spacing:.15em;margin:.1rem 0}
.bot-thread .bt-result{margin-top:.6rem;padding-top:.8rem;border-top:1px solid oklch(1 0 0/.06);display:flex;justify-content:space-between;align-items:center;font-size:.65rem;color:var(--t3);letter-spacing:.04em}
.bot-thread .bt-result b{color:var(--a);font-weight:500}
```

- [ ] **Step 6.2 : Remplacer le HTML `.bot-demo-preview` (lignes 1486-1502)**

Trouver `<div class="bot-demo-preview" aria-hidden="true">` ligne 1486. Remplacer tout le bloc (jusqu'à son `</div>` de fermeture, ligne 1502) par :

```html
      <div class="bot-thread glow-miel" aria-hidden="true">
        <div class="bt-head">
          <div class="bt-av">BP</div>
          <span class="bt-name">BarberShop Pro</span>
          <span class="bt-ai" data-en="AI Active" data-fr="IA Active">AI Active</span>
        </div>
        <div class="bt-msg client" data-en="Hey, any spots tomorrow at 2pm?" data-fr="Bonjour, dispo demain à 14h ?">Hey, any spots tomorrow at 2pm?</div>
        <div class="bt-arrow" data-en="→ 4s" data-fr="→ 4s">→ 4s</div>
        <div class="bt-msg ai" data-en="14:00 is available! What service?" data-fr="14h c'est libre ! Quelle prestation ?">14:00 is available! What service?</div>
        <div class="bt-msg client" data-en="Cut + beard" data-fr="Coupe + barbe">Cut + beard</div>
        <div class="bt-msg ai" data-en="✓ Booked — Cut + Beard, 14:00" data-fr="✓ Réservé — Coupe + Barbe, 14h">✓ Booked — Cut + Beard, 14:00</div>
        <div class="bt-result">
          <span data-en="Zero manual work" data-fr="Zéro effort manuel">Zero manual work</span>
          <b data-en="12s total" data-fr="12s total">12s total</b>
        </div>
      </div>
```

- [ ] **Step 6.3 : Vérification**

Recharger preview, scroll jusqu'à "Your bot. Your tone."

**Critères** :
- Thread vertical centré, max 340px de large
- Bulles client (gris) à gauche, IA (cyan) à droite, alternance
- Petit "→ 4s" entre la première client et la première IA
- Header BP avatar + "AI Active" cuivre avec pulse animation
- Footer "Zero manual work · 12s total"
- Aura cuivre visible (glow-miel)
- Mobile : reste centré et lisible

`preview_screenshot`.

- [ ] **Step 6.4 : Commit + push**

```bash
git add index.html
git commit -m "refonte(bot-demo): mini-thread Insta vertical + glow cuivre"
git push
```

---

## Task 7: Sparkline pricing (#pricing)

**Files:**
- Modify: `index.html` lignes 1612-1614 (insertion avant `<p class="vs-lbl">`)

**Goal:** Ajouter un mini bar chart 7 jours qui montre les pics de DMs reçus en week-end soir — argument visuel pour le ROI.

- [ ] **Step 7.1 : Insérer le HTML `.sparkline-7d`**

Trouver `<div class="price-right rv d3">` ligne 1613. À l'intérieur, AVANT le `<p class="vs-lbl">` (ligne 1614), insérer :

```html
        <div class="sparkline-7d" aria-hidden="true">
          <div class="sl-head">
            <span class="sl-title" data-en="DMs received · this week" data-fr="DMs reçus · cette semaine">DMs received · this week</span>
            <span class="sl-peak" data-en="Sat 22h · peak" data-fr="Sam 22h · pic">Sat 22h · peak</span>
          </div>
          <div class="sl-bars">
            <div class="sl-bar" style="height:32%"></div>
            <div class="sl-bar" style="height:48%"></div>
            <div class="sl-bar" style="height:38%"></div>
            <div class="sl-bar" style="height:55%"></div>
            <div class="sl-bar" style="height:68%"></div>
            <div class="sl-bar weekend" style="height:100%"></div>
            <div class="sl-bar weekend" style="height:82%"></div>
          </div>
          <div class="sl-labels">
            <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
          </div>
          <div class="sl-foot" data-en="<b>Sat 10pm–2am</b> = 38% of weekly DMs. You're off. TrimSync isn't." data-fr="<b>Sam 22h–2h</b> = 38% des DMs de la semaine. Toi t'es off. TrimSync, non."><b>Sat 10pm–2am</b> = 38% of weekly DMs. You're off. TrimSync isn't.</div>
        </div>
```

- [ ] **Step 7.2 : Vérification**

Recharger preview, scroll jusqu'à "Transparent pricing" → colonne droite (price-right).

**Critères** :
- Sparkline au-dessus du tableau ROI existant
- 7 barres avec Lun→Ven en cyan/bleu, Sam/Dim en cuivre/orange (les plus hautes)
- Label "Sat 22h · peak" en cuivre à droite du titre
- Note en bas avec le chiffre 38% en cuivre gras
- Le tableau ROI existant en dessous est inchangé

`preview_screenshot`.

- [ ] **Step 7.3 : Commit + push**

```bash
git add index.html
git commit -m "feat(pricing): sparkline DMs hebdomadaire au-dessus du tableau ROI"
git push
```

---

## Task 8: FAQ micro-icônes + mini-visuels (#faq)

**Files:**
- Modify: `index.html` ligne 362 (CSS `.faq-item`) et lignes 1659-1731 (HTML des 8 `.faq-item`)

**Goal:** Ajouter une micro-icône SVG 16px à gauche de chaque question + 3 mini-visuels dans les réponses Q1, Q5, Q8.

- [ ] **Step 8.1 : Étendre le CSS pour les icônes FAQ**

Coller en fin de `<style>` :

```css
/* FAQ — micro-iconographie */
.faq-q{display:flex;align-items:center;gap:.8rem}
.faq-q .faq-q-ico{flex:none;width:18px;height:18px;color:var(--a);opacity:.7;display:inline-flex}
.faq-q > span:not(.faq-ico):not(.faq-q-ico){flex:1;min-width:0}

/* FAQ mini-visuels dans certaines réponses */
.faq-visual{margin-top:.9rem;padding:.7rem .9rem;background:oklch(0.13 0.009 222/.6);border:1px solid oklch(1 0 0/.06);border-radius:10px;display:flex;align-items:center;gap:.65rem;font-size:.75rem;color:var(--t2);line-height:1.4}
.faq-visual .fv-ico{width:24px;height:24px;flex:none;display:grid;place-items:center;border-radius:6px;background:oklch(0.76 0.13 193/.15);color:var(--a)}
.faq-visual b{color:var(--t1);font-weight:500}
.faq-visual.cost{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;text-align:center;font-size:.7rem}
.faq-visual.cost .col{display:flex;flex-direction:column;gap:.15rem}
.faq-visual.cost .col .n{font-size:.95rem;font-weight:700;color:var(--a);letter-spacing:-.02em}
.faq-visual.cost .col .l{font-size:.55rem;color:var(--t3);letter-spacing:.05em;text-transform:uppercase}
```

- [ ] **Step 8.2 : Ajouter une icône à chaque question (8 questions)**

Pour chaque `<div class="faq-q" ...>` (lignes 1660, 1669, 1678, 1687, 1696, 1705, 1714, 1723), insérer juste après l'ouverture une icône SVG. Voici le mapping question → icône à insérer comme `<span class="faq-q-ico">...</span>` juste avant le `<span data-en="...">` existant :

**Q1 (How does TrimSync connect to my Instagram?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="12" height="12" rx="3.5" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="9" r="2.8" stroke="currentColor" stroke-width="1.4"/><circle cx="13" cy="5" r=".7" fill="currentColor"/></svg></span>
```

**Q2 (Do I need technical skills…?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><path d="M9 2v3M9 13v3M2 9h3M13 9h3M4.5 4.5l2 2M11.5 11.5l2 2M4.5 13.5l2-2M11.5 6.5l2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="9" cy="9" r="2" stroke="currentColor" stroke-width="1.3"/></svg></span>
```

**Q3 (What if the AI doesn't understand?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><rect x="3" y="4" width="12" height="10" rx="2.5" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="9" r="1" fill="currentColor"/><circle cx="12" cy="9" r="1" fill="currentColor"/><path d="M9 2v2M5 14l-1 2M13 14l1 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></span>
```

**Q4 (Can I customize what the bot says?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><path d="M12 2l4 4-9 9H3v-4l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 4l4 4" stroke="currentColor" stroke-width="1.4"/></svg></span>
```

**Q5 (Is my clients' data secure?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><path d="M9 1.5L3 4v5c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L9 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.5 9l2 2 3.5-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
```

**Q6 (Does the bot sound natural?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><path d="M3 5h12v8H6l-3 2.5V5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 9h6M6 11h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></span>
```

**Q7 (What if I'm fully booked?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><rect x="3" y="4" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M3 7h12M6 2v3M12 2v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="11" r=".8" fill="currentColor"/><circle cx="9" cy="11" r=".8" fill="currentColor"/><circle cx="12" cy="11" r=".8" fill="currentColor"/></svg></span>
```

**Q8 (What's the total cost?)** :
```html
          <span class="faq-q-ico" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M9 5v8M11.5 6.5H7.5a1.5 1.5 0 100 3h3a1.5 1.5 0 110 3H6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></span>
```

- [ ] **Step 8.3 : Ajouter le mini-visuel dans la réponse Q1 (OAuth Meta)**

Dans `<div class="faq-a" id="fa1" ...>`, à l'intérieur de `.faq-a-in`, juste après le `<p class="body-t">...</p>` existant, ajouter :

```html
          <div class="faq-visual" aria-hidden="true">
            <div class="fv-ico"><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="12" height="12" rx="3.5" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="9" r="2.8" stroke="currentColor" stroke-width="1.4"/><circle cx="13" cy="5" r=".7" fill="currentColor"/></svg></div>
            <span data-en="<b>OAuth Meta official</b> · setup avg 4min47 · no password shared" data-fr="<b>OAuth Meta officiel</b> · setup moyen 4min47 · aucun mot de passe partagé"><b>OAuth Meta official</b> · setup avg 4min47 · no password shared</span>
          </div>
```

- [ ] **Step 8.4 : Ajouter le mini-visuel dans la réponse Q5 (sécurité données)**

Dans `<div class="faq-a" id="fa5" ...>`, juste après le `<p class="body-t">...</p>`, ajouter :

```html
          <div class="faq-visual" aria-hidden="true">
            <div class="fv-ico"><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M9 1.5L3 4v5c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L9 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.5 9l2 2 3.5-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <span data-en="<b>AES-256 encryption</b> · GDPR compliant · delete request at felix@trimsync.tech" data-fr="<b>Chiffrement AES-256</b> · RGPD conforme · suppression à felix@trimsync.tech"><b>AES-256 encryption</b> · GDPR compliant · delete request at felix@trimsync.tech</span>
          </div>
```

- [ ] **Step 8.5 : Ajouter le mini-visuel dans la réponse Q8 (tarifs)**

Dans `<div class="faq-a" id="fa8" ...>`, juste après le `<p class="body-t">...</p>`, ajouter :

```html
          <div class="faq-visual cost" aria-hidden="true">
            <div class="col"><span class="n" data-en="0€" data-fr="0€">0€</span><span class="l" data-en="setup (1st 10)" data-fr="setup (10 premiers)">setup (1st 10)</span></div>
            <div class="col"><span class="n">59€</span><span class="l" data-en="/mo Starter" data-fr="/mois Starter">/mo Starter</span></div>
            <div class="col"><span class="n">99€</span><span class="l" data-en="/mo Max" data-fr="/mois Max">/mo Max</span></div>
          </div>
```

- [ ] **Step 8.6 : Vérification**

Recharger preview, scroll jusqu'à "Questions barbers ask".

**Critères** :
- Chaque question a une micro-icône cyan à gauche
- Ouvrir Q1, Q5, Q8 (clic) → mini-visuel visible sous le texte
- Les autres questions (Q2/3/4/6/7) restent texte pur
- L'animation d'ouverture des FAQ continue à fonctionner
- Mobile : icône ne casse pas la mise en page

`preview_screenshot` (FAQ avec 1-2 questions ouvertes).

- [ ] **Step 8.7 : Commit + push**

```bash
git add index.html
git commit -m "feat(faq): micro-icônes par question + mini-visuels Q1/Q5/Q8"
git push
```

---

## Task 9: Refonte CTA final (#cta)

**Files:**
- Modify: `index.html` ligne 374 (CSS `.cta-final`, `.cta-glow`) et lignes 1736-1754 (HTML CTA)

**Goal:** Transformer le CTA très vide (titre + bouton) en grid 2 colonnes : contenu à gauche, phone-mock avec notification à droite, social proof strip en dessous, aura cuivre amplifiée.

- [ ] **Step 9.1 : Étendre le CSS de `.cta-final`**

Trouver `.cta-final{...}` ligne 374. Ajouter ces règles en fin de `<style>` :

```css
/* CTA final — refonte avec grid 2 colonnes + phone mock */
.cta-final{padding:5rem 0 6rem}
.cta-final .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:3rem;align-items:center;text-align:left}
.cta-final h2{margin-left:0;margin-right:0;max-width:none;text-align:left}
.cta-final .body-lg{margin-left:0;margin-right:0;max-width:none;text-align:left}
.cta-final .cta-acts{justify-content:flex-start;display:flex}
.cta-final .label{text-align:left;display:inline-block}
.cta-glow{background:radial-gradient(ellipse 70% 80% at 60% 50%,oklch(0.65 0.14 60/.18) 0%,oklch(0.76 0.13 193/.10) 30%,transparent 70%)}

.cta-proof-strip{margin-top:1.6rem;padding-top:1.2rem;border-top:1px solid oklch(1 0 0/.08);display:flex;gap:1.6rem;flex-wrap:wrap}
.cta-proof-strip .ps{display:flex;flex-direction:column;gap:.1rem}
.cta-proof-strip .ps .n{font-size:1.05rem;font-weight:700;color:var(--a);letter-spacing:-.02em;font-feature-settings:"tnum";line-height:1}
.cta-proof-strip .ps .l{font-size:.6rem;color:var(--t3);letter-spacing:.06em;text-transform:uppercase}

.cta-phone-mock{position:relative;display:flex;justify-content:center;align-items:center;min-height:340px}
.cta-phone-mock .pf{width:240px;height:340px;background:linear-gradient(180deg,oklch(0.12 0.008 218),oklch(0.08 0.008 218));border:8px solid oklch(0.18 0.008 218);border-radius:36px;padding:1rem .8rem;display:flex;flex-direction:column;gap:.7rem;position:relative;box-shadow:0 30px 80px -20px oklch(0.65 0.14 60/.4), 0 0 0 1px oklch(1 0 0/.05)}
.cta-phone-mock .pf::before{content:"";position:absolute;top:8px;left:50%;transform:translateX(-50%);width:60px;height:5px;background:oklch(0.18 0.008 218);border-radius:100px}
.cta-phone-mock .pf-time{font-size:.6rem;color:var(--t3);text-align:center;margin-top:.4rem;letter-spacing:.05em}
.cta-phone-mock .pf-notif{animation:popnotif .6s ease-out .4s both}
@keyframes popnotif{from{opacity:0;transform:translateY(-10px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}

@media(max-width:900px){
  .cta-final .wrap{grid-template-columns:1fr;gap:2rem;text-align:center}
  .cta-final h2,.cta-final .body-lg{text-align:center}
  .cta-final .cta-acts{justify-content:center}
  .cta-final .label{text-align:center}
  .cta-proof-strip{justify-content:center}
  .cta-phone-mock{min-height:auto;order:-1}
  .cta-phone-mock .pf{width:200px;height:280px}
}
```

- [ ] **Step 9.2 : Remplacer le HTML du `#cta` (lignes 1736-1754)**

Trouver `<section class="section cta-final" id="cta">` ligne 1736. Remplacer le contenu de `.wrap` (mais garder `<div class="cta-glow">` et la balise `<section>` elle-même) :

```html
<section class="section cta-final" id="cta">
  <div class="cta-glow" aria-hidden="true"></div>
  <div class="wrap">

    <div class="cta-content">
      <span class="label rv" data-en="Get started" data-fr="Commencer">Get started</span>
      <h2 class="fd fd-lg rv d1 sec-h2"
        data-en="Ready to stop answering<br><em>DMs at midnight?</em>"
        data-fr="Prêt à arrêter de répondre<br><em>aux DMs à minuit ?</em>"
      >Ready to stop answering<br><em>DMs at midnight?</em></h2>
      <p class="body-lg rv d2"
        data-en="Get set up in minutes. Connect Instagram, pick your plan, and let your AI bot take over."
        data-fr="Configuré en quelques minutes. Connecte Instagram, choisis ton plan, et laisse ton bot IA gérer."
      >Get set up in minutes. Connect Instagram, pick your plan, and let your AI bot take over.</p>
      <div class="cta-acts rv d3">
        <a href="trimsync-booking.html" class="btn btn-a btn-lg mag">
          <span data-en="Get started" data-fr="Commencer">Get started</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>
      <div class="cta-proof-strip rv d3">
        <div class="ps"><span class="n">47+</span><span class="l" data-en="barbers active" data-fr="barbiers actifs">barbers active</span></div>
        <div class="ps"><span class="n">12 400</span><span class="l" data-en="DMs handled" data-fr="DMs traités">DMs handled</span></div>
        <div class="ps"><span class="n">4.9★</span><span class="l" data-en="avg rating" data-fr="note moyenne">avg rating</span></div>
      </div>
    </div>

    <div class="cta-phone-mock" aria-hidden="true">
      <div class="pf">
        <div class="pf-time">9:41 · TrimSync</div>
        <div class="pf-notif phone-notif">
          <div class="pn-ico">TS</div>
          <div class="pn-body">
            <div class="pn-meta"><span data-en="TrimSync · now" data-fr="TrimSync · maintenant">TrimSync · now</span></div>
            <div class="pn-title" data-en="New booking · #47" data-fr="Nouveau RDV · #47">New booking · #47</div>
            <div class="pn-msg" data-en="Mehdi P. · Thursday 6pm · Cut + beard" data-fr="Mehdi P. · Jeudi 18h · Coupe + barbe">Mehdi P. · Thursday 6pm · Cut + beard</div>
          </div>
        </div>
        <div class="pf-notif phone-notif" style="animation-delay:1.4s">
          <div class="pn-ico" style="background:linear-gradient(135deg,oklch(0.72 0.14 162),oklch(0.50 0.12 165))">✓</div>
          <div class="pn-body">
            <div class="pn-meta"><span data-en="Auto-confirmed" data-fr="Auto-confirmé">Auto-confirmed</span></div>
            <div class="pn-title" data-en="Reminder scheduled" data-fr="Rappel programmé">Reminder scheduled</div>
            <div class="pn-msg" data-en="D-1 SMS · 9pm" data-fr="J-1 SMS · 21h">D-1 SMS · 9pm</div>
          </div>
        </div>
      </div>
    </div>

  </div>
</section>
```

- [ ] **Step 9.3 : Vérification**

Recharger preview, scroll tout en bas jusqu'au CTA.

**Critères** :
- Grid 2 colonnes : texte/CTA à gauche, phone mock à droite
- Phone mock affiche 2 notifications cyan/vert qui popent en cascade (animation)
- Strip social proof "47+ barbers · 12 400 DMs · 4.9★" sous le bouton
- Aura cuivre clairement visible derrière (radial gradient amplifié)
- Mobile : phone passe au-dessus du contenu, tout est centré

`preview_screenshot` desktop + mobile.

- [ ] **Step 9.4 : Commit + push**

```bash
git add index.html
git commit -m "refonte(cta): grid 2 col + phone mock notif + social proof strip"
git push
```

---

## Final Verification

- [ ] **Step F.1 : Tour complet desktop**

Recharger l'index complet en preview. Scroll de haut en bas. Vérifier :
- Hero : inchangé (chat phone + iframe dashboard)
- Marquee : inchangé
- Problem : 3 pain cards enrichies (Task 3)
- Solution : 3 steps avec mockups latéraux (Task 4)
- Features : 4 cards avec mocks + stats (Task 5)
- Bot demo : thread vertical glow cuivre (Task 6)
- Pricing : sparkline + tableau ROI + 2 plans (Task 7)
- FAQ : icônes + 3 mini-visuels (Task 8)
- CTA final : grid 2 col + phone notif + proof (Task 9)

`preview_screenshot` final.

- [ ] **Step F.2 : Tour complet mobile (resize 375×800)**

`preview_resize` à 375×800. Re-scroll. Vérifier qu'aucune section ne déborde, que tous les nouveaux composants ont leur fallback responsive activé.

- [ ] **Step F.3 : Toggle EN/FR**

Cliquer le toggle de langue. Vérifier que tous les nouveaux textes basculent (les `data-en` / `data-fr` ajoutés).

- [ ] **Step F.4 : Console**

`preview_console_logs` : zéro erreur JS, zéro warning CSS.

- [ ] **Step F.5 : Poids du fichier**

```bash
wc -c index.html
```

Comparer avec la valeur avant refonte. Attendu : +30 à +45 KB max (les SVG inline + nouvelles règles CSS). Si > +60 KB, regarder s'il y a des duplications.

- [ ] **Step F.6 : Commit final + push (s'il reste des changements)**

```bash
git status
# Si des fichiers traînent (par ex. screenshots) :
git add <fichiers pertinents>
git commit -m "chore(landing): vérification finale enrichissement visuel"
git push
```

---

## Self-Review

✅ **Spec coverage** : chaque section du spec (hero, problem, solution, features, bot-demo, pricing, faq, cta) a sa tâche correspondante (Task 1+2 = composants partagés, Task 3-9 = sections). Hero non-couvert volontairement (spec 3.1 dit "on touche pas").

✅ **Placeholder scan** : aucun "TBD", "TODO", "implement later". Chaque snippet HTML/CSS est livré complet. Les chiffres (3h22, 22 DMs, 38%, 4min47, 12 400, 47+) viennent du spec et sont cohérents entre eux.

✅ **Type consistency** : `.dm-mock`, `.mini-cal`, `.oauth-card`, `.phone-notif`, `.sparkline-7d`, `.stat-strip`, `.compare-row`, `.grain-overlay`, `.glow-miel`, `.glow-cyan` sont définis en Task 1-2 et réutilisés avec les mêmes noms en Task 3-9. Les variables `--stat-positive`, `--stat-negative`, `--grain-uri` introduites en Task 1 sont utilisées dans `.stat-strip` et `.compare-row` partout. `--a` (cyan) et `--ink`, `--t1/t2/t3` sont les variables existantes du projet réutilisées.

✅ **Variables existantes** : `--a` (cyan), `--ink`, `--t1/t2/t3` (text), `--bd` (border), `var(--miel)` (cuivre) — toutes héritées du projet, vérifiées dans les règles CSS existantes lignes 28-200.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-trimsync-enrichissement-visuel.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — je dispatch un subagent frais par tâche, je review entre chaque, itération rapide.
2. **Inline Execution** — j'exécute les tâches dans cette session avec checkpoints de review entre tâches.

Quelle approche tu préfères ?
