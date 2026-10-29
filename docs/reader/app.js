import { query, h, qlink, badge, setStatus, errorBox, fmt, getHash, setHash, topbar, footer, day, short, projectTags, esc } from '../shared/sparql.js';
document.getElementById('top').replaceWith(topbar('reader'));
document.getElementById('foot').replaceWith(footer());
const $ = id => document.getElementById(id);

const Q_DOCS = `SELECT ?doc ?docLabel ?date (SAMPLE(?clsLabel) AS ?cls) (COUNT(DISTINCT ?block) AS ?blocks) (GROUP_CONCAT(DISTINCT STR(?proj);separator="|") AS ?projects) (SAMPLE(?file) AS ?file) WHERE {
  ?block wdt:P24 ?doc; wdt:P11 ?proj. VALUES ?proj { wd:Q19104 wd:Q28603 }
  OPTIONAL { ?doc wdt:P98 ?date } OPTIONAL { ?doc wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?doc wdt:P200 ?file }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?doc ?docLabel ?date`;
const Q_DOC = (doc) => `SELECT ?doc ?docLabel ?desc ?date ?citation ?creditLine (GROUP_CONCAT(DISTINCT ?file;separator="|") AS ?files) (GROUP_CONCAT(DISTINCT CONCAT(STR(?creator),"~",?creatorLabel);separator="|") AS ?creators) (GROUP_CONCAT(DISTINCT CONCAT(STR(?subj),"~",?subjLabel);separator="|") AS ?subjects) (SAMPLE(?collLabel) AS ?coll) (SAMPLE(?rrfa) AS ?rrfa) (SAMPLE(?fmtLabel) AS ?format) (SAMPLE(?extent) AS ?extent) WHERE {
  BIND(wd:${doc} AS ?doc) OPTIONAL { ?doc schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?doc wdt:P98 ?date } OPTIONAL { ?doc wdt:P147 ?citation } OPTIONAL { ?doc wdt:P136 ?creditLine }
  OPTIONAL { ?doc wdt:P200 ?file } OPTIONAL { ?doc wdt:P74 ?creator. ?creator rdfs:label ?creatorLabel FILTER(LANG(?creatorLabel)="en") } OPTIONAL { ?doc wdt:P77 ?subj. ?subj rdfs:label ?subjLabel FILTER(LANG(?subjLabel)="en") }
  OPTIONAL { ?doc wdt:P138 ?coll. ?coll rdfs:label ?collLabel FILTER(LANG(?collLabel)="en") } OPTIONAL { ?doc wdt:P73 ?rrfa } OPTIONAL { ?doc wdt:P191 ?fmt. ?fmt rdfs:label ?fmtLabel FILTER(LANG(?fmtLabel)="en") } OPTIONAL { ?doc wdt:P266 ?extent }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?doc ?docLabel ?desc ?date ?citation ?creditLine`;
const Q_BLOCKS = (doc) => `SELECT ?block ?id ?text (GROUP_CONCAT(DISTINCT CONCAT(STR(?ent),"~",?entLabel);separator="|") AS ?ents) WHERE {
  ?block wdt:P24 wd:${doc}; wdt:P17 ?id. OPTIONAL { ?block wdt:P19 ?text } OPTIONAL { ?block wdt:P21 ?ent. ?ent rdfs:label ?entLabel FILTER(LANG(?entLabel)="en") } } GROUP BY ?block ?id ?text ORDER BY xsd:integer(?id)`;
const Q_CLAIMS = (block) => `SELECT ?s ?sLabel ?pLabel ?o ?oLabel WHERE { ?ref pr:P26 wd:${block}. ?st prov:wasDerivedFrom ?ref. ?s ?pp ?st. ?p wikibase:claim ?pp; wikibase:statementProperty ?pps. ?st ?pps ?o. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
const Q_ESEARCH = (text) => `SELECT ?e ?eLabel ?desc (SAMPLE(?clsLabel) AS ?cls) (COUNT(DISTINCT ?b) AS ?n) WHERE { ?e rdfs:label ?eLabel. FILTER(LANG(?eLabel)="en") FILTER(CONTAINS(LCASE(?eLabel), "${text.toLowerCase().replace(/["\\]/g, '')}")) ?b wdt:P21 ?e. OPTIONAL { ?e schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?e wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } } GROUP BY ?e ?eLabel ?desc ORDER BY DESC(?n) LIMIT 40`;
const Q_EMENTIONS = (e) => `SELECT ?block ?id ?text ?doc ?docLabel ?date (SAMPLE(?clsLabel) AS ?cls) (GROUP_CONCAT(DISTINCT CONCAT(STR(?ent),"~",?entLabel);separator="|") AS ?ents) WHERE {
  ?block wdt:P21 wd:${e}; wdt:P24 ?doc. OPTIONAL { ?block wdt:P17 ?id } OPTIONAL { ?block wdt:P19 ?text } OPTIONAL { ?doc wdt:P98 ?date } OPTIONAL { ?doc wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") }
  OPTIONAL { ?block wdt:P21 ?ent. ?ent rdfs:label ?entLabel FILTER(LANG(?entLabel)="en") } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?block ?id ?text ?doc ?docLabel ?date ORDER BY ?date ?docLabel xsd:integer(?id)`;
