import { query, h, qlink, setStatus, errorBox, fmt, getHash, setHash, topbar, footer, day, uniq, thumbUrl } from '../shared/sparql.js';
document.getElementById('top').replaceWith(topbar('nine-evenings'));
document.getElementById('foot').replaceWith(footer());
const EVENT = 'Q19118';
const Q_PERFS = `SELECT ?perf ?perfLabel ?date ?work ?workLabel ?workDesc ?locLabel (GROUP_CONCAT(DISTINCT ?creatorLabel;separator=", ") AS ?creators) WHERE {
  ?perf wdt:P96 wd:${EVENT}; wdt:P1 wd:Q19074. OPTIONAL { ?perf wdt:P98 ?date } OPTIONAL { ?perf wdt:P127 ?work. OPTIONAL { ?work schema:description ?workDesc FILTER(LANG(?workDesc)="en") } OPTIONAL { ?work wdt:P74 ?creator. ?creator rdfs:label ?creatorLabel FILTER(LANG(?creatorLabel)="en") } }
  OPTIONAL { ?perf wdt:P125 ?loc } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?perf ?perfLabel ?date ?work ?workLabel ?workDesc ?locLabel`;
const Q_CREW = `SELECT ?perf ?person ?personLabel ?roleLabel ?thumb (GROUP_CONCAT(DISTINCT ?occLabel;separator=", ") AS ?occ) WHERE {
  ?perf wdt:P96 wd:${EVENT}; wdt:P1 wd:Q19074; p:P75 ?st. ?st ps:P75 ?person. OPTIONAL { ?st pq:P262 ?role }
  OPTIONAL { ?person wdt:P3 ?thumb } OPTIONAL { ?person wdt:P44 ?occ. ?occ rdfs:label ?occLabel FILTER(LANG(?occLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?perf ?person ?personLabel ?roleLabel ?thumb`;
const Q_USES = `SELECT ?perf ?item ?itemLabel (SAMPLE(?clsLabel) AS ?cls) WHERE {
  ?perf wdt:P96 wd:${EVENT}; wdt:P1 wd:Q19074; wdt:P185 ?item. OPTIONAL { ?item wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?perf ?item ?itemLabel`;
const Q_DOCS = `SELECT ?doc ?docLabel ?date (SAMPLE(?clsLabel) AS ?cls) (SAMPLE(?file) AS ?file) (SAMPLE(?thumb) AS ?thumb) (GROUP_CONCAT(DISTINCT STR(?subj);separator="|") AS ?subjects) WHERE {
  ?doc wdt:P77 ?subj. { ?doc wdt:P77 wd:${EVENT} } UNION { ?doc wdt:P77 ?s2. ?s2 wdt:P96 wd:${EVENT} } UNION { ?doc wdt:P77 ?s3. ?p3 wdt:P127 ?s3; wdt:P96 wd:${EVENT} }
  OPTIONAL { ?doc wdt:P98 ?date } OPTIONAL { ?doc wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?doc wdt:P200 ?file } OPTIONAL { ?doc wdt:P3 ?thumb }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?doc ?docLabel ?date`;
const Q_PRESS = `SELECT ?ref ?title ?date ?pubLabel (GROUP_CONCAT(DISTINCT ?authorLabel;separator=", ") AS ?authors) ?placeLabel WHERE {
  ?ref wdt:P1 wd:Q27513; wdt:P98 ?date. FILTER(?date >= "1966-09-01T00:00:00Z"^^xsd:dateTime && ?date < "1967-02-01T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?ref wdt:P82 ?title } OPTIONAL { ?ref wdt:P103 ?pub } OPTIONAL { ?ref wdt:P104 ?place } OPTIONAL { ?ref wdt:P91 ?author. ?author rdfs:label ?authorLabel FILTER(LANG(?authorLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?ref ?title ?date ?pubLabel ?placeLabel ORDER BY ?date`;
const Q_MENTIONS = (ids) => `SELECT ?block ?text ?doc ?docLabel WHERE { VALUES ?t { ${ids.map(q => 'wd:' + q).join(' ')} } ?block wdt:P21 ?t; wdt:P19 ?text; wdt:P24 ?doc. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 40`;

const NIGHTS = ['1966-10-13', '1966-10-14', '1966-10-15', '1966-10-16', '1966-10-18', '1966-10-19', '1966-10-21', '1966-10-22', '1966-10-23'];
const DOW = { '1966-10-13': 'Thu', '1966-10-14': 'Fri', '1966-10-15': 'Sat', '1966-10-16': 'Sun', '1966-10-18': 'Tue', '1966-10-19': 'Wed', '1966-10-21': 'Fri', '1966-10-22': 'Sat', '1966-10-23': 'Sun' };
const $ = id => document.getElementById(id);
let perfs = [], crew = new Map(), uses = new Map(), docs = [], press = [], selected = null;

