import { query, h, qlink, badge, setStatus, errorBox, fmt, getHash, setHash, topbar, footer, short, isQ, projectTags } from '../shared/sparql.js';

document.getElementById('top').replaceWith(topbar('matchmaker'));
document.getElementById('foot').replaceWith(footer());

const Q_CARDS = `SELECT ?card ?cardLabel ?localId ?desc ?eng ?engLabel ?engDesc
  (GROUP_CONCAT(DISTINCT ?file;separator="|") AS ?files)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?emp),"~",?empLabel);separator="|") AS ?emps)
  (GROUP_CONCAT(DISTINCT ?addr;separator="|") AS ?addrs)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?fow),"~",?fowLabel);separator="|") AS ?fows)
  (GROUP_CONCAT(DISTINCT STR(?proj);separator="|") AS ?projects)
  (SAMPLE(?thumb) AS ?thumb) (SAMPLE(?wd) AS ?wikidata)
WHERE {
  ?card wdt:P1 wd:Q28613; wdt:P77 ?eng.
  OPTIONAL { ?card wdt:P17 ?localId } OPTIONAL { ?card wdt:P130 ?desc }
  OPTIONAL { ?card wdt:P200 ?file }
  OPTIONAL { ?eng wdt:P110 ?emp. ?emp rdfs:label ?empLabel FILTER(LANG(?empLabel)="en") }
  OPTIONAL { ?eng wdt:P152 ?addr }
  OPTIONAL { ?eng wdt:P202 ?fow. ?fow rdfs:label ?fowLabel FILTER(LANG(?fowLabel)="en") }
  OPTIONAL { ?eng wdt:P11 ?proj } OPTIONAL { ?eng wdt:P3 ?thumb } OPTIONAL { ?eng wdt:P8 ?wd }
  OPTIONAL { ?eng schema:description ?engDesc FILTER(LANG(?engDesc)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?card ?cardLabel ?localId ?desc ?eng ?engLabel ?engDesc`;

const Q_EDGES = `SELECT ?a ?aLabel ?b ?bLabel (GROUP_CONCAT(DISTINCT STR(?bp);separator="|") AS ?bprojects) (SAMPLE(?occLabel) AS ?occ) WHERE {
  ?a wdt:P278 ?b. ?a wdt:P11 wd:Q28603.
  OPTIONAL { ?b wdt:P11 ?bp } OPTIONAL { ?b wdt:P44 ?occ. ?occ rdfs:label ?occLabel FILTER(LANG(?occLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?a ?aLabel ?b ?bLabel`;

const Q_BLOCKS = (card) => `SELECT ?block ?id ?text WHERE { ?block wdt:P24 wd:${card}; wdt:P17 ?id; wdt:P19 ?text } ORDER BY xsd:integer(?id)`;

const splitPairs = s => (s || '').split('|').filter(Boolean).map(x => { const [q, l] = x.split('~'); return { q: short(q), label: l || short(q) }; });
const region = addr => {
  const a = addr || '';
  if (/\b(Brooklyn|Bronx|Queens|Staten|Flushing|Jamaica,? N|Astoria|Long Island City)\b/i.test(a)) return 'NYC outer boroughs';
  if (/\b(New York|N\.?\s?Y\.?C?\b|Manhattan|NYC)/i.test(a) && !/\b(L\.?\s?I\.?|Long Island|Westchester|Rochester|Buffalo|Syracuse|Ithaca|Yorktown|Ossining|Scarsdale|White Plains)\b/i.test(a)) return 'New York City';
  if (/\b(L\.?\s?I\.?|Long Island|Hempstead|Huntington|Bethpage|Stony Brook|Garden City|Roslyn|Great Neck|Port Washington|Syosset|Mineola|Plainview|Farmingdale|Hicksville)\b/i.test(a)) return 'Long Island';
  if (/\b(N\.?\s?J\.?|New Jersey|Murray Hill|Berkeley Heights|Princeton|Newark|Hoboken|Summit)\b/i.test(a)) return 'New Jersey';
  if (/\b(Conn\.?|Connecticut|CT)\b/i.test(a)) return 'Connecticut';
  if (/\b(Mass\.?|Massachusetts|Cambridge|Boston|MA)\b/i.test(a)) return 'Massachusetts';
  if (/\b(Pa\.?|Penn|Philadelphia|Phila|Pittsburgh)\b/i.test(a)) return 'Pennsylvania';
  if (/\b(Calif\.?|California|CA|Los Angeles|San Francisco|Berkeley|Palo Alto|Stanford)\b/i.test(a)) return 'California';
  if (/\b(Westchester|Yorktown|Ossining|Scarsdale|White Plains|Rochester|Buffalo|Syracuse|Ithaca|Schenectady)\b/i.test(a)) return 'Upstate NY';
  if (!a) return 'No address';
  return 'Elsewhere';
};

