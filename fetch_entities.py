"""Fetch full entity JSON (with qualifiers/references) via wbgetentities for all EAT items that carry role-bearing link properties."""
import json, urllib.request, urllib.parse, time, collections, sys
items=json.load(open('data/items.json')); props=json.load(open('data/properties.json'))
want=sorted({q for q,d in items.items() if any(p in d['claims'] for p in ('P75','P196','P127','P185','P65','P110','P278','P74','P128'))})
print(len(want),'items to fetch',file=sys.stderr)
out={}
for i in range(0,len(want),50):
    ids='|'.join(want[i:i+50])
    url='https://base.semlab.io/w/api.php?'+urllib.parse.urlencode({'action':'wbgetentities','ids':ids,'format':'json','props':'claims|labels'})
    req=urllib.request.Request(url,headers={'User-Agent':'semlab-data-process (claude-code; thisismattmiller@gmail.com)'})
    with urllib.request.urlopen(req,timeout=120) as r: out.update(json.load(r).get('entities',{}))
    time.sleep(0.3)
json.dump(out,open('data/entities_full.json','w'))
L=lambda p: props.get(p,{}).get('label',p)
qc=collections.Counter(); roles=collections.Counter(); refs=collections.Counter(); qprops={}
for qid,ent in out.items():
    for p,sts in ent.get('claims',{}).items():
        for st in sts:
            for q,snaks in st.get('qualifiers',{}).items():
                qc[(L(p),L(q))]+=1; qprops[q]=L(q)
                if L(q) in ('object has role','subject has role'):
                    for s in snaks:
                        v=s.get('datavalue',{}).get('value',{}); roles[(L(p), v.get('id') if isinstance(v,dict) else v)]+=1
            for ref in st.get('references',[]):
                for rp in ref.get('snaks',{}): refs[(L(p),L(rp))]+=1
print('\n## qualifier usage (property, qualifier) -> count'); [print(f'{c:5d} {a} / {b}') for (a,b),c in qc.most_common(40)]
print('\n## role values'); 
rl=json.load(open('data/items.json'))
for (p,r),c in roles.most_common(40): print(f'{c:5d} {p} role={r} {items.get(r,{}).get("label","?")}')
print('\n## reference types'); [print(f'{c:5d} {a} / {b}') for (a,b),c in refs.most_common(25)]
print('\n## qualifier props:', qprops)
print('statements with reference block:', sum(c for (a,b),c in refs.items() if b=='reference block'), 'of', sum(len(sts) for e in out.values() for sts in e['claims'].values()))
