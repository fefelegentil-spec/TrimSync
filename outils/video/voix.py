# Génère la voix off (une phrase = un mp3) avec edge-tts, puis les durées exactes.
# python voix.py   → voix/<id>.mp3 + voix/durees.json
import asyncio, json, subprocess, re, sys, os
import edge_tts
VOIX = os.environ.get('VOIX', 'fr-FR-VivienneMultilingualNeural')
FFMPEG = os.environ.get('FFMPEG', r'C:\Users\Fefel\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe')
LIGNES = [
 ('hook1', "Deux heures du matin. Un client t'écrit sur Instagram : « Tu peux me prendre demain ? »"),
 ('hook2', "Tu dors. Tu réponds à midi… il est déjà allé chez un autre."),
 ('nom',   "Voici TrimSync. Ton agenda se remplit tout seul."),
 ('resa',  "D'abord, ta page de réservation. À ton nom, à tes couleurs. Ton client choisit sa prestation, son horaire, et c'est réservé. Avec un acompte contre les lapins."),
 ('dash',  "Chaque rendez-vous tombe dans ton dashboard. L'agenda, tes clients, tes stats, tes rappels. Tout est là, dans ta poche."),
 ('lien',   "Ensuite, le bot. Tu relies ton Instagram pro en quelques secondes, avec la connexion officielle. Rien à installer."),
 ('perso',  "Tu le règles à ta façon : tes prestations, tes prix, tes horaires. Et il apprend ton style, pour écrire comme toi."),
 ('bot1',   "Un client écrit ? Le bot lit ton agenda, propose une heure vraiment libre, et pose le rendez-vous. Même à trois heures du matin."),
 ('bot2',   "Il gère aussi les annulations, les décalages, et te prévient quand il a besoin de toi."),
 ('relai',  "Toi, tu coupes. Lui, il répond, il réserve, il relance. Il te remplace sur tout ce qui n'est pas ton métier."),
 ('fin',    "TrimSync. L'appli dès dix-neuf euros par mois, le bot à quarante-neuf. Sept jours d'essai gratuit. Ton agenda se remplit tout seul."),
]
def duree(f):
    r = subprocess.run([FFMPEG,'-i',f,'-f','null','-'],capture_output=True,text=True)
    m = re.findall(r'time=(\d+):(\d+):([\d.]+)', r.stderr)[-1]
    return int(m[0])*3600+int(m[1])*60+float(m[2])
async def main():
    out = {}; mots = {}
    for k, texte in LIGNES:
        f = f'voix/{k}.mp3'
        com = edge_tts.Communicate(texte, VOIX, rate='+4%', boundary='WordBoundary')
        mots[k] = []
        with open(f, 'wb') as fh:
            async for ev in com.stream():
                if ev['type'] == 'audio': fh.write(ev['data'])
                elif ev['type'] == 'WordBoundary': mots[k].append({'t': round(ev['offset']/1e7, 3), 'd': round(ev['duration']/1e7, 3), 'm': ev['text']})
        out[k] = round(duree(f), 3)
        print(k, out[k])
    json.dump(out, open('voix/durees.json','w'), indent=1)
    json.dump(mots, open('voix/mots.json','w',encoding='utf-8'), ensure_ascii=False)
asyncio.run(main())
