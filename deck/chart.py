#!/usr/bin/env python3
"""Any svg-charts chart as native PowerPoint shapes, from the spec file that draws the page.

  python3 deck/chart.py spec.json --check
      checks the spec and the fit at slide size
  python3 deck/chart.py spec.json --out chart.pptx
      one 16:9 slide: the claim as the slide title, then the chart under its own title, with its source
  python3 deck/chart.py spec.json --into deck.pptx --slide 3 --replace "Content Placeholder 2" --out deck2.pptx
      the chart takes the box of that shape on slide 3 and the shape is removed
  python3 deck/chart.py spec.json --into deck.pptx --slide 3 --box 40,130,880,330 --out deck2.pptx
      the chart inside a box (x,y,w,h in points)
  python3 deck/chart.py a.json b.json c.json --out slide.pptx --title "The claim of the slide"
  python3 deck/chart.py a.json b.json --into deck.pptx --slide 3 --replace "Content Placeholder 2" --out deck2.pptx
      two or three charts side by side in equal columns, each under its numbered takeaway (the claim of its spec)
  python3 deck/chart.py --list deck.pptx --slide 3
      the shapes on a slide with their boxes, to choose --box or --replace
  --subtitle "..." is about the slide: one or two lines under the slide title (in an existing slide, at the top of
      the box), so the charts do not stand against the title. It is not a chart title.
  --takeaway "..." is the bottom line of the slide: one or two bold lines with an accent bar under the charts.
  The title of a chart is always about its data: the "title" and "unit" of the spec ("Revenue 2025 and 2026 · USD
  million"). It runs the width of the chart and goes to a next line only where the chart ends.

`charts.js` computes the geometry (through deck/render.mjs, so `node` is needed) and this script writes each
mark as a native shape: bars are rectangles, lines are connectors and freeforms, slices are arcs, text is text.
One point on the slide is one pixel of the page chart, so the text has the size the builder gives it.
`rankedTable` has its own layout in deck/ranked_table.py and needs no node.

Each chart has its own title (the "title · unit" of the spec: what its data is) and its own source line;
--bare leaves them out. Colours and fonts come from the deck theme: accents 1 to 5 for the palette,
text 1 for the ink. `--palette RRGGBB,RRGGBB,...` (or `--accent RRGGBB` for the first) forces colours. On a
dark slide the ink is light; `--on dark` sets it when the background is a picture.

Nothing is cut, shrunk or left out without notice: a label that does not fit, labels that overlap, a box
that is too small or a bad spec stops the run with exit 2 and the reason. Needs python-pptx.
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ranked_table as rt  # noqa: E402
from ranked_table import SpecError  # noqa: E402

SVG = '{http://www.w3.org/2000/svg}'
EMU = 12700
ACCENTS = ['1', '2', '3', '4', '5']
INK_LEVEL = {'ink': 0.0, 'axis-text': 0.35, 'total': 0.5, 'muted': 0.7, 'grid': 0.8}
VAR = re.compile(r'var\(\s*--chart-([\w-]+)\s*(?:,\s*([^)]+?)\s*)?\)')


def render(spec_path, width, height, frame='full'):
    """The page chart of the spec at this size, from charts.js in strict mode.
    frame: 'full' keeps the title, unit and source lines, 'source' the source only, 'none' leaves all out."""
    node = shutil.which('node')
    if not node:
        raise SpecError('node is not installed: charts.js computes the geometry of every chart but rankedTable')
    cmd = [node, os.path.join(HERE, 'render.mjs'), spec_path, '--width', str(int(width)), '--height', str(int(height))]
    cmd += {'full': [], 'source': ['--bare-title'], 'none': ['--bare']}[frame]
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    if p.returncode == 2:
        raise SpecError(p.stderr.strip())
    if p.returncode:
        raise RuntimeError(p.stderr)
    return json.loads(p.stdout)


def parse_color(css):
    """('role', name) for a theme hook, ('rgb', 'RRGGBB') for a fixed colour, None for no paint."""
    css = (css or '').strip()
    if css in ('', 'none', 'transparent'):
        return None
    m = VAR.fullmatch(css)
    if m:
        if m.group(1) in ACCENTS or m.group(1) in INK_LEVEL or m.group(1) in ('up', 'down', 'target', 'paper', 'callout'):
            return ('role', m.group(1))
        if m.group(2):
            return parse_color(m.group(2))
    m = re.fullmatch(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})', css)
    if m:
        h = m.group(1)
        return ('rgb', (''.join(c * 2 for c in h) if len(h) == 3 else h).upper())
    raise SpecError(f'colour "{css}": use #RRGGBB or var(--chart-1) to var(--chart-5)')


def arc_from_svg(x0, y0, r, large, sweep, x1, y1):
    """Start angle and sweep (degrees, clockwise with y down) of an SVG circular arc from (x0,y0) to (x1,y1)."""
    dx, dy = (x0 - x1) / 2, (y0 - y1) / 2
    d2 = dx * dx + dy * dy
    r = max(r, math.sqrt(d2))
    k = math.sqrt(max(0.0, (r * r - d2) / d2)) if d2 else 0.0
    if large == sweep:
        k = -k
    cx, cy = (x0 + x1) / 2 + k * dy, (y0 + y1) / 2 - k * dx
    a0 = math.degrees(math.atan2(y0 - cy, x0 - cx))
    a1 = math.degrees(math.atan2(y1 - cy, x1 - cx))
    sw = (a1 - a0) % 360 if sweep else -((a0 - a1) % 360)
    return r, a0, sw


def parse_path(d):
    """An SVG path (absolute M, L, C, A, Z as charts.js writes them) as freeform commands."""
    cmds, cur = [], (0.0, 0.0)
    for letter, body in re.findall(r'([MLCAZ])([^MLCAZ]*)', d):
        n = [float(v) for v in re.findall(r'-?\d*\.?\d+(?:e-?\d+)?', body)]
        if letter == 'Z':
            cmds.append(('Z',))
        elif letter in 'ML':
            for i in range(0, len(n), 2):
                cmds.append(('M' if letter == 'M' and i == 0 else 'L', n[i], n[i + 1]))
                cur = (n[i], n[i + 1])
        elif letter == 'C':
            for i in range(0, len(n), 6):
                cmds.append(('C', *n[i:i + 6]))
                cur = (n[i + 4], n[i + 5])
        elif letter == 'A':
            for i in range(0, len(n), 7):
                rx, ry, rot, large, sweep, x, y = n[i:i + 7]
                if abs(rx - ry) > 0.01 or rot:
                    raise SpecError('deck: only circular arcs are drawn')
                cmds.append(('A', *arc_from_svg(cur[0], cur[1], rx, bool(large), bool(sweep), x, y)))
                cur = (x, y)
    if re.sub(r'[MLCAZ\s\d.,e-]', '', d):
        raise SpecError(f'deck: this path command is not drawn: {d[:40]}')
    return cmds


def _contrast(a, b):
    """WCAG contrast ratio of two RRGGBB colours."""
    def lum(rgb):
        ch = [int(rgb[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        ch = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in ch]
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def theme_palette(slide, background, dark):
    """The series colours of the deck: theme accents 1 to 6 in order, without the accents that are too close to the
    slide background to read (contrast under 2 to 1: the light tints of a brand theme on a white slide). When fewer
    than five stay, greys from the text colour fill the list. Returns RRGGBB values; [] when the theme cannot be read."""
    master = slide.slide_layout.slide_master
    back = background or ('000000' if dark else 'FFFFFF')
    accents = [rt._theme_rgb(master, f'accent{i}') for i in range(1, 7)]
    if not all(accents):
        return []
    keep = [c.upper() for c in accents if _contrast(c, back) >= 2]
    if len(keep) == 6 or (len(keep) >= 5 and keep[:5] == [c.upper() for c in accents[:5]]):
        return []                                           # every accent reads: keep the theme colours as theme colours
    greys = ['B0B0B0', '6E6E6E', 'D0D0D0'] if dark else ['595959', '8C8C8C', 'B3B3B3']
    return (keep + greys)[:5]


class Canvas:
    """Writes SVG marks into one group of native shapes, at an offset, in the colours of the deck theme."""

    def __init__(self, slide, name, ox, oy, width, palette=None, dark=False, background=None):
        self.grp = slide.shapes.add_group_shape()
        self.grp.name = name
        self.ox, self.oy, self.width, self.palette, self.dark, self.background = ox, oy, width, palette or [], dark, background
        self.count = 0

    # ---- colour ----
    def paint(self, color, css, text=False):
        """Set a python-pptx colour from a CSS colour of charts.js. False when the mark has no paint."""
        from pptx.dml.color import RGBColor
        from pptx.enum.dml import MSO_THEME_COLOR
        kind = parse_color(css)
        if kind is None:
            return False
        what, v = kind
        if what == 'role':
            v = {'up': '1', 'down': '2'}.get(v, v)
        if what == 'rgb':
            color.rgb = RGBColor.from_string(v)
        elif v in ACCENTS:
            i = int(v) - 1
            if i < len(self.palette):
                color.rgb = RGBColor.from_string(self.palette[i])
            else:
                color.theme_color = getattr(MSO_THEME_COLOR, f'ACCENT_{v}')
        elif v == 'callout':
            # Callouts take the first series colour, darker on a light slide and lighter on a dark one.
            if self.palette:
                r, g, b = (int(self.palette[0][i:i + 2], 16) for i in (0, 2, 4))
                k = (lambda c: round(c + (255 - c) * 0.45)) if self.dark else (lambda c: round(c * 0.68))
                color.rgb = RGBColor(k(r), k(g), k(b))
            else:
                color.theme_color = MSO_THEME_COLOR.ACCENT_1
                color.brightness = 0.4 if self.dark else -0.3
        elif v == 'target':
            color.rgb = RGBColor.from_string('C0392B')
        elif v == 'paper':
            # Text on a strong fill is white. A paper fill (a hollow marker) is the slide background.
            if text or (self.dark and not self.background):
                color.rgb = RGBColor.from_string('FFFFFF' if text else '000000')
            elif self.dark:
                color.rgb = RGBColor.from_string(self.background)
            else:
                color.theme_color = MSO_THEME_COLOR.BACKGROUND_1
        else:
            level = INK_LEVEL[v]
            if self.dark:                       # a grey from white: the theme text colour is dark on a dark slide
                g = round(255 * (1 - level * 0.87))
                color.rgb = RGBColor(g, g, g)
            else:
                color.theme_color = MSO_THEME_COLOR.TEXT_1
                if level:
                    color.brightness = level
        return True

    @staticmethod
    def _alpha(parent, opacity):
        from pptx.oxml.ns import qn
        if opacity is None or float(opacity) >= 0.995:
            return
        fill = parent.find(qn('a:solidFill'))
        if fill is not None and len(fill):
            a = fill[0].makeelement(qn('a:alpha'), {'val': str(int(round(float(opacity) * 100000)))})
            fill[0].append(a)

    def _style(self, shp, el, closed=True):
        """Fill, outline and tooltip of a shape from the SVG attributes."""
        from pptx.enum.dml import MSO_LINE
        from pptx.oxml.ns import qn
        from pptx.util import Pt
        self.count += 1
        if hasattr(shp, 'shadow'):
            shp.shadow.inherit = False
        for style in shp._element.xpath('./p:style'):       # the default style adds theme effects and a theme outline
            shp._element.remove(style)
        if hasattr(shp, 'fill'):
            if closed and el.get('fill') not in (None, 'none', 'transparent'):
                shp.fill.solid()
                self.paint(shp.fill.fore_color, el.get('fill'))
                self._alpha(shp._element.spPr, el.get('fill-opacity'))
            else:
                shp.fill.background()
        if el.get('stroke') in (None, 'none'):
            shp.line.fill.background()
        else:
            shp.line.width = Pt(float(el.get('stroke-width', 1)))
            self.paint(shp.line.color, el.get('stroke'))
            dash = [float(v) for v in re.findall(r'[\d.]+', el.get('stroke-dasharray') or '')]
            if dash and not el.get('pathLength') and el.tag != SVG + 'circle':
                shp.line.dash_style = MSO_LINE.DASH if dash[0] >= 5 else MSO_LINE.SQUARE_DOT
            ln = shp.line._get_or_add_ln()
            if el.get('stroke-linecap') == 'round':
                ln.set('cap', 'rnd')
            if el.tag in (SVG + 'polyline', SVG + 'path'):
                ln.append(ln.makeelement(qn('a:round'), {}))
        tip = el.find(SVG + 'title')
        if tip is not None and tip.text:
            shp.name = tip.text[:80]
            shp._element.xpath('.//p:cNvPr')[0].set('descr', tip.text)
        return shp

    # ---- shapes ----
    def rect(self, el):
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.util import Pt
        x, y, w, h = (float(el.get(k, 0)) for k in ('x', 'y', 'width', 'height'))
        if el.get('fill-opacity') == '0' or (el.get('fill') in (None, 'none', 'transparent') and not el.get('stroke')):
            return                              # a hit area for a tooltip: a slide has no tooltip
        rx = min(float(el.get('rx', 0)), w / 2, h / 2)
        # Both edges are rounded first and the size is their difference, so bars on one baseline end on one unit.
        x0, y0 = round((self.ox + x) * EMU), round((self.oy + y) * EMU)
        x1, y1 = round((self.ox + x + max(w, 0.1)) * EMU), round((self.oy + y + max(h, 0.1)) * EMU)
        shp = self.grp.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rx > 0.2 else MSO_SHAPE.RECTANGLE, x0, y0, x1 - x0, y1 - y0)
        if rx > 0.2:
            shp.adjustments[0] = min(0.5, rx / min(w, h))
        self._style(shp, el)

    def line(self, el):
        from pptx.enum.shapes import MSO_CONNECTOR
        from pptx.util import Pt
        x1, y1, x2, y2 = (float(el.get(k, 0)) for k in ('x1', 'y1', 'x2', 'y2'))
        shp = self.grp.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Pt(self.ox + x1), Pt(self.oy + y1), Pt(self.ox + x2), Pt(self.oy + y2))
        self._style(shp, el)

    def circle(self, el):
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.util import Pt
        cx, cy, r = (float(el.get(k, 0)) for k in ('cx', 'cy', 'r'))
        dash = [float(v) for v in re.findall(r'[\d.]+', el.get('stroke-dasharray') or '')]
        if dash:
            # A donut slice: charts.js draws it as one dash of a thick circle outline. Here it is a ring segment.
            around, sw = 2 * math.pi * r, float(el.get('stroke-width', 1))
            turn = re.search(r'rotate\(\s*(-?[\d.]+)', el.get('transform') or '')
            a0 = (float(turn.group(1)) if turn else 0.0) - float(el.get('stroke-dashoffset', 0)) / around * 360
            sweep = min(359.9, dash[0] / around * 360)
            ro, ri = r + sw / 2, r - sw / 2
            p = lambda rad, a: (cx + rad * math.cos(math.radians(a)), cy + rad * math.sin(math.radians(a)))  # noqa: E731
            cmds = [('M', *p(ro, a0)), ('A', ro, a0, sweep), ('L', *p(ri, a0 + sweep)), ('A', ri, a0 + sweep, -sweep), ('Z',)]
            fake = ET.Element(el.tag, {'fill': el.get('stroke')})
            fake.extend(list(el))
            self.freeform(cmds, fake, closed=True)
            return
        shp = self.grp.shapes.add_shape(MSO_SHAPE.OVAL, Pt(self.ox + cx - r), Pt(self.oy + cy - r), Pt(2 * r), Pt(2 * r))
        self._style(shp, el)

    def poly(self, el, closed):
        pts = [float(v) for v in re.findall(r'-?\d*\.?\d+', el.get('points') or '')]
        pairs = list(zip(pts[0::2], pts[1::2]))
        if len(pairs) < 2:
            return
        cmds = [('M', *pairs[0])] + [('L', *p) for p in pairs[1:]] + ([('Z',)] if closed else [])
        self.freeform(cmds, el, closed)

    def path(self, el):
        cmds = parse_path(el.get('d') or '')
        if el.get('pathLength'):
            # charts.js draws a part of an arc as one dash of the whole arc: here the arc itself is shorter.
            dash = [float(v) for v in re.findall(r'[\d.]+', el.get('stroke-dasharray') or '')]
            arcs = [c for c in cmds if c[0] == 'A']
            if len(cmds) != 2 or len(arcs) != 1 or not dash:
                raise SpecError('deck: a dashed path is drawn only for one arc')
            share = min(1.0, dash[0] / float(el.get('pathLength')))
            cmds = [cmds[0], ('A', arcs[0][1], arcs[0][2], arcs[0][3] * share)]
        self.freeform(cmds, el, closed=any(c[0] == 'Z' for c in cmds))

    def freeform(self, cmds, el, closed):
        """A custom-geometry shape. Commands: M x y, L x y, C x1 y1 x2 y2 x y, A r start sweep (from the current point), Z."""
        from lxml import etree
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.oxml.ns import qn
        from pptx.util import Pt
        xs, ys, cur = [], [], (0.0, 0.0)
        steps = []                              # commands with the points resolved, for the bounding box
        for c in cmds:
            if c[0] in 'ML':
                cur = (c[1], c[2])
                xs.append(cur[0]), ys.append(cur[1])
            elif c[0] == 'C':
                xs.extend(c[1::2]), ys.extend(c[2::2])
                cur = (c[5], c[6])
            elif c[0] == 'A':
                r, a0, sw = c[1], c[2], c[3]
                ccx, ccy = cur[0] - r * math.cos(math.radians(a0)), cur[1] - r * math.sin(math.radians(a0))
                for k in range(0, 37):
                    a = math.radians(a0 + sw * k / 36)
                    xs.append(ccx + r * math.cos(a)), ys.append(ccy + r * math.sin(a))
                cur = (xs[-1], ys[-1])
            steps.append(c)
        x0, y0 = min(xs), min(ys)
        w, h = max(max(xs) - x0, 0.01), max(max(ys) - y0, 0.01)
        e = lambda v, o: str(int(round((v - o) * EMU)))  # noqa: E731
        pt = lambda x, y: f'<a:pt x="{e(x, x0)}" y="{e(y, y0)}"/>'  # noqa: E731
        body = ''
        for c in steps:
            if c[0] == 'M':
                body += f'<a:moveTo>{pt(c[1], c[2])}</a:moveTo>'
            elif c[0] == 'L':
                body += f'<a:lnTo>{pt(c[1], c[2])}</a:lnTo>'
            elif c[0] == 'C':
                body += f'<a:cubicBezTo>{pt(c[1], c[2])}{pt(c[3], c[4])}{pt(c[5], c[6])}</a:cubicBezTo>'
            elif c[0] == 'A':
                rr = int(round(c[1] * EMU))
                body += f'<a:arcTo wR="{rr}" hR="{rr}" stAng="{int(round((c[2] % 360) * 60000))}" swAng="{int(round(c[3] * 60000))}"/>'
            else:
                body += '<a:close/>'
        ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
        geom = etree.fromstring(
            f'<a:custGeom {ns}><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>'
            f'<a:path w="{int(round(w * EMU))}" h="{int(round(h * EMU))}"{"" if closed else " fill=\"none\""}>{body}</a:path>'
            f'</a:pathLst></a:custGeom>')
        shp = self.grp.shapes.add_shape(MSO_SHAPE.RECTANGLE, Pt(self.ox + x0), Pt(self.oy + y0), Pt(w), Pt(h))
        sp_pr = shp._element.spPr
        sp_pr.replace(sp_pr.find(qn('a:prstGeom')), geom)
        self._style(shp, el, closed)

    def text(self, el):
        from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
        from pptx.util import Pt
        fs = float(el.get('font-size', 12))
        base = (el.get('font-weight'), el.get('fill'), el.get('fill-opacity'))
        runs = [(el.text, base)] if el.text else []
        for child in el:
            if child.tag == SVG + 'tspan':
                runs.append((child.text or '', (child.get('font-weight') or base[0], child.get('fill') or base[1], base[2])))
            if child.tail:
                runs.append((child.tail, base))
        s = ''.join(t for t, _ in runs)
        if not s.strip():
            return
        x, y, anchor = float(el.get('x', 0)), float(el.get('y', 0)), el.get('text-anchor', 'start')
        # The box is wider than the text (the font is not known here) but stays inside the chart: the text does not
        # wrap, so it keeps its anchor and the group keeps the size of the chart.
        w, h = len(s) * fs * 0.66 + 6, fs * 1.3
        if anchor == 'start':
            left, w = x, max(1.0, min(w, self.width - x))
        elif anchor == 'middle':
            w = max(1.0, min(w, 2 * x, 2 * (self.width - x)))
            left = x - w / 2
        else:
            left = max(0.0, x - w)
            w = max(1.0, x - left)
        # y is the baseline. The middle of a line of text is about 0.35em above its baseline.
        tb = self.grp.shapes.add_textbox(Pt(self.ox + left), Pt(self.oy + y - 0.35 * fs - h / 2), Pt(w), Pt(h))
        tf = tb.text_frame
        tf.word_wrap = False
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.alignment = {'start': PP_ALIGN.LEFT, 'middle': PP_ALIGN.CENTER, 'end': PP_ALIGN.RIGHT}[anchor]
        for t, (weight, fill, opacity) in runs:
            run = p.add_run()
            run.text = t
            run.font.size = Pt(fs)
            run.font.bold = str(weight or '400') >= '600'
            self.paint(run.font.color, fill or 'var(--chart-ink)', text=True)
            self._alpha(run._r.get_or_add_rPr(), opacity)
        self.count += 1

    def draw(self, root):
        for el in root:
            tag = el.tag.replace(SVG, '')
            if tag == 'rect':
                self.rect(el)
            elif tag == 'line':
                self.line(el)
            elif tag == 'circle':
                self.circle(el)
            elif tag in ('polyline', 'polygon'):
                self.poly(el, tag == 'polygon')
            elif tag == 'path':
                self.path(el)
            elif tag == 'text':
                self.text(el)
            elif tag != 'title':
                raise SpecError(f'deck: the svg element <{tag}> is not drawn')


def draw_svg(slide, drawn, box, palette=None, dark=False, background=None):
    """Draw a rendered chart ({chart, width, height, svg}) into the slide at the top left of the box."""
    root = ET.fromstring(drawn['svg'])
    canvas = Canvas(slide, f"Chart {drawn['chart']}", box[0], box[1], drawn['width'], palette, dark, background)
    canvas.draw(root)
    canvas.grp._element.xpath('./p:nvGrpSpPr/p:cNvPr')[0].set('descr', root.get('aria-label') or drawn['chart'])
    return canvas


GUTTER = 24                 # points between two charts on one slide
HEAD_FS, HEAD_LINE = 13, 17  # the claim above each chart when a slide holds two or three


def load(path):
    try:
        with open(path, encoding='utf-8') as fh:
            spec = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        raise SpecError(f'{path}: {e}')
    if not isinstance(spec, dict) or not spec.get('chart'):
        raise SpecError(f'{path}: the spec needs "chart": the name of the chart type (see SKILL.md)')
    return spec


TITLE_FS, TITLE_LINE = 14, 18


def chart_title(spec, width):
    """The title of a chart: what its data is, with the unit ("Revenue by region · USD million"). It runs the
    width of the chart and wraps only at the chart's edge. Returns (title, unit, height in points)."""
    title, unit = str(spec.get('title') or ''), str(spec.get('unit') or '')
    text = ' · '.join(t for t in (title, unit) if t)
    if not text:
        return '', '', 0
    lines = rt.wrap(text, width - 4, TITLE_FS, 0.56)
    if len(lines) > 3:
        raise SpecError(f'the chart title "{text[:50]}..." needs {len(lines)} lines in {width:.0f}pt, it has 3: shorten the title or the unit')
    return title, unit, TITLE_LINE * len(lines) + 6


