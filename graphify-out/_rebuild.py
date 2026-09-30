"""Reconstruction propre du graphe : détection (avec .graphifyignore),
extraction AST neuve (cache vidé), réintégration du fragment sémantique,
build, cluster, labels conservés, rapport, HTML.

Usage : python -X utf8 _rebuild.py <nom>   (nom = titre du rapport)
Lancé depuis le dossier du repo (mylife/ ou trimsync/).
"""
import json
import shutil
import sys
from pathlib import Path

from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.detect import detect, save_manifest
from graphify.extract import collect_files, extract
from graphify.export import to_json
from graphify.report import generate

NOM = sys.argv[1] if len(sys.argv) > 1 else 'Projet'
OUT = Path('graphify-out')

# Détection, sans digérer les sorties du graphe lui-même.
result = detect(Path('.'))
for cat in list(result.get('files', {})):
    result['files'][cat] = [f for f in result['files'][cat] if 'graphify-out' not in f]
result['total_files'] = sum(len(v) for v in result['files'].values())
OUT.mkdir(exist_ok=True)
(OUT / '.graphify_detect.json').write_text(json.dumps(result), encoding='utf-8')
print('Corpus :', result['total_files'], 'fichiers')

# Extraction AST neuve — le cache est vidé pour oublier le vendor.
code_files = []
for f in result.get('files', {}).get('code', []):
    code_files.extend(collect_files(Path(f)) if Path(f).is_dir() else [Path(f)])
cache = Path('cache')
if cache.exists():
    shutil.rmtree(cache)
ast = extract(code_files, cache_root=Path('.'), parallel=False)
(OUT / '.graphify_ast.json').write_text(json.dumps(ast, indent=2), encoding='utf-8')
print(f"AST : {len(ast['nodes'])} nœuds, {len(ast['edges'])} arêtes")

# Le fragment sémantique maison, s'il existe, est réintégré.
sem = {'nodes': [], 'edges': [], 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}
for chunk in sorted(OUT.glob('.graphify_chunk_*.json')):
    d = json.loads(chunk.read_text(encoding='utf-8'))
    for k in ('nodes', 'edges', 'hyperedges'):
        sem[k] += d.get(k, [])
    sem['input_tokens'] += d.get('input_tokens', 0)
    sem['output_tokens'] += d.get('output_tokens', 0)

seen = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])
merged = {'nodes': merged_nodes, 'edges': ast['edges'] + sem['edges'],
          'hyperedges': sem['hyperedges'], 'input_tokens': sem['input_tokens'],
          'output_tokens': sem['output_tokens']}
(OUT / '.graphify_extract.json').write_text(json.dumps(merged, indent=2), encoding='utf-8')

# Build, cluster, labels conservés.
G = build_from_json(merged)
communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': merged['input_tokens'], 'output': merged['output_tokens']}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

labels = {}
labels_file = OUT / '.graphify_labels.json'
if labels_file.exists():
    raw = json.loads(labels_file.read_text(encoding='utf-8'))
    labels = {int(k): v for k, v in raw.items()}
for cid in communities:
    labels.setdefault(cid, f'Community {cid}')

questions = suggest_questions(G, communities, labels)
report = generate(G, communities, cohesion, labels, gods, surprises,
                  result, tokens, '.', suggested_questions=questions)
(OUT / 'GRAPH_REPORT.md').write_text(
    report.replace('# Graph Report - .', f'# Graph Report - {NOM}'), encoding='utf-8')
(OUT / '.graphify_labels.json').write_text(
    json.dumps({str(k): v for k, v in labels.items()}, indent=2), encoding='utf-8')
(OUT / '.graphify_analysis.json').write_text(
    json.dumps({'communities': {str(k): v for k, v in communities.items()},
                'cohesion': {str(k): v for k, v in cohesion.items()},
                'gods': gods, 'surprises': surprises, 'questions': questions},
               indent=2), encoding='utf-8')
to_json(G, communities, str(OUT / 'graph.json'), force=True)
save_manifest(result['files'])

print(f"Graphe : {G.number_of_nodes()} nœuds, {G.number_of_edges()} arêtes, {len(communities)} communautés")
