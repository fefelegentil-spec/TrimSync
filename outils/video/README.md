# Le film de présentation TrimSync

1920 × 1080, 60 i/s, 1 min 41, voix off, musique et bruitages. Tout se régénère d'ici ;
ni les clips, ni les vidéos ne sont versionnés.

```bash
cd outils/video
npm install                 # playwright-core (pilote Chrome, déjà installé sur la machine)
python voix.py              # la voix off → voix/<voix>/*.mp3 (pip install edge-tts)
node enregistrer.mjs        # filme les vraies pages du site → clips/ (1,2 Go)
node rendu.mjs              # rend le film → sortie/trimsync-presentation-voix-{homme,femme}.mp4 + .srt
```

Relire sans tout rendre : `node rendu.mjs --stills 19.6,65.6` (images fixes),
`--bande 26.6:28.9:8` (huit images d'un mouvement côte à côte), `--planche 24` (tout le film
en 24 vignettes), `--son` (la bande son seule), `--fps 30 --dpr 1` (essai rapide, 2 minutes).
Vérifier qu'un clip a bien joué son scénario : `python planche-clip.py resa`.

## Comment c'est fait

| Fichier | Rôle |
|---|---|
| `voix.py` | Le texte de la voix off, et sa synthèse (deux voix). Relève le début de chaque mot. |
| `temps.mjs` | La partition : durée de chaque scène (en temps de la musique), départ de chaque phrase, repères de chaque geste (calés sur les mots). Quelles mesures du morceau jouent sous quelle scène. |
| `clips.mjs` + `enregistrer.mjs` | Les pages du site à filmer, à quelle heure de l'histoire, avec quels touchers. |
| `lib/temps-virtuel.js` | L'horloge de la page filmée : le site joue ses propres animations, une image à la fois. |
| `lib/demo.mjs` | Le salon de démonstration (« Studio Nova ») et la fausse API : les pages sont les vraies, seul le réseau est simulé. Rien ne touche la production. |
| `film.html`, `film.css`, `film.mjs`, `film/` | Le film : fond (la fumée du site), téléphones, typographie, douze scènes. `seek(t)` pose l'état exact de l'instant t. |
| `lib/son.mjs` | Le mixage : voix, musique recoupée mesure par mesure, bruitages. |
| `rendu.mjs` | Photographie le film image par image (4 pages Chrome en parallèle), encode, monte le son. |

## Ce qu'il faut savoir avant d'y toucher

- **Les écrans TrimSync sont le vrai site.** `reserver.html`, `app.html` et le formulaire du
  bot de `index.html` sont ouverts tels quels et filmés. Une retouche du site se retrouve dans
  le film au prochain `node enregistrer.mjs`. Pour filmer une autre copie du site que celle du
  dépôt : `SITE=/chemin node enregistrer.mjs`. Ce qui n'appartient pas à TrimSync est
  redessiné dans `film/` : l'écran verrouillé, la messagerie Instagram, la feuille
  d'autorisation de Meta.
- **Rien d'ici n'est servi par le site.** Cloudflare Pages publie tout le dépôt ; `outils/`
  est dans la liste de `_routes.json`, que `functions/_middleware.js` répond en 404.
- **La voix décide du rythme, la musique du découpage.** Chaque geste est calé sur un mot
  (`local('r3', 'acompte')` dans `temps.mjs`) : réécrire une phrase puis relancer `voix.py`
  recale tout. Les scènes durent un nombre entier de temps (140 BPM) ; si une phrase ne tient
  plus dans sa scène, `rendu.mjs` le dit (« ⚠ partition »), et il faut alors allonger la scène
  et ajuster `MONTAGE` (le total doit rester un nombre entier de mesures).
- **L'image est calée sur la voix d'homme** (`PRINCIPALE`). La voix de femme est posée aux
  mêmes instants : ses mots tombent à un ou deux dixièmes de seconde près.
- **Dates.** L'histoire se passe le jeudi 8 octobre 2026 (`lib/demo.mjs`, `J0`) ; les pages
  filmées croient être ce jour-là, quel que soit le jour du rendu.
- **Sons.** Musique et bruitages viennent de Mixkit (usage commercial permis, redistribution
  des fichiers seuls interdite) : ils sont lus dans `../../../outils/videos/sons` (les vidéos
  FCUTZ), ou dans le dossier donné par la variable `SONS`.
- **Voix.** `edge-tts` passe par le service de lecture à voix haute de Microsoft Edge, sans
  contrat. Avant une diffusion payante (publicité), la remplacer par une voix sous licence
  (Azure Speech propose les mêmes) ou par un enregistrement : il suffit de déposer les mp3
  dans `voix/<nom>/` avec leurs `durees.json` et `mots.json`.
