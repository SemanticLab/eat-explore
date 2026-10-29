import json, collections, sys
items = json.load(open('data/items.json')); props = json.load(open('data/properties.json')); ext = json.load(open('data/external_items.json'))
PL = lambda p: props.get(p,{}).get('label',p)
def cls(q): return [c['label'] for c in items.get(q,{}).get('claims',{}).get('P1',[])] if q in items else [c[1] for c in ext.get(q,{}).get('classes',[])]
def projs(q): return items[q]['projects'] if q in items else ext.get(q,{}).get('projects',[])
# bridges: property, subject project set -> object project set, only item->item
bridge = collections.Counter()
deg = collections.Counter(); indeg = collections.Counter()
for q,d in items.items():
    for p,vals in d['claims'].items():
        if p in ('P11','P1'): continue
        for v in vals:
            if v['t']=='uri' and v['v'].startswith('Q'):
                o=v['v']; deg[q]+=1; indeg[o]+=1
                bridge[(p, '+'.join(sorted(d['projects'])), '+'.join(sorted(projs(o))) or 'none')]+=1
print("## cross-project bridges (subject projects != object projects), top 40")
for (p,a,b),c in sorted(bridge.items(), key=lambda x:-x[1]):
    if a!=b and c>=5: print(f"{c:5d}  {p} {PL(p):28s} {a:12s} -> {b}")
print("\n## top hubs by total degree")
tot = collections.Counter(); 
for q in set(deg)|set(indeg): tot[q]=deg[q]+indeg[q]
for q,c in tot.most_common(30):
    lab = items[q]['label'] if q in items else ext.get(q,{}).get('label'); print(f"{c:5d} in={indeg[q]:4d} out={deg[q]:4d} {q} {lab} [{','.join(cls(q)[:2])}] {projs(q)}")
print("\n## persons: counts of key facets")
persons=[q for q,d in items.items() if any(c['v']=='Q1' for c in d['claims'].get('P1',[]))]
fac = collections.Counter()
for q in persons:
    c=items[q]['claims']
    for p in ('P3','P8','P44','P110','P202','P152','P278','P196','P65','P245','P43','P274','P116'):
        if p in c: fac[p]+=1
print(len(persons),'persons;', {PL(p):n for p,n in fac.items()})
print("\n## ENC-only persons: how many are ALSO mentioned in KG blocks (P21) or contributed to KG works?")
mentioned = collections.Counter()
for q,d in items.items():
    for v in d['claims'].get('P21',[]): mentioned[v['v']]+=1
enc_only=[q for q in persons if items[q]['projects']==['enc']]
print(len(enc_only),'ENC-only persons;', sum(1 for q in enc_only if mentioned[q]>0),'mentioned in any block;', sum(1 for q in enc_only if 'P196' in items[q]['claims']),'with contributed-to')
print("\n## P278 proposed collaborator: directionality & reciprocity")
pc=set()
for q,d in items.items():
    for v in d['claims'].get('P278',[]): pc.add((q,v['v']))
recip=sum(1 for a,b in pc if (b,a) in pc)
print(len(pc),'edges;',recip,'reciprocal;', len({a for a,b in pc}),'sources;', len({b for a,b in pc}),'targets')
# who are the targets with most proposals
tc=collections.Counter(b for a,b in pc)
print('most-proposed:', [(items[q]['label'] if q in items else q, n, projs(q)) for q,n in tc.most_common(12)])
sc=collections.Counter(a for a,b in pc)
print('most-proposing:', [(items[q]['label'], n, projs(q)) for q,n in sc.most_common(8)])
print("\n## occupation of P278 sources vs targets")
def occ(q): return tuple(sorted(v.get('label','?') for v in items.get(q,{}).get('claims',{}).get('P44',[])))
print('sources occ:', collections.Counter(occ(a) for a,b in pc).most_common(6))
print('targets occ:', collections.Counter(occ(b) for a,b in pc).most_common(6))
print("\n## 9 Evenings subgraph: performances & their works/devices")
perf=[q for q,d in items.items() if any(c['v'] in ('Q19074',) for c in d['claims'].get('P1',[]))]
for q in perf[:40]:
    c=items[q]['claims']
    print(f"- {items[q]['label']} | part of: {[v.get('label') for v in c.get('P96',[])]} | date {[v['v'][:10] for v in c.get('P98',[])]} | contributors {len(c.get('P75',[]))} | uses {len(c.get('P185',[]))} | work performed {[v.get('label') for v in c.get('P127',[])]}")
print("\n## uses (P185) object hierarchy: materials/devices and their subclass-of")
uses=collections.Counter(v['v'] for d in items.values() for v in d['claims'].get('P185',[]))
for q,n in uses.most_common(20): print(n, items[q]['label'] if q in items else q, cls(q), 'subclass of', [v.get('label') for v in items.get(q,{}).get('claims',{}).get('P55',[])])
print("\n## documents w/ blocks: how many docs, blocks, and distinct entities mentioned")
docs=collections.defaultdict(set)
for q,d in items.items():
    if any(c['v']=='Q2013' for c in d['claims'].get('P1',[])):
        for pd in d['claims'].get('P24',[]): docs[pd['v']].add(q)
print(len(docs),'documents with blocks; mentions:', sum(mentioned.values()), 'distinct mentioned entities:', len(mentioned))
print("ENC persons mentioned on >1 card:", sum(1 for q,n in mentioned.items() if n>1 and q in items and items[q]['projects']==['enc']))
print("\n## thumbnails: persons with image per project")
for tag in ('kg','enc','bib','ds'):
    ps=[q for q in persons if tag in items[q]['projects']]; print(tag, len(ps), 'persons', sum(1 for q in ps if 'P3' in items[q]['claims']), 'with thumbnail')
print("\n## employers (P110) top & their projects")
emp=collections.Counter(v['v'] for d in items.values() for v in d['claims'].get('P110',[]))
for q,n in emp.most_common(15): print(n, items[q]['label'] if q in items else ext.get(q,{}).get('label'), projs(q))
print("\n## external (non-EAT) linked items by project of origin")
print(collections.Counter('+'.join(e['projects']) or 'no project' for e in ext.values()).most_common())
print([ (e['label'], e['projects']) for e in list(ext.values())[:0]])
print("\n## wikidata QIDs: duplicates within EAT")
qd=collections.defaultdict(list)
for q,d in items.items():
    for v in d['claims'].get('P8',[]): qd[v['v']].append(q)
dups={k:v for k,v in qd.items() if len(v)>1}
print(len(dups),'wikidata QIDs on >1 EAT item:', [(k,[ (x,items[x]['label'],items[x]['projects']) for x in v]) for k,v in list(dups.items())[:8]])
print("\n## persons with no outgoing item links at all (isolated)")
print(sum(1 for q in persons if deg[q]==0 and indeg[q]==0), 'isolated;', sum(1 for q in persons if deg[q]==0), 'no out-links')
print("\n## field of work / occupation / role classes (ENC taxonomy)")
fow=collections.Counter(v.get('label') for d in items.values() for v in d['claims'].get('P202',[]))
print(len(fow),'fields of work; top', fow.most_common(15))
