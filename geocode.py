"""Geocode street addresses (P152) found on E.A.T. items via Nominatim, 1 req/s, into docs/map/geocoded.json (address string -> lat/lon)."""
import json, re, time, urllib.request, urllib.parse, os, sys
items = json.load(open('data/items.json'))
out_path = 'docs/map/geocoded.json'
out = json.load(open(out_path)) if os.path.exists(out_path) else {}
addrs = sorted({v['v'].strip() for d in items.values() for v in d['claims'].get('P152', [])})
print(len(addrs), 'addresses', file=sys.stderr)
def clean(a):
    a = re.sub(r'\b[A-Z]{2}\s?\d\s?-?\s?\d{4}\b', ' ', a)           # phone exchanges like "Vi3 9700"
    a = re.sub(r'\(?\b\d{3}\)?[\s-]\d{3}[\s-]\d{4}\b', ' ', a)       # phone numbers
    a = re.sub(r'\b(ext|x)\.?\s?\d+\b', ' ', a, flags=re.I)
    a = re.sub(r'\s+', ' ', a).strip(' ,.')
    if not re.search(r'\b(USA|U\.S\.A|United States|Canada|England|France|Sweden|Japan|Italy)\b', a, re.I):
        a += ', USA'
    return a
def geocode(q):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'json', 'limit': 1})
    req = urllib.request.Request(url, headers={'User-Agent': 'semlab-data-process eat-explore geocoder (thisismattmiller@gmail.com)'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
n = 0
for a in addrs:
    if a in out: continue
    q = clean(a)
    try:
        res = geocode(q)
        if not res and ',' in q:  # retry with the tail (city/state) only
            tail = ', '.join(q.split(',')[-2:]); res = geocode(tail); time.sleep(1.1)
            if res: res[0]['approx'] = True
        out[a] = {'lat': float(res[0]['lat']), 'lon': float(res[0]['lon']), 'display': res[0].get('display_name'), 'approx': res[0].get('approx', False), 'query': q} if res else None
    except Exception as e:
        print('ERR', a, e, file=sys.stderr); out[a] = None
    n += 1
    if n % 20 == 0:
        json.dump(out, open(out_path, 'w'), indent=0, ensure_ascii=False); print(n, 'done', file=sys.stderr)
    time.sleep(1.1)
json.dump(out, open(out_path, 'w'), indent=0, ensure_ascii=False)
print('finished', sum(1 for v in out.values() if v), 'of', len(out), file=sys.stderr)