def fit(path, spec, box, frame):
    """Check one chart against a box without a deck. Returns the receipt fields."""
    if spec['chart'] == 'rankedTable':
        rows, heads = rt.model(spec)
        band = (22 if frame == 'full' and (spec.get('title') or spec.get('unit')) else 0) + (16 if frame != 'none' and spec.get('source') else 0)
        rt.layout(spec, [box[0], box[1], box[2], box[3] - band])
        return {'chart': spec['chart'], 'box_pt': [round(v, 1) for v in box], 'rows': [r['label'] for r in rows], 'columns': heads}
    head = chart_title(spec, box[2])[2] if frame == 'full' else 0
    d = render(path, box[2], box[3] - head, 'source' if frame == 'full' else frame)
    return {'chart': spec['chart'], 'box_pt': [round(v, 1) for v in box], 'used_pt': [d['width'], d['height'] + head]}


def place(slide, path, spec, box, frame, palette, dark, background):
    """Draw one chart into a box of the slide. Returns the receipt fields."""
    out = {'chart': spec['chart'], 'box_pt': [round(v, 1) for v in box]}
    if spec['chart'] == 'rankedTable':
        g = rt.draw(slide, spec, box, palette[0] if palette else None, dark, frame={'full': True, 'source': 'source', 'none': False}[frame])
        out.update(used_height_pt=round(g['height'], 1), rows=[r['label'] for r in g['rows']])
        return out
    # The chart title is a text box of the width of the chart, so the deck program wraps it where the chart ends.
    title, unit, head = chart_title(spec, box[2]) if frame == 'full' else ('', '', 0)
    d = render(path, box[2], box[3] - head, 'source' if frame == 'full' else frame)
    canvas = draw_svg(slide, d, [box[0], box[1] + head, box[2], box[3] - head], palette, dark, background)
    if head:
        from pptx.util import Pt
        tb = canvas.grp.shapes.add_textbox(Pt(box[0] + 4), Pt(box[1]), Pt(box[2] - 4), Pt(head))
        tb.name = 'Chart title'
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        # The line count is an estimate. The title stands on the bottom of its box, so it stays next to its
        # chart when the deck program needs fewer lines than the estimate.
        from pptx.enum.text import MSO_ANCHOR
        tf.vertical_anchor = MSO_ANCHOR.BOTTOM
        tf.margin_bottom = Pt(4)
        p = tf.paragraphs[0]
        for text, bold, css in ((title, True, 'var(--chart-ink)'), ((' · ' if title else '') + unit if unit else '', False, 'var(--chart-axis-text)')):
            if text:
                run = p.add_run()
                run.text = text
                run.font.size = Pt(TITLE_FS)
                run.font.bold = bold
                canvas.paint(run.font.color, css, text=True)
        canvas.count += 1
    out.update(used_pt=[d['width'], d['height'] + head], shapes=canvas.count)
    return out