let cards = [], edges = [], byEng = new Map(), artistsByEng = new Map(), engsByArtist = new Map(), artistInfo = new Map();
const $ = id => document.getElementById(id);

async function load() {
  setStatus('loading cards and pairings');
  try {
    const [c, e] = await Promise.all([query(Q_CARDS), query(Q_EDGES)]);
    cards = c.map(r => ({ ...r, files: (r.files || '').split('|').filter(Boolean), emps: splitPairs(r.emps), fows: splitPairs(r.fows), addrs: (r.addrs || '').split('|').filter(Boolean), projects: projectTags(r.projects) }));
    cards.sort((a, b) => a.engLabel.localeCompare(b.engLabel));
    for (const r of cards) byEng.set(r.eng, r);
    edges = e;
    for (const r of edges) {
      if (!artistsByEng.has(r.a)) artistsByEng.set(r.a, []);
      artistsByEng.get(r.a).push(r.b);
      if (!engsByArtist.has(r.b)) engsByArtist.set(r.b, []);
      engsByArtist.get(r.b).push(r.a);
      artistInfo.set(r.b, { label: r.bLabel, projects: projectTags(r.bprojects), occ: r.occ });
    }
    // artists are the P278 targets of card subjects that are not card subjects themselves
    for (const r of cards) { const l = artistsByEng.get(r.eng) || []; r.artists = l.filter(q => !byEng.has(q)); }
    const artists = new Set(cards.flatMap(r => r.artists));
    const pairs = cards.reduce((n, r) => n + r.artists.length, 0);
    const artistsInKg = [...artists].filter(q => artistInfo.get(q)?.projects.includes('kg')).length;
    $('stats').replaceChildren(
      stat(cards.length, 'engineer cards'), stat(artists.size, 'artists named on backs'), stat(pairs, 'proposed pairings'),
      stat(cards.filter(r => r.projects.includes('kg')).length, 'engineers also in the Knowledge Graph'), stat(artistsInKg, 'artists also in the Knowledge Graph'));
    fillSelect('fow', cards.flatMap(r => r.fows.map(f => f.label)));
    fillSelect('emp', cards.flatMap(r => r.emps.map(f => f.label)));
    fillSelect('region', cards.map(r => region(r.addrs[0])));
    setStatus(`${fmt(cards.length)} cards · ${fmt(edges.length)} pairing statements`);
    render();
    const hs = getHash();
    if (hs.card && byEng.has(hs.card)) select(hs.card); else if (hs.card) { const c = cards.find(r => r.card === hs.card); if (c) select(c.eng); }
    else $('detail').replaceChildren(h('p', { class: 'muted' }, 'Select an engineer on the left.'));
    if (hs.view === 'graph') showGraph();
  } catch (err) { setStatus('query failed', true); $('detail').replaceChildren(errorBox(err)); }
}
function stat(n, label) { return h('span', {}, h('b', {}, fmt(n)), label); }
function fillSelect(id, values) {
  const counts = new Map(); for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  const sel = $(id); for (const [v, n] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) sel.append(h('option', { value: v }, `${v} (${n})`));
}
function filtered() {
  const q = $('q').value.trim().toLowerCase(), fow = $('fow').value, emp = $('emp').value, reg = $('region').value, sort = $('sort').value;
  let list = cards.filter(r => (!fow || r.fows.some(f => f.label === fow)) && (!emp || r.emps.some(f => f.label === emp)) && (!reg || region(r.addrs[0]) === reg)
    && (!q || [r.engLabel, r.desc, ...r.emps.map(f => f.label), ...r.fows.map(f => f.label), ...r.addrs, ...r.artists.map(a => artistInfo.get(a)?.label || '')].join(' ').toLowerCase().includes(q)));
  if (sort === 'artists') list.sort((a, b) => b.artists.length - a.artists.length || a.engLabel.localeCompare(b.engLabel));
  else if (sort === 'kg') list.sort((a, b) => (b.projects.includes('kg') - a.projects.includes('kg')) || a.engLabel.localeCompare(b.engLabel));
  else list.sort((a, b) => a.engLabel.localeCompare(b.engLabel));
  return list;
}
let selected = null;
function render() {
  const list = filtered();
  $('listcount').textContent = `${fmt(list.length)} of ${fmt(cards.length)} engineers`;
  $('list').replaceChildren(...list.map(r => h('li', { role: 'option', 'aria-selected': r.eng === selected ? 'true' : 'false', 'data-q': r.eng, onclick: () => select(r.eng) },
    h('span', {}, h('span', { class: 'name' }, r.engLabel), h('span', { class: 'sub' }, [r.emps[0]?.label, r.fows[0]?.label].filter(Boolean).join(' · ') || region(r.addrs[0]))),
    h('span', { class: 'count' }, r.artists.length ? `${r.artists.length} ↔` : ''))));
}
for (const id of ['q', 'fow', 'emp', 'region', 'sort']) $(id).addEventListener('input', render);

