import { query, h, qlink, setStatus, errorBox, fmt, getHash, setHash, topbar, footer, day } from '../shared/sparql.js';
document.getElementById('top').replaceWith(topbar('timeline'));
document.getElementById('foot').replaceWith(footer());
const $ = id => document.getElementById(id);
const Q_KG = `SELECT ?item ?itemLabel ?date (SAMPLE(?clsLabel) AS ?cls) (SAMPLE(?thumb) AS ?thumb) (GROUP_CONCAT(DISTINCT ?subjLabel;separator=", ") AS ?subjects) (SAMPLE(?ref) AS ?linkedRef) WHERE {
  ?item wdt:P98 ?date; wdt:P11 wd:Q19104. FILTER NOT EXISTS { ?item wdt:P1 wd:Q27513 } OPTIONAL { ?item wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?item wdt:P3 ?thumb }
  OPTIONAL { ?item wdt:P77 ?subj. ?subj rdfs:label ?subjLabel FILTER(LANG(?subjLabel)="en") } OPTIONAL { ?item wdt:P248 ?ref } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?item ?itemLabel ?date`;
const Q_BIB = `SELECT ?ref ?title ?date ?pubLabel ?placeLabel (GROUP_CONCAT(DISTINCT ?authorLabel;separator=", ") AS ?authors) (SAMPLE(?doc) AS ?linkedDoc) WHERE {
  ?ref wdt:P1 wd:Q27513; wdt:P98 ?date. OPTIONAL { ?ref wdt:P82 ?title } OPTIONAL { ?ref wdt:P103 ?pub } OPTIONAL { ?ref wdt:P104 ?place } OPTIONAL { ?ref wdt:P91 ?author. ?author rdfs:label ?authorLabel FILTER(LANG(?authorLabel)="en") } OPTIONAL { ?ref wdt:P247 ?doc }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?ref ?title ?date ?pubLabel ?placeLabel`;
