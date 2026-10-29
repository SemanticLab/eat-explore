/* Shared SPARQL client for E.A.T. Explore. Talks to query.semlab.io, labels items, caches results in sessionStorage. */
export const ENDPOINT = 'https://query.semlab.io/sparql';
export const UA = 'semlab-data-process (eat-explore static site)';
export const PREFIX = `#semlab-data-process eat-explore
PREFIX wd: <http://base.semlab.io/entity/>
PREFIX wdt: <http://base.semlab.io/prop/direct/>
PREFIX p: <http://base.semlab.io/prop/>
PREFIX ps: <http://base.semlab.io/prop/statement/>
PREFIX pq: <http://base.semlab.io/prop/qualifier/>
PREFIX pr: <http://base.semlab.io/prop/reference/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;
export const ENTITY = 'http://base.semlab.io/entity/';
export const LABEL = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }';
export const PROJECTS = { Q19104: 'kg', Q28603: 'enc', Q20517: 'bib', Q27735: 'ds' };
export const PROJECT_NAMES = { kg: 'Knowledge Graph', enc: 'Edge-notched cards', bib: 'Bibliography', ds: 'Datascape' };

/* Hide images whose host no longer serves them (the Rauschenberg Foundation moved its files). */
document.addEventListener('error', e => { if (e.target && e.target.tagName === 'IMG') { e.target.remove(); } }, true);

/* Let replaceChildren(...) skip null/false/undefined children, so conditional pieces can be passed directly. */
{ const rc = Element.prototype.replaceChildren; Element.prototype.replaceChildren = function (...nodes) { return rc.apply(this, nodes.flat().filter(n => n !== null && n !== undefined && n !== false)); }; }

const mem = new Map();
function cacheKey(q) { let h = 0; for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0; return 'sparql:' + h + ':' + q.length; }

/** Run a query, return simplified rows: {var: value} with QIDs shortened and literals as strings. */
export async function query(q, { raw = false, cache = true, signal } = {}) {
  const key = cacheKey(q);
  if (cache && mem.has(key)) return mem.get(key);
  if (cache) { try { const s = sessionStorage.getItem(key); if (s) { const v = JSON.parse(s); mem.set(key, v); return v; } } catch (e) {} }
  const url = ENDPOINT + '?' + new URLSearchParams({ query: PREFIX + q });
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' }, signal });
  if (!res.ok) throw new Error('SPARQL ' + res.status + ' ' + res.statusText);
  const json = await res.json();
  const rows = raw ? json : json.results.bindings.map(simplify);
  if (cache) { mem.set(key, rows); try { sessionStorage.setItem(key, JSON.stringify(rows)); } catch (e) {} }
  return rows;
}
/* The Rauschenberg Foundation re-uploaded its archive files into a 2026-10 folder; the dated paths stored in the Wikibase 404. 139 of 142 resolve after this rewrite. */
export function fixUrl(v) { return typeof v === 'string' && v.includes('rauschenbergfoundation.org/sites/default/files/') ? v.replace(/\/sites\/default\/files\/\d{4}-\d{2}\//, '/sites/default/files/2026-10/') : v; }
/* Small derivative for lists and graphs: the foundation serves a 220x250 'art_teasers' style (~6 KB) next to each ~800 KB original. */
export function thumbUrl(v) { return typeof v === 'string' && v.includes('rauschenbergfoundation.org/sites/default/files/2026-10/') ? v.replace('/sites/default/files/2026-10/', '/sites/default/files/styles/art_teasers/public/2026-10/') : v; }
export function simplify(b) {
  const o = {};
  for (const k in b) { const v = b[k]; o[k] = v.type === 'uri' ? short(v.value) : fixUrl(v.value); }
  return o;
}
export function short(uri) { return uri.startsWith(ENTITY) ? uri.slice(ENTITY.length) : uri; }
export function isQ(v) { return typeof v === 'string' && /^Q\d+$/.test(v); }
export function itemUrl(q) { return 'https://base.semlab.io/wiki/Item:' + q; }
export function wikidataUrl(q) { return 'https://www.wikidata.org/wiki/' + q; }
export function datascapeUrl(id) { return 'https://eat_datascape.medialab.sciences-po.fr/' + id; }
export function year(d) { return d ? d.slice(0, 4) : ''; }
export function day(d) { return d ? d.slice(0, 10) : ''; }
export function projectTags(concat) { return [...new Set((concat || '').split('|').map(s => short(s.trim())).filter(Boolean).map(q => PROJECTS[q]).filter(Boolean))]; }

/** Group rows by a key var, collecting the others into sets. */
export function groupBy(rows, key) { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }
export function uniq(arr) { return [...new Set(arr.filter(x => x !== undefined && x !== ''))]; }

/* ---- Small DOM helpers ---- */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function qlink(q, label, cls = 'q') { return h('a', { class: cls, href: itemUrl(q), target: '_blank', rel: 'noopener', title: q }, label || q); }
export function badge(tag) { return h('span', { class: 'badge ' + tag }, PROJECT_NAMES[tag] || tag); }
export function setStatus(text, isError = false) { const el = document.getElementById('status'); if (!el) return; el.textContent = text; el.style.color = isError ? 'var(--warn)' : ''; }
export function errorBox(e) { return h('div', { class: 'msg error' }, 'Query failed: ' + (e.message || e), ' ', h('span', { class: 'muted' }, 'The query service at query.semlab.io may be slow or down. Reload to retry.')); }
export function loading(text = 'Querying query.semlab.io') { return h('div', { class: 'loading' }, text); }
export function fmt(n) { return Number(n).toLocaleString('en-US'); }

/** Hash-state helpers: #key=value&key2=value2 */
export function getHash() { const o = {}; for (const [k, v] of new URLSearchParams(location.hash.slice(1))) o[k] = v; return o; }
export function setHash(obj) { const p = new URLSearchParams(); for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v); const s = p.toString(); history.replaceState(null, '', s ? '#' + s : location.pathname); }

/** Shared top bar */
export function topbar(current) {
  const apps = [['documents', 'Paper Trail'], ['matchmaker', 'Matchmaker'], ['nine-evenings', '9 Evenings'], ['reader', 'Reader'], ['whos-who', "Who's Who"], ['timeline', 'Timeline'], ['map', 'Map'], ['technology', 'Technology']];
  const nav = h('nav', {}, apps.map(([slug, name]) => h('a', { href: '../' + slug + '/', 'aria-current': slug === current ? 'page' : null }, name)));
  return h('div', { class: 'topbar' }, h('a', { class: 'brand', href: '../' }, 'E.A.T. Explore'), nav, h('span', { class: 'status', id: 'status' }, ''));
}
export function footer() {
  return h('footer', {}, 'Live from the Semantic Lab Wikibase (', h('a', { href: 'https://base.semlab.io', target: '_blank', rel: 'noopener' }, 'base.semlab.io'), ') via its SPARQL endpoint. Results are cached in this tab. Projects: ',
    badge('kg'), ' ', badge('enc'), ' ', badge('bib'), ' ', badge('ds'));
}
