"""Capture a looping 300x300 animation of Paper Trail: documents hovered one after another,
their relation lines drawn out stroke by stroke, no hover card. Frames via headless Chromium,
assembled with Pillow into an animated WebP."""
import json, math, sys, time, io, os
from playwright.sync_api import sync_playwright
from PIL import Image

URL = 'http://127.0.0.1:8766/documents/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'eat-explore.webp'
SIZE = 300          # output px
DSF = 2             # capture at 2x then downscale
NDOCS = 6           # documents hovered per loop
DRAW_FRAMES = 6     # frames while lines are drawn
HOLD_FRAMES = 5     # frames held with lines complete
MOVE_FRAMES = 4     # cursor travel frames between documents
FRAME_MS = 90
QUALITY = int(os.environ.get('Q', '88'))
LOSSLESS = os.environ.get('LOSSLESS') == '1'
SCALE = float(os.environ.get('SCALE', '0.85'))   # svg zoom; window covers SIZE/SCALE sim px

CSS = """
.card{display:none!important}
svg .node:hover .frame{stroke:var(--accent);stroke-width:3}
.hud,.trail,.hint,.legend,#top,footer{visibility:hidden!important}
#cursor{position:fixed;z-index:99;width:18px;height:26px;pointer-events:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}
"""
CURSOR_SVG = ('<svg id="cursor" viewBox="0 0 18 26" xmlns="http://www.w3.org/2000/svg">'
              '<path d="M1 1 L1 20 L6 15.5 L9.5 23.5 L13 22 L9.5 14 L16 14 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>')

PICK_JS = """
(W) => {
  const nodes = [...document.querySelectorAll('svg .node')].map(el => el.__data__).filter(d => d && d.group === 'doc' && d.floating);
  const links = [...document.querySelectorAll('svg line.dlink')].map(el => el.__data__).filter(l => l && l.source && l.target && l.source.x !== undefined);
  // scan windows of W x W (sim coords, scale 1) for the one holding the most complete links
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const inside = (n, x0, y0) => n.x > x0 + 30 && n.x < x0 + W - 30 && n.y > y0 + 36 && n.y < y0 + W - 36;
  let best = null;
  for (let x0 = minx; x0 < maxx - W; x0 += 20) for (let y0 = miny; y0 < maxy - W; y0 += 20) {
    let score = 0;
    for (const l of links) { const a = inside(l.source, x0, y0), b = inside(l.target, x0, y0); if (a && b) score += 4; else if (a || b) score -= 2; }
    const inn = nodes.filter(n => inside(n, x0, y0)); const nd = inn.length, ni = inn.filter(n => n.img).length;
    if (nd < 7 || nd > 16 || ni < 4) continue;
    score += nd + 2 * ni;
    if (!best || score > best.score) best = { x0, y0, score, nd };
  }
  const x0 = best.x0, y0 = best.y0;
  const deg = new Map();
  for (const l of links) if (inside(l.source, x0, y0) && inside(l.target, x0, y0)) { deg.set(l.source.id, (deg.get(l.source.id) || 0) + 1); deg.set(l.target.id, (deg.get(l.target.id) || 0) + 1); }
  const cands = nodes.filter(n => inside(n, x0, y0) && deg.get(n.id)).map(n => ({ id: n.id, x: n.x, y: n.y, deg: deg.get(n.id) })).sort((a, b) => b.deg - a.deg);
  return { x0, y0, best, cands };
}
"""

SET_VIEW_JS = """
([x0, y0, k]) => { const g = document.querySelector('#g > g'); g.setAttribute('transform', `translate(${-x0 * k},${-y0 * k}) scale(${k})`); }
"""

NODE_RECT_JS = """
(id) => { const el = [...document.querySelectorAll('svg .node')].find(e => e.__data__ && e.__data__.id === id); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
"""

# Set how much of each highlighted line is drawn (t in 0..1), drawing outward from the hovered document.
DRAW_JS = """
([id, t]) => {
  const lines = document.querySelectorAll('svg line.dlink.hl');
  for (const el of lines) {
    const l = el.__data__; let a = l.source, b = l.target; if (b.id === id) { a = l.target; b = l.source; }
    el.setAttribute('x1', a.x); el.setAttribute('y1', a.y); el.setAttribute('x2', b.x); el.setAttribute('y2', b.y);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    el.style.strokeDasharray = len + ' ' + len; el.style.strokeDashoffset = String(len * (1 - t));
  }
  return lines.length;
}
"""

RESET_JS = """
() => { for (const el of document.querySelectorAll('svg line.dlink')) { el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; const l = el.__data__; el.setAttribute('x1', l.source.x); el.setAttribute('y1', l.source.y); el.setAttribute('x2', l.target.x); el.setAttribute('y2', l.target.y); } }
"""

