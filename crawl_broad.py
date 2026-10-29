"""Broad crawl: several generic searches per category, every detail page once; collect site identifier -> image. Match against documents lacking images."""
import json, re, time, urllib.request, urllib.parse, sys, csv, html
UA={'User-Agent':'Mozilla/5.0 semlab-data-process eat-explore'}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60) as r: return r.read().decode('utf-8','replace')
items=json.load(open('data/items.json'))
site=json.load(open('data/foundation_site_ids.json'))
seen_slugs={r['slug'] for r in site.values()}
TERMS=['9 Evenings','E.A.T.','Experiments in Art and Technology','Kluver','Klüver','Stockholm','Festival','Theatre','Theater','Engineering','Open Score','Oracle','Tono','Breer','postcard','notebook','benefit','loft','airplanes','organizational','press','rehearsal','preparation','Armory']
slugs=set()
for cat in (207,208):
    for t in TERMS:
        page=0
        while page<12:
            u=f'https://www.rauschenbergfoundation.org/art/search-archives/all?category={cat}&search_text={urllib.parse.quote_plus(t)}&start_date=&end_date=&page={page}'
            try: s=get(u)
            except Exception as e: print('err',u,e,file=sys.stderr); break
            hits=set(re.findall(r'href="(/art/archive/[^"]+)"',s))
            if not hits: break
            slugs|=hits; page+=1; time.sleep(0.6)
    print('cat',cat,'slugs',len(slugs),file=sys.stderr)
todo=[s for s in slugs if s not in seen_slugs]
print(len(todo),'detail pages to fetch',file=sys.stderr)
for i,sl in enumerate(todo):
    try: s=get('https://www.rauschenbergfoundation.org'+sl)
    except Exception as e: continue
    img=re.search(r'/sites/default/files/(?!styles/)(\d{4}-\d{2}/[^"\s]+\.(?:jpe?g|png))',s)
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
    lines=[l.strip() for l in t.split('\n') if l.strip()]
    ids=[l for l in lines if re.fullmatch(r'[AP]\d{1,4}(\.\d+)?',l)]
    title=re.search(r'<title>([^<|]*)',s)
    if ids: site[ids[-1]]={'id':ids[-1],'img':('https://www.rauschenbergfoundation.org/sites/default/files/'+img.group(1)) if img else None,'title':title.group(1).strip() if title else '','slug':sl}
    if i%25==0: print(i,'fetched, ids',len(site),file=sys.stderr); json.dump(site,open('data/foundation_site_ids.json','w'),indent=1)
    time.sleep(0.5)
json.dump(site,open('data/foundation_site_ids.json','w'),indent=1)
# match
found=json.load(open('docs/documents/images.json')); exact={}
need={}
for q,d in items.items():
    rr=[v['v'] for v in d['claims'].get('P73',[])]
    urls=[v['v'] for v in d['claims'].get('P200',[])+d['claims'].get('P3',[])]
    if rr and q not in found and not any('semlab.s3' in u or 'rauschenbergfoundation' in u for u in urls): need[q]=rr[0]
for q,rr in need.items():
    r=site.get(rr)
    if r and r['img']: exact[q]=r['img']
found.update(exact); json.dump(found,open('docs/documents/images.json','w'),indent=0)
with open('data/missing_images.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['qid','rrfa','label','file_url'])
    for q,u in sorted(found.items()): w.writerow([q,need.get(q,''),items[q]['label'],u])
print('site ids total',len(site),'| exact matches now',len(exact),'| still missing',sorted(set(need.values())-set(site)),file=sys.stderr)
# also: Wikibase items whose stored identifier exists on site but site title differs (for the title/number mismatch question)
wb={v['v']:(q,d['label']) for q,d in items.items() for v in d['claims'].get('P73',[])}
diff=[(i,wb[i][1],site[i]['title']) for i in site if i in wb and wb[i][1].lower().replace(i.lower()+' ','')!=site[i]['title'].lower()]
print(len(diff),'identifiers on both sides with different titles; e.g.',diff[:6],file=sys.stderr)