const Q_ENTITY = (e) => `SELECT ?eLabel ?desc (SAMPLE(?clsLabel) AS ?cls) (SAMPLE(?thumb) AS ?thumb) (GROUP_CONCAT(DISTINCT STR(?proj);separator="|") AS ?projects) WHERE { BIND(wd:${e} AS ?e) OPTIONAL { ?e schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?e wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?e wdt:P3 ?thumb } OPTIONAL { ?e wdt:P11 ?proj } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?eLabel ?desc`;

const pairs = s => (s || '').split('|').filter(Boolean).map(x => { const [q, l] = x.split('~'); return { q: short(q), label: l || short(q) }; });
let docs = [], selected = null;

/* Link entity mentions inside a passage by label matching (longest labels first; surname fallback for persons). */
const ACC = { a: 'aàáâäãåā', e: 'eèéêëē', i: 'iìíîïī', o: 'oòóôöõøō', u: 'uùúûüū', c: 'cç', n: 'nñ', y: 'yÿ', s: 'sß' };
/* Regex source for a label that tolerates accents and runs of whitespace, so "Klüver" matches "Kluver" in OCR text. */
function fuzzy(label) { return [...label].map(ch => { const l = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); if (ACC[l]) return '[' + ACC[l] + ACC[l].toUpperCase() + ']'; if (/\s/.test(ch)) return '\\s+'; return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('').replace(/(\\s\+)+/g, '\\s+'); }
function linkText(text, ents) {
  if (!text) return h('div', { class: 'passage muted' }, '(no transcription)');
  const cands = [];
  for (const e of ents) { if (!e.label) continue; cands.push({ q: e.q, s: e.label });
    const parts = e.label.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/\s+/); if (parts.length > 1 && parts.at(-1).length > 3) cands.push({ q: e.q, s: parts.at(-1) }); }
  cands.sort((a, b) => b.s.length - a.s.length);
  let html = esc(text.replace(/&amp;/g, '&').replace(/&quot;/g, '"')); const used = new Set();
  for (const c of cands) { if (used.has(c.q)) continue; const re = new RegExp('(^|[^\\w>])(' + fuzzy(c.s) + ')(?![\\w<])', 'i');
    if (re.test(html)) { html = html.replace(re, (m, pre, hit) => `${pre}<a class="ent" href="#entity=${c.q}" data-q="${c.q}">${hit}</a>`); used.add(c.q); } }
  const el = h('div', { class: 'passage', html });
  el.querySelectorAll('a.ent').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); openEntity(a.dataset.q); }));
  return el;
}
function entChips(ents, skip) { return h('div', { class: 'ents' }, ...ents.filter(e => e.q !== skip).map(e => h('a', { href: '#entity=' + e.q, onclick: ev => { ev.preventDefault(); openEntity(e.q); } }, e.label))); }

async function load() {
  setStatus('loading document list');
  try {
    docs = (await query(Q_DOCS)).map(r => ({ ...r, projects: projectTags(r.projects), cls: r.cls || 'document', blocks: +r.blocks, d: day(r.date) }));
    const clsCounts = new Map(); for (const d of docs) clsCounts.set(d.cls, (clsCounts.get(d.cls) || 0) + 1);
    for (const [c, n] of [...clsCounts].sort((a, b) => b[1] - a[1])) $('cls').append(h('option', { value: c }, `${c} (${n})`));
    setStatus(`${fmt(docs.length)} documents · ${fmt(docs.reduce((n, d) => n + d.blocks, 0))} passages`);
    render();
    route();
  } catch (err) { setStatus('query failed', true); $('detail').replaceChildren(errorBox(err)); }
}
function filtered() {
  const q = $('q').value.trim().toLowerCase(), proj = $('proj').value, cls = $('cls').value, sort = $('sort').value;
  const list = docs.filter(d => (!proj || d.projects.includes(proj)) && (!cls || d.cls === cls) && (!q || `${d.docLabel} ${d.cls} ${d.d}`.toLowerCase().includes(q)));
  if (sort === 'date') list.sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999') || a.docLabel.localeCompare(b.docLabel));
  else if (sort === 'blocks') list.sort((a, b) => b.blocks - a.blocks);
  else list.sort((a, b) => a.cls.localeCompare(b.cls) || a.docLabel.localeCompare(b.docLabel));
  return list;
}
function render() {
  const list = filtered(); $('listcount').textContent = `${fmt(list.length)} documents`;
  const items = []; let grp = null;
  for (const d of list) { if ($('sort').value === 'type' && d.cls !== grp) { grp = d.cls; items.push(h('li', { class: 'grp' }, grp)); }
    items.push(h('li', { role: 'option', 'data-q': d.doc, 'aria-selected': d.doc === selected ? 'true' : 'false', onclick: () => openDoc(d.doc) }, d.docLabel, h('span', { class: 'sub' }, [$('sort').value === 'type' ? null : d.cls, d.d, `${d.blocks} passage${d.blocks > 1 ? 's' : ''}`].filter(Boolean).join(' · ')))); }
  $('list').replaceChildren(...items);
}
for (const id of ['q', 'proj', 'cls', 'sort']) $(id).addEventListener('input', render);

