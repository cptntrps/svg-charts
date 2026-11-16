#!/usr/bin/env python3
"""Ranked bars with a table, as native PowerPoint shapes.

Reads the same spec file as `rankedTable` in charts.js, so the page and the deck
show the same rows, the same order and the same numbers.

  python3 deck/ranked_table.py spec.json --out chart.pptx
      one 16:9 slide: the claim as the slide title, the measure and unit, the chart, the source
  python3 deck/ranked_table.py spec.json --into deck.pptx --slide 3 --box 40,130,880,330 --out deck2.pptx
      the chart only, inside a box (x,y,w,h in points) on slide 3 of an existing deck
  python3 deck/ranked_table.py spec.json --into deck.pptx --slide 3 --replace "Content Placeholder 2" --out deck2.pptx
      the chart takes the box of that shape and the shape is removed
  python3 deck/ranked_table.py --list deck.pptx --slide 3
      the shapes on a slide with their boxes, to choose --box or --replace
  python3 deck/ranked_table.py spec.json --check
      checks the spec only

Colours and fonts come from the deck theme (accent 1 for the bars, text 1 for the
ink), so the chart takes the look of the template it lands in. `--accent RRGGBB`
forces a bar colour. On a dark slide the ink is light: the script reads the
background from the deck, and `--on dark` or `--on light` sets it when the
background is a picture. Every shape is editable and the chart is one group.

Nothing is cut or shrunk without notice: a label that does not fit, a box that is
too small or a bad spec stops the run with exit 2 and the reason.
Needs python-pptx.
"""
import argparse
import json
import math
import sys

EM = 0.6            # text width estimate, the same as charts.js: 0.6em per character
FS, FS_HEAD, FS_NOTE = 12, 10, 9
ROW_MIN, ROW_MAX, HEAD_H, NOTE_H = 20, 34, 22, 13


class SpecError(ValueError):
    pass