async function select(eng) {
  selected = eng; setHash({ card: eng }); render();
  document.querySelector(`#list li[data-q="${eng}"]`)?.scrollIntoView({ block: 'nearest' });
  const r = byEng.get(eng); const d = $('detail');
  const front = r.files.find(f => /_f\.(jpg|png)/i.test(f)), back = r.files.find(f => /_b\.(jpg|png)/i.test(f));
  const artistItems = r.artists.map(a => { const info = artistInfo.get(a) || {}; const others = (engsByArtist.get(a) || []).filter(x => x !== eng && byEng.has(x));
    return h('li', {}, qlink(a, info.label), ' ', info.projects?.includes('kg') ? h('a', { href: '../whos-who/#person=' + a, class: 'badge kg', title: 'Also in the Knowledge Graph: open profile' }, 'KG') : null,
      info.occ ? h('span', { class: 'muted small' }, ' ' + info.occ) : null,
      others.length ? h('span', { class: 'muted small' }, ` · also proposed to ${others.length} other engineer${others.length > 1 ? 's' : ''}: `, ...others.slice(0, 4).flatMap((o, i) => [i ? ', ' : '', h('a', { href: '#card=' + o, onclick: ev => { ev.preventDefault(); select(o); } }, byEng.get(o).engLabel)]), others.length > 4 ? ', …' : '') : null); });
  d.replaceChildren(
    h('div', { class: 'row' }, r.thumb ? h('img', { class: 'thumb lg', src: r.thumb, alt: '' }) : null,
      h('div', {}, h('div', { class: 'eyebrow' }, `Card ${r.localId || ''} · ${r.card}`), h('h2', { style: 'margin:4px 0' }, qlink(r.eng, r.engLabel)), r.engDesc ? h('p', { class: 'muted' }, r.engDesc) : null,
        h('p', {}, ...r.projects.map(t => [badge(t), ' ']), r.projects.includes('kg') ? h('a', { href: '../whos-who/#person=' + r.eng }, 'Open full profile →') : h('span', { class: 'muted small' }, 'This engineer exists only in the card file.')))),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Employer'), h('dd', {}, r.emps.length ? r.emps.flatMap((e, i) => [i ? ', ' : '', qlink(e.q, e.label)]) : '—'),
      h('dt', {}, 'Address'), h('dd', { class: 'mono' }, r.addrs.join(' / ') || '—'),
      h('dt', {}, 'Fields of work'), h('dd', {}, r.fows.length ? r.fows.flatMap((f, i) => [i ? ', ' : '', h('a', { href: '../technology/#term=' + f.q }, f.label)]) : '—'),
      r.wikidata ? h('dt', {}, 'Wikidata') : null, r.wikidata ? h('dd', {}, h('a', { href: 'https://www.wikidata.org/wiki/' + r.wikidata, target: '_blank', rel: 'noopener' }, r.wikidata)) : null),
    h('div', { class: 'scans' },
      front ? h('figure', {}, h('img', { class: 'card-scan', src: front, alt: 'Front of card', loading: 'lazy' }), h('figcaption', {}, 'Front: typed engineer record')) : null,
      back ? h('figure', {}, h('img', { class: 'card-scan', src: back, alt: 'Back of card', loading: 'lazy' }), h('figcaption', {}, 'Back: handwritten list of proposed artists')) : null),
    h('div', { id: 'blocks' }, h('div', { class: 'loading' }, 'Loading transcribed text')),
    h('h3', {}, `Proposed artists · ${r.artists.length}`),
    r.artists.length ? h('ul', { class: 'artists' }, ...artistItems) : h('p', { class: 'muted' }, 'No artists recorded on the back of this card.'),
    h('p', { class: 'small muted' }, 'Pairings come from ', h('span', { class: 'mono' }, 'P278 proposed collaborator'), ' statements, each referenced to the back-of-card text block. ', h('a', { href: '../reader/#doc=' + r.card }, 'Read this card in the archive reader →'), ' ', r.desc ? h('span', {}, r.desc) : null));
  try {
    const blocks = await query(Q_BLOCKS(r.card));
    $('blocks')?.replaceChildren(...blocks.map(b => h('div', { class: 'cardtext' }, h('span', { class: 'eyebrow' }, b.id === '0' ? 'front' : 'back'), '\n', b.text)));
  } catch (e) { $('blocks')?.replaceChildren(h('p', { class: 'muted small' }, 'Transcription unavailable.')); }
}