BADGE = 18                  # diameter of the number badge of a section
PAD = 8                     # padding inside the section header


def side_by_side(specs, box):
    """Two or three charts in equal columns of the box. Each column is a section: a header with a number badge and
    the takeaway of the chart (the `claim` of its spec), then the chart under its own title. The header is a comment;
    the title of a chart always says what its data is. Returns per chart (takeaway lines, header box, chart box)."""
    n = len(specs)
    w = (box[2] - GUTTER * (n - 1)) / n
    heads = []
    for path, spec in specs:
        if not spec.get('claim'):
            raise SpecError(f'{path}: each chart on a shared slide stands under its takeaway: add "claim" to the spec')
        if spec['chart'] == 'sparkline':
            raise SpecError(f'{path}: a sparkline is not a chart of its own: use --into with a small --box beside the number it supports')
        lines = rt.wrap(spec['claim'], w - BADGE - 3 * PAD, HEAD_FS, 0.56)
        if len(lines) > 3:
            raise SpecError(f'{path}: the claim needs {len(lines)} lines at {HEAD_FS}pt in a {w:.0f}pt column, it has 3: shorten it')
        heads.append(lines)
    head_h = max(HEAD_LINE * max(len(h) for h in heads), BADGE) + 2 * PAD
    return [(heads[i], [box[0] + i * (w + GUTTER), box[1], w, head_h],
             [box[0] + i * (w + GUTTER), box[1] + head_h + 10, w, box[3] - head_h - 10]) for i in range(n)]