async function load() {
  setStatus('loading performances');
  try {
    const [p, c, u, d, pr] = await Promise.all([query(Q_PERFS), query(Q_CREW), query(Q_USES), query(Q_DOCS), query(Q_PRESS)]);
    perfs = p.map(r => ({ ...r, d: day(r.date) })).sort((a, b) => a.d.localeCompare(b.d) || a.perfLabel.localeCompare(b.perfLabel));
    const seenCrew = new Set(); for (const r of c) { const k = r.perf + '|' + r.person + '|' + (r.roleLabel || ''); if (seenCrew.has(k)) continue; seenCrew.add(k); if (!crew.has(r.perf)) crew.set(r.perf, []); crew.get(r.perf).push(r); }
    for (const r of u) { if (!uses.has(r.perf)) uses.set(r.perf, []); uses.get(r.perf).push(r); }
    docs = d; press = pr;
    const people = uniq(c.map(r => r.person)), kit = uniq(u.map(r => r.item));
    $('stats').replaceChildren(stat(perfs.length, 'performances'), stat(uniq(perfs.map(r => r.work)).length, 'works'), stat(people.length, 'people on crews'), stat(kit.length, 'devices, materials, phenomena'), stat(docs.length, 'archive documents'), stat(press.length, 'press items, Sep 1966–Jan 1967'));
    setStatus(`${perfs.length} performances loaded`);
    renderCalendar();
    const hs = getHash();
    if (hs.perf && perfs.some(r => r.perf === hs.perf)) select(hs.perf); else overview();
  } catch (err) { setStatus('query failed', true); $('detail').replaceChildren(errorBox(err)); }
}
function stat(n, label) { return h('span', {}, h('b', {}, fmt(n)), label); }
function short(label) { return label.replace(/\s*\(9 Evenings performance on .*\)$/, ''); }
function renderCalendar() {
  $('calendar').replaceChildren(...NIGHTS.map(n => { const list = perfs.filter(r => r.d === n);
    return h('div', { class: 'night' }, h('div', { class: 'd' }, DOW[n], h('b', {}, n.slice(8))),
      ...list.map(r => h('button', { 'aria-pressed': r.perf === selected ? 'true' : 'false', onclick: () => select(r.perf) }, short(r.perfLabel))),
      list.length ? null : h('div', { class: 'dark' }, 'dark')); }));
}
function overview() {
  selected = null; setHash({}); renderCalendar();
  const byWork = new Map(); for (const r of perfs) { if (!byWork.has(r.work)) byWork.set(r.work, { label: r.workLabel, creators: r.creators, nights: [] }); byWork.get(r.work).nights.push(r); }
  $('detail').replaceChildren(
    h('p', {}, 'Pick a night above, or start from a work:'),
    h('div', { class: 'grid' }, ...[...byWork].map(([q, w]) => h('div', { class: 'panel' }, h('h3', { style: 'margin:0 0 4px' }, qlink(q, w.label)), h('div', { class: 'muted small' }, w.creators || ''),
      h('p', { class: 'small', style: 'margin:8px 0 0' }, ...w.nights.flatMap((n, i) => [i ? ' · ' : '', h('a', { href: '#perf=' + n.perf, onclick: ev => { ev.preventDefault(); select(n.perf); } }, 'Oct ' + n.d.slice(8))])),
      h('p', { class: 'count', style: 'margin:6px 0 0' }, `${uniq(w.nights.flatMap(n => (crew.get(n.perf) || []).map(c => c.person))).length} people · ${uniq(w.nights.flatMap(n => (uses.get(n.perf) || []).map(c => c.item))).length} devices`)))),
    h('h2', {}, 'The archive on 9 Evenings'), docList(docs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))),
    h('h2', {}, 'The press, autumn 1966'), pressList(press));
}
function docList(list) { return h('ul', { class: 'list docs' }, ...list.map(r => h('li', {}, (r.thumb || r.file) ? h('img', { src: thumbUrl(r.thumb || r.file), alt: '', loading: 'lazy' }) : null, h('div', {}, qlink(r.doc, r.docLabel), h('div', { class: 'small muted' }, [r.cls, day(r.date)].filter(Boolean).join(' · ')), h('a', { class: 'small', href: '../reader/#doc=' + r.doc }, 'Read →'))))); }
function pressList(list) { return h('ul', { class: 'list press' }, ...list.map(r => h('li', {}, h('span', { class: 'mono muted' }, day(r.date)), ' ', qlink(r.ref, r.title || r.ref), ' ', h('span', { class: 'pub' }, [r.authors, r.pubLabel, r.placeLabel].filter(Boolean).join(' · '))))); }

