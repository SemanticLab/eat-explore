import { query, h, qlink, badge, setStatus, errorBox, fmt, getHash, setHash, topbar, footer, day, short, projectTags, isQ, datascapeUrl, wikidataUrl } from '../shared/sparql.js';
document.getElementById('top').replaceWith(topbar('whos-who'));
document.getElementById('foot').replaceWith(footer());
const $ = id => document.getElementById(id);
const esc = s => s.replace(/["\\]/g, '');

const Q_SEARCH = ({ text, proj, occ, pic, prefix }) => `SELECT ?p ?pLabel ?desc (SAMPLE(?thumb) AS ?thumb) (GROUP_CONCAT(DISTINCT STR(?proj);separator="|") AS ?projects) (GROUP_CONCAT(DISTINCT ?occLabel;separator=", ") AS ?occs) WHERE {
  ?p wdt:P1 wd:Q1; rdfs:label ?pLabel. FILTER(LANG(?pLabel)="en")
  ${text ? `FILTER(CONTAINS(LCASE(?pLabel), "${esc(text.toLowerCase())}"))` : ''} ${prefix ? `FILTER(STRSTARTS(UCASE(?pLabel), "${prefix}"))` : ''}
  ${proj ? `?p wdt:P11 wd:${proj}.` : '?p wdt:P11 ?anyproj. VALUES ?anyproj { wd:Q19104 wd:Q28603 wd:Q20517 wd:Q27735 }'} ${occ ? `?p wdt:P44 wd:${occ}.` : ''} ${pic ? '?p wdt:P3 ?thumb.' : 'OPTIONAL { ?p wdt:P3 ?thumb }'}
  OPTIONAL { ?p wdt:P11 ?proj } OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?p wdt:P44 ?o. ?o rdfs:label ?occLabel FILTER(LANG(?occLabel)="en") }
} GROUP BY ?p ?pLabel ?desc ORDER BY ?pLabel LIMIT 300`;
const Q_BASIC = (p) => `SELECT ?pLabel ?desc (SAMPLE(?thumb) AS ?thumb) (SAMPLE(?wd) AS ?wikidata) (SAMPLE(?ds) AS ?datascape) (GROUP_CONCAT(DISTINCT STR(?proj);separator="|") AS ?projects) (GROUP_CONCAT(DISTINCT ?occLabel;separator=", ") AS ?occs) (GROUP_CONCAT(DISTINCT ?alias;separator=" · ") AS ?aliases) (GROUP_CONCAT(DISTINCT ?citLabel;separator=", ") AS ?citizenship) (SAMPLE(?birthLabel) AS ?birthplace) (GROUP_CONCAT(DISTINCT ?addr;separator=" / ") AS ?addresses) (GROUP_CONCAT(DISTINCT ?fowLabel;separator=", ") AS ?fields) WHERE {
  BIND(wd:${p} AS ?p) OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?p wdt:P3 ?thumb } OPTIONAL { ?p wdt:P8 ?wd } OPTIONAL { ?p wdt:P245 ?ds } OPTIONAL { ?p wdt:P11 ?proj }
  OPTIONAL { ?p wdt:P44 ?o. ?o rdfs:label ?occLabel FILTER(LANG(?occLabel)="en") } OPTIONAL { ?p skos:altLabel ?alias FILTER(LANG(?alias)="en") } OPTIONAL { ?p wdt:P43 ?cit. ?cit rdfs:label ?citLabel FILTER(LANG(?citLabel)="en") } OPTIONAL { ?p wdt:P274 ?birth. ?birth rdfs:label ?birthLabel FILTER(LANG(?birthLabel)="en") }
  OPTIONAL { ?p wdt:P152 ?addr } OPTIONAL { ?p wdt:P202 ?fow. ?fow rdfs:label ?fowLabel FILTER(LANG(?fowLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?pLabel ?desc`;
// outgoing statements with optional role qualifier (subject has role P117) and date/location qualifiers
const Q_OUT = (p) => `SELECT ?prop ?propLabel ?o ?oLabel ?roleLabel (SAMPLE(?clsLabel) AS ?cls) (SAMPLE(?d) AS ?date) WHERE {
  wd:${p} ?pp ?st. ?prop wikibase:claim ?pp; wikibase:statementProperty ?pps; wikibase:propertyType wikibase:WikibaseItem. ?st ?pps ?o.
  FILTER(?prop NOT IN (wd:P1, wd:P11, wd:P44)) OPTIONAL { ?st pq:P117 ?role } OPTIONAL { ?st pq:P98 ?d } OPTIONAL { ?o wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?o wdt:P98 ?d }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?prop ?propLabel ?o ?oLabel ?roleLabel`;
// incoming statements with optional role qualifier (object has role P262)
const Q_IN = (p) => `SELECT ?prop ?propLabel ?s ?sLabel ?roleLabel (SAMPLE(?clsLabel) AS ?cls) (SAMPLE(?d) AS ?date) WHERE {
  ?s ?pp ?st. ?st ?pps wd:${p}. ?prop wikibase:claim ?pp; wikibase:statementProperty ?pps. FILTER(?prop NOT IN (wd:P21, wd:P278)) OPTIONAL { ?st pq:P262 ?role } OPTIONAL { ?s wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?s wdt:P98 ?d }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?prop ?propLabel ?s ?sLabel ?roleLabel`;
const Q_COLLAB = (p) => `SELECT ?o ?oLabel (GROUP_CONCAT(DISTINCT STR(?proj);separator="|") AS ?projects) (SAMPLE(?isEng) AS ?engineer) WHERE { { wd:${p} wdt:P278 ?o } UNION { ?o wdt:P278 wd:${p} } OPTIONAL { ?o wdt:P11 ?proj } OPTIONAL { ?card wdt:P1 wd:Q28613; wdt:P77 ?o. BIND(true AS ?isEng) } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?o ?oLabel ORDER BY ?oLabel`;
const Q_CARD = (p) => `SELECT ?card ?cardLabel (GROUP_CONCAT(DISTINCT ?file;separator="|") AS ?files) WHERE { ?card wdt:P1 wd:Q28613; wdt:P77 wd:${p}. OPTIONAL { ?card wdt:P200 ?file } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?card ?cardLabel`;
const Q_MENTIONS = (p) => `SELECT ?block ?text ?doc ?docLabel ?date WHERE { ?block wdt:P21 wd:${p}; wdt:P24 ?doc. OPTIONAL { ?block wdt:P19 ?text } OPTIONAL { ?doc wdt:P98 ?date } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY ?date LIMIT 60`;

async function search(prefix) {
  const params = { text: $('q').value.trim(), proj: $('proj').value, occ: $('occ').value, pic: $('pic').checked, prefix };
  if (!params.text && !params.proj && !params.occ && !params.pic && !prefix) { $('results').replaceChildren(); $('rcount').textContent = ''; return; }
  setHash({ q: params.text, proj: params.proj, occ: params.occ, pic: params.pic ? 1 : '', a: prefix });
  $('results').replaceChildren(h('div', { class: 'loading' }, 'Searching persons')); $('rcount').textContent = '';
  setStatus('searching');
  try { const rows = await query(Q_SEARCH(params));
    $('rcount').textContent = `${rows.length}${rows.length === 300 ? '+' : ''} persons`; setStatus(`${rows.length} results`);
    $('results').replaceChildren(...rows.map(r => h('a', { class: 'person', href: '#person=' + r.p }, r.thumb ? h('img', { class: 'thumb', src: r.thumb, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb' }), h('span', { style: 'min-width:0' }, h('span', { class: 'nm' }, r.pLabel), h('span', { class: 'sub' }, [r.occs, r.desc].filter(Boolean).join(' · ').slice(0, 90)), h('span', { class: 'sub' }, ...projectTags(r.projects).map(t => [badge(t), ' ']))))));
    if (!rows.length) $('results').replaceChildren(h('p', { class: 'muted' }, 'No one matches.'));
  } catch (err) { setStatus('query failed', true); $('results').replaceChildren(errorBox(err)); }
}
$('go').onclick = () => search(); $('q').addEventListener('keydown', ev => { if (ev.key === 'Enter') search(); });
for (const id of ['proj', 'occ', 'pic']) $(id).addEventListener('change', () => search());
$('alpha').replaceChildren(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L => h('button', { onclick: () => { $('q').value = ''; search(L); } }, L)));

function mode(m) { $('search-mode').hidden = m !== 'search'; $('profile-mode').hidden = m !== 'profile'; }
const section = (title, items, count) => items.length ? h('div', { class: 'sec' }, h('h3', {}, title, h('span', { class: 'count' }, count ?? items.length)), h('ul', {}, ...items)) : null;
const link = (q, label, cls) => cls === 'person' ? h('a', { href: '#person=' + q }, label) : qlink(q, label);

async function openPerson(p) {
  mode('profile'); setHash({ person: p }); const el = $('profile'); el.replaceChildren(h('div', { class: 'loading' }, 'Assembling profile from four projects')); setStatus('loading ' + p);
  try {
    const [[b], out, inc, collab, cards, mentions] = await Promise.all([query(Q_BASIC(p)), query(Q_OUT(p)), query(Q_IN(p)), query(Q_COLLAB(p)), query(Q_CARD(p)), query(Q_MENTIONS(p))]);
    const tags = projectTags(b.projects); document.title = b.pLabel + " · Who's Who";
    const groupOut = new Map(); for (const r of out) { const k = r.propLabel; if (!groupOut.has(k)) groupOut.set(k, []); groupOut.get(k).push(r); }
    const groupIn = new Map(); for (const r of inc) { const k = r.propLabel; if (!groupIn.has(k)) groupIn.set(k, []); groupIn.get(k).push(r); }
    const li = (q, label, cls, role, date) => h('li', {}, link(q, label, cls), role ? [' ', h('span', { class: 'badge role' }, role)] : null, cls && cls !== 'person' ? h('span', { class: 'muted small' }, ' ' + cls) : null, date ? h('span', { class: 'mono muted small' }, ' ' + day(date)) : null);
    const outSecs = [...groupOut].map(([k, rows]) => section(k, rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.oLabel.localeCompare(b.oLabel)).map(r => li(r.o, r.oLabel, r.cls, r.roleLabel, r.date))));
    const inSecs = [...groupIn].map(([k, rows]) => section(k + ' ←', rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.sLabel.localeCompare(b.sLabel)).map(r => li(r.s, r.sLabel, r.cls, r.roleLabel, r.date))));
    const refs = inc.filter(r => r.propLabel === 'author');
    const card = cards[0]; const files = card ? (card.files || '').split('|').filter(Boolean) : [];
    el.replaceChildren(
      h('p', { class: 'small' }, h('a', { href: '#', onclick: ev => { ev.preventDefault(); mode('search'); setHash({}); } }, '← Search')),
      h('div', { class: 'hero' }, b.thumb ? h('img', { src: b.thumb, alt: '' }) : null, h('div', { style: 'min-width:0;flex:1' },
        h('div', { class: 'eyebrow' }, [b.occs, b.fields].filter(Boolean).join(' · ') || 'person'), h('h1', {}, b.pLabel), b.aliases ? h('div', { class: 'muted small' }, 'also ' + b.aliases) : null, b.desc ? h('p', {}, b.desc) : null,
        h('div', { class: 'sources' }, ...tags.map(badge), qlink(p, 'Wikibase item'),
          b.wikidata ? h('a', { href: wikidataUrl(b.wikidata), target: '_blank', rel: 'noopener' }, 'Wikidata ' + b.wikidata) : h('span', { class: 'off' }, 'no Wikidata link'),
          b.datascape ? h('a', { href: datascapeUrl(b.datascape), target: '_blank', rel: 'noopener' }, 'Datascape ' + b.datascape + ' ↗') : h('span', { class: 'off' }, 'not in Datascape'),
          card ? h('a', { href: '../matchmaker/#card=' + p }, 'Engineer card ↗') : h('span', { class: 'off' }, 'no engineer card'),
          mentions.length ? h('a', { href: '../reader/#entity=' + p }, `${mentions.length}${mentions.length === 60 ? '+' : ''} passages ↗`) : h('span', { class: 'off' }, 'not mentioned in any passage')),
        h('dl', { class: 'kv' }, b.citizenship ? [h('dt', {}, 'Citizenship'), h('dd', {}, b.citizenship)] : null, b.birthplace ? [h('dt', {}, 'Born'), h('dd', {}, b.birthplace)] : null, b.addresses ? [h('dt', {}, 'Address'), h('dd', { class: 'mono small' }, b.addresses)] : null))),
      files.length ? h('div', { class: 'grid' }, ...files.map(f => h('a', { href: '../matchmaker/#card=' + p }, h('img', { class: 'card-scan', src: f, alt: 'Card scan', loading: 'lazy' })))) : null,
      h('div', { class: 'profile' },
        h('div', {}, ...outSecs, section('Proposed collaborators', collab.map(r => h('li', {}, link(r.o, r.oLabel, 'person'), ' ', r.engineer ? h('span', { class: 'badge enc' }, 'engineer card') : null, ' ', ...projectTags(r.projects).filter(t => t !== 'enc').map(t => [badge(t), ' ']))))),
        h('div', {}, ...inSecs, section('Mentioned in passages', mentions.map(m => h('li', {}, h('a', { href: '../reader/#doc=' + m.doc }, m.docLabel), m.date ? h('span', { class: 'mono muted small' }, ' ' + day(m.date)) : null, h('div', { class: 'small muted' }, (m.text || '').slice(0, 220) + ((m.text || '').length > 220 ? '…' : '')))), mentions.length + (mentions.length === 60 ? '+' : '')))),
      (!out.length && !inc.length && !collab.length && !mentions.length) ? h('div', { class: 'msg' }, 'This person is a stub: a name and a pointer, with no links in any direction. Most such records came from the Datascape import.') : null);
    setStatus(`${out.length} outgoing · ${inc.length} incoming statements`);
  } catch (err) { setStatus('query failed', true); el.replaceChildren(errorBox(err)); }
}
function route() { const hs = getHash(); if (hs.person) openPerson(hs.person); else { mode('search'); if (hs.q) $('q').value = hs.q; if (hs.proj) $('proj').value = hs.proj; if (hs.occ) $('occ').value = hs.occ; if (hs.pic) $('pic').checked = true; if (hs.q || hs.proj || hs.occ || hs.pic || hs.a) search(hs.a || ''); } }
window.addEventListener('hashchange', route);
route();
