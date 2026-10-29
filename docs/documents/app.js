import { query, h, qlink, setStatus, errorBox, fmt, getHash, setHash, topbar, footer, day, short, itemUrl, thumbUrl } from '../shared/sparql.js';
document.getElementById('top').replaceWith(topbar('documents'));
const $ = id => document.getElementById(id);

/* ---------- queries ---------- */
const DOC_CLASSES = 'wd:Q22310 wd:Q22365 wd:Q19091 wd:Q19089 wd:Q22649 wd:Q19069 wd:Q27063 wd:Q19090 wd:Q19096 wd:Q22652 wd:Q27062 wd:Q22651 wd:Q22655 wd:Q22301 wd:Q22335 wd:Q22653 wd:Q22654 wd:Q22648 wd:Q28954 wd:Q22647 wd:Q19086 wd:Q22646 wd:Q28952 wd:Q19094 wd:Q20638 wd:Q1960 wd:Q27420 wd:Q28955 wd:Q28945 wd:Q28943 wd:Q24678';
const Q_DOCS = `SELECT ?doc ?docLabel ?date ?desc (SAMPLE(?clsLabel) AS ?cls) (SAMPLE(?thumb) AS ?thumb) (GROUP_CONCAT(DISTINCT ?file;separator="|") AS ?files) (SAMPLE(?nb) AS ?blocks) WHERE {
  { SELECT DISTINCT ?doc WHERE { ?doc wdt:P11 wd:Q19104. { ?doc wdt:P73 ?rrfa } UNION { ?doc wdt:P1 ?dc. VALUES ?dc { ${DOC_CLASSES} } } UNION { ?b0 wdt:P24 ?doc } FILTER NOT EXISTS { ?doc wdt:P1 wd:Q28613 } FILTER NOT EXISTS { ?doc wdt:P1 wd:Q2013 } } }
  OPTIONAL { SELECT ?doc (COUNT(?b) AS ?nb) WHERE { ?b wdt:P24 ?doc } GROUP BY ?doc }
  OPTIONAL { ?doc wdt:P98 ?date } OPTIONAL { ?doc schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?doc wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") }
  OPTIONAL { ?doc wdt:P3 ?thumb } OPTIONAL { ?doc wdt:P200 ?file }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?doc ?docLabel ?date ?desc`;
const Q_EXPAND = (q) => `SELECT ?n ?nLabel ?rel ?dir (SAMPLE(?clsLabel) AS ?cls) (SAMPLE(?thumb) AS ?thumb) (SAMPLE(?file) AS ?file) (SAMPLE(?isDoc) AS ?isDoc) WHERE {
  { wd:${q} ?pd ?n. ?prop wikibase:directClaim ?pd; rdfs:label ?rel. FILTER(LANG(?rel)="en") FILTER(?pd NOT IN (wdt:P1, wdt:P11, wdt:P24, wdt:P21, wdt:P55, wdt:P199, wdt:P251, wdt:P54, wdt:P201)) BIND("out" AS ?dir) }
  UNION { ?n ?pd wd:${q}. ?prop wikibase:directClaim ?pd; rdfs:label ?rel. FILTER(LANG(?rel)="en") FILTER(?pd NOT IN (wdt:P1, wdt:P11, wdt:P24, wdt:P21, wdt:P55, wdt:P199, wdt:P251, wdt:P54, wdt:P201)) BIND("in" AS ?dir) }
  UNION { ?b wdt:P24 wd:${q}; wdt:P21 ?n. BIND("mentions" AS ?rel) BIND("out" AS ?dir) }
  UNION { ?b wdt:P21 wd:${q}; wdt:P24 ?n. BIND("mentions" AS ?rel) BIND("in" AS ?dir) }
  FILTER(ISIRI(?n)) FILTER(STRSTARTS(STR(?n), "http://base.semlab.io/entity/Q"))
  FILTER NOT EXISTS { ?n wdt:P1 wd:Q2013 } FILTER NOT EXISTS { ?n wdt:P1 wd:Q19063 } FILTER NOT EXISTS { ?n wdt:P1 wd:Q20664 } FILTER NOT EXISTS { ?n wdt:P1 wd:Q22531 } FILTER NOT EXISTS { ?n wdt:P1 wd:Q23571 }
  OPTIONAL { ?n wdt:P1 ?c. ?c rdfs:label ?clsLabel FILTER(LANG(?clsLabel)="en") } OPTIONAL { ?n wdt:P3 ?thumb } OPTIONAL { ?n wdt:P200 ?file }
  OPTIONAL { { ?n wdt:P73 ?rr } UNION { ?bb wdt:P24 ?n } UNION { ?n wdt:P1 ?dc. VALUES ?dc { ${DOC_CLASSES} wd:Q28613 } } BIND(true AS ?isDoc) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?n ?nLabel ?rel ?dir LIMIT 160`;
