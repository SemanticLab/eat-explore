# E.A.T. Explore

Seven small static web apps onto the E.A.T. (Experiments in Art and Technology) data in the Semantic Lab Wikibase at [base.semlab.io](https://base.semlab.io), plus the data-connections report they were designed from.

Every page queries the live SPARQL endpoint (`https://query.semlab.io/sparql`) when it opens. There is no build step and no server-side code.

## Site (`docs/`)

| Path | App | Data path |
|---|---|---|
| `docs/index.html` | Landing page | |
| `docs/report.html` | Data-connections report with diagrams | |
| `docs/documents/` | Paper Trail: archive documents float on screen; click one to expand its connections hop by hop (documents are the interface) | document → mentions · subject · creator · depicts → entities → further documents |
| `docs/matchmaker/` | The Matchmaking File: engineer cards, scans, proposed artists, engineer–artist graph | card → engineer ⇄ artist |
| `docs/nine-evenings/` | 9 Evenings night by night: performances, crews with roles, equipment, documents, press | event ← performance → work · contributor [role] · uses |
| `docs/reader/` | Read the Archive: documents as passages with linked mentions; entity → every passage | document ← block → mentions; claim → reference block |
| `docs/whos-who/` | Who's Who: person profiles assembled from all four projects | person ↔ everything |
| `docs/timeline/` | Archive Against Press: dated Knowledge Graph items vs bibliography references | item → date |
| `docs/map/` | Where the Engineers Were: geocoded card addresses, Knowledge Graph places, places of publication | address, coordinates |
| `docs/technology/` | Technology as the Join: works' `uses` terms vs engineers' fields of work, with reconciliation suggestions | term |
| `docs/shared/` | Shared stylesheet and SPARQL client (`sparql.js`) | |

### Publish on GitHub Pages

Deployment is done by GitHub Actions (`.github/workflows/pages.yml`): every push to `main` that touches `docs/` uploads that folder as the Pages artifact and deploys it. No build step; the folder is served as-is.

One-time setup after the first push: in the repository **Settings → Pages**, set **Source** to **GitHub Actions**. The site then appears at <https://semanticlab.github.io/eat-explore/>. The workflow can also be run by hand from the Actions tab (*Run workflow*).

All links inside `docs/` are relative, so the site works under the `/eat-explore/` sub-path as well as at a domain root.

### Run locally

```
python3 -m http.server 8000 --directory docs
```
then open <http://localhost:8000/>. ES modules need http, not `file://`.

### Notes

- Browser requests go straight to the query service; it sends `Access-Control-Allow-Origin: *`. Queries are tagged `#semlab-data-process` in their first line. Results are cached per tab in `sessionStorage`.
- Roles (engineer, performing artist, production team member…) are read from statement qualifiers (`pq:P262 object has role`, `pq:P117 subject has role`); provenance from `prov:wasDerivedFrom … pr:P26 reference block`.
- The Rauschenberg Foundation re-uploaded its archive files into `/sites/default/files/2026-10/`; the dated paths stored in the Wikibase 404. `shared/sparql.js` rewrites them on the way in (139 of 142 resolve; `foundation_urls.py` checks the mapping and writes `docs/documents/foundation.json`). Updating the P200/P3 values in the Wikibase would make the rewrite unnecessary.
- The map joins live address strings to `docs/map/geocoded.json`, produced once by `geocode.py` from Nominatim. Re-run it if addresses change.
- External libraries (d3 7.9.0, Leaflet 1.9.4) and fonts load from cdnjs and Google Fonts.

## Data and scripts (repository root)

- `data/items.json` — all 5,773 items in the four projects with labels, descriptions, project tags and direct claims.
- `data/entities_full.json` — full Wikibase JSON (qualifiers, references) for the 1,737 items carrying link properties.
- `data/properties.json`, `data/external_items.json` — property definitions and items linked from outside the four projects.
- `q.py` — run a SPARQL query from the shell with prefixes set. `dump.py`, `fetch_entities.py`, `analyze.py`, `analyze2.py`, `geocode.py` — reproduce the dumps and the numbers in the report.
- `eat-data-connections.html` — source of the report page.
