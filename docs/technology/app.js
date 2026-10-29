import { query, h, qlink, setStatus, errorBox, fmt, getHash, setHash, topbar, footer, short } from '../shared/sparql.js';
document.getElementById('top').replaceWith(topbar('technology'));
document.getElementById('foot').replaceWith(footer());
const $ = id => document.getElementById(id);
const Q_USES = `SELECT ?term ?termLabel (SAMPLE(?clsLabel) AS ?cls) (COUNT(DISTINCT ?work) AS ?n) (GROUP_CONCAT(DISTINCT CONCAT(STR(?work),"~",?workLabel,"~",COALESCE(?wcls,""));separator="|") AS ?works) WHERE {
  ?work wdt:P185 ?term; rdfs:label ?workLabel. FILTER(LANG(?workLabel)="en") OPTIONAL { ?term wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?work wdt:P1 ?wc. ?wc rdfs:label ?wcls FILTER(LANG(?wcls)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?term ?termLabel`;
const Q_FOW = `SELECT ?term ?termLabel (SAMPLE(?clsLabel) AS ?cls) (COUNT(DISTINCT ?eng) AS ?n) (GROUP_CONCAT(DISTINCT CONCAT(STR(?eng),"~",?engLabel,"~",COALESCE(?empLabel,""));separator="|") AS ?engs) WHERE {
  ?eng wdt:P202 ?term; rdfs:label ?engLabel. FILTER(LANG(?engLabel)="en") OPTIONAL { ?term wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?eng wdt:P110 ?emp. ?emp rdfs:label ?empLabel FILTER(LANG(?empLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?term ?termLabel`;
