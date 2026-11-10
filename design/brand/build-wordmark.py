"""Builds the OwnTape wordmark and lockups as pure-path SVGs.

Letters: Noto Sans Bold outlines (SIL Open Font License: use in a logo is
allowed). The "O" is replaced by the record mark (ring + dot) of the icon.

Usage (needs fontTools):  python3 design/brand/build-wordmark.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
OUT = Path(__file__).parent
TEXT = "wnTape"                 # the "O" is drawn as the mark
KERN = {("T", "a"): -70, ("n", "T"): -10, ("w", "n"): -5}   # manual optical kerning, font units
TRACK = -6                      # tracking, font units

COLORS = {
    "light": {"text": "#16181d", "mark": "#4338ca", "bg": None},
    "dark": {"text": "#ffffff", "mark": "#a5b0ff", "bg": None},
}
TILE = ('<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5348e6"/>'
        '<stop offset="1" stop-color="#3730a3"/></linearGradient></defs>')

font = TTFont(FONT)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
cap = font["OS/2"].sCapHeight            # 714 for Noto Sans
hmtx = font["hmtx"]


def glyph_path(ch, x):
    name = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))   # flip y; baseline at y=0
    return pen.getCommands(), hmtx[name][0]


def letters(start_x, text=TEXT):
    """Return (svg path data, end x) for text set from start_x on baseline 0."""
    x, d, prev = start_x, [], None
    for ch in text:
        if prev:
            x += KERN.get((prev, ch), 0) + TRACK
        cmds, adv = glyph_path(ch, x)
        d.append(cmds)
        x += adv
        prev = ch
    return " ".join(d), x


def mark_o(x, color):
    """Ring + dot in the place of the capital O. Height = cap height + overshoot."""
    h = cap * 1.03
    r_out = h / 2
    stroke = 0.17 * h                    # close to the Bold stem weight
    r = r_out - stroke / 2
    cx, cy = x + r_out + 18, -cap / 2
    svg = (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="{color}" stroke-width="{stroke:.1f}"/>'
           f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{0.44 * r:.1f}" fill="{color}"/>')
    return svg, cx + r_out + 62          # end x incl. side bearing


def write(name, body, x0, y0, w, h):
    (OUT / name).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.0f} {y0:.0f} {w:.0f} {h:.0f}">{body}</svg>\n')
    print(name)


desc = 40          # room under baseline for "p"
asc = cap + 60
pdesc = 250        # descender of "p"
for theme, c in COLORS.items():
    # 1) Wordmark: record-O + "wnTape"
    o_svg, x = mark_o(0, c["mark"])
    d, end = letters(x)
    body = o_svg + f'<path fill="{c["text"]}" d="{d}"/>'
    pad = 40
    write(f"wordmark-{theme}.svg", body, -pad, -asc - pad, end + 2 * pad, asc + pdesc + 2 * pad)

    # 2) Lockup: icon tile + plain "OwnTape"
    tile = cap * 1.45
    ty = -cap / 2 - tile / 2
    k = tile / 16
    icon = (TILE + f'<g transform="translate(0 {ty:.1f}) scale({k:.3f})">'
            '<rect width="16" height="16" rx="3.6" fill="url(#t)"/>'
            '<circle cx="8" cy="8" r="4.6" fill="none" stroke="#fff" stroke-width="1.3"/>'
            '<circle cx="8" cy="8" r="2.2" fill="#fff"/></g>')
    d, end = letters(tile + cap * 0.42, "OwnTape")
    body = icon + f'<path fill="{c["text"]}" d="{d}"/>'
    top = min(ty, -asc)
    write(f"lockup-{theme}.svg", body, -pad, top - pad, end + 2 * pad, (ty + tile if ty + tile > pdesc else pdesc) - top + 2 * pad)