def order_path(cands, n):
    """Greedy nearest-neighbour walk through the n best-connected candidates."""
    pool = cands[:max(n, min(len(cands), n + 3))]
    if not pool: return []
    path = [pool.pop(0)]
    while pool and len(path) < n:
        last = path[-1]
        pool.sort(key=lambda c: math.hypot(c['x'] - last['x'], c['y'] - last['y']))
        path.append(pool.pop(0))
    return path

def main():
    frames = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell'))
        page = browser.new_page(viewport={'width': 1400, 'height': 900}, device_scale_factor=DSF)
        page.goto(URL)
        page.wait_for_function("() => /documents$/.test(document.getElementById('status').textContent)", timeout=120000)
        page.wait_for_function("() => document.querySelectorAll('svg line.dlink').length > 0", timeout=120000)
        # let the simulation settle: wait until positions stop changing
        prev = None
        for _ in range(60):
            time.sleep(1)
            cur = page.evaluate("() => [...document.querySelectorAll('svg .node')].slice(0, 200).map(e => e.__data__ ? Math.round(e.__data__.x) + ',' + Math.round(e.__data__.y) : '').join(';')")
            if cur == prev: break
            prev = cur
        page.evaluate("() => { const b = document.querySelector('.loadbar'); if (b) b.hidden = true; }")
        page.add_style_tag(content=CSS)
        page.evaluate("(svg) => document.body.insertAdjacentHTML('beforeend', svg)", CURSOR_SVG)

        pick = page.evaluate(PICK_JS, SIZE / SCALE)
        print('window', pick['best'], 'candidates', len(pick['cands']), file=sys.stderr)
        page.evaluate(SET_VIEW_JS, [pick['x0'], pick['y0'], SCALE])
        time.sleep(0.3)
        seq = order_path(pick['cands'], NDOCS)
        print('sequence', [c['id'] for c in seq], file=sys.stderr)

        svg_rect = page.evaluate("() => { const r = document.getElementById('g').getBoundingClientRect(); return { x: r.x, y: r.y }; }")
        clip = {'x': svg_rect['x'], 'y': svg_rect['y'], 'width': SIZE, 'height': SIZE}

        def shot():
            png = page.screenshot(clip=clip)
            img = Image.open(io.BytesIO(png)).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
            frames.append(img)

        def cursor(x, y):
            page.evaluate("([x, y]) => { const c = document.getElementById('cursor'); c.style.left = x + 'px'; c.style.top = y + 'px'; }", [x, y])

        # start off-document
        start = page.evaluate(NODE_RECT_JS, seq[0]['id'])
        cx, cy = start['x'] + 70, start['y'] + 60
        page.mouse.move(cx, cy); cursor(cx, cy); shot()

        for i, c in enumerate(seq):
            tgt = page.evaluate(NODE_RECT_JS, c['id'])
            # travel
            for k in range(1, MOVE_FRAMES + 1):
                t = k / MOVE_FRAMES; e = t * t * (3 - 2 * t)
                x = cx + (tgt['x'] - cx) * e; y = cy + (tgt['y'] - cy) * e
                page.mouse.move(x, y); cursor(x, y)
                if k < MOVE_FRAMES: shot()
            cx, cy = tgt['x'], tgt['y']
            page.mouse.move(cx, cy); cursor(cx, cy)
            time.sleep(0.05)
            # draw lines outward
            for k in range(1, DRAW_FRAMES + 1):
                t = k / DRAW_FRAMES; e = 1 - (1 - t) ** 2
                n = page.evaluate(DRAW_JS, [c['id'], e]); shot()
            print(c['id'], 'lines', n, file=sys.stderr)
            for _ in range(HOLD_FRAMES): shot()
            page.evaluate(RESET_JS)
        # travel back toward start so the loop closes
        start = page.evaluate(NODE_RECT_JS, seq[0]['id'])
        ex, ey = start['x'] + 70, start['y'] + 60
        for k in range(1, MOVE_FRAMES + 1):
            t = k / MOVE_FRAMES; e = t * t * (3 - 2 * t)
            x = cx + (ex - cx) * e; y = cy + (ey - cy) * e
            page.mouse.move(x, y); cursor(x, y); shot()
        browser.close()

    print('frames', len(frames), file=sys.stderr)
    frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=FRAME_MS, loop=0, quality=QUALITY, method=6, lossless=LOSSLESS)
    print(OUT, os.path.getsize(OUT), 'bytes', file=sys.stderr)

main()