const Q_CARDS = `SELECT ?eng (SAMPLE(?card) AS ?card) WHERE { ?card wdt:P1 wd:Q28613; wdt:P77 ?eng } GROUP BY ?eng`;
const triples = s => (s || '').split('|').filter(Boolean).map(x => { const [q, l, c] = x.split('~'); return { q: short(q), label: l, cls: c }; });
const norm = s => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(systems?|devices?|technolog(y|ies)|engineering|equipment)\b/g, ' ').replace(/s\b/g, '').replace(/\s+/g, ' ').trim();
const bigrams = s => { const t = ' ' + s + ' '; const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
const dice = (a, b) => { const A = bigrams(a), B = bigrams(b); let n = 0; for (const x of A) if (B.has(x)) n++; return 2 * n / (A.size + B.size); };
let terms = new Map(), cardOf = new Map(), selected = null;
async function load() {
  setStatus('loading vocabularies');
  try {
    const [u, f, c] = await Promise.all([query(Q_USES), query(Q_FOW), query(Q_CARDS)]);
    for (const r of c) cardOf.set(r.eng, r.card);
    for (const r of u) terms.set(r.term, { q: r.term, label: r.termLabel, cls: r.cls, works: triples(r.works), engs: [] });
    for (const r of f) { const t = terms.get(r.term) || { q: r.term, label: r.termLabel, cls: r.cls, works: [], engs: [] }; t.engs = triples(r.engs); t.cls = t.cls || r.cls; terms.set(r.term, t); }
    // fuzzy suggestions between unmatched terms
    const usesOnly = [...terms.values()].filter(t => t.works.length && !t.engs.length), fowOnly = [...terms.values()].filter(t => t.engs.length && !t.works.length);
    for (const t of terms.values()) t.sugg = [];
    for (const a of usesOnly) for (const b of fowOnly) { const na = norm(a.label), nb = norm(b.label); if (!na || !nb) continue;
      let s = na === nb ? 1 : (na.includes(nb) || nb.includes(na)) ? 0.85 : dice(na, nb); if (s >= 0.62) { a.sugg.push({ t: b, s }); b.sugg.push({ t: a, s }); } }
    for (const t of terms.values()) t.sugg.sort((x, y) => y.s - x.s);
    const shared = [...terms.values()].filter(t => t.works.length && t.engs.length);
    const pairs = [...terms.values()].reduce((n, t) => n + (t.works.length ? t.sugg.length : 0), 0);
    $('tiles').replaceChildren(tile(u.length, 'terms used by works'), tile(f.length, 'fields of work on cards'), tile(shared.length, 'terms in both vocabularies'), tile(pairs, 'suggested reconciliations'));
    setStatus(`${terms.size} terms`);
    render();
    const hs = getHash(); if (hs.term && terms.has(hs.term)) select(hs.term); else sharedOverview(shared);
  } catch (err) { setStatus('query failed', true); $('detail').replaceChildren(errorBox(err)); }
}
const tile = (n, l) => h('div', { class: 'tile' }, h('b', {}, fmt(n)), h('span', {}, l));
function list() {
  const q = $('q').value.trim().toLowerCase(), show = $('show').value, sort = $('sort').value;
  let L = [...terms.values()].filter(t => (!q || t.label.toLowerCase().includes(q) || (t.cls || '').toLowerCase().includes(q)) && (show === 'all' || (show === 'shared' && t.works.length && t.engs.length) || (show === 'uses' && t.works.length && !t.engs.length) || (show === 'fow' && t.engs.length && !t.works.length)));
  if (sort === 'works') L.sort((a, b) => b.works.length - a.works.length || a.label.localeCompare(b.label));
  else if (sort === 'eng') L.sort((a, b) => b.engs.length - a.engs.length || a.label.localeCompare(b.label));
  else if (sort === 'name') L.sort((a, b) => a.label.localeCompare(b.label));
  else L.sort((a, b) => (b.works.length + b.engs.length) - (a.works.length + a.engs.length) || a.label.localeCompare(b.label));
  return L;
}
function render() {
  const L = list(); const max = Math.max(1, ...L.map(t => Math.max(t.works.length, t.engs.length)));
  $('tcount').textContent = `${L.length} terms`;
  $('terms').replaceChildren(...L.map(t => h('li', { role: 'option', 'data-q': t.q, 'aria-selected': t.q === selected ? 'true' : 'false', onclick: () => select(t.q) },
    h('span', {}, t.label, h('span', { class: 'cls' }, t.cls || '')),
    h('span', { class: 'bars' }, h('i', { style: `width:${Math.round(t.works.length / max * 50)}px;background:var(--chart1)` }), t.works.length || '', ' ', h('i', { style: `width:${Math.round(t.engs.length / max * 50)}px;background:var(--chart2)` }), t.engs.length || ''))));
}
for (const id of ['q', 'show', 'sort']) $(id).addEventListener('input', render);
function sharedOverview(shared) {
  selected = null; setHash({}); render();
  $('detail').replaceChildren(h('h2', { style: 'margin-top:0' }, 'The shared terms'), h('p', { class: 'muted' }, 'Terms that both a work uses and an engineer names as a field. These are the only places the two vocabularies meet today.'),
    h('table', {}, h('tr', {}, h('th', {}, 'Term'), h('th', { class: 'n' }, 'Works using it'), h('th', { class: 'n' }, 'Engineers in the field')), ...shared.sort((a, b) => (b.works.length + b.engs.length) - (a.works.length + a.engs.length)).map(t => h('tr', {}, h('td', {}, h('a', { href: '#term=' + t.q, onclick: ev => { ev.preventDefault(); select(t.q); } }, t.label)), h('td', { class: 'n' }, t.works.length), h('td', { class: 'n' }, t.engs.length)))),
    h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Pick any term on the left for its works, engineers and suggested counterparts.'));
}
function select(q) {
  selected = q; setHash({ term: q }); render(); document.querySelector(`#terms li[data-q="${q}"]`)?.scrollIntoView({ block: 'nearest' });
  const t = terms.get(q);
  const workItem = w => h('li', {}, /9 Evenings performance/.test(w.label) ? h('a', { href: '../nine-evenings/#perf=' + w.q }, w.label) : qlink(w.q, w.label), ' ', h('span', { class: 'muted small' }, w.cls || ''));
  const engItem = e => h('li', {}, cardOf.has(e.q) ? h('a', { href: '../matchmaker/#card=' + e.q }, e.label) : h('a', { href: '../whos-who/#person=' + e.q }, e.label), ' ', h('span', { class: 'muted small' }, e.cls || ''));
  $('detail').replaceChildren(
    h('div', { class: 'eyebrow' }, t.cls || 'term'), h('h2', { style: 'margin:2px 0 10px' }, qlink(q, t.label)),
    h('div', { class: 'two' },
      h('div', {}, h('h3', {}, 'Works that use it', h('span', { class: 'count' }, t.works.length)), t.works.length ? h('ul', {}, ...t.works.sort((a, b) => a.label.localeCompare(b.label)).map(workItem)) : h('p', { class: 'muted small' }, 'No work records using this term.')),
      h('div', {}, h('h3', {}, 'Engineers in the field', h('span', { class: 'count' }, t.engs.length)), t.engs.length ? h('ul', {}, ...t.engs.sort((a, b) => a.label.localeCompare(b.label)).map(engItem)) : h('p', { class: 'muted small' }, 'No engineer card names this field.'))),
    t.sugg.length ? h('div', { style: 'margin-top:18px' }, h('h3', {}, t.works.length ? 'Fields of work that may be the same thing' : 'Work terms that may be the same thing'),
      h('ul', { class: 'list sugg' }, ...t.sugg.map(s => h('li', {}, h('a', { href: '#term=' + s.t.q, onclick: ev => { ev.preventDefault(); select(s.t.q); } }, s.t.label), h('span', { class: 'score' }, `${s.t.works.length || s.t.engs.length} ${s.t.works.length ? 'works' : 'engineers'} · similarity ${s.s.toFixed(2)}`)))),
      h('p', { class: 'small muted' }, 'Suggestions come from label similarity only. A real reconciliation would add a ', h('span', { class: 'mono' }, 'skos:exactMatch'), ' or merge the items in the Wikibase.')) : null);
}
window.addEventListener('hashchange', () => { const hs = getHash(); if (hs.term && hs.term !== selected && terms.has(hs.term)) select(hs.term); });
load();
