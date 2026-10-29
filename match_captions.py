"""Fetch captions for every foundation archive page; match Wikibase documents (P147 citation / P130 description / label) to site records by caption similarity.
Writes data/foundation_site_ids.json (with captions), data/caption_matches.csv, and adds confident matches for image-less items to docs/documents/images.json."""
import json, re, html, urllib.request, time, sys, csv
UA={'User-Agent':'Mozilla/5.0 semlab-data-process eat-explore'}
site=json.load(open('data/foundation_site_ids.json')); items=json.load(open('data/items.json'))
def caption(slug):
    s=urllib.request.urlopen(urllib.request.Request('https://www.rauschenbergfoundation.org'+slug,headers=UA),timeout=60).read().decode('utf-8','replace')
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
    lines=[l.strip() for l in t.split('\n') if l.strip()]
    try: k=lines.index('Archives Collections')
    except ValueError: k=0
    body=[l for l in lines[k:] if len(l)>25 and not re.search(r'cookie|©|Foundation Archives, New York$|^Photo:|On View|Public Collections|Robert Rauschenberg Foundation$',l)]
    return ' '.join(body[:4])[:600]
n=0
for i,r in site.items():
    if 'caption' in r: continue
    try: r['caption']=caption(r['slug'])
    except Exception as e: r['caption']=''
    n+=1
    if n%50==0: print(n,'captions',file=sys.stderr); json.dump(site,open('data/foundation_site_ids.json','w'),indent=1)
    time.sleep(0.35)
json.dump(site,open('data/foundation_site_ids.json','w'),indent=1)
STOP=set('the a an and of for in at with to during on by from photo is as rauschenberg robert foundation archives new york evenings theatre theater engineering technical rehearsal 1966 1965 1967 photograph'.split())
def toks(s): return {w for w in re.findall(r'[a-z0-9]+',s.lower()) if w not in STOP and len(w)>2}
def sim(a,b): A,B=toks(a),toks(b); return len(A&B)/len(A|B) if A and B else 0
wbdocs={}
for q,d in items.items():
    rr=[v['v'] for v in d['claims'].get('P73',[])]
    if not rr: continue
    text=' '.join(v['v'] for k in ('P147','P130','P82') for v in d['claims'].get(k,[]))+' '+d['label']
    urls=[v['v'] for v in d['claims'].get('P200',[])+d['claims'].get('P3',[])]
    wbdocs[q]={'rrfa':rr[0],'label':d['label'],'text':text,'has_image':any('semlab.s3' in u or 'rauschenbergfoundation' in u for u in urls)}
rows=[]; found=json.load(open('docs/documents/images.json')); added=0
for q,w in sorted(wbdocs.items(), key=lambda x:x[1]['rrfa']):
    scored=sorted(((sim(w['text'],r.get('caption','')+' '+r['title']),i) for i,r in site.items()), reverse=True)[:2]
    best,bid=scored[0]; second=scored[1][0] if len(scored)>1 else 0
    r=site[bid]
    rows.append([q,w['rrfa'],w['label'],'yes' if w['has_image'] else 'no',bid,r['title'],f'{best:.2f}',f'{second:.2f}','same' if bid==w['rrfa'] else 'DIFFERENT',r['img'] or '','https://www.rauschenbergfoundation.org'+r['slug'],(r.get('caption') or '')[:160]])
    if not w['has_image'] and best>=0.5 and best-second>=0.15 and r['img'] and q not in found: found[q]=r['img']; added+=1
with open('data/caption_matches.csv','w',newline='') as f:
    wr=csv.writer(f); wr.writerow(['qid','wb_rrfa','wb_label','wb_has_image','site_id','site_title','score','runner_up','id_agree','site_image','site_page','site_caption']); wr.writerows(rows)
json.dump(found,open('docs/documents/images.json','w'),indent=0)
print('rows',len(rows),'| confident new images for image-less items:',added,file=sys.stderr)
agree=sum(1 for r in rows if r[8]=='same' and float(r[6])>=0.4); diff=[(r[1],r[4],r[6]) for r in rows if r[8]=='DIFFERENT' and float(r[6])>=0.5]
print('identifier agrees with best caption match:',agree,'| confident matches with a DIFFERENT identifier:',len(diff),diff[:25],file=sys.stderr)