async function select(id) {
  selected = id; setHash({ perf: id }); renderCalendar();
  const r = perfs.find(x => x.perf === id); const c = crew.get(id) || []; const u = uses.get(id) || [];
  const roles = new Map(); for (const m of c) { const k = m.roleLabel || 'contributor (no role recorded)'; if (!roles.has(k)) roles.set(k, []); roles.get(k).push(m); }
  const order = ['artist', 'performing artist', 'performance engineer', 'engineer', 'production team member', 'choreographer', 'director', 'projectionist', 'costume designer'];
  const roleKeys = [...roles.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const kitByCls = new Map(); for (const k of u) { const cls = k.cls || 'other'; if (!kitByCls.has(cls)) kitByCls.set(cls, []); kitByCls.get(cls).push(k); }
  const otherNight = perfs.find(x => x.work === r.work && x.perf !== id);
  const relDocs = docs.filter(d => (d.subjects || '').split('|').some(s => s.endsWith(id) || s.endsWith(r.work)));
  const weekPress = press.filter(p => { const d = day(p.date); return d >= '1966-10-10' && d <= '1966-11-15'; });
  $('detail').replaceChildren(
    h('div', { class: 'eyebrow' }, `${DOW[r.d]} ${r.d} · ${r.locLabel || '69th Regiment Armory'} · `, h('a', { href: '#', onclick: ev => { ev.preventDefault(); overview(); } }, 'all nights')),
    h('h2', { style: 'margin:4px 0 2px' }, qlink(r.work, r.workLabel), h('span', { class: 'muted' }, ' by ' + (r.creators || 'unknown'))),
    h('p', { class: 'muted' }, r.workDesc || '', otherNight ? h('span', {}, ' Also performed ', h('a', { href: '#perf=' + otherNight.perf, onclick: ev => { ev.preventDefault(); select(otherNight.perf); } }, 'Oct ' + otherNight.d.slice(8)), '.') : null, ' ', h('span', { class: 'small' }, qlink(id, 'performance record'))),
    h('div', { class: 'detail' },
      h('div', {}, h('h3', {}, `Crew · ${c.length}`), h('div', { class: 'roles' }, ...roleKeys.map(k => h('div', {}, h('h4', {}, `${k} · ${roles.get(k).length}`), h('ul', {}, ...roles.get(k).sort((a, b) => a.personLabel.localeCompare(b.personLabel)).map(m => h('li', {},
        m.thumb ? h('img', { src: m.thumb, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb', style: 'width:28px;height:28px;border-radius:50%' }), h('a', { href: '../whos-who/#person=' + m.person }, m.personLabel), m.occ ? h('span', { class: 'muted small' }, m.occ) : null)))))),
        h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Roles come from the ', h('span', { class: 'mono' }, 'object has role'), ' qualifier on each contributor statement.')),
      h('div', {}, h('h3', {}, `Equipment · ${u.length}`), u.length ? h('div', { class: 'kit' }, ...[...kitByCls].sort((a, b) => b[1].length - a[1].length).flatMap(([cls, items]) => [h('span', { class: 'cls' }, cls), ...items.sort((a, b) => a.itemLabel.localeCompare(b.itemLabel)).map(k => h('a', { href: '../technology/#term=' + k.item }, k.itemLabel))])) : h('p', { class: 'muted' }, 'No equipment recorded.'),
        h('h3', {}, `Documents · ${relDocs.length}`), relDocs.length ? docList(relDocs) : h('p', { class: 'muted small' }, 'No document has this performance or work as its main subject.'),
        h('h3', {}, 'Passages that mention it'), h('div', { id: 'mentions' }, h('div', { class: 'loading' }, 'Searching blocks')))),
    h('h3', {}, 'Press, 10 Oct – 15 Nov 1966'), pressList(weekPress));
  try {
    const m = await query(Q_MENTIONS([id, r.work]));
    $('mentions')?.replaceChildren(m.length ? h('ul', { class: 'list' }, ...m.map(b => h('li', {}, h('div', { class: 'passage', style: 'margin:0 0 4px' }, b.text.length > 420 ? b.text.slice(0, 420) + '…' : b.text), h('a', { class: 'small', href: '../reader/#doc=' + b.doc }, b.docLabel)))) : h('p', { class: 'muted small' }, 'No passages mention this performance or work directly.'));
  } catch (e) { $('mentions')?.replaceChildren(h('p', { class: 'muted small' }, 'Passage search failed.')); }
}
window.addEventListener('hashchange', () => { const hs = getHash(); if (hs.perf && hs.perf !== selected) select(hs.perf); });
load();
