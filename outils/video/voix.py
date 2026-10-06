# Voix off de la présentation TrimSync : une phrase = un mp3, plus le début de chaque mot.
#
#   python voix.py            → voix/<voix>/<id>.mp3, voix/<voix>/durees.json, voix/<voix>/mots.json
#   python voix.py remy       → une seule des deux voix
#
# Deux voix sont générées (edge-tts, voix neuronales françaises) : l'image est calée sur
# la première (PRINCIPALE dans temps.mjs), la seconde est recalée phrase par phrase au mixage.
# Le texte est ici et nulle part ailleurs : film.html cale ses gestes sur les mots relevés
# (mots.json), donc changer une phrase ne décale rien, il suffit de relancer ce script.
import asyncio, json, os, re, subprocess, sys
import edge_tts

VOIX = {
    'vivienne': ('fr-FR-VivienneMultilingualNeural', '+0%'),   # plus lente : ses phrases durent alors autant que celles de Rémy
    'remy': ('fr-FR-RemyMultilingualNeural', '+7%'),
}
FFMPEG = os.environ.get('FFMPEG') or os.path.join(os.environ.get('APPDATA', ''), r'Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe')

LIGNES = [
    # le problème
    ('h1', "Pendant que tu travailles, ton téléphone, lui, n'arrête pas."),
    ('h2', "Tu réponds le soir. Trop tard : le rendez-vous est parti ailleurs."),
    ('h3', "Ton téléphone ne devrait pas être un deuxième job."),
    # le nom
    ('nom', "TrimSync. Ton agenda se remplit tout seul."),
    # la réservation
    ('r1', "D'abord, ta page de réservation. À ton nom, à tes couleurs."),
    ('r2', "Un lien dans ta bio, et tes clients réservent seuls."),
    ('r3', "Avec un acompte, si tu veux, contre les lapins."),
    # le dashboard
    ('d1', "Chaque rendez-vous arrive dans ton agenda."),
    ('d2', "Tes clients, ton chiffre, tes horaires : tout ton salon tient dans une appli."),
    # le bot
    ('b1', "Et pour tes messages Instagram, il y a le bot. Une IA qui répond et réserve à ta place."),
    ('c1', "Tu connectes ton compte Instagram pro, par la connexion officielle de Meta. Aucun mot de passe à donner."),
    ('p1', "Tu lui donnes tes prestations, tes prix, tes horaires."),
    ('p2', "Tu choisis son ton. Et avec l'offre Max, il apprend à écrire comme toi."),
    ('a1', "Un message arrive. Le bot regarde ton agenda, propose un créneau vraiment libre, et pose le rendez-vous."),
    ('a2', "Même à trois heures du matin."),
    ('k1', "Une annulation ? Il libère le créneau."),
    ('k2', "Une question qu'il ne connaît pas ? Il te passe la main."),
    ('m1', "Toi, tu fais ton métier. Lui, il répond, il réserve, il confirme."),
    ('m2', "Ton téléphone redevient un téléphone."),
    # les offres
    ('o1', "L'appli complète : dix-neuf euros par mois. Avec le bot : quarante-neuf."),
    ('o2', "Sept jours d'essai, sans carte bancaire."),
    ('fin', "TrimSync. Ton agenda se remplit tout seul."),
]

def bornes(f):
    """Début et fin de la parole dans le fichier (le mp3 commence et finit par du silence)."""
    r = subprocess.run([FFMPEG, '-i', f, '-af', 'silencedetect=noise=-38dB:d=0.08', '-f', 'null', '-'], capture_output=True, text=True)
    duree = [int(m[0]) * 3600 + int(m[1]) * 60 + float(m[2]) for m in re.findall(r'time=(\d+):(\d+):([\d.]+)', r.stderr)][-1]
    fins = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r.stderr)]
    debuts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r.stderr)]
    debut = fins[0] if fins and debuts and debuts[0] < 0.05 else 0.0
    fin = debuts[-1] if debuts and (len(fins) < len(debuts) or fins[-1] >= duree - 0.02) else duree
    return round(debut, 3), round(min(fin, duree), 3), round(duree, 3)

async def une_voix(nom):
    voix, debit = VOIX[nom]
    os.makedirs(f'voix/{nom}', exist_ok=True)
    durees, mots = {}, {}
    for k, texte in LIGNES:
        f = f'voix/{nom}/{k}.mp3'
        com = edge_tts.Communicate(texte, voix, rate=debit, boundary='WordBoundary')
        mots[k] = []
        with open(f, 'wb') as fh:
            async for ev in com.stream():
                if ev['type'] == 'audio':
                    fh.write(ev['data'])
                elif ev['type'] == 'WordBoundary':
                    mots[k].append({'t': round(ev['offset'] / 1e7, 3), 'd': round(ev['duration'] / 1e7, 3), 'm': ev['text']})
        debut, fin, total = bornes(f)
        durees[k] = {'debut': debut, 'fin': fin, 'total': total, 'texte': texte}
        print(nom, k, debut, fin, total)
    json.dump(durees, open(f'voix/{nom}/durees.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(mots, open(f'voix/{nom}/mots.json', 'w', encoding='utf-8'), ensure_ascii=False)

async def main():
    for nom in (sys.argv[1:] or list(VOIX)):
        await une_voix(nom)

asyncio.run(main())