/* ---------- graph ---------- */
let graphBuilt = false;
$('tab-cards').onclick = () => { $('view-cards').hidden = false; $('view-graph').hidden = true; $('tab-cards').setAttribute('aria-pressed', 'true'); $('tab-graph').setAttribute('aria-pressed', 'false'); const hs = getHash(); delete hs.view; setHash(hs); };
$('tab-graph').onclick = showGraph;
function showGraph() {
  $('view-cards').hidden = true; $('view-graph').hidden = false; $('tab-cards').setAttribute('aria-pressed', 'false'); $('tab-graph').setAttribute('aria-pressed', 'true');
  setHash({ ...getHash(), view: 'graph' });
  if (graphBuilt || !cards.length) return; graphBuilt = true;
  const nodes = [], links = [], idx = new Map();
  for (const r of cards) { idx.set(r.eng, nodes.length); nodes.push({ id: r.eng, label: r.engLabel, type: 'eng', n: r.artists.length }); }
  for (const r of cards) for (const a of r.artists) {
    if (!idx.has(a)) { idx.set(a, nodes.length); const info = artistInfo.get(a) || {}; nodes.push({ id: a, label: info.label || a, type: info.projects?.includes('kg') ? 'artist-kg' : 'artist', n: (engsByArtist.get(a) || []).length }); }
    links.push({ source: r.eng, target: a });
  }
  const svg = d3.select('#graph'); const W = svg.node().clientWidth || 1000, H = svg.node().clientHeight || 600; svg.attr('viewBox', [0, 0, W, H]);
  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.2, 6]).on('zoom', ev => g.attr('transform', ev.transform)));
  const color = d => d.type === 'eng' ? 'var(--accent)' : d.type === 'artist-kg' ? 'var(--ok)' : 'var(--ink)';
  const sim = d3.forceSimulation(nodes).force('link', d3.forceLink(links).id(d => d.id).distance(28).strength(0.6)).force('charge', d3.forceManyBody().strength(-45)).force('center', d3.forceCenter(W / 2, H / 2)).force('collide', d3.forceCollide(d => 4 + Math.sqrt(d.n) * 1.6));
  const link = g.append('g').attr('stroke', 'currentColor').attr('stroke-opacity', 0.18).selectAll('line').data(links).join('line');
  const node = g.append('g').selectAll('circle').data(nodes).join('circle').attr('r', d => 3 + Math.sqrt(d.n) * 1.6).attr('fill', color).style('cursor', 'pointer')
    .call(d3.drag().on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; }).on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
    .on('click', (ev, d) => { if (d.type === 'eng') { $('tab-cards').click(); select(d.id); } else { const first = (engsByArtist.get(d.id) || []).find(x => byEng.has(x)); if (first) { $('tab-cards').click(); select(first); } } });
  node.append('title').text(d => `${d.label} · ${d.n} ${d.type === 'eng' ? 'artists proposed' : 'engineers proposed'}`);
  const label = g.append('g').selectAll('text').data(nodes.filter(d => d.n >= 8)).join('text').text(d => d.label).attr('dx', 8).attr('dy', 4);
  sim.on('tick', () => { link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y); node.attr('cx', d => d.x).attr('cy', d => d.y); label.attr('x', d => d.x).attr('y', d => d.y); });
}
window.addEventListener('hashchange', () => { const hs = getHash(); if (hs.card && hs.card !== selected && byEng.has(hs.card)) select(hs.card); });
load();
