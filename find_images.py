"""For documents with an R.R.F.A. identifier (P73) but no working image, probe the foundation's 2026-10 folder by filename pattern,
then scrape the archive search listings (categories 207 photographs, 208 papers) for anything still missing.
Writes docs/documents/images.json (QID -> URL) and data/missing_images.csv (for updating the Wikibase)."""
import json, re, time, urllib.request, sys, csv, html
UA={'User-Agent':'Mozilla/5.0 semlab-data-process eat-explore'}
items=json.load(open('data/items.json'))
base='https://www.rauschenbergfoundation.org/sites/default/files/2026-10/'
def head(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u,method='HEAD',headers=UA),timeout=30) as r: return r.status==200 and r.headers.get('Content-Type','').startswith('image')
    except Exception: return False
need={}
for q,d in items.items():
    rr=[v['v'] for v in d['claims'].get('P73',[])]
    if not rr: continue
    urls=[v['v'] for v in d['claims'].get('P200',[])+d['claims'].get('P3',[])]
    if any('semlab.s3' in u or 'rauschenbergfoundation' in u for u in urls): continue
    need[q]=rr[0]
print(len(need),'documents with an R.R.F.A. id and no image',file=sys.stderr)
found={}
for q,rr in sorted(need.items()):
    for ext in ('jpg','jpeg','png'):
        u=f'{base}{rr}_00.{ext}'
        if head(u): found[q]=u; break
        time.sleep(0.15)
    time.sleep(0.2)
print(len(found),'found by filename pattern',file=sys.stderr)
# scrape listings for the rest
missing={q:rr for q,rr in need.items() if q not in found}
if missing:
    seen={}
    for cat in (207,208):
        page=0
        while True:
            u=f'https://www.rauschenbergfoundation.org/art/search-archives/all?category={cat}&search_text=&start_date=&end_date=&page={page}'
            try:
                with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60) as r: s=r.read().decode('utf-8','replace')
            except Exception as e: print('listing err',u,e,file=sys.stderr); break
            hits=re.findall(r'/sites/default/files/styles/[^/]+/public/(\d{4}-\d{2})/([A-Za-z]+\d+)_(\d+)\.(jpe?g|png)',s)
            if not hits: break
            for folder,rid,suffix,ext in hits: seen.setdefault(rid,(folder,suffix,ext))
            print('cat',cat,'page',page,len(hits),'thumbs',file=sys.stderr); page+=1; time.sleep(1.0)
    for q,rr in missing.items():
        if rr in seen:
            folder,suffix,ext=seen[rr]; u=f'https://www.rauschenbergfoundation.org/sites/default/files/{folder}/{rr}_{suffix}.{ext}'
            if head(u): found[q]=u
    print(len(found),'after scraping listings',file=sys.stderr)
json.dump(found,open('docs/documents/images.json','w'),indent=0)
with open('data/missing_images.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['qid','rrfa','label','file_url'])
    for q,u in sorted(found.items()): w.writerow([q,need[q],items[q]['label'],u])
still=[(q,need[q]) for q in need if q not in found]
print('still missing',len(still),still[:20],file=sys.stderr)