def section_header(slide, n, text, hbox, dark, palette):
    """The header of a section: a rule in the accent colour, a light band, a number badge and the takeaway."""
    from pptx.dml.color import RGBColor
    from pptx.enum.dml import MSO_THEME_COLOR
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.util import Pt
    x, y, w, h = hbox

    def accent(color):
        if palette:
            color.rgb = RGBColor.from_string(palette[0])
        else:
            color.theme_color = MSO_THEME_COLOR.ACCENT_1

    def block(name, left, top, width, height, shape=MSO_SHAPE.RECTANGLE):
        shp = slide.shapes.add_shape(shape, Pt(left), Pt(top), Pt(width), Pt(height))
        shp.name = name
        shp.shadow.inherit = False
        shp.line.fill.background()
        shp.fill.solid()
        return shp
    band = block(f'Section band {n}', x, y, w, h)
    if dark:
        band.fill.fore_color.rgb = RGBColor(0x2A, 0x2E, 0x33)
    else:
        band.fill.fore_color.theme_color = MSO_THEME_COLOR.TEXT_1
        band.fill.fore_color.brightness = 0.93
    accent(block(f'Section rule {n}', x, y, w, 2).fill.fore_color)
    badge = block(f'Takeaway badge {n}', x + PAD, y + PAD, BADGE, BADGE, MSO_SHAPE.OVAL)
    accent(badge.fill.fore_color)
    bf = badge.text_frame
    bf.margin_left = bf.margin_right = bf.margin_top = bf.margin_bottom = 0
    bf.vertical_anchor = MSO_ANCHOR.MIDDLE
    bf.paragraphs[0].alignment = PP_ALIGN.CENTER
    num = bf.paragraphs[0].add_run()
    num.text = str(n)
    num.font.size = Pt(10)
    num.font.bold = True
    num.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    tb = slide.shapes.add_textbox(Pt(x + BADGE + 2 * PAD), Pt(y + PAD), Pt(w - BADGE - 3 * PAD), Pt(h - 2 * PAD))
    tb.name = f'Takeaway {n}'
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    run = tf.paragraphs[0].add_run()
    run.text = text
    run.font.size = Pt(HEAD_FS)
    run.font.bold = True
    if dark:
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    return tb


