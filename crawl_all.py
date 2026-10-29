"""Paginate a one-letter search per category to enumerate the archive as fully as the site allows; fetch unseen detail pages; match identifiers."""
import json, re, time, urllib.request, urllib.parse, sys, csv, html
UA={'User-Agent':'Mozilla/5.0 semlab-data-process eat-explore'}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60) as r: return r.read().decode('utf-8','replace')
items=json.load(open('data/items.json')); site=json.load(open('data/foundation_site_ids.json'))
seen={r['slug'] for r in site.values()}; slugs=set()
for cat in (207,208):
    for t in ('e','a','o','i'):
        page=0; empty=0
        while page<80:
            u=f'https://www.rauschenbergfoundation.org/art/search-archives/all?category={cat}&search_text={t}&start_date=&end_date=&page={page}'
            try: s=get(u)
            except Exception as e: print('err',page,e,file=sys.stderr); break
            hits=set(re.findall(r'href="(/art/archive/[^"]+)"',s))
            if not hits: break
            new=hits-slugs; slugs|=hits; page+=1; time.sleep(0.5)
        print('cat',cat,'term',t,'pages',page,'slugs',len(slugs),file=sys.stderr)
todo=sorted(s for s in slugs if s not in seen); print(len(todo),'new detail pages',file=sys.stderr)
for i,sl in enumerate(todo):
    try: s=get('https://www.rauschenbergfoundation.org'+sl)
    except Exception: continue
    img=re.search(r'/sites/default/files/(?!styles/)(\d{4}-\d{2}/[^"\s]+\.(?:jpe?g|png))',s)
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
    lines=[l.strip() for l in t.split('\n') if l.strip()]
    ids=[l for l in lines if re.fullmatch(r'[AP]\d{1,4}(\.\d+)?',l)]; title=re.search(r'<title>([^<|]*)',s)
    if ids: site[ids[-1]]={'id':ids[-1],'img':('https://www.rauschenbergfoundation.org/sites/default/files/'+img.group(1)) if img else None,'title':title.group(1).strip() if title else '','slug':sl}
    if i%40==0: json.dump(site,open('data/foundation_site_ids.json','w'),indent=1); print(i,'fetched; ids',len(site),file=sys.stderr)
    time.sleep(0.4)
json.dump(site,open('data/foundation_site_ids.json','w'),indent=1)
found=json.load(open('docs/documents/images.json')); need={}
for q,d in items.items():
    rr=[v['v'] for v in d['claims'].get('P73',[])]; urls=[v['v'] for v in d['claims'].get('P200',[])+d['claims'].get('P3',[])]
    if rr and q not in found and not any('semlab.s3' in u or 'rauschenbergfoundation' in u for u in urls): need[q]=rr[0]
exact={q:site[rr]['img'] for q,rr in need.items() if rr in site and site[rr]['img']}
found.update(exact); json.dump(found,open('docs/documents/images.json','w'),indent=0)
with open('data/missing_images.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['qid','rrfa','label','file_url'])
    for q,u in sorted(found.items()): w.writerow([q,[v['v'] for v in items[q]['claims'].get('P73',[{'v':''}])][0],items[q]['label'],u])
print('site ids',len(site),'| new exact matches',len(exact),'| still missing',sorted(set(need.values())-set(site)),file=sys.stderr)
