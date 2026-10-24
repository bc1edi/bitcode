"""Extracts the outlines the wordmarks need into brand/logo/glyphs.json, so no SVG depends on an installed font.
Run only when the typeface or weight changes:  python3 brand/tools/outline-glyphs.py
Needs fontTools and brotli. Output is committed; build.mjs reads it."""
import json, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

root = pathlib.Path(__file__).resolve().parents[2]
SPECS = {  # key: (font file, wght, text)
    'inter': ('site/public/assets/site/inter-latin.woff2', 600, 'bitcode'),
    'mono': ('site/public/assets/site/jetbrains-mono-latin.woff2', 700, 'bitcode'),
}
out = {}
for key, (rel, wght, text) in SPECS.items():
    font = instantiateVariableFont(TTFont(root / rel), {'wght': wght})
    gs, cmap, hmtx, upm = font.getGlyphSet(), font.getBestCmap(), font['hmtx'], font['head'].unitsPerEm
    glyphs = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        # flip y: font units are y-up, SVG is y-down
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, 0, 0)))
        glyphs.append({'char': ch, 'advance': hmtx[name][0], 'd': pen.getCommands()})
    bp = BoundsPen(gs)  # ascender = height of 'd', the tallest letter in both words
    gs[cmap[ord('d')]].draw(bp)
    hhea = font['hhea']  # browsers center a line box on these metrics (line-height: normal)
    out[key] = {'upm': upm, 'wght': wght, 'ascender': bp.bounds[3], 'hheaAscent': hhea.ascent, 'hheaDescent': -hhea.descent, 'lineGap': hhea.lineGap, 'glyphs': glyphs}
(root / 'brand/logo/glyphs.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
print('wrote brand/logo/glyphs.json', {k: len(v['glyphs']) for k, v in out.items()})