const Q_DOCENTS = `SELECT ?doc ?e WHERE {
  { SELECT DISTINCT ?doc WHERE { ?doc wdt:P11 wd:Q19104. { ?doc wdt:P73 ?rrfa } UNION { ?doc wdt:P1 ?dc. VALUES ?dc { ${DOC_CLASSES} } } UNION { ?b0 wdt:P24 ?doc } FILTER NOT EXISTS { ?doc wdt:P1 wd:Q28613 } FILTER NOT EXISTS { ?doc wdt:P1 wd:Q2013 } } }
  { ?b wdt:P24 ?doc; wdt:P21 ?e } UNION { ?doc ?pd ?e. VALUES ?pd { wdt:P77 wdt:P74 wdt:P75 wdt:P135 wdt:P78 wdt:P79 wdt:P125 wdt:P248 } } }`;
const Q_BLOCKS = (q) => `SELECT ?text WHERE { ?b wdt:P24 wd:${q}; wdt:P17 ?id; wdt:P19 ?text } ORDER BY xsd:integer(?id) LIMIT 3`;
const HUBS = new Set(['Q19263', 'Q24347', 'Q20512', 'Q19118', 'Q28614', 'Q19486', 'Q19157', 'Q19081', 'Q19082', 'Q22371', 'Q22387', 'Q22704', 'Q22705', 'Q19556', 'Q19180']); // E.A.T., TSP, bibliography, 9 Evenings, R.R.F.A. list, NYC, artist, engineer, musician

/* ---------- class → group/colour ---------- */
function group(cls, isDoc) {
  if (isDoc) return 'doc';
  const c = (cls || '').toLowerCase();
  if (c === 'person') return 'person';
  if (/organization|business|institution|museum|group|publisher|school|nonprofit|union|gallery|family|brand|collection/.test(c)) return 'org';
  if (/city|country|state|venue|place|borough|neighborhood|continent|island|studio|hotel|canal|air base/.test(c)) return 'place';
  if (/performance|artwork|sculpture|painting|event|exhibition|project|work|film|cinematic|musical|installation|concert|biennale|benefit|lecture|print|combine|happening/.test(c)) return 'work';
  if (/device|material|technology|component|phenomenon|instrument|prop|scenery|appliance|textile|plastic|foam|wood|metal|satellite|sensor|microphone|technique|color|signal|field of work|class/.test(c)) return 'tech';
  return 'other';
}
const COLORS = { person: 'var(--ink)', org: 'var(--ok)', place: '#9a6fb0', work: 'var(--accent)', tech: 'var(--warn)', other: 'var(--muted)', doc: 'var(--panel)' };

/* ---------- state ---------- */
let docs = new Map(); const nodes = []; const links = []; const byId = new Map(); const linkKey = new Set(); const expanded = new Set();
let active = null; let trail = []; let sim, svg, g, zoomBehaviour, hoverId = null; let docLinks = []; const docEnts = new Map();
const W = () => $('canvas').clientWidth, H = () => $('canvas').clientHeight;

function imageFor(urls) {
  for (const u of urls.filter(Boolean)) { if (/semlab\.s3|linkedjazz|rauschenbergfoundation\.org\/sites\/default\/files/.test(u)) return u; }
  return null;
}
function addNode(n) { if (byId.has(n.id)) return byId.get(n.id); n.x = n.x ?? W() / 2; n.y = n.y ?? H() / 2; nodes.push(n); byId.set(n.id, n); return n; }
function addLink(a, b, rel, kind) { const k = a < b ? a + '|' + b + '|' + rel : b + '|' + a + '|' + rel; if (linkKey.has(k)) return; linkKey.add(k); links.push({ source: a, target: b, rel, kind }); }

