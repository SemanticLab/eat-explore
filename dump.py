#!/usr/bin/env python3
"""Dump all direct claims (+labels/descriptions) for every item in the four E.A.T. projects, plus one hop out.
Writes JSON to the directory given as argv[1]."""
import sys, json, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from q import run, short
outdir = sys.argv[1]; os.makedirs(outdir, exist_ok=True)
PROJECTS = {'Q19104':'kg','Q28603':'enc','Q20517':'bib','Q27735':'ds'}
items = {}
for proj, tag in PROJECTS.items():
    # fetch claims in pages by item to avoid timeouts
    q = f"""SELECT ?item ?itemLabel ?desc WHERE {{ ?item wdt:P11 wd:{proj}. OPTIONAL {{ ?item rdfs:label ?itemLabel FILTER(LANG(?itemLabel)="en") }} OPTIONAL {{ ?item schema:description ?desc FILTER(LANG(?desc)="en") }} }}"""
    res = run(q)
    for b in res['results']['bindings']:
        qid = short(b['item'])
        d = items.setdefault(qid, {'qid': qid, 'label': None, 'description': None, 'projects': [], 'claims': {}})
        d['label'] = b.get('itemLabel', {}).get('value', d['label'])
        d['description'] = b.get('desc', {}).get('value', d['description'])
        if tag not in d['projects']: d['projects'].append(tag)
    print(tag, len(res['results']['bindings']), 'items', file=sys.stderr)
# claims: query per project in chunks of properties isn't needed; do one query per project
for proj, tag in PROJECTS.items():
    q = f"""SELECT ?item ?pd ?o ?oLabel WHERE {{ ?item wdt:P11 wd:{proj}. ?item ?pd ?o. FILTER(STRSTARTS(STR(?pd),"http://base.semlab.io/prop/direct/")) OPTIONAL {{ ?o rdfs:label ?oLabel FILTER(LANG(?oLabel)="en") }} }}"""
    t=time.time(); res = run(q)
    n=0
    for b in res['results']['bindings']:
        qid = short(b['item']); p = short(b['pd'])
        o = b['o']; val = short(o) if o['type']=='uri' else o['value']
        entry = {'v': val, 't': o['type']}
        if 'oLabel' in b: entry['label'] = b['oLabel']['value']
        if o['type']=='literal' and 'datatype' in o: entry['dt'] = o['datatype'].split('#')[-1]
        lst = items[qid]['claims'].setdefault(p, [])
        if entry not in lst: lst.append(entry); n+=1
    print(tag, n, 'claims', f'{time.time()-t:.0f}s', file=sys.stderr)
json.dump(items, open(os.path.join(outdir,'items.json'),'w'), indent=0, ensure_ascii=False)
# property labels
res = run("""SELECT ?p ?pLabel ?desc ?dt WHERE { ?p a wikibase:Property; wikibase:propertyType ?dt. OPTIONAL { ?p rdfs:label ?pLabel FILTER(LANG(?pLabel)="en") } OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc)="en") } }""")
props = {short(b['p']): {'label': b.get('pLabel',{}).get('value'), 'description': b.get('desc',{}).get('value'), 'type': b['dt']['value'].split('#')[-1]} for b in res['results']['bindings']}
json.dump(props, open(os.path.join(outdir,'properties.json'),'w'), indent=1, ensure_ascii=False)
# one-hop-out items (linked from project items but not in any of the 4 projects): labels + class
res = run("""SELECT DISTINCT ?o ?oLabel ?cls ?clsLabel ?proj WHERE { ?item wdt:P11 ?p. VALUES ?p { wd:Q19104 wd:Q28603 wd:Q20517 wd:Q27735 } ?item ?pd ?o. FILTER(STRSTARTS(STR(?pd),"http://base.semlab.io/prop/direct/")) FILTER(STRSTARTS(STR(?o),"http://base.semlab.io/entity/Q")) FILTER NOT EXISTS { ?o wdt:P11 ?x. VALUES ?x { wd:Q19104 wd:Q28603 wd:Q20517 wd:Q27735 } } OPTIONAL { ?o wdt:P1 ?cls } OPTIONAL { ?o wdt:P11 ?proj } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }""")
ext = {}
for b in res['results']['bindings']:
    qid = short(b['o']); d = ext.setdefault(qid, {'qid': qid, 'label': b.get('oLabel',{}).get('value'), 'classes': [], 'projects': []})
    if 'cls' in b:
        c = (short(b['cls']), b.get('clsLabel',{}).get('value'))
        if c not in d['classes']: d['classes'].append(c)
    if 'proj' in b and short(b['proj']) not in d['projects']: d['projects'].append(short(b['proj']))
json.dump(ext, open(os.path.join(outdir,'external_items.json'),'w'), indent=1, ensure_ascii=False)
print('external', len(ext), file=sys.stderr)
print('done', len(items), 'items', file=sys.stderr)
