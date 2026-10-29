import { query, h, qlink, setStatus, errorBox, fmt, topbar, footer, itemUrl, esc } from '../shared/sparql.js';
document.getElementById('top').replaceWith(topbar('map'));
document.getElementById('foot').replaceWith(footer());
const $ = id => document.getElementById(id);
const Q_ENG = `SELECT ?eng ?engLabel ?addr (SAMPLE(?empLabel) AS ?emp) (SAMPLE(?card) AS ?card) (GROUP_CONCAT(DISTINCT ?fowLabel;separator=", ") AS ?fields) WHERE {
  ?eng wdt:P152 ?addr; wdt:P11 ?proj. VALUES ?proj { wd:Q28603 wd:Q19104 } OPTIONAL { ?card wdt:P1 wd:Q28613; wdt:P77 ?eng } OPTIONAL { ?eng wdt:P110 ?e. ?e rdfs:label ?empLabel FILTER(LANG(?empLabel)="en") } OPTIONAL { ?eng wdt:P202 ?f. ?f rdfs:label ?fowLabel FILTER(LANG(?fowLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?eng ?engLabel ?addr`;
const Q_KG = `SELECT ?place ?placeLabel ?coord (SAMPLE(?clsLabel) AS ?cls) (COUNT(DISTINCT ?s) AS ?n) (GROUP_CONCAT(DISTINCT ?sLabel;separator="|") AS ?items) WHERE {
  ?s wdt:P125 ?place; wdt:P11 wd:Q19104; rdfs:label ?sLabel. FILTER(LANG(?sLabel)="en") ?place wdt:P146 ?coord. OPTIONAL { ?place wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?place ?placeLabel ?coord`;
const Q_PUB = `SELECT ?place ?placeLabel ?coord (COUNT(DISTINCT ?ref) AS ?n) (GROUP_CONCAT(DISTINCT ?pubLabel;separator="|") AS ?pubs) WHERE {
  ?ref wdt:P1 wd:Q27513; wdt:P104 ?place. ?place wdt:P146 ?coord. OPTIONAL { ?ref wdt:P103 ?pub. ?pub rdfs:label ?pubLabel FILTER(LANG(?pubLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?place ?placeLabel ?coord`;
