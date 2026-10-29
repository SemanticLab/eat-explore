"""Check every rauschenbergfoundation.org file URL in the data against the re-uploaded 2026-10 folder; write docs/documents/foundation.json (old -> new or null)."""
import json, re, urllib.request, time, sys
items=json.load(open('data/items.json'))
urls=sorted({v['v'] for d in items.values() for v in d['claims'].get('P200',[])+d['claims'].get('P3',[]) if 'rauschenbergfoundation' in v['v']})
out={}
for u in urls:
    new=re.sub(r'/sites/default/files/\d{4}-\d{2}/', '/sites/default/files/2026-10/', u)
    try:
        req=urllib.request.Request(new, method='HEAD', headers={'User-Agent':'Mozilla/5.0 semlab-data-process eat-explore'})
        with urllib.request.urlopen(req, timeout=30) as r: out[u]= new if r.status==200 and r.headers.get('Content-Type','').startswith('image') else None
    except Exception as e: out[u]=None; print('miss', new, e, file=sys.stderr)
    time.sleep(0.4)
json.dump(out, open('docs/documents/foundation.json','w'), indent=0)
print('found', sum(1 for v in out.values() if v), 'of', len(out), file=sys.stderr)
