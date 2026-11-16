#!/usr/bin/env python3
"""Any svg-charts chart as native PowerPoint shapes, from the spec file that draws the page.

  python3 deck/chart.py spec.json --check
      checks the spec and the fit at slide size
  python3 deck/chart.py spec.json --out chart.pptx
      one 16:9 slide: the claim as the slide title, "title · unit", the chart, the source
  python3 deck/chart.py spec.json --into deck.pptx --slide 3 --replace "Content Placeholder 2" --out deck2.pptx
      the chart takes the box of that shape on slide 3 and the shape is removed
  python3 deck/chart.py spec.json --into deck.pptx --slide 3 --box 40,130,880,330 --out deck2.pptx
      the chart inside a box (x,y,w,h in points)
  python3 deck/chart.py --list deck.pptx --slide 3
      the shapes on a slide with their boxes, to choose --box or --replace

`charts.js` computes the geometry (through deck/render.mjs, so `node` is needed) and this script writes each
mark as a native shape: bars are rectangles, lines are connectors and freeforms, slices are arcs, text is text.
One point on the slide is one pixel of the page chart, so the text has the size the builder gives it.
`rankedTable` has its own layout in deck/ranked_table.py and needs no node.

With --into the chart keeps its own "title · unit" line and its source line; --bare leaves them out when the
slide has its own places for them. Colours and fonts come from the deck theme: accents 1 to 5 for the palette,
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


def render(spec_path, width, height, bare):
    """The page chart of the spec at this size, from charts.js in strict mode."""
    node = shutil.which('node')
    if not node:
        raise SpecError('node is not installed: charts.js computes the geometry of every chart but rankedTable')
    cmd = [node, os.path.join(HERE, 'render.mjs'), spec_path, '--width', str(int(width)), '--height', str(int(height))]
    p = subprocess.run(cmd + (['--bare'] if bare else []), capture_output=True, text=True, encoding='utf-8')
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
        if m.group(1) in ACCENTS or m.group(1) in INK_LEVEL or m.group(1) in ('up', 'down', 'target', 'paper'):
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
        shp = self.grp.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rx > 0.2 else MSO_SHAPE.RECTANGLE,
                                        Pt(self.ox + x), Pt(self.oy + y), Pt(max(w, 0.1)), Pt(max(h, 0.1)))
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


def main(argv=None):
    ap = argparse.ArgumentParser(description='Any svg-charts chart as native PowerPoint shapes.')
    rt.add_target_args(ap)
    ap.add_argument('--palette', help='RRGGBB,RRGGBB,... in place of theme accents 1 to 5')
    ap.add_argument('--bare', action='store_true', help='with --into: leave out the title, unit and source lines of the chart')
    a = ap.parse_args(argv)
    try:
        if a.list:
            rt.list_shapes(a.list, a.slide)
            return 0
        if not a.spec:
            raise SpecError('give a spec file')
        try:
            with open(a.spec, encoding='utf-8') as fh:
                spec = json.load(fh)
        except (OSError, json.JSONDecodeError) as e:
            raise SpecError(f'{a.spec}: {e}')
        kind = spec.get('chart') if isinstance(spec, dict) else None
        if not kind:
            raise SpecError('the spec needs "chart": the name of the chart type (see SKILL.md)')
        palette = [c.strip().lstrip('#').upper() for c in (a.palette or a.accent or '').split(',') if c.strip()]
        if any(not re.fullmatch(r'[0-9A-F]{6}', c) for c in palette):
            raise SpecError('--palette and --accent take colours as RRGGBB')
        ranked = kind == 'rankedTable'
        if a.check:
            box = rt.parse_box(a.box) if a.box else rt.new_deck_box(spec)[3]
            if ranked:
                rows, heads = rt.model(spec)
                rt.layout(spec, box)
                print(json.dumps({'ok': True, 'chart': kind, 'box_pt': box, 'rows': [r['label'] for r in rows], 'columns': heads}))
            else:
                d = render(a.spec, box[2], box[3], bare=not a.box)
                print(json.dumps({'ok': True, 'chart': kind, 'box_pt': box, 'used_pt': [d['width'], d['height']]}))
            return 0
        if not a.out:
            raise SpecError('give --out')
        if not a.into:
            if not spec.get('claim'):
                raise SpecError('the slide title is the claim: add "claim" to the spec, one sentence with the finding')
            if kind == 'sparkline':
                raise SpecError('a sparkline is not a slide of its own: use --into with a small --box beside the number it supports')
        prs, slide, box = rt.open_target(a, spec)
        background = rt.background_rgb(prs, slide)
        dark = a.on == 'dark' if a.on else rt.is_dark(background)
        framed = bool(a.into) and not a.bare
        receipt = {'ok': True, 'out': a.out, 'chart': kind, 'slide': a.slide if a.into else 1, 'box_pt': [round(v, 1) for v in box]}
        if ranked:
            g = rt.draw(slide, spec, box, palette[0] if palette else None, dark, frame=framed)
            receipt.update(used_height_pt=round(g['height'], 1), rows=[r['label'] for r in g['rows']])
        else:
            d = render(a.spec, box[2], box[3], bare=not framed)
            canvas = draw_svg(slide, d, box, palette, dark, background)
            receipt.update(used_pt=[d['width'], d['height']], shapes=canvas.count)
        receipt['ink'] = 'light ink for a dark slide' if dark else 'theme text colour for a light slide'
        prs.save(a.out)
        print(json.dumps(receipt))
        return 0
    except SpecError as e:
        print(f'chart: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