async function openDoc(doc) {
  mode('docs'); selected = doc; setHash({ doc }); render();
  document.querySelector(`#list li[data-q="${doc}"]`)?.scrollIntoView({ block: 'nearest' });
  const d = $('detail'); d.replaceChildren(h('div', { class: 'loading' }, 'Loading document'));
  try {
    const [[meta], blocks] = await Promise.all([query(Q_DOC(doc)), query(Q_BLOCKS(doc))]);
    const files = (meta.files || '').split('|').filter(Boolean), creators = pairs(meta.creators), subjects = pairs(meta.subjects);
    const info = docs.find(x => x.doc === doc) || {};
    d.replaceChildren(
      h('div', { class: 'eyebrow' }, [info.cls, meta.rrfa ? 'R.R.F.A. ' + meta.rrfa : null, day(meta.date)].filter(Boolean).join(' · '), ' ', ...(info.projects || []).map(badge)),
      h('h2', { style: 'margin:4px 0 6px' }, qlink(doc, meta.docLabel)),
      meta.desc ? h('p', {}, meta.desc) : null,
      h('dl', { class: 'kv' },
        creators.length ? h('dt', {}, 'Creator') : null, creators.length ? h('dd', {}, ...creators.flatMap((c, i) => [i ? ', ' : '', h('a', { href: '#entity=' + c.q, onclick: ev => { ev.preventDefault(); openEntity(c.q); } }, c.label)])) : null,
        subjects.length ? h('dt', {}, 'Main subject') : null, subjects.length ? h('dd', {}, ...subjects.flatMap((c, i) => [i ? ', ' : '', h('a', { href: '#entity=' + c.q, onclick: ev => { ev.preventDefault(); openEntity(c.q); } }, c.label)])) : null,
        meta.coll ? h('dt', {}, 'Collection') : null, meta.coll ? h('dd', {}, meta.coll) : null,
        meta.format || meta.extent ? h('dt', {}, 'Format') : null, meta.format || meta.extent ? h('dd', {}, [meta.format, meta.extent].filter(Boolean).join(' · ')) : null,
        meta.citation ? h('dt', {}, 'Citation') : null, meta.citation ? h('dd', { class: 'small' }, meta.citation) : null),
      h('div', { class: 'reader' },
        h('div', {}, ...blocks.map(b => { const ents = pairs(b.ents); return h('div', { class: 'block' }, h('div', { class: 'bid' }, `passage ${b.id} · ${b.block}`), linkText(b.text, ents), entChips(ents),
          h('details', { class: 'small', ontoggle: ev => { if (ev.target.open && !ev.target.dataset.loaded) { ev.target.dataset.loaded = 1; loadClaims(b.block, ev.target.querySelector('div')); } } }, h('summary', {}, 'Facts extracted from this passage'), h('div', {}, h('div', { class: 'loading' }, 'Loading')))); })),
        h('div', { class: 'scan' }, ...files.map(f => h('a', { href: f, target: '_blank', rel: 'noopener' }, h('img', { src: f, alt: 'Scan', loading: 'lazy' }))), files.length ? null : h('p', { class: 'muted small' }, 'No scan linked.'))));
  } catch (err) { d.replaceChildren(errorBox(err)); }
}
async function loadClaims(block, el) {
  try { const rows = await query(Q_CLAIMS(block));
    el.replaceChildren(rows.length ? h('ul', { class: 'claims list' }, ...rows.map(r => h('li', {}, qlink(r.s, r.sLabel), ' ', h('span', { class: 'mono muted' }, r.pLabel), ' ', /^Q\d+$/.test(r.o) ? qlink(r.o, r.oLabel) : h('span', {}, r.oLabel || r.o)))) : h('p', { class: 'muted' }, 'No statements cite this passage as their reference.'));
  } catch (e) { el.replaceChildren(h('p', { class: 'muted' }, 'Could not load.')); }
}

