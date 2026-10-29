import json, collections, re
items = json.load(open('data/items.json')); props = json.load(open('data/properties.json')); ext=json.load(open('data/external_items.json'))
L=lambda q: items[q]['label'] if q in items else ext.get(q,{}).get('label',q)
cards=[q for q,d in items.items() if any(c['v']=='Q28613' for c in d['claims'].get('P1',[]))]
subjects={v['v'] for q in cards for v in items[q]['claims'].get('P77',[])}
pc=set()
for q,d in items.items():
    for v in d['claims'].get('P278',[]): pc.add((q,v['v']))
targets_of_subjects=collections.Counter(b for a,b in pc if a in subjects and b not in subjects)
print("## ENC: card subjects (engineers) =",len(subjects),"; distinct proposed collaborators (artists) =",len(targets_of_subjects))
print("artists by project:", collections.Counter('+'.join(items[q]['projects']) if q in items else 'ext' for q in targets_of_subjects).most_common())
print("subjects by project:", collections.Counter('+'.join(items[q]['projects']) for q in subjects).most_common())
print("artists with occupation:", sum(1 for q in targets_of_subjects if 'P44' in items.get(q,{}).get('claims',{})))
print("top artists by #engineers:", [(L(q),n,items[q]['projects']) for q,n in targets_of_subjects.most_common(15)])
print("engineers per artist distribution:", sorted(collections.Counter(targets_of_subjects.values()).items()))
print("artists per engineer distribution:", sorted(collections.Counter(collections.Counter(a for a,b in pc if a in subjects).values()).items()))
# engineers: address / employer / field coverage
cov=collections.Counter()
for q in subjects:
    c=items[q]['claims']
    for p in ('P152','P110','P202','P21','P8','P3','P125'):
        if p in c: cov[props[p]['label']]+=1
print("engineer facet coverage:", dict(cov))
# address city parse
cities=collections.Counter()
for q in subjects:
    for v in items[q]['claims'].get('P152',[]):
        a=v['v']
        m=re.search(r'(N\.?Y\.?C?|New York|Brooklyn|Bronx|Queens|Phila|Philadelphia|N\.?J\.?|New Jersey|Conn|Mass|Calif|Pa\b|Long Island|L\.I\.)',a,re.I)
        cities[m.group(1).upper().replace('.','') if m else 'other']+=1
print("engineer address regions:", cities.most_common())
# cards' blocks: front text (engineer info) vs back (artists)? check block count per card & local IDs
bl=collections.Counter(); 
for q,d in items.items():
    if any(c['v']=='Q2013' for c in d['claims'].get('P1',[])) and 'enc' in d['projects']:
        for pd in d['claims'].get('P24',[]): bl[pd['v']]+=1
print("blocks per card:", collections.Counter(bl.values()))
ex=[q for q in cards if bl[q]==2][0]
for q,d in items.items():
    if any(c['v']=='Q2013' for c in d['claims'].get('P1',[])) and any(pd['v']==ex for pd in d['claims'].get('P24',[])):
        print(' block',d['claims'].get('P17'),':', [v['v'][:200] for v in d['claims'].get('P19',[])])
print("\n## KG documents (R.R.F.A.) structure")
docs=[q for q,d in items.items() if 'P73' in d['claims']]
print(len(docs),'docs with RRFA id; classes:', collections.Counter(c.get('label') for q in docs for c in items[q]['claims'].get('P1',[])).most_common())
print("doc facets:", {props[p]['label']: sum(1 for q in docs if p in items[q]['claims']) for p in ('P98','P74','P75','P77','P78','P79','P138','P200','P3','P248','P191','P125','P135','P147')})
print("docs main subjects:", collections.Counter(v.get('label') for q in docs for v in items[q]['claims'].get('P77',[])).most_common(12))
print("\n## KG dated items by class (timeline material)")
dated=collections.Counter()
for q,d in items.items():
    if 'P98' in d['claims'] and 'kg' in d['projects']:
        for c in d['claims'].get('P1',[]): dated[c.get('label')]+=1
print(dated.most_common(20))
print("\n## Bibliography: refs facets")
refs=[q for q,d in items.items() if any(c['v']=='Q27513' for c in d['claims'].get('P1',[]))]
print(len(refs),'refs;', {props[p]['label']: sum(1 for q in refs if p in items[q]['claims']) for p in ('P91','P103','P104','P98','P82','P77','P247','P249','P84','P87')})
auth=collections.Counter(v['v'] for q in refs for v in items[q]['claims'].get('P91',[]))
print('authors:',len(auth),'top', [(L(q),n,items.get(q,{}).get('projects')) for q,n in auth.most_common(10)])
pubs=collections.Counter(v.get('label') for q in refs for v in items[q]['claims'].get('P103',[]))
print('venues:',len(pubs))
places=collections.Counter(v.get('label') or v['v'] for q in refs for v in items[q]['claims'].get('P104',[]))
print('places of publication:', places.most_common(10))
print("\n## Datascape: 738 items with P245 — classes & what else they have")
ds=[q for q,d in items.items() if 'ds' in d['projects']]
print(collections.Counter(c.get('label') for q in ds for c in items[q]['claims'].get('P1',[])).most_common())
print({props[p]['label']: sum(1 for q in ds if p in items[q]['claims']) for p in ('P44','P278','P196','P110','P3','P8','P21','P75')})
print("ds persons mentioned in blocks:", sum(1 for q in ds if any(v['v']==q for d in items.values() for v in d['claims'].get('P21',[]))))
print("ds persons with incoming P75 contributor:", sum(1 for q in ds if any(v['v']==q for d in items.values() for v in d['claims'].get('P75',[]))))
print("\n## Works: concept vs performance instance; contributors; roles?")
concepts=[q for q,d in items.items() if any(c['v'] in ('Q28938','Q19073','Q24556','Q22436','Q28940','Q19098') for c in d['claims'].get('P1',[]))]
print(len(concepts),'work concepts; with P127 inverse (performances):', sum(1 for q in concepts if any(v['v']==q for d in items.values() for v in d['claims'].get('P127',[]))))
print('concept facets:', {props[p]['label']: sum(1 for q in concepts if p in items[q]['claims']) for p in ('P74','P75','P185','P98','P3','P8','P276','P135','P205')})
print("\n## persons lacking any link to a document/work (ENC excluded) — pure DS name-only?")
kgp=[q for q,d in items.items() if 'kg' in d['projects'] and any(c['v']=='Q1' for c in d['claims'].get('P1',[]))]
inlinks=collections.Counter()
for q,d in items.items():
    for p,vals in d['claims'].items():
        if p in('P11','P1'):continue
        for v in vals:
            if v['t']=='uri': inlinks[v['v']]+=1
nolink=[q for q in kgp if inlinks[q]==0 and not any(p not in ('P1','P11','P2','P245','P8','P3','P44') for p in items[q]['claims'])]
print(len(kgp),'KG persons;', len(nolink),'with no in-links and only identity props')