const wkt = s => { const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(s || ''); return m ? [+m[2], +m[1]] : null; };
const map = L.map('map', { scrollWheelZoom: false }).setView([40.72, -74.0], 9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
const layers = { eng: L.layerGroup().addTo(map), kg: L.layerGroup().addTo(map), pub: L.layerGroup() };
for (const k of ['eng', 'kg', 'pub']) $('l-' + k).addEventListener('change', ev => { ev.target.checked ? layers[k].addTo(map) : map.removeLayer(layers[k]); });
const circle = (ll, color, r, html) => L.circleMarker(ll, { radius: r, color: 'var(--panel)', weight: 1.5, fillColor: color, fillOpacity: 0.85 }).bindPopup(html);
const region = a => /\b(N\.?\s?J\.?|New Jersey|Murray Hill|Berkeley Heights|Princeton|Newark|Summit)\b/i.test(a) ? 'New Jersey' : /\b(Brooklyn|Bronx|Queens|Staten|Flushing|Astoria)\b/i.test(a) ? 'NYC outer boroughs' : /\b(L\.?\s?I\.?|Long Island|Hempstead|Huntington|Bethpage|Stony Brook|Garden City|Roslyn|Great Neck|Syosset|Mineola|Plainview|Farmingdale|Hicksville)\b/i.test(a) ? 'Long Island' : /\b(New York|N\.?\s?Y\.?C?\b|Manhattan|NYC)/i.test(a) ? 'New York City' : /\b(Conn\.?|Connecticut)\b/i.test(a) ? 'Connecticut' : /\b(Mass\.?|Massachusetts|Cambridge|Boston)\b/i.test(a) ? 'Massachusetts' : /\b(Pa\.?|Penn|Phila)/i.test(a) ? 'Pennsylvania' : /\b(Calif\.?|California|Los Angeles|San Francisco|Palo Alto|Stanford)\b/i.test(a) ? 'California' : 'Elsewhere';
async function load() {
  setStatus('loading addresses and places');
  try {
    const [eng, kg, pub, geo] = await Promise.all([query(Q_ENG), query(Q_KG), query(Q_PUB), fetch('geocoded.json').then(r => r.ok ? r.json() : {})]);
    // engineers
    let placed = 0, approx = 0; const seen = new Set(); const emps = new Map(), regs = new Map();
    for (const r of eng) { if (seen.has(r.eng)) continue; const g = geo[r.addr.trim()]; if (!g) continue; seen.add(r.eng); placed++; if (g.approx) approx++;
      const jitter = () => (Math.random() - 0.5) * 0.004;
      layers.eng.addLayer(circle([g.lat + (g.approx ? jitter() : 0), g.lon + (g.approx ? jitter() : 0)], 'var(--chart1)', 6,
        `<b>${esc(r.engLabel)}</b><br>${esc(r.addr)}${r.emp ? '<br>' + esc(r.emp) : ''}${r.fields ? '<br><i>' + esc(r.fields) + '</i>' : ''}${g.approx ? '<br><span style="color:var(--muted)">approximate: town centre</span>' : ''}<br>${r.card ? `<a href="../matchmaker/#card=${r.eng}">Open card →</a>` : `<a href="../whos-who/#person=${r.eng}">Profile →</a>`}`));
      if (r.emp) emps.set(r.emp, (emps.get(r.emp) || 0) + 1); const rg = region(r.addr); regs.set(rg, (regs.get(rg) || 0) + 1); }
    $('n-eng').textContent = `${placed} of ${new Set(eng.map(r => r.eng)).size} placed`;
    $('employers').replaceChildren(...[...emps].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([e, n]) => h('li', {}, h('span', {}, e), h('span', { class: 'count' }, n))));
    $('regions').replaceChildren(...[...regs].sort((a, b) => b[1] - a[1]).map(([e, n]) => h('li', {}, h('span', {}, e), h('span', { class: 'count' }, n))));
    // KG places
    let nk = 0; for (const r of kg) { const ll = wkt(r.coord); if (!ll) continue; nk++; const items = (r.items || '').split('|').filter(Boolean);
      layers.kg.addLayer(circle(ll, 'var(--chart2)', 5 + Math.min(14, Math.sqrt(+r.n) * 2.2), `<b><a href="${itemUrl(r.place)}" target="_blank" rel="noopener">${esc(r.placeLabel)}</a></b> <span style="color:var(--muted)">${esc(r.cls || '')}</span><br>${r.n} item${r.n > 1 ? 's' : ''} located here<br><span style="font-size:12px">${items.slice(0, 8).map(esc).join('<br>')}${items.length > 8 ? '<br>…' : ''}</span>`)); }
    $('n-kg').textContent = `${nk} places`;
    // publication places
    let np = 0; const pubsList = [];
    for (const r of pub) { const ll = wkt(r.coord); if (!ll) continue; np++; pubsList.push(r);
      layers.pub.addLayer(circle(ll, 'var(--ok)', 5 + Math.min(16, Math.sqrt(+r.n) * 2.2), `<b>${esc(r.placeLabel)}</b><br>${r.n} reference${r.n > 1 ? 's' : ''} published here<br><span style="font-size:12px">${(r.pubs || '').split('|').filter(Boolean).slice(0, 8).map(esc).join('<br>')}</span><br><a href="../timeline/#q=${encodeURIComponent(r.placeLabel)}">In the timeline →</a>`)); }
    $('n-pub').textContent = `${np} places`;
    $('pubs').replaceChildren(...pubsList.sort((a, b) => b.n - a.n).slice(0, 15).map(r => h('li', {}, h('a', { onclick: () => { if (!map.hasLayer(layers.pub)) { $('l-pub').checked = true; layers.pub.addTo(map); } map.setView(wkt(r.coord), 6); } }, r.placeLabel), h('span', { class: 'count' }, r.n))));
    $('mapstatus').textContent = approx ? `${approx} engineer markers approximate` : '';
    setStatus(`${placed} engineers · ${nk} places · ${np} publication places`);
  } catch (err) { setStatus('query failed', true); $('layers').after(errorBox(err)); }
}
load();