const Y0 = 1958, Y1 = 1981;
let kg = [], bib = [], year = null, month = null;
async function load() {
  setStatus('loading dated items');
  try {
    const [a, b] = await Promise.all([query(Q_KG), query(Q_BIB)]);
    kg = a.map(r => ({ ...r, d: day(r.date), y: +r.date.slice(0, 4), m: +r.date.slice(5, 7), lane: 'kg', label: r.itemLabel, id: r.item, cls: r.cls || 'item' }));
    bib = b.map(r => ({ ...r, d: day(r.date), y: +r.date.slice(0, 4), m: +r.date.slice(5, 7), lane: 'bib', label: r.title || r.ref, id: r.ref }));
    const clsCounts = new Map(); for (const r of kg) clsCounts.set(r.cls, (clsCounts.get(r.cls) || 0) + 1);
    for (const [c, n] of [...clsCounts].sort((x, y) => y[1] - x[1])) $('cls').append(h('option', { value: c }, `${c} (${n})`));
    const pubCounts = new Map(); for (const r of bib) if (r.pubLabel) pubCounts.set(r.pubLabel, (pubCounts.get(r.pubLabel) || 0) + 1);
    for (const [c, n] of [...pubCounts].sort((x, y) => y[1] - x[1])) $('pub').append(h('option', { value: c }, `${c} (${n})`));
    const out = kg.filter(r => r.y < Y0 || r.y > Y1).length + bib.filter(r => r.y < Y0 || r.y > Y1).length;
    $('range').textContent = `${fmt(kg.length)} archive items · ${fmt(bib.length)} press items · ${out} fall outside ${Y0}–${Y1}`;
    setStatus(`${fmt(kg.length + bib.length)} dated items`);
    const hs = getHash(); year = hs.y ? +hs.y : null; month = hs.m ? +hs.m : null;
    render();
  } catch (err) { setStatus('query failed', true); $('chart').replaceChildren(errorBox(err)); }
}
function filt() {
  const cls = $('cls').value, pub = $('pub').value, q = $('q').value.trim().toLowerCase();
  const K = kg.filter(r => (!cls || r.cls === cls) && (!q || `${r.label} ${r.subjects || ''} ${r.cls}`.toLowerCase().includes(q)));
  const B = bib.filter(r => (!pub || r.pubLabel === pub) && (!q || `${r.label} ${r.authors || ''} ${r.pubLabel || ''} ${r.placeLabel || ''}`.toLowerCase().includes(q)));
  return { K, B };
}
function render() {
  const { K, B } = filt();
  const years = []; for (let y = Y0; y <= Y1; y++) years.push({ y, k: K.filter(r => r.y === y).length, b: B.filter(r => r.y === y).length });
  const max = Math.max(1, ...years.map(r => Math.max(r.k, r.b)));
  const W = 1000, H = 260, L = 40, R = 10, T = 14, Bm = 34, pw = W - L - R, ph = H - T - Bm, bw = pw / years.length, gap = 2, half = (bw - gap * 3) / 2;
  const ys = v => T + ph - (v / max) * ph;
  const ticks = [0, Math.round(max / 2), max];
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Grouped bars per year: archive items in amber, press references in blue' });
  for (const t of ticks) { svg.append(el('line', { x1: L, x2: W - R, y1: ys(t), y2: ys(t), stroke: 'var(--rule)', 'stroke-width': 1 })); svg.append(el('text', { x: L - 6, y: ys(t) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--muted)' }, fmt(t))); }
  years.forEach((r, i) => { const x = L + i * bw;
    const g = el('g', { class: 'yr', style: 'cursor:pointer', 'data-y': r.y });
    g.append(el('rect', { x, y: T, width: bw, height: ph, fill: r.y === year ? 'var(--panel2)' : 'transparent' }));
    g.append(el('rect', { x: x + gap, y: ys(r.k), width: Math.max(0, half), height: ph - (ys(r.k) - T), fill: 'var(--chart1)', rx: 2 }));
    g.append(el('rect', { x: x + gap * 2 + half, y: ys(r.b), width: Math.max(0, half), height: ph - (ys(r.b) - T), fill: 'var(--chart2)', rx: 2 }));
    g.append(el('text', { x: x + bw / 2, y: H - Bm + 16, 'text-anchor': 'middle', 'font-size': 11, fill: r.y === year ? 'var(--fg)' : 'var(--muted)', 'font-weight': r.y === year ? 700 : 400 }, r.y % 2 ? '' : String(r.y)));
    g.addEventListener('mousemove', ev => { const tip = $('tip'); tip.style.display = 'block'; const box = $('chart').getBoundingClientRect(); tip.style.left = (ev.clientX - box.left) + 'px'; tip.style.top = (ev.clientY - box.top) + 'px'; tip.textContent = `${r.y}: ${r.k} archive · ${r.b} press`; });
    g.addEventListener('mouseleave', () => { $('tip').style.display = 'none'; });
    g.addEventListener('click', () => { year = r.y === year ? null : r.y; month = null; setHash({ y: year, m: null }); render(); });
    svg.append(g); });
  $('chart').replaceChildren(svg, $('tip'));
  renderMonths(K, B); renderLists(K, B); renderTable(K, B);
}
function el(tag, attrs, text) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function renderMonths(K, B) {
  if (!year) { $('months').replaceChildren(h('p', { class: 'muted small' }, 'Click a year to break it into months.')); return; }
  const ms = MON.map((n, i) => ({ m: i + 1, n, k: K.filter(r => r.y === year && r.m === i + 1).length, b: B.filter(r => r.y === year && r.m === i + 1).length }));
  const max = Math.max(1, ...ms.map(r => Math.max(r.k, r.b)));
  $('months').replaceChildren(h('div', { class: 'eyebrow' }, `${year} by month`), h('div', { class: 'months' }, ...ms.map(r => h('button', { 'aria-pressed': r.m === month ? 'true' : 'false', title: `${r.n} ${year}: ${r.k} archive · ${r.b} press`, onclick: () => { month = r.m === month ? null : r.m; setHash({ y: year, m: month }); render(); } },
    h('span', { class: 'bars' }, h('i', { style: `height:${Math.max(2, r.k / max * 22)}px;background:var(--chart1)` }), h('i', { style: `height:${Math.max(2, r.b / max * 22)}px;background:var(--chart2)` })), h('b', {}, r.n), h('span', { class: 'count' }, `${r.k}·${r.b}`)))));
}
function renderLists(K, B) {
  const sel = r => (!year || r.y === year) && (!month || r.m === month);
  const k = K.filter(sel).sort((a, b) => a.d.localeCompare(b.d)), b = B.filter(sel).sort((a, b) => a.d.localeCompare(b.d));
  const title = year ? (month ? `${MON[month - 1]} ${year}` : String(year)) : 'All years';
  $('lists').replaceChildren(h('div', { class: 'lanes' },
    h('div', { class: 'lane' }, h('h3', {}, `Archive · ${title}`, h('span', { class: 'n' }, fmt(k.length))), h('ul', {}, ...k.slice(0, 400).map(r => h('li', {}, h('span', { class: 'd' }, r.d), h('span', {}, qlink(r.id, r.label), ' ', h('span', { class: 'cls' }, r.cls), r.subjects ? h('div', { class: 'cls' }, 'about ' + r.subjects) : null, r.linkedRef ? h('div', {}, h('span', { class: 'linked' }, 'has press entry'), ' ', qlink(r.linkedRef, 'bibliography record')) : null, r.cls && /letter|press release|statement|list|programme|booklet|memorandum|notes|clipping|schedule|pamphlet|notebook|instructions|postcard|telegram|receipt|form|questionnaire/.test(r.cls) ? h('a', { class: 'small', href: '../reader/#doc=' + r.id }, ' read →') : null))))),
    h('div', { class: 'lane' }, h('h3', {}, `Press · ${title}`, h('span', { class: 'n' }, fmt(b.length))), h('ul', {}, ...b.slice(0, 400).map(r => h('li', {}, h('span', { class: 'd' }, r.d), h('span', {}, qlink(r.id, r.label), h('div', { class: 'cls' }, [r.authors, r.pubLabel, r.placeLabel].filter(Boolean).join(' · ')), r.linkedDoc ? h('div', {}, h('span', { class: 'linked' }, 'in the archive'), ' ', h('a', { class: 'small', href: '../reader/#doc=' + r.linkedDoc }, 'read the document →')) : null)))))));
}
function renderTable(K, B) {
  const years = []; for (let y = Y0; y <= Y1; y++) years.push([y, K.filter(r => r.y === y).length, B.filter(r => r.y === y).length]);
  $('table').replaceChildren(h('table', { class: 'tv' }, h('tr', {}, h('th', {}, 'Year'), h('th', { class: 'n' }, 'Archive items'), h('th', { class: 'n' }, 'Press references')), ...years.map(([y, k, b]) => h('tr', {}, h('td', {}, y), h('td', { class: 'n' }, k), h('td', { class: 'n' }, b)))));
}
$('tableview').onclick = () => { const on = $('table').hidden; $('table').hidden = !on; $('chart').hidden = on; $('tableview').setAttribute('aria-pressed', on); };
for (const id of ['cls', 'pub', 'q']) $(id).addEventListener('input', render);
load();