/* ---------- entity mode ---------- */
function mode(m) { const docsOn = m === 'docs'; $('docs-mode').hidden = !docsOn; $('entity-mode').hidden = docsOn; $('mode-docs').setAttribute('aria-pressed', docsOn); $('mode-entity').setAttribute('aria-pressed', !docsOn); }
$('mode-docs').onclick = () => { mode('docs'); setHash(selected ? { doc: selected } : {}); };
$('mode-entity').onclick = () => { mode('entity'); setHash({ find: '' }); };
$('esearch').onclick = esearch; $('eq').addEventListener('keydown', ev => { if (ev.key === 'Enter') esearch(); });
async function esearch() {
  const t = $('eq').value.trim(); if (t.length < 2) return; setHash({ find: t });
  $('eresults').replaceChildren(h('div', { class: 'loading' }, 'Searching entities mentioned in passages'));
  try { const rows = await query(Q_ESEARCH(t));
    $('eresults').replaceChildren(rows.length ? h('ul', { class: 'list entlist' }, ...rows.map(r => h('li', {}, h('a', { href: '#entity=' + r.e, onclick: ev => { ev.preventDefault(); openEntity(r.e); } }, r.eLabel), ' ', h('span', { class: 'muted small' }, [r.cls, r.desc].filter(Boolean).join(' · ')), ' ', h('span', { class: 'count' }, `${r.n} passage${r.n > 1 ? 's' : ''}`)))) : h('p', { class: 'muted' }, 'No entity with that name is mentioned in any passage.'));
  } catch (err) { $('eresults').replaceChildren(errorBox(err)); }
}
async function openEntity(e) {
  mode('entity'); setHash({ entity: e }); $('eresults').replaceChildren();
  const d = $('edetail'); d.replaceChildren(h('div', { class: 'loading' }, 'Loading passages'));
  try { const [[meta], rows] = await Promise.all([query(Q_ENTITY(e)), query(Q_EMENTIONS(e))]);
    const byDoc = new Map(); for (const r of rows) { if (!byDoc.has(r.doc)) byDoc.set(r.doc, { label: r.docLabel, date: day(r.date), cls: r.cls, blocks: [] }); byDoc.get(r.doc).blocks.push(r); }
    const tags = projectTags(meta?.projects);
    d.replaceChildren(
      h('div', { class: 'row' }, meta?.thumb ? h('img', { class: 'thumb lg', src: meta.thumb, alt: '' }) : null, h('div', {}, h('div', { class: 'eyebrow' }, meta?.cls || 'entity', ' ', ...tags.map(badge)), h('h2', { style: 'margin:4px 0' }, qlink(e, meta?.eLabel || e)), meta?.desc ? h('p', { class: 'muted' }, meta.desc) : null,
        h('p', { class: 'small' }, meta?.cls === 'person' ? h('a', { href: '../whos-who/#person=' + e }, 'Open profile in Who\'s Who →') : null))),
      h('h3', {}, `${fmt(rows.length)} passages in ${byDoc.size} documents`),
      ...[...byDoc].map(([doc, g]) => h('div', { class: 'panel', style: 'margin-bottom:14px' }, h('div', { class: 'eyebrow' }, [g.cls, g.date].filter(Boolean).join(' · ')), h('h3', { style: 'margin:2px 0 8px' }, h('a', { href: '#doc=' + doc, onclick: ev => { ev.preventDefault(); openDoc(doc); } }, g.label)),
        ...g.blocks.map(b => { const ents = pairs(b.ents); return h('div', { class: 'block' }, linkText(b.text, ents), entChips(ents, e)); }))));
  } catch (err) { d.replaceChildren(errorBox(err)); }
}
function route() { const hs = getHash(); if (hs.doc) openDoc(hs.doc); else if (hs.entity) openEntity(hs.entity); else if (hs.find !== undefined) { mode('entity'); if (hs.find) { $('eq').value = hs.find; esearch(); } } else $('detail').replaceChildren(h('p', { class: 'muted' }, 'Select a document on the left.')); }
window.addEventListener('hashchange', () => { const hs = getHash(); if (hs.doc && hs.doc !== selected) openDoc(hs.doc); else if (hs.entity) openEntity(hs.entity); });
load();
