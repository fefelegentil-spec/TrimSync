# Planche-contact d'un clip filmé par enregistrer.mjs : pour vérifier d'un coup d'œil
# que la page a bien joué son scénario (touchers, changements d'écran).
#
#   python planche-clip.py resa                 → apercus/planche-resa.jpg (20 vignettes)
#   python planche-clip.py resa 12 2 160 5 9    → 12 colonnes × 2 lignes, vignettes de 160 px, de 5 à 9 s du clip
import glob, json, os, subprocess, sys

FFMPEG = os.environ.get('FFMPEG') or next(iter(glob.glob(os.path.join(os.environ.get('APPDATA', ''), 'Python', 'Python*', 'site-packages', 'imageio_ffmpeg', 'binaries', 'ffmpeg*.exe'))), 'ffmpeg')
nom = sys.argv[1]
col = int(sys.argv[2]) if len(sys.argv) > 2 else 10
lig = int(sys.argv[3]) if len(sys.argv) > 3 else 2
larg = int(sys.argv[4]) if len(sys.argv) > 4 else 190
meta = json.load(open(f'clips/{nom}/meta.json', encoding='utf-8'))
n, fps = meta['images'], meta['fps']
de = float(sys.argv[5]) if len(sys.argv) > 5 else 0
a = float(sys.argv[6]) if len(sys.argv) > 6 else n / fps
i0, i1 = int(de * fps), min(n - 1, int(a * fps))
k = col * lig
idx = [round(i0 + (i1 - i0) * j / (k - 1)) for j in range(k)]
sel = '+'.join(f'eq(n\\,{i})' for i in idx)
os.makedirs('apercus', exist_ok=True)
out = f'apercus/planche-{nom}.jpg'
subprocess.run([FFMPEG, '-y', '-v', 'error', '-framerate', str(fps), '-i', f'clips/{nom}/%05d.jpg', '-vf', f"select='{sel}',scale={larg}:-1,tile={col}x{lig}", '-frames:v', '1', '-q:v', '3', out], check=True)
# les instants sont donnés en secondes de la SCÈNE (comme dans clips.mjs)
print(out, '| instants :', ' '.join(f'{i / fps + meta["depart"]:.2f}' for i in idx))
