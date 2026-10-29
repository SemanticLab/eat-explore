#!/usr/bin/env python3
"""Run a SPARQL query against semlab and print a compact table. usage: q.py "<query>" [--json out.json]"""
import sys, json, urllib.request, urllib.parse
PREFIX = """PREFIX wd: <http://base.semlab.io/entity/>
PREFIX wdt: <http://base.semlab.io/prop/direct/>
PREFIX p: <http://base.semlab.io/prop/>
PREFIX ps: <http://base.semlab.io/prop/statement/>
PREFIX pq: <http://base.semlab.io/prop/qualifier/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""
def run(q):
    url = 'https://query.semlab.io/sparql?' + urllib.parse.urlencode({'query': PREFIX + q})
    req = urllib.request.Request(url, headers={'Accept': 'application/sparql-results+json',
        'User-Agent': 'semlab-data-process (claude-code; thisismattmiller@gmail.com)'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)
def short(v):
    s = v['value']
    for pre in ('http://base.semlab.io/entity/', 'http://base.semlab.io/prop/direct/'):
        if s.startswith(pre): return s[len(pre):]
    return s
if __name__ == '__main__':
    q = sys.argv[1]
    res = run(q)
    if '--json' in sys.argv:
        out = sys.argv[sys.argv.index('--json')+1]
        json.dump(res, open(out,'w'), indent=1)
        print(f"wrote {len(res['results']['bindings'])} rows to {out}")
    else:
        vars_ = res['head']['vars']
        print('\t'.join(vars_))
        for b in res['results']['bindings']:
            print('\t'.join(short(b[v]) if v in b else '' for v in vars_))
        print(f"-- {len(res['results']['bindings'])} rows", file=sys.stderr)