def main(argv=None):
    ap = argparse.ArgumentParser(description='Any svg-charts chart as native PowerPoint shapes. Give two or three spec files '
                                             'to draw them side by side on one slide.')
    rt.add_target_args(ap, many=True)
    ap.add_argument('--palette', help='RRGGBB,RRGGBB,... in place of theme accents 1 to 5')
    ap.add_argument('--bare', action='store_true', help='leave out the title, unit and source lines of the chart')
    ap.add_argument('--title', help='with two or three specs and --out alone: the claim of the slide')
    a = ap.parse_args(argv)
    try:
        if a.list:
            rt.list_shapes(a.list, a.slide)
            return 0
        if not a.spec:
            raise SpecError('give a spec file')
        if len(a.spec) > 3:
            raise SpecError(f'{len(a.spec)} charts: a slide holds 3 at most. Use two slides, or one chart with more series')
        specs = [(path, load(path)) for path in a.spec]
        palette = [c.strip().lstrip('#').upper() for c in (a.palette or a.accent or '').split(',') if c.strip()]
        if any(not re.fullmatch(r'[0-9A-F]{6}', c) for c in palette):
            raise SpecError('--palette and --accent take colours as RRGGBB')
        many = len(specs) > 1
        path, spec = specs[0]
        if many and not a.into and not a.title and (a.out or not a.box):
            raise SpecError('a slide with two or three charts needs its own claim: give --title "<one sentence>"')
        if a.title and not many:
            raise SpecError('--title is for a slide with two or three charts; one chart takes its title from "claim"')
        head = {'claim': a.title} if many else spec
        if a.check:
            box = rt.parse_box(a.box) if a.box else rt.new_deck_box(head, a.subtitle)['box']
            box = rt.furnish_box(box, a.subtitle if a.box else None, a.takeaway)[0]
            if many:
                cols = side_by_side(specs, box)
                print(json.dumps({'ok': True, 'charts': [fit(p, s, c[2], 'none' if a.bare else 'full') for (p, s), c in zip(specs, cols)]}))
            else:
                print(json.dumps(dict(ok=True, **fit(path, spec, box, 'none' if a.bare else 'full'))))
            return 0
        if not a.out:
            raise SpecError('give --out')
        if not a.into and not many:
            if not spec.get('claim'):
                raise SpecError('the slide title is the claim: add "claim" to the spec, one sentence with the finding')
            if spec['chart'] == 'sparkline':
                raise SpecError('a sparkline is not a slide of its own: use --into with a small --box beside the number it supports')
        prs, slide, box = rt.open_target(a, head)
        background = rt.background_rgb(prs, slide)
        dark = a.on == 'dark' if a.on else rt.is_dark(background)
        if not palette:
            palette = theme_palette(slide, background, dark)
        # The subtitle of a new deck stands under its title. In an existing slide it stands at the top of the box.
        box = rt.furnish(slide, box, a.subtitle if a.into else None, a.takeaway, dark, palette[0] if palette else None)
        receipt = {'ok': True, 'out': a.out, 'slide': a.slide if a.into else 1}
        if not (a.palette or a.accent) and palette:
            receipt['palette'] = 'theme accents that read on this slide, then greys: ' + ','.join(palette)
        frame = 'none' if a.bare else 'full'          # each chart has its own title and its own source
        if many:
            charts = []
            for n, ((p, s), (lines, hbox, cbox)) in enumerate(zip(specs, side_by_side(specs, box)), 1):
                section_header(slide, n, s['claim'], hbox, dark, palette)
                charts.append(place(slide, p, s, cbox, frame, palette, dark, background))
            receipt['charts'] = charts
        else:
            receipt.update(place(slide, path, spec, box, frame, palette, dark, background))
        receipt['ink'] = 'light ink for a dark slide' if dark else 'theme text colour for a light slide'
        prs.save(a.out)
        print(json.dumps(receipt))
        return 0
    except SpecError as e:
        print(f'chart: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
