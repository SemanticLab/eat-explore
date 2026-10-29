"""Crawl the Rauschenberg Foundation archive search for the titles of documents that lack images; read each detail page's
R.R.F.A. identifier and full-size image; match by identifier. Writes docs/documents/images.json, data/missing_images.csv,
data/missing_images_candidates.csv (same title, different identifier: needs a human check)."""
import json, re, time, urllib.request, urllib.parse, sys, csv, html
UA={'User-Agent':'Mozilla/5.0 semlab-data-process eat-explore'}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60) as r: return r.read().decode('utf-8','replace')
items=json.load(open('data/items.json'))
found=json.load(open('docs/documents/images.json'))
need={}
for q,d in items.items():
    rr=[v['v'] for v in d['claims'].get('P73',[])]
    if not rr or q in found: continue
    urls=[v['v'] for v in d['claims'].get('P200',[])+d['claims'].get('P3',[])]
    if any('semlab.s3' in u or 'rauschenbergfoundation' in u for u in urls): continue
    need[q]={'rrfa':rr[0],'label':d['label'],'title':(d['claims'].get('P82') or [{'v':re.sub(r'^[AP]\d+\s+','',d['label'])}])[0]['v']}
print(len(need),'to find',file=sys.stderr)
searches={}
for q,n in need.items():
    cat=207 if n['rrfa'].startswith('P') else 208
    key=(cat,re.sub(r'[^\w ]',' ',n['title']).strip()); searches.setdefault(key,[]).append(q)
site={}; detail_cache={}
def detail(slug):
    if slug in detail_cache: return detail_cache[slug]
    try: s=get('https://www.rauschenbergfoundation.org'+slug)
    except Exception as e: detail_cache[slug]=None; return None
    img=re.search(r'/sites/default/files/(?!styles/)(\d{4}-\d{2}/[^"\s]+\.(?:jpe?g|png))',s)
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
    lines=[l.strip() for l in t.split('\n') if l.strip()]
    ids=[l for l in lines if re.fullmatch(r'[AP]\d{1,4}(\.\d+)?',l)]
    title=re.search(r'<title>([^<|]*)',s)
    rec={'id':ids[-1] if ids else None,'img':('https://www.rauschenbergfoundation.org/sites/default/files/'+img.group(1)) if img else None,'title':title.group(1).strip() if title else '','slug':slug}
    detail_cache[slug]=rec; time.sleep(0.5); return rec
for (cat,text),qs in searches.items():
    page=0; slugs=[]
    while page<6:
        u=f'https://www.rauschenbergfoundation.org/art/search-archives/all?category={cat}&search_text={urllib.parse.quote_plus(text)}&start_date=&end_date=&page={page}'
        try: s=get(u)
        except Exception as e: print('search err',u,e,file=sys.stderr); break
        hits=sorted(set(re.findall(r'href="(/art/archive/[^"]+)"',s)))
        if not hits: break
        slugs+=hits; page+=1; time.sleep(0.7)
    for sl in slugs:
        rec=detail(sl)
        if rec and rec['id']: site[rec['id']]=rec
    print(f'{text!r}: {len(slugs)} pages, site ids so far {len(site)}',file=sys.stderr)
exact={}; cand=[]
for q,n in need.items():
    r=site.get(n['rrfa'])
    if r and r['img']: exact[q]=r['img']
    else:
        same=[r for r in site.values() if r['title'].lower()==n['title'].lower() and r['img']]
        for r in same: cand.append([q,n['rrfa'],n['label'],r['id'],r['title'],r['img'],'https://www.rauschenbergfoundation.org'+r['slug']])
found.update(exact)
json.dump(found,open('docs/documents/images.json','w'),indent=0)
with open('data/missing_images.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['qid','rrfa','label','file_url'])
    for q,u in sorted(found.items()): w.writerow([q,(need.get(q) or {}).get('rrfa',''),items[q]['label'],u])
with open('data/missing_images_candidates.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['qid','rrfa','label','site_id','site_title','site_image','site_page']); w.writerows(cand)
json.dump(site,open('data/foundation_site_ids.json','w'),indent=1)
print('exact matches',len(exact),'| title-only candidates',len(cand),'| still nothing',len([q for q in need if q not in exact and not any(c[0]==q for c in cand)]),file=sys.stderr)