/* ---------- load ---------- */
async function load() {
  setStatus('loading documents');
  try {
    const [rows, extra] = await Promise.all([query(Q_DOCS), fetch('images.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
    for (const r of rows) {
      const files = (r.files || '').split('|').filter(Boolean);
      const d = { id: r.doc, label: r.docLabel, cls: r.cls || 'document', date: day(r.date), desc: r.desc, blocks: +(r.blocks || 0), img: imageFor([r.thumb, ...files]) || (typeof extra[r.doc] === 'string' ? extra[r.doc] : extra[r.doc]?.url) || null, imgNote: typeof extra[r.doc] === 'object' ? extra[r.doc]?.note : null, group: 'doc', floating: true };
      docs.set(d.id, d);
    }
    for (const d of docs.values()) addNode({ ...d, x: Math.random() * W(), y: Math.random() * H() });
    query(Q_DOCENTS).then(ents => { buildDocLinks(ents); sim.force('rel', d3.forceLink(docLinks).id(d => d.id).distance(l => 110 + (1 - l.w) * 110).strength(l => 0.1 + l.w * 0.5)); sim.alpha(0.8).restart(); draw(); }).catch(() => {});
    $('doclist').replaceChildren(...[...docs.values()].sort((a, b) => a.label.localeCompare(b.label)).map(d => h('option', { value: d.label })));
    setStatus(`${docs.size} documents`);
    initGraph();
    const hs = getHash(); if (hs.doc && docs.has(hs.doc)) select(hs.doc);
  } catch (err) { setStatus('query failed', true); $('panel').replaceChildren(errorBox(err)); }
}

/* Document-to-document relatedness: shared subjects, people, places and mentions, with common entities down-weighted. */
function buildDocLinks(rows) {
  docEnts.clear(); const df = new Map();
  for (const r of rows) { if (!docs.has(r.doc)) continue; if (!docEnts.has(r.doc)) docEnts.set(r.doc, new Set()); if (!docEnts.get(r.doc).has(r.e)) { docEnts.get(r.doc).add(r.e); df.set(r.e, (df.get(r.e) || 0) + 1); } }
  const N = docs.size; const wt = e => { const f = df.get(e) || 1; return f > N * 0.3 ? 0 : 1 / Math.sqrt(f); };
  const ids = [...docEnts.keys()]; const cand = new Map();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = docEnts.get(ids[i]), B = docEnts.get(ids[j]); let inter = 0, uni = 0;
    for (const e of A) { const w = wt(e); uni += w; if (B.has(e)) inter += w; } for (const e of B) if (!A.has(e)) uni += wt(e);
    const sim = uni ? inter / uni : 0; if (sim >= 0.12) { (cand.get(ids[i]) || cand.set(ids[i], []).get(ids[i])).push({ o: ids[j], sim }); (cand.get(ids[j]) || cand.set(ids[j], []).get(ids[j])).push({ o: ids[i], sim }); }
  }
  const keep = new Set(); docLinks = [];
  for (const [id, list] of cand) { list.sort((a, b) => b.sim - a.sim); for (const c of list.slice(0, 4)) { const k = id < c.o ? id + '|' + c.o : c.o + '|' + id; if (keep.has(k)) continue; keep.add(k); docLinks.push({ source: id, target: c.o, w: Math.min(1, c.sim * 2) }); } }
  for (const n of nodes) n.rel = 0; for (const l of docLinks) { byId.get(l.source).rel++; byId.get(l.target).rel++; }
}
/* ---------- drawing ---------- */
function initGraph() {
  svg = d3.select('#g'); g = svg.append('g');
  // field view: wheel zooms. tree view: wheel scrolls (a tree is tall), ctrl/cmd + wheel zooms
  zoomBehaviour = d3.zoom().scaleExtent([0.15, 5]).filter(ev => ev.type !== 'wheel' || !active || ev.ctrlKey || ev.metaKey).on('zoom', ev => g.attr('transform', ev.transform)); svg.call(zoomBehaviour);
  svg.on('wheel.pan', ev => { if (!active || ev.ctrlKey || ev.metaKey) return; ev.preventDefault(); svg.call(zoomBehaviour.translateBy, -ev.deltaX, -ev.deltaY); });
  g.append('g').attr('class', 'cross'); g.append('g').attr('class', 'links'); g.append('g').attr('class', 'elabels'); g.append('g').attr('class', 'nodes');
  // physics only for the idle field of floating documents
  sim = d3.forceSimulation(nodes).force('collide', d3.forceCollide(d => radius(d) * 1.5 + 18).iterations(2)).force('charge', d3.forceManyBody().strength(-120).distanceMax(320)).force('x', d3.forceX(() => W() / 2).strength(0.008)).force('y', d3.forceY(() => H() / 2).strength(0.03))
    .alphaDecay(0.03).velocityDecay(0.5).on('tick', () => { if (!active) positionNodes(); }).on('end', () => { if (!active) fitField(); });
  draw();
}
function drift() { for (const n of nodes) if (n.floating) { n.vx = (n.vx || 0) + (Math.random() - 0.5) * 0.8; n.vy = (n.vy || 0) + (Math.random() - 0.5) * 0.8; const pad = 40; if (n.x < pad) n.vx += 1; if (n.x > W() - pad) n.vx -= 1; if (n.y < pad) n.vy += 1; if (n.y > H() - pad) n.vy -= 1; } }
function radius(d) { if (d.group === 'doc') return active ? (d.id === active ? 60 : 24) : 26; return d.id === active ? 11 : 6; }
function docSize(d) { const r = radius(d); return [r * 2, r * 2.4]; }
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function draw() {
  const shown = active ? nodes.filter(n => n.tx !== undefined) : nodes.filter(n => n.floating);
  const nodeSel = g.select('.nodes').selectAll('g.node').data(shown, d => d.id).join(enter => {
    const ge = enter.append('g').attr('class', 'node');
    ge.filter(d => d.group === 'doc').each(function (d) { const el = d3.select(this);
      el.append('rect').attr('class', 'frame').attr('rx', 2); el.append('text').attr('class', 'doclabel');
      if (d.img) { el.append('clipPath').attr('id', 'clip-' + d.id).append('rect').attr('rx', 2); el.append('image').attr('href', thumbUrl(d.img)).attr('preserveAspectRatio', 'xMidYMid slice').attr('clip-path', `url(#clip-${d.id})`).on('error', function () { d.img = null; d3.select(this).remove(); paper(el, d); }); }
      else paper(el, d); });
    ge.filter(d => d.group !== 'doc' && d.group !== 'head').each(function (d) { const el = d3.select(this);
      if (d.img) { el.append('clipPath').attr('id', 'clip-' + d.id).append('circle'); el.append('image').attr('href', thumbUrl(d.img)).attr('preserveAspectRatio', 'xMidYMid slice').attr('clip-path', `url(#clip-${d.id})`).on('error', function () { d.img = null; d3.select(this).remove(); }); }
      el.append('circle').attr('class', 'dot').attr('fill', d.img ? 'none' : COLORS[d.group]).attr('stroke', COLORS[d.group]).attr('stroke-width', d.img ? 2 : 0);
      el.append('text').attr('class', 'nlabel'); });
    ge.filter(d => d.group === 'head').append('text').attr('class', 'head');
    ge.on('click', (ev, d) => { ev.stopPropagation(); if (d.group !== 'head') select(d.id); }).on('mouseenter', (ev, d) => { highlight(d); if (d.group !== 'head') showCard(d, ev); }).on('mouseleave', () => { highlight(null); hideCardSoon(); });
    return ge; });
  nodeSel.attr('class', d => 'node' + (d.floating && !active ? ' floating' : '') + (d.id === active ? ' active' : '') + (d.group === 'head' ? ' headnode' : ''));
  nodeSel.filter(d => d.group === 'doc').each(function (d) { const el = d3.select(this); const [w, hh] = docSize(d);
    el.select('.frame').attr('x', -w / 2).attr('y', -hh / 2).attr('width', w).attr('height', hh);
    el.select('clipPath rect').attr('x', -w / 2 + 2).attr('y', -hh / 2 + 2).attr('width', w - 4).attr('height', hh - 4);
    el.select('image').attr('x', -w / 2 + 2).attr('y', -hh / 2 + 2).attr('width', w - 4).attr('height', hh - 4);
    if (!el.select('.paper-title').empty()) layoutPaper(el, d);
    const lab = el.select('.doclabel'); if (active && d.id !== active) { lab.attr('x', w / 2 + 8).attr('y', 4).attr('text-anchor', 'start').text(trunc(d.label, 46)); } else if (active) { lab.attr('x', 0).attr('y', hh / 2 + 14).attr('text-anchor', 'middle').text(trunc(d.label, 40)); } else lab.text(''); });
  nodeSel.filter(d => d.group !== 'doc' && d.group !== 'head').each(function (d) { const el = d3.select(this); const r = radius(d);
    el.select('.dot').attr('r', r); el.select('clipPath circle').attr('r', r); el.select('image').attr('x', -r).attr('y', -r).attr('width', 2 * r).attr('height', 2 * r);
    el.select('.nlabel').attr('x', r + 7).attr('y', 4).attr('text-anchor', 'start').text(trunc(d.label, 40) + (d.more ? '  +' : '')); });
  nodeSel.filter(d => d.group === 'head').select('text.head').attr('x', 0).attr('y', 0).attr('text-anchor', 'start').text(d => d.label);
  g.select('.cross').selectAll('line.dlink').data(active ? [] : docLinks, l => (l.source.id || l.source) + '|' + (l.target.id || l.target)).join('line').attr('class', 'dlink');
  // tree links
  const tl = active ? links.filter(l => l.tree) : [];
  const path = d3.linkHorizontal().x(d => d.x).y(d => d.y);
  g.select('.links').selectAll('path').data(tl, l => (l.source.id || l.source) + '|' + (l.target.id || l.target) + '|' + l.rel).join('path').attr('class', l => 'edge ' + (l.kind === 'mention' ? 'mention' : ''));
  g.select('.links').selectAll('line').remove();
  g.select('.elabels').selectAll('text').data(tl, l => (l.source.id || l.source) + '|' + (l.target.id || l.target) + '|' + l.rel).join('text').attr('class', 'elabel').attr('text-anchor', 'end').text(l => l.rel);
  // faint links between documents of the same group that share entities (drawn as arcs to the right of the column)
  const xl = active ? crossLinks() : [];
  g.select('.cross').selectAll('path').data(xl, l => l.a + '|' + l.b).join('path').attr('class', 'xedge').attr('data-a', l => l.a).attr('data-b', l => l.b);
  positionNodes();
}
function positionNodes() {
  g.select('.nodes').selectAll('g.node').attr('transform', d => active ? `translate(${d.tx},${d.ty})` : `translate(${d.x},${d.y})`);
  if (!active) g.select('.cross').selectAll('line.dlink').attr('x1', l => l.source.x).attr('y1', l => l.source.y).attr('x2', l => l.target.x).attr('y2', l => l.target.y);
  if (active) { const path = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const ends = l => { const s = byId.get(l.source.id || l.source), t = byId.get(l.target.id || l.target); const half = n => n.group === 'doc' ? docSize(n)[0] / 2 : (n.group === 'head' ? 0 : radius(n)); const left = s.tx < t.tx ? s : t, right = left === s ? t : s; return { left, right, x0: left.tx + half(left) + (left.group === 'head' ? 0 : 0), x1: right.tx - half(right) - 4 }; };
    g.select('.links').selectAll('path').attr('d', l => { const e = ends(l); return path({ source: { x: e.x0, y: e.left.ty }, target: { x: e.x1, y: e.right.ty } }); });
    g.select('.elabels').selectAll('text').attr('x', l => ends(l).x1 - 4).attr('y', l => ends(l).right.ty + 11);
    g.select('.cross').selectAll('path').attr('d', l => { const a = byId.get(l.a), b = byId.get(l.b); const x = Math.max(a.tx, b.tx) + 150 + Math.abs(a.ty - b.ty) * 0.08; return `M${a.tx + 24},${a.ty} C${x},${a.ty} ${x},${b.ty} ${b.tx + 24},${b.ty}`; }); }
}
function paper(el, d) { el.select('.frame').classed('paper', true); el.insert('text', 'text').attr('class', 'paper-type'); el.insert('text', 'text.doclabel').attr('class', 'paper-title'); layoutPaper(el, d); }
function layoutPaper(el, d) {
  const [w, hh] = docSize(d); const fs = Math.max(5, Math.round(w / 8)); const lh = fs * 1.15; const chars = Math.floor((w - 8) / (fs * 0.6)); const maxLines = Math.max(1, Math.floor((hh - fs - 10) / lh));
  const words = d.label.split(/\s+/); const lines = []; let line = '';
  for (const wd of words) { if (line && (line + ' ' + wd).length > chars) { lines.push(line); line = wd; } else line = line ? line + ' ' + wd : wd; if (lines.length === maxLines) break; }
  if (lines.length < maxLines && line) lines.push(line); if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(1, chars - 1)) + '…';
  el.select('.paper-type').attr('x', -w / 2 + 4).attr('y', -hh / 2 + fs + 2).style('font-size', (fs - 1) + 'px').text((d.cls || 'document').toUpperCase());
  const t = el.select('.paper-title').attr('x', -w / 2 + 4).attr('y', -hh / 2 + fs * 2 + 5).style('font-size', fs + 'px'); t.selectAll('tspan').remove();
  lines.forEach((l, i) => t.append('tspan').attr('x', -w / 2 + 4).attr('dy', i ? lh : 0).text(l));
}
function highlight(d) { hoverId = d ? d.id : null; g.select('.links').selectAll('path').classed('hl', l => d && ((l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id)); g.select('.cross').selectAll('path').classed('hl', l => d && (l.a === d.id || l.b === d.id)); g.select('.cross').selectAll('line.dlink').classed('hl', l => d && ((l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id)); }
/* hover card */
let cardTimer = null;
function showCard(d, ev) {
  clearTimeout(cardTimer); const card = $('card'); const box = $('canvas').getBoundingClientRect();
  const related = active ? crossLinks().filter(l => l.a === d.id || l.b === d.id).map(l => byId.get(l.a === d.id ? l.b : l.a)) : docLinks.filter(l => (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id).sort((a, b) => b.w - a.w).map(l => byId.get((l.source.id || l.source) === d.id ? (l.target.id || l.target) : (l.source.id || l.source)));
  card.replaceChildren(
    h('div', { class: 'cls' }, [d.cls, d.date].filter(Boolean).join(' · ')), h('b', {}, d.label), d.desc ? h('div', { class: 'small muted' }, trunc(d.desc, 160)) : null,
    d.img && d.group === 'doc' ? h('img', { src: thumbUrl(d.img), alt: '' }) : null,
    related.length ? h('div', { class: 'small muted' }, active ? 'shares entities with ' : 'related: ', ...related.slice(0, 4).flatMap((r, i) => [i ? ', ' : '', h('a', { href: '#doc=' + r.id, onclick: e => { e.preventDefault(); select(r.id); } }, trunc(r.label, 28))]), related.length > 4 ? ` and ${related.length - 4} more` : '') : null,
    h('div', { class: 'acts' }, d.id !== active ? h('button', { onclick: () => select(d.id) }, 'Focus here') : null, h('a', { class: 'btn', href: itemUrl(d.id), target: '_blank', rel: 'noopener' }, 'Wikibase'),
      d.group === 'doc' && d.blocks ? h('a', { class: 'btn', href: '../reader/#doc=' + d.id }, 'Passages') : null, d.group === 'person' ? h('a', { class: 'btn', href: '../whos-who/#person=' + d.id }, 'Profile') : null, d.group === 'doc' && d.img ? h('a', { class: 'btn', href: d.img, target: '_blank', rel: 'noopener' }, 'Scan') : null));
  card.hidden = false;
  const x = Math.min(ev.clientX - box.left + 16, box.width - 300), y = Math.min(ev.clientY - box.top + 12, box.height - card.offsetHeight - 12);
  card.style.left = x + 'px'; card.style.top = Math.max(8, y) + 'px';
}
function hideCardSoon() { clearTimeout(cardTimer); cardTimer = setTimeout(() => { $('card').hidden = true; }, 350); }

/* ---------- tree layout: root at left, relation headers, entities, next-hop documents ---------- */
function layoutTree() {
  neighCache.clear();
  for (const n of nodes) { n.tx = undefined; n.ty = undefined; } for (const l of links) l.tree = false;
  for (const n of [...nodes]) if (n.group === 'head') { nodes.splice(nodes.indexOf(n), 1); byId.delete(n.id); }
  const adj = new Map(); const rel = new Map();
  for (const l of links) { const a = l.source.id || l.source, b = l.target.id || l.target; if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); rel.set(a + '|' + b, { rel: l.rel, kind: l.kind, l }); rel.set(b + '|' + a, { rel: '← ' + l.rel, kind: l.kind, l }); }
  const root = byId.get(active); const seen = new Set([active]); const maxDepth = +$('depth').value;
  const build = (id, depth) => {
    const node = { data: byId.get(id), children: [] }; if (depth >= maxDepth) return node;
    const kids = (adj.get(id) || []).filter(k => !seen.has(k) && byId.get(k)?.group !== 'head'); for (const k of kids) seen.add(k);
    const groups = new Map(); for (const k of kids) { const r = rel.get(id + '|' + k); if (!groups.has(r.rel)) groups.set(r.rel, []); groups.get(r.rel).push(k); }
    const order = [...groups].sort((a, b) => b[1].length - a[1].length);
    for (const [rname, ids] of order) {
      const head = addNode({ id: 'head|' + id + '|' + rname, label: `${rname.replace('← ', '')} · ${ids.length}`, group: 'head', floating: false });
      const hn = { data: head, children: [] }; node.children.push(hn);
      const byDeg = ids.map(k => byId.get(k)).sort((a, b) => (b.deg || 0) - (a.deg || 0) || a.label.localeCompare(b.label));
      const sorted = [...orderRelated(byDeg.filter(n => n.group !== 'doc')), ...orderRelated(byDeg.filter(n => n.group === 'doc'))];
      for (const kn of sorted) { rel.get(id + '|' + kn.id).l.tree = true; hn.children.push(build(kn.id, depth + 1)); }
    }
    return node;
  };
  const hier = d3.hierarchy(build(active, 0));
  const tree = d3.tree().nodeSize([34, 1]).separation((a, b) => { const big = x => x.data.data.group === 'doc' ? 1.9 : (x.data.data.group === 'head' ? 1.1 : 1); return Math.max(big(a), big(b)) * (a.parent === b.parent ? 1 : 1.7); });
  tree(hier);
  const colX = []; let x = 0; const widths = { 0: 0, doc: 320, head: 90, ent: 300 };
  hier.each(n => { const d = n.depth; if (colX[d] === undefined) { colX[d] = x; const kind = n.data.data.group === 'head' ? 'head' : (n.data.data.group === 'doc' ? 'doc' : 'ent'); x += widths[kind]; } });
  // group headers are section titles: aligned with the left edge of the group's children, just above the first one
  const half = d => d.group === 'doc' ? docSize(d)[0] / 2 : (d.group === 'head' ? 0 : radius(d));
  hier.each(n => { const d = n.data.data; if (d.group !== 'head') { d.tx = colX[n.depth]; d.ty = n.x; } });
  hier.each(n => { const d = n.data.data; if (d.group === 'head' && n.children) { const first = n.children.reduce((a, b) => a.x < b.x ? a : b).data.data; d.tx = first.tx - half(first); d.ty = first.ty - half(first) * (first.group === 'doc' ? 1.2 : 1) - 8; } });
  for (const n of nodes) if (n.tx === undefined) n.floating = true;
}
/* Documents in the same group that share entities in the current graph: used to order siblings and to draw faint arcs. */
function sharedCount(a, b) { const na = neigh(a), nb = neigh(b); let n = 0; for (const x of na) if (nb.has(x)) n++; return n; }
const neighCache = new Map();
function neigh(id) { if (neighCache.has(id)) return neighCache.get(id); const set = new Set(); for (const l of links) { const a = l.source.id || l.source, b = l.target.id || l.target; if (a === id) set.add(b); else if (b === id) set.add(a); } neighCache.set(id, set); return set; }
function crossLinks() {
  const out = []; const cols = new Map();
  for (const n of nodes) if (n.tx !== undefined && n.group === 'doc' && n.id !== active) { if (!cols.has(n.tx)) cols.set(n.tx, []); cols.get(n.tx).push(n); }
  for (const list of cols.values()) { const byY = list.slice().sort((a, b) => a.ty - b.ty);
    for (let i = 0; i < byY.length; i++) for (let j = i + 1; j < byY.length && j < i + 12; j++) { const c = sharedCount(byY[i].id, byY[j].id); if (c >= 2) out.push({ a: byY[i].id, b: byY[j].id, n: c }); } }
  return out;
}
function orderRelated(list) {
  if (list.length < 3) return list; const left = list.slice(); const out = [left.shift()];
  while (left.length) { const prev = out.at(-1); let best = 0, bi = 0; left.forEach((n, i) => { const c = sharedCount(prev.id, n.id); if (c > best) { best = c; bi = i; } }); out.push(left.splice(bi, 1)[0]); }
  return out;
}
function fitField() {
  const fl = nodes.filter(n => n.floating); if (fl.length < 2) return;
  const x0 = d3.min(fl, n => n.x) - 60, x1 = d3.max(fl, n => n.x) + 60, y0 = d3.min(fl, n => n.y) - 60, y1 = d3.max(fl, n => n.y) + 60;
  const k = Math.min(1, 0.98 / Math.max((x1 - x0) / W(), (y1 - y0) / H()));
  svg.transition().duration(500).call(zoomBehaviour.transform, d3.zoomIdentity.translate(W() / 2 - k * (x0 + x1) / 2, H() / 2 - k * (y0 + y1) / 2).scale(k));
}
function fitView() {
  const gn = nodes.filter(n => n.tx !== undefined); if (gn.length < 2) return;
  const x0 = d3.min(gn, n => n.tx) - 120, x1 = d3.max(gn, n => n.tx) + 320, y0 = d3.min(gn, n => n.ty) - 60, y1 = d3.max(gn, n => n.ty) + 60;
  // fit the width; a tall tree scrolls with the wheel, so the root ends up readable at the left
  const k = Math.min(1, Math.max(0.35, 0.96 * W() / (x1 - x0)));
  const root = byId.get(active); const ty = (y1 - y0) * k < H() ? H() / 2 - k * (y0 + y1) / 2 : H() / 2 - k * (root ? root.ty : y0);
  svg.transition().duration(600).call(zoomBehaviour.transform, d3.zoomIdentity.translate(20 - k * x0, ty).scale(k));
}

/* ---------- expansion ---------- */
async function expand(id, depth, origin) {
  if (expanded.has(id)) return []; expanded.add(id);
  let rows = await query(Q_EXPAND(id));
  const me = byId.get(id); const added = []; me.total = rows.length;
  // beyond the first hop, keep the expansion readable: documents first, then people, then works, up to 30 new nodes
  if (depth >= 2 && rows.length > 30) { const rank = r => (r.isDoc === 'true' || docs.has(r.n)) ? 0 : (r.cls === 'person' ? 1 : (group(r.cls, false) === 'work' ? 2 : 3)); rows = rows.slice().sort((a, b) => rank(a) - rank(b) || (byId.has(b.n) - byId.has(a.n))).slice(0, 30); me.trimmed = true; }
  for (const r of rows) {
    const isDoc = r.isDoc === 'true' || docs.has(r.n);
    let n = byId.get(r.n);
    if (!n) { const known = docs.get(r.n); n = addNode({ id: r.n, label: r.nLabel, cls: known?.cls || r.cls || '', img: known?.img || imageFor([r.thumb, r.file]), group: group(r.cls, isDoc), floating: false, depth: depth, date: known?.date, desc: known?.desc, blocks: known?.blocks, }); added.push(n); }
    else if (n.floating) { n.floating = false; added.push(n); }
    const kind = r.rel === 'mentions' ? 'mention' : 'claim';
    if (r.dir === 'out') addLink(id, r.n, r.rel, kind); else addLink(r.n, id, r.rel, kind);
  }
  me.more = rows.length >= 160;
  return added;
}
async function select(id) {
  const n = byId.get(id); if (!n || n.group === 'head') return;
  active = id; setHash({ doc: id }); if (trail.at(-1) !== id) trail.push(id); renderTrail();
  n.floating = false; setStatus('expanding ' + trunc(n.label, 30)); renderPanel(n, true);
  try {
    const maxDepth = +$('depth').value;
    let frontier = await expand(id, 1);
    for (let d = 2; d <= maxDepth; d++) {
      const batch = frontier.filter(x => !HUBS.has(x.id) && x.group !== 'tech' && x.group !== 'other').slice(0, d === 2 ? 40 : 15);
      const results = await Promise.all(batch.map(x => expand(x.id, d).catch(() => []))); frontier = results.flat();
    }
    setStatus(`${links.length} links from ${trunc(n.label, 24)}`);
  } catch (err) { setStatus('expansion failed', true); $('panel').append(errorBox(err)); }
  for (const x of nodes) x.deg = 0; for (const l of links) { const s = byId.get(l.source.id || l.source), t = byId.get(l.target.id || l.target); if (s) s.deg++; if (t) t.deg++; }
  layoutTree(); draw(); fitView(); renderPanel(n, false);
}
function renderTrail() {
  const el = $('trail'); el.replaceChildren(...trail.map((id, i) => { const n = byId.get(id); return h('span', {}, i ? ' › ' : '', h('a', { href: '#doc=' + id, onclick: ev => { ev.preventDefault(); trail = trail.slice(0, i); select(id); } }, trunc(n?.label || id, 28))); }));
}
function renderPanel(n, loading) {
  const rels = new Map();
  for (const l of links) { const s = l.source.id || l.source, t = l.target.id || l.target; if (s !== n.id && t !== n.id) continue; const other = byId.get(s === n.id ? t : s); const key = (s === n.id ? '' : '← ') + l.rel; if (!rels.has(key)) rels.set(key, []); rels.get(key).push(other); }
  const order = [...rels].sort((a, b) => b[1].length - a[1].length);
  $('panel').replaceChildren(
    h('div', { class: 'cls' }, [n.cls, n.date].filter(Boolean).join(' · ')),
    h('h2', {}, n.label),
    n.desc ? h('p', { class: 'small muted' }, n.desc) : null,
    n.img && n.group === 'doc' ? h('a', { href: n.img, target: '_blank', rel: 'noopener' }, h('img', { class: 'doc', src: n.img, alt: '' })) : null,
    n.imgNote ? h('p', { class: 'small muted', style: 'margin-top:-4px' }, n.imgNote) : null,
    h('div', { class: 'actions' }, qlink(n.id, 'Wikibase', 'btn'), n.group === 'doc' && n.blocks ? h('a', { class: 'btn', href: '../reader/#doc=' + n.id }, 'Read passages') : null, n.group === 'person' ? h('a', { class: 'btn', href: '../whos-who/#person=' + n.id }, 'Profile') : null,
      (!expanded.has(n.id) || n.trimmed) ? h('button', { onclick: () => { expanded.delete(n.id); n.trimmed = false; select(n.id); } }, 'Expand from here') : null, n.more ? h('span', { class: 'small muted' }, 'showing the first 160 connections') : (n.trimmed ? h('span', { class: 'small muted' }, `${n.total} connections, 30 drawn · expand from here for all`) : null)),
    loading ? h('div', { class: 'loading' }, 'Following connections') : null,
    n.group === 'doc' && n.blocks ? h('div', { id: 'excerpt' }) : null,
    ...order.map(([rel, list]) => h('div', { class: 'rel' }, h('h4', {}, rel, h('span', {}, list.length)), h('ul', {}, ...list.sort((a, b) => (b.deg || 0) - (a.deg || 0) || a.label.localeCompare(b.label)).map(o => h('li', { onclick: () => select(o.id) }, h('i', { style: `background:${o.group === 'doc' ? 'var(--panel)' : COLORS[o.group]};border:1px solid ${o.group === 'doc' ? 'var(--muted)' : 'transparent'}` }), h('span', {}, o.label), h('span', { class: 'c' }, o.group === 'doc' ? 'doc' : (o.deg > 1 ? o.deg + ' links' : ''))))))),
    !loading && !order.length ? h('p', { class: 'muted small' }, 'No connections recorded for this item.') : null);
  if (n.group === 'doc' && n.blocks && !n.excerptLoaded) { n.excerptLoaded = true; query(Q_BLOCKS(n.id)).then(rows => { const ex = $('excerpt'); if (ex) ex.replaceChildren(...rows.map(r => h('div', { class: 'passage-mini' }, r.text.length > 300 ? r.text.slice(0, 300) + '…' : r.text))); }).catch(() => {}); }
}

$('card').addEventListener('mouseenter', () => clearTimeout(cardTimer)); $('card').addEventListener('mouseleave', hideCardSoon);
/* ---------- controls ---------- */
$('depth').addEventListener('input', () => { $('depthv').textContent = $('depth').value; if (active) select(active); });
$('clear').onclick = () => { for (const n of [...nodes]) { if (!docs.has(n.id)) { byId.delete(n.id); nodes.splice(nodes.indexOf(n), 1); } else { n.floating = true; n.tx = undefined; n.ty = undefined; n.more = false; n.trimmed = false; } } links.length = 0; linkKey.clear(); expanded.clear(); active = null; trail = []; renderTrail(); setHash({}); svg.transition().duration(400).call(zoomBehaviour.transform, d3.zoomIdentity); sim.nodes(nodes); if (sim.force('rel')) sim.force('rel').links(docLinks); sim.alpha(0.6).restart(); draw(); $('panel').replaceChildren(h('p', { class: 'muted' }, 'Pick a document on the left.')); setStatus(`${docs.size} documents`); };
$('q').addEventListener('change', () => { const v = $('q').value.trim().toLowerCase(); const d = [...docs.values()].find(x => x.label.toLowerCase() === v) || [...docs.values()].find(x => x.label.toLowerCase().includes(v)); if (d) select(d.id); });
window.addEventListener('hashchange', () => { const hs = getHash(); if (hs.doc && hs.doc !== active && byId.has(hs.doc)) select(hs.doc); });
load();