def fin(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def text_w(s, fs):
    return len(str(s)) * fs * EM


def wrap(s, width, fs, em=0.54):
    """Wrap prose (a footnote, the claim): 0.54em per character, the same as charts.js."""
    limit, lines, cur = max(8, int(width // (fs * em))), [], ''
    for w in str(s).split():
        if cur and len(cur) + 1 + len(w) > limit:
            lines.append(cur)
            cur = w
        else:
            cur = f'{cur} {w}' if cur else w
    return lines + [cur] if cur else lines


def model(spec):
    """Validate the spec and return the rows in draw order with their cell texts.
    The rules are the rules of rankedTable in charts.js."""
    rows, columns = spec.get('rows') or [], spec.get('columns') or []
    total, change, fmt = spec.get('total'), spec.get('change'), spec.get('format') or {}
    dec = fmt.get('decimals', 0)
    if not rows:
        raise SpecError('the spec has no rows')
    if len(columns) > 3:
        raise SpecError('a ranked table holds the bar value and at most 3 more columns; put the rest in a table')
    if change and not all(isinstance(change.get(k), int) and 0 <= change[k] < len(columns) for k in ('from', 'to')):
        raise SpecError('change.from and change.to must be positions in columns')
    if total and not fin(total.get('value')):
        raise SpecError('total needs a value')
    for r in rows + ([total] if total else []):
        what = f'row "{r.get("label")}"'
        v = r.get('value')
        if v is not None and (not fin(v) or v < 0):
            raise SpecError(f'{what}: value must be a number of zero or more, or null with a note')
        if v is None and not r.get('note'):
            raise SpecError(f'{what}: a row without a value needs a note that says why')
        if r.get('cols') is not None and len(r['cols']) != len(columns):
            raise SpecError(f'{what}: cols needs {len(columns)} entries, one per column')
    labels = [r['label'] for r in rows]
    for n in spec.get('highlight') or []:
        if n not in labels:
            raise SpecError(f'highlight "{n}" is not a row label')

    def f(v):
        return f"{'−' if v < 0 else ''}{fmt.get('prefix', '')}{abs(v):,.{dec}f}{fmt.get('suffix', '')}"

    cd = (change or {}).get('decimals', dec)

    def delta(r):
        cols = r.get('cols') or []
        a = cols[change['from']] if cols else None
        b = cols[change['to']] if cols else None
        if not fin(a) or not fin(b):
            return 'n.a.'
        d, eps = b - a, 0.5 / 10 ** cd
        sign = '▲ +' if d >= eps else '▼ −' if d <= -eps else ''
        return f"{sign}{abs(d):.{cd}f}{change.get('suffix', '')}"

    ranked = rows
    if spec.get('sort', True):
        ranked = sorted((r for r in rows if r.get('value') is not None), key=lambda r: -r['value']) + \
            [r for r in rows if r.get('value') is None]
    out = []
    for r in ranked + ([dict(total, total=True)] if total else []):
        cols = r.get('cols') or [None] * len(columns)
        cells = [f(r['value']) if r.get('value') is not None else ''] + \
            [f(c) if fin(c) else 'n.a.' for c in cols] + ([delta(r)] if change else [])
        out.append(dict(r, cells=cells, name=r['label'] + (' *' if r.get('flag') else '')))
    heads = [spec.get('valueLabel', 'Value')] + list(columns) + ([change.get('label', 'Change')] if change else [])
    return out, heads


def layout(spec, box):
    """Geometry in points inside box (x, y, w, h). Raises SpecError when the content does not fit."""
    x, y, w, h = box
    rows, heads = model(spec)
    cw = [math.ceil(max([text_w(hd, FS_HEAD)] + [text_w(r['cells'][j], FS) for r in rows])) + 16 for j, hd in enumerate(heads)]
    table_w = sum(cw)
    need = max(text_w(r['name'], FS) for r in rows) + 14
    name_w = min(need, w * 0.34)
    if need > name_w:
        long = max(rows, key=lambda r: len(r['name']))['label']
        raise SpecError(f'label "{long}" needs {need:.0f}pt, the box gives {name_w:.0f}pt: shorten the label or widen the box')
    bar_w = w - name_w - table_w - 8
    if bar_w < 100:
        raise SpecError(f'the bars get {bar_w:.0f}pt of a {w:.0f}pt box, they need 100pt: widen the box or drop a column')
    notes = [ln for r in rows if r.get('flag') for ln in wrap(f"* {r['label']}: {r['flag']}", w, FS_NOTE)]
    notes_h = len(notes) * NOTE_H + (6 if notes else 0)
    rh = min(ROW_MAX, (h - HEAD_H - notes_h) / len(rows))
    if rh < ROW_MIN:
        raise SpecError(f'{len(rows)} rows need {HEAD_H + notes_h + ROW_MIN * len(rows):.0f}pt of height, the box has {h:.0f}pt: '
                        'use fewer rows, a shorter flag or a taller box')
    for r in rows:
        if r.get('value') is None and text_w(r['note'], FS_HEAD) > bar_w + cw[0] - 8:
            raise SpecError(f'the note of row "{r["label"]}" is too long for the bar area: shorten it')
    x0 = x + name_w
    x1 = x0 + bar_w
    edges, acc = [], x1 + 8
    for c in cw:
        acc += c
        edges.append(acc)
    vmax = max(r.get('value') or 0 for r in rows) or 1
    return dict(rows=rows, heads=heads, cw=cw, x=x, y=y, w=w, name_w=name_w, x0=x0, x1=x1, edges=edges, rh=rh,
                bh=max(6, min(16, rh - 12)), top=y + HEAD_H, vmax=vmax, notes=notes,
                height=HEAD_H + rh * len(rows) + notes_h)


A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'


def _theme_rgb(master, name):
    """The RGB of a theme colour name (bg1, tx1, accent1 ...) through the master colour map."""
    from lxml import etree
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT
    cmap = master._element.xpath('./p:clrMap')
    key = cmap[0].get(name, name) if cmap else name
    el = etree.fromstring(master.part.part_related_by(RT.THEME).blob).find(f'.//{A}clrScheme/{A}{key}')
    return None if el is None or not len(el) else el[0].get('val') if el[0].tag == f'{A}srgbClr' else el[0].get('lastClr')


def _fill_rgb(el, master):
    """The RGB of a solid fill under el, or None when the fill is not one plain colour."""
    rgb = el.find(f'{A}solidFill/{A}srgbClr')
    scheme = el.find(f'{A}solidFill/{A}schemeClr')
    if scheme is None:
        scheme = el.find(f'{A}schemeClr')              # p:bgRef holds the colour directly
    return rgb.get('val') if rgb is not None else _theme_rgb(master, scheme.get('val')) if scheme is not None else None


def background_rgb(prs, slide):
    """The RGB of the slide background: a full-size filled shape on the slide, its layout or its master,
    or else the background fill. None when it cannot be read (a picture background): pass --on dark."""
    master = slide.slide_layout.slide_master
    rgb = None
    for part in (slide, slide.slide_layout, master):
        for sp in part._element.xpath('./p:cSld/p:spTree/p:sp'):
            ext = sp.xpath('./p:spPr/a:xfrm/a:ext')
            if ext and int(ext[0].get('cx')) >= prs.slide_width * 0.9 and int(ext[0].get('cy')) >= prs.slide_height * 0.9:
                rgb = _fill_rgb(sp.xpath('./p:spPr')[0], master) or rgb
        bg = part._element.xpath('./p:cSld/p:bg/p:bgPr | ./p:cSld/p:bg/p:bgRef')
        if not rgb and bg:
            rgb = _fill_rgb(bg[0], master)
        if rgb:
            break
    return rgb


def is_dark(rgb):
    if not rgb:
        return False
    r, g, b = (int(rgb[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35


def background_is_dark(prs, slide):
    """True when the slide stands on a dark background."""
    return is_dark(background_rgb(prs, slide))


def draw(slide, spec, box, accent=None, dark=False, frame=False):
    """Draw the chart into the slide as one group of native shapes. Returns the layout.
    frame=True also writes "title · unit" above the chart and the source under it, inside the box.
    frame='source' writes the source only (the slide has its own subtitle)."""
    from pptx.dml.color import RGBColor
    from pptx.enum.dml import MSO_THEME_COLOR
    from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.util import Pt

    head = [str(spec[k]) for k in ('title', 'unit') if frame is True and spec.get(k)]
    foot = f"Source: {spec['source']}" if frame and spec.get('source') else None
    band_top, band_bottom = (22 if head else 0), (16 if foot else 0)
    g = layout(spec, (box[0], box[1] + band_top, box[2], box[3] - band_top - band_bottom))
    grp = slide.shapes.add_group_shape()
    grp.name = 'Ranked table'
    highlight = spec.get('highlight')

    def ink(color, level):
        """Ink that fades toward the background: 0 = ink, 0.35 = muted text, 0.5 = total bar, 0.75 = muted bar,
        0.8 = rule. On a light slide it is the theme text colour, lightened. On a dark slide it is a grey from white."""
        if dark:
            v = round(255 * (1 - level * 0.87))
            color.rgb = RGBColor(v, v, v)
            return
        color.theme_color = MSO_THEME_COLOR.TEXT_1
        if level:
            color.brightness = level

    def text(s, left, top, width, height, size, align, level=0.0, bold=False):
        tb = grp.shapes.add_textbox(Pt(left), Pt(top), Pt(width), Pt(height))
        tf = tb.text_frame
        tf.word_wrap = False
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.alignment = align
        # A change mark (▲ or ▼) is its own run: a font without the glyph then replaces the mark only, not the digits.
        for part in ([s[0], s[1:]] if s[:1] in '▲▼' and len(s) > 1 else [s]):
            run = p.add_run()
            run.text = part
            run.font.size = Pt(size)
            run.font.bold = bold
            ink(run.font.color, level)
        return tb

    def rule(xa, ya, xb, yb, level=0.8):
        ln = grp.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Pt(xa), Pt(ya), Pt(xb), Pt(yb))
        ln.line.width = Pt(0.75)
        ink(ln.line.color, level)
        for style in ln._element.xpath('./p:style'):      # the default connector style adds a theme shadow
            ln._element.remove(style)

    for j, hd in enumerate(g['heads']):
        text(hd, g['edges'][j] - g['cw'][j], g['y'], g['cw'][j], HEAD_H - 4, FS_HEAD, PP_ALIGN.RIGHT, 0.35)
    rule(g['x'], g['top'] - 2, g['x'] + g['w'], g['top'] - 2)
    total = next((r for r in g['rows'] if r.get('total')), None)
    xt = g['x0'] + (g['x1'] - g['x0']) * total['value'] / g['vmax'] if total else None
    refs = []           # the reference line marks the total on the rows that have a bar; it skips a row that shows a note
    for k, r in enumerate(g['rows']):
        top = g['top'] + k * g['rh']
        yc = top + g['rh'] / 2
        is_total = bool(r.get('total'))
        if is_total:
            rule(g['x'], top, g['x'] + g['w'], top)
        if total and r.get('value') is not None:
            refs.append((top if k else g['top'] - 2, yc - g['bh'] / 2 if is_total else top + g['rh']))
        text(r['name'], g['x'], top, g['name_w'] - 10, g['rh'], FS, PP_ALIGN.RIGHT, bold=is_total)
        if r.get('value') is not None:
            bar_w = max(1.0, (g['x1'] - g['x0']) * r['value'] / g['vmax'])
            bar = grp.shapes.add_shape(MSO_SHAPE.RECTANGLE, Pt(g['x0']), Pt(yc - g['bh'] / 2), Pt(bar_w), Pt(g['bh']))
            bar.name = f"Bar {r['label']}"
            bar.shadow.inherit = False
            bar.line.fill.background()
            bar.fill.solid()
            if is_total:
                ink(bar.fill.fore_color, 0.5)
            elif highlight and r['label'] not in highlight:
                ink(bar.fill.fore_color, 0.75)
            elif accent:
                bar.fill.fore_color.rgb = RGBColor.from_string(accent)
            else:
                bar.fill.fore_color.theme_color = MSO_THEME_COLOR.ACCENT_1
        else:
            text(r['note'], g['x0'] + 6, top, g['edges'][0] - g['x0'] - 6, g['rh'], FS_HEAD, PP_ALIGN.LEFT, 0.35)
        for j, cell in enumerate(r['cells']):
            if cell:
                text(cell, g['edges'][j] - g['cw'][j], top, g['cw'][j], g['rh'], FS, PP_ALIGN.RIGHT,
                     0.35 if cell == 'n.a.' else 0.0, bold=(j == 0 or is_total) and cell != 'n.a.')
    merged = []         # join the segments of adjacent rows, so the line is one shape per run of bars
    for ya, yb in refs:
        if merged and abs(merged[-1][1] - ya) < 0.01:
            merged[-1][1] = yb
        else:
            merged.append([ya, yb])
    for ya, yb in merged:
        rule(xt, ya, xt, yb, 0.35)
    for i, ln in enumerate(g['notes']):
        text(ln, g['x'], g['top'] + g['rh'] * len(g['rows']) + 6 + i * NOTE_H, g['w'], NOTE_H, FS_NOTE, PP_ALIGN.LEFT, 0.35)
    if head:
        tb = text(spec['title'] if spec.get('title') else head[0], box[0], box[1], box[2], 18, 14, PP_ALIGN.LEFT,
                  0.0 if spec.get('title') else 0.35, bold=bool(spec.get('title')))
        if spec.get('title') and spec.get('unit'):
            run = tb.text_frame.paragraphs[0].add_run()
            run.text = f" · {spec['unit']}"
            run.font.size = Pt(14)
            run.font.bold = False
            ink(run.font.color, 0.35)
    if foot:
        text(foot, box[0], g['top'] - HEAD_H + g['height'] + 2, box[2], 14, 10, PP_ALIGN.LEFT, 0.35)
    alt = '; '.join(f"{r['label']}: " + (', '.join(f'{h} {c}' for h, c in zip(g['heads'], r['cells'])) if r.get('value') is not None
                                           else r['note']) for r in g['rows'])
    grp._element.xpath('./p:nvGrpSpPr/p:cNvPr')[0].set('descr', f"{spec.get('title', 'Ranked table')}. {alt}")
    return g


def list_shapes(path, slide_no):
    from pptx import Presentation
    prs = Presentation(path)
    slide = prs.slides[slide_no - 1]
    print(json.dumps({'slide_size_pt': [prs.slide_width / 12700, prs.slide_height / 12700], 'shapes': [
        {'name': s.name, 'type': str(s.shape_type), 'box_pt': [round(v / 12700, 1) for v in (s.left, s.top, s.width, s.height)],
         'text': (s.text_frame.text[:60] if s.has_text_frame else '')} for s in slide.shapes]}, indent=1))


def add_target_args(ap, many=False):
    ap.add_argument('spec', nargs='*' if many else '?')
    ap.add_argument('--out')
    ap.add_argument('--into')
    ap.add_argument('--slide', type=int, default=1)
    ap.add_argument('--box')
    ap.add_argument('--replace')
    ap.add_argument('--accent')
    ap.add_argument('--on', choices=['light', 'dark'], help='background of the slide; read from the deck when not given')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--list')
    ap.add_argument('--subtitle', help='one or two lines about the slide, under its title: the scope, the period, the premise. '
                    'It is not a chart title: each chart has its own title, which says what its data is')
    ap.add_argument('--takeaway', help='one or two bold lines under the chart: the comment, what the reader must conclude or do')


def parse_box(text):
    try:
        box = [float(v) for v in text.split(',')]
    except ValueError:
        box = []
    if len(box) != 4:
        raise SpecError('--box takes x,y,w,h in points')
    return box


SUB_FS, SUB_LINE = 14, 19        # subtitle and takeaway text
TITLE_GAP = 22                   # points between the title block and the chart


def new_deck_box(spec, subtitle=None):
    """Layout of the one-slide deck that --out writes: the claim as the slide title, the subtitle of the slide
    when one is given, then the chart box. The chart has its own title (what its data is) and its own source.
    Returns a dict; `box` is x, y, w, h in points."""
    head = wrap(spec.get('claim') or spec.get('title') or '', 864, 24, 0.56)
    if len(head) > 3:
        raise SpecError(f'the claim needs {len(head)} lines at 24pt, the slide holds 3: shorten it')
    head_h = 30 * max(1, len(head))
    lines = wrap(subtitle, 864, SUB_FS) if subtitle else []
    if len(lines) > 2:
        raise SpecError(f'the subtitle needs {len(lines)} lines, it has 2: shorten it')
    top = 32 + head_h + 6 + (SUB_LINE * len(lines) + 4 if lines else 0) + TITLE_GAP
    return dict(head=head, head_h=head_h, subtitle=subtitle or '', box=[48, top, 864, 500 - top])


def furnish_box(box, subtitle=None, takeaway=None):
    """The chart box that stays when a subtitle stands at the top of the box and a takeaway at its bottom."""
    x, y, w, h = box
    sub = wrap(subtitle, w, SUB_FS) if subtitle else []
    take = wrap(takeaway, w - 14, SUB_FS) if takeaway else []
    for name, lines in (('subtitle', sub), ('takeaway', take)):
        if len(lines) > 2:
            raise SpecError(f'the {name} needs {len(lines)} lines in {w:.0f}pt, it has 2: shorten it')
    top = SUB_LINE * len(sub) + TITLE_GAP if sub else 0
    bottom = SUB_LINE * len(take) + 10 + 16 if take else 0
    return [x, y + top, w, h - top - bottom], sub, take


def _ink(color, level, dark):
    from pptx.dml.color import RGBColor
    from pptx.enum.dml import MSO_THEME_COLOR
    if dark:
        v = round(255 * (1 - level * 0.87))
        color.rgb = RGBColor(v, v, v)
    else:
        color.theme_color = MSO_THEME_COLOR.TEXT_1
        if level:
            color.brightness = level


def furnish(slide, box, subtitle=None, takeaway=None, dark=False, accent=None):
    """Write the subtitle at the top of the box and the takeaway (an accent bar and a bold line) at its bottom.
    Returns the box that stays for the chart."""
    from pptx.dml.color import RGBColor
    from pptx.enum.dml import MSO_THEME_COLOR
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR
    from pptx.util import Pt
    chart_box, sub, take = furnish_box(box, subtitle, takeaway)
    x, y, w, h = box

    def line(name, s, left, top, width, height, bold, level):
        tb = slide.shapes.add_textbox(Pt(left), Pt(top), Pt(width), Pt(height))
        tb.name = name
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        run = tf.paragraphs[0].add_run()
        run.text = s
        run.font.size = Pt(SUB_FS)
        run.font.bold = bold
        _ink(run.font.color, level, dark)
    if sub:
        line('Subtitle', subtitle, x, y, w, SUB_LINE * len(sub), False, 0.35)
    if take:
        th = SUB_LINE * len(take) + 10
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Pt(x), Pt(y + h - th), Pt(4), Pt(th))
        bar.name = 'Takeaway bar'
        bar.shadow.inherit = False
        bar.line.fill.background()
        bar.fill.solid()
        if accent:
            bar.fill.fore_color.rgb = RGBColor.from_string(accent)
        else:
            bar.fill.fore_color.theme_color = MSO_THEME_COLOR.ACCENT_1
        line('Takeaway', takeaway, x + 14, y + h - th, w - 14, th, True, 0.0)
    return chart_box


def open_target(a, spec):
    """The deck, the slide and the box (x, y, w, h in points) the chart goes to.
    With --into: an existing slide, the box of --replace (that shape is removed) or --box.
    Without: a new 16:9 deck with one slide: the claim as its title and the subtitle of the slide under it."""
    from pptx import Presentation
    from pptx.util import Pt
    if a.into:
        prs = Presentation(a.into)
        if not 1 <= a.slide <= len(prs.slides):
            raise SpecError(f'--slide {a.slide}: the deck has {len(prs.slides)} slides')
        slide = prs.slides[a.slide - 1]
        if a.replace:
            old = [s for s in slide.shapes if s.name == a.replace]
            if len(old) != 1:
                raise SpecError(f'--replace "{a.replace}": {len(old)} shapes have that name on slide {a.slide}; see --list')
            box = [v / 12700 for v in (old[0].left, old[0].top, old[0].width, old[0].height)]
            old[0]._element.getparent().remove(old[0]._element)
        elif a.box:
            box = parse_box(a.box)
        else:
            raise SpecError('--into needs --box x,y,w,h or --replace "<shape name>"')
        sw, sh = prs.slide_width / 12700, prs.slide_height / 12700
        if box[0] < 0 or box[1] < 0 or box[0] + box[2] > sw + 0.5 or box[1] + box[3] > sh + 0.5:
            raise SpecError(f'the box {box} is outside the {sw:.0f}x{sh:.0f}pt slide')
        return prs, slide, box
    lay = new_deck_box(spec, getattr(a, 'subtitle', None))
    prs = Presentation()
    prs.slide_width, prs.slide_height = Pt(960), Pt(540)
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    from pptx.enum.text import PP_ALIGN

    def run(p, text, size, bold, level=0.0):
        p.alignment = PP_ALIGN.LEFT
        r = p.add_run()
        r.text = text
        r.font.size = Pt(size)
        r.font.bold = bold
        if level:
            _ink(r.font.color, level, False)
    # One text box holds the title block, so the subtitle follows the title where the title really ends: the
    # line count is an estimate, the font of the machine decides. The slide title is the claim (the finding as a
    # sentence); the subtitle of the slide goes under it.
    block = [(' '.join(lay['head']), 24, True, 0.0)] if lay['head'] else []
    if lay['subtitle']:
        block.append((lay['subtitle'], SUB_FS, False, 0.35))
    if block:
        tb = slide.shapes.add_textbox(Pt(48), Pt(32), Pt(864), Pt(lay['box'][1] - TITLE_GAP - 32))
        tb.name = 'Title'
        tb.text_frame.word_wrap = True
        tb.text_frame.margin_left = tb.text_frame.margin_right = tb.text_frame.margin_bottom = 0
        # The block stands on the bottom of its box: the room between the subtitle and the chart stays the same
        # when the title takes fewer or more lines than the estimate.
        from pptx.enum.text import MSO_ANCHOR
        tb.text_frame.vertical_anchor = MSO_ANCHOR.BOTTOM
        for i, (text, size, bold, level) in enumerate(block):
            p = tb.text_frame.paragraphs[0] if i == 0 else tb.text_frame.add_paragraph()
            if i:
                p.space_before = Pt(4)
            run(p, text, size, bold, level)
    return prs, slide, lay['box']


def main(argv=None):
    ap = argparse.ArgumentParser(description='Ranked bars with a table as native PowerPoint shapes.')
    add_target_args(ap)
    a = ap.parse_args(argv)
    try:
        if a.list:
            list_shapes(a.list, a.slide)
            return 0
        if not a.spec:
            raise SpecError('give a spec file')
        with open(a.spec, encoding='utf-8') as fh:
            spec = json.load(fh)
        if a.check:
            rows, heads = model(spec)
            print(json.dumps({'ok': True, 'rows': [r['label'] for r in rows], 'columns': heads}))
            return 0
        if not a.out:
            raise SpecError('give --out')
        prs, slide, box = open_target(a, spec)
        dark = a.on == 'dark' if a.on else background_is_dark(prs, slide)
        box = furnish(slide, box, a.subtitle if a.into else None, a.takeaway, dark, a.accent)
        g = draw(slide, spec, box, a.accent, dark, frame=True)
        prs.save(a.out)
        print(json.dumps({'ok': True, 'out': a.out, 'slide': a.slide if a.into else 1, 'box_pt': [round(v, 1) for v in box],
                          'used_height_pt': round(g['height'], 1), 'row_height_pt': round(g['rh'], 1),
                          'ink': 'light ink for a dark slide' if dark else 'theme text colour for a light slide',
                          'rows': [r['label'] for r in g['rows']]}))
        return 0
    except SpecError as e:
        print(f'ranked_table: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
