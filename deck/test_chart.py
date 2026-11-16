"""Tests for deck/chart.py. Run: python3 -m unittest discover -s deck"""
import contextlib
import html
import io
import json
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.util import Pt

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'deck'))
import chart as ch  # noqa: E402

EXAMPLES = sorted((ROOT / 'examples').glob('*.json'))
PT = 12700
NODE = shutil.which('node')


def run(*args):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = ch.main([str(a) for a in args])
    return code, out.getvalue(), err.getvalue()


def group(slide):
    groups = [s for s in slide.shapes if s.shape_type == MSO_SHAPE_TYPE.GROUP]
    assert len(groups) == 1, 'one chart group on the slide'
    return groups[0]


def title_block(slide):
    return [p.text for p in next(s for s in slide.shapes if s.name == 'Title').text_frame.paragraphs]


def texts(shapes):
    return [s.text_frame.text for s in shapes if s.has_text_frame and s.text_frame.text]


@unittest.skipUnless(NODE, 'node is not installed: the deck tests for the charts that charts.js draws did not run')
class ChartDeck(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def write(self, spec):
        p = self.dir / 'spec.json'
        p.write_text(json.dumps(spec), encoding='utf-8')
        return p

    def base_deck(self, dark=False):
        deck = self.dir / 'base.pptx'
        prs = Presentation()
        prs.slide_width, prs.slide_height = Pt(960), Pt(540)
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        if dark:
            back = slide.shapes.add_shape(1, 0, 0, prs.slide_width, prs.slide_height)
            back.fill.solid()
            back.fill.fore_color.rgb = RGBColor(0x10, 0x18, 0x20)
        hole = slide.shapes.add_textbox(Pt(40), Pt(120), Pt(880), Pt(360))
        hole.name = 'Chart area'
        prs.save(deck)
        return deck

    def test_every_example_becomes_one_group_with_the_texts_of_the_page(self):
        self.assertEqual(len(EXAMPLES), 25)
        for path in EXAMPLES:
            spec = json.loads(path.read_text(encoding='utf-8'))
            if spec['chart'] == 'sparkline':
                continue
            with self.subTest(chart=spec['chart']):
                out = self.dir / f'{path.stem}.pptx'
                code, receipt, err = run(path, '--out', out)
                self.assertEqual(code, 0, err)
                box = json.loads(receipt)['box_pt']
                slide = Presentation(out).slides[0]
                g = group(slide)
                self.assertGreaterEqual(g.left, box[0] * PT - PT)
                self.assertGreaterEqual(g.top, box[1] * PT - 6 * PT)       # a text box stands a little above its baseline row
                self.assertLessEqual(g.left + g.width, (box[0] + box[2]) * PT + PT)
                self.assertLessEqual(g.top + g.height, (box[1] + box[3]) * PT + 6 * PT)
                self.assertEqual(title_block(slide)[0], spec['claim'], 'the slide title is the claim')
                if spec['chart'] == 'rankedTable':
                    continue
                title = ' · '.join(str(spec[k]) for k in ('title', 'unit') if spec.get(k))
                head = ch.chart_title(spec, box[2])[2]
                page = ch.render(str(path), box[2], box[3] - head, 'source')['svg']
                want = [html.unescape(re.sub(r'<title>.*?</title>|<[^>]+>', '', m)) for m in re.findall(r'<text\b[^>]*>(.*?)</text>', page)]
                have = texts(g.shapes)
                self.assertEqual(sorted([t for t in want if t.strip()] + [title]), sorted(have), 'the slide shows the texts of the page chart and the chart title')
                name = next(s for s in g.shapes if s.name == 'Chart title')
                self.assertTrue(name.text_frame.word_wrap, 'the title wraps where the chart ends')
                self.assertAlmostEqual(name.width / PT, box[2] - 4, places=0, msg='the title box has the width of the chart')

    def test_marks_are_native_shapes_with_their_tooltip_as_name(self):
        out = self.dir / 'bar.pptx'
        self.assertEqual(run(ROOT / 'examples' / 'bar-chart.json', '--out', out)[0], 0)
        g = group(Presentation(out).slides[0])
        bars = [s for s in g.shapes if s.shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE and ':' in s.name]
        self.assertEqual([b.name for b in bars], ['Search: 1,240', 'Direct: 980', 'Social: 860', 'Email: 640', 'Referral: 410'])
        self.assertAlmostEqual(bars[0].height / bars[1].height, 1240 / 980, places=2)
        self.assertEqual(len({b.top + b.height for b in bars}), 1, 'all bars stand on one baseline')
        self.assertEqual(len({str(b.fill.fore_color.theme_color) for b in bars}), 1, 'one series, one colour')
        self.assertIn('ACCENT_1', str(bars[0].fill.fore_color.theme_color))

    def test_curves_are_native_geometry(self):
        for name, tag, count in (('donut', 'arcTo', 12), ('gauge', 'arcTo', 2), ('sankey', 'cubicBezTo', 12)):
            out = self.dir / f'{name}.pptx'
            self.assertEqual(run(ROOT / 'examples' / f'{name}.json', '--out', out)[0], 0)
            g = group(Presentation(out).slides[0])
            found = g._element.xpath(f'.//a:custGeom//a:{tag}')
            self.assertEqual(len(found), count, f'{name}: {tag}')
        # the gauge value arc covers 72% of the half circle
        g = group(Presentation(self.dir / 'gauge.pptx').slides[0])
        sweeps = sorted(int(a.get('swAng')) for a in g._element.xpath('.//a:custGeom//a:arcTo'))
        self.assertEqual(sweeps, [round(180 * 0.72 * 60000), 180 * 60000])

    def test_into_keeps_the_frame_and_bare_leaves_it_out(self):
        deck, out = self.base_deck(), self.dir / 'deck2.pptx'
        spec = ROOT / 'examples' / 'line-chart.json'
        self.assertEqual(run(spec, '--into', deck, '--replace', 'Chart area', '--out', out)[0], 0)
        slide = Presentation(out).slides[0]
        self.assertNotIn('Chart area', [s.name for s in slide.shapes])
        have = texts(group(slide).shapes)
        self.assertIn('Support tickets · tickets per month', have)
        self.assertIn('Source: Sample data', have)
        self.assertEqual(run(spec, '--into', deck, '--replace', 'Chart area', '--bare', '--out', out)[0], 0)
        have = texts(group(Presentation(out).slides[0]).shapes)
        self.assertFalse([t for t in have if t.startswith('Source:') or t.startswith('Support tickets')])
        ranked = ROOT / 'examples' / 'ranked-table.json'
        self.assertEqual(run(ranked, '--into', deck, '--replace', 'Chart area', '--out', out)[0], 0)
        have = texts(group(Presentation(out).slides[0]).shapes)
        self.assertIn('Travel cost per revenue dollar · travel cost / revenue', have)
        self.assertTrue(any(t.startswith('Source: Sample ledger') for t in have))

    def test_a_dark_slide_gets_light_ink_and_a_palette_forces_colours(self):
        deck, out = self.base_deck(dark=True), self.dir / 'dark.pptx'
        spec = ROOT / 'examples' / 'dumbbell.json'
        code, receipt, err = run(spec, '--into', deck, '--box', '40,120,880,360', '--palette', 'AA0000,00AA00', '--out', out)
        self.assertEqual(code, 0, err)
        self.assertIn('light ink', json.loads(receipt)['ink'])
        g = group(Presentation(out).slides[0])
        label = next(s for s in g.shapes if s.has_text_frame and s.text_frame.text == 'Line one')
        self.assertEqual(str(label.text_frame.paragraphs[0].runs[0].font.color.rgb), 'FFFFFF')
        hollow = next(s for s in g.shapes if s.name.startswith('Line one April'))
        self.assertEqual(str(hollow.fill.fore_color.rgb), '101820', 'a hollow marker has the colour of the slide')
        self.assertEqual(str(hollow.line.color.rgb), 'AA0000')
        second = next(s for s in g.shapes if s.name.startswith('Line two June'))
        self.assertEqual(str(second.fill.fore_color.rgb), '00AA00')

    def test_a_sparkline_goes_into_a_small_box_only(self):
        spec = ROOT / 'examples' / 'sparkline.json'
        code, _, err = run(spec, '--out', self.dir / 'x.pptx')
        self.assertEqual(code, 2)
        self.assertIn('not a slide of its own', err)
        deck, out = self.base_deck(), self.dir / 'spark.pptx'
        self.assertEqual(run(spec, '--into', deck, '--box', '700,60,160,36', '--out', out)[0], 0)
        g = group(Presentation(out).slides[0])
        self.assertLessEqual(g.width, 161 * PT)

    def test_what_does_not_fit_stops_the_run_and_writes_nothing(self):
        out = self.dir / 'x.pptx'
        bar = json.loads((ROOT / 'examples' / 'bar-chart.json').read_text(encoding='utf-8'))
        cases = (
            (dict(bar, claim=None), 'add "claim"'),
            ({k: v for k, v in bar.items() if k != 'chart'}, 'needs "chart"'),
            (dict(bar, dat=1), 'does not take "dat"'),
            (dict(bar, data=[dict(d, label=d['label'] + ' and a very long channel name') for d in bar['data']] * 3), 'wider than its bar slot'),
            (dict(bar, data=[dict(d, color='red') for d in bar['data']]), 'use #RRGGBB'),
            (dict(bar, chart='hbarChart', data=[dict(label=f'Row {i}', value=i) for i in range(40)]), 'rows need'),
        )
        for spec, text in cases:
            code, _, err = run(self.write(spec), '--out', out)
            self.assertEqual(code, 2, text)
            self.assertIn(text, err)
            self.assertFalse(out.exists(), 'nothing is written when a gate fails')

    def test_two_and_three_charts_stand_side_by_side_with_their_claims(self):
        ex = ROOT / 'examples'
        out = self.dir / 'two.pptx'
        code, receipt, err = run(ex / 'line-chart.json', ex / 'hbar-chart.json', '--out', out, '--title', 'Two findings on one slide')
        self.assertEqual(code, 0, err)
        slide = Presentation(out).slides[0]
        self.assertEqual(title_block(slide), ['Two findings on one slide'])
        groups = [s for s in slide.shapes if s.shape_type == MSO_SHAPE_TYPE.GROUP]
        claims = [s for s in slide.shapes if re.fullmatch(r'Takeaway \d', s.name)]
        self.assertEqual([s.text_frame.text for s in slide.shapes if s.name.startswith('Takeaway badge')], ['1', '2'])
        self.assertEqual([g.name for g in groups], ['Chart lineChart', 'Chart hbarChart'])
        self.assertEqual([c.text_frame.text for c in claims], [json.loads((ex / f).read_text(encoding='utf-8'))['claim'] for f in ('line-chart.json', 'hbar-chart.json')])
        self.assertLessEqual(groups[0].left + groups[0].width, groups[1].left, 'the charts do not overlap')
        self.assertEqual(claims[0].top, claims[1].top)
        self.assertLessEqual(claims[0].top + claims[0].height, min(g.top for g in groups), 'each section header stands above its chart')
        for g in groups:
            self.assertEqual(texts(g.shapes).count(next(t for t in texts(g.shapes) if ' · ' in t)), 1, 'each chart has one title, about its data')
        boxes = [c['box_pt'] for c in json.loads(receipt)['charts']]
        self.assertAlmostEqual(boxes[0][2], boxes[1][2])
        self.assertAlmostEqual(boxes[1][0] - boxes[0][0] - boxes[0][2], ch.GUTTER)

        deck, out3 = self.base_deck(dark=True), self.dir / 'three.pptx'
        code, receipt, err = run(ex / 'dumbbell.json', ex / 'box-plot.json', ex / 'bullet.json', '--into', deck, '--replace', 'Chart area', '--out', out3)
        self.assertEqual(code, 0, err)
        slide = Presentation(out3).slides[0]
        groups = [s for s in slide.shapes if s.shape_type == MSO_SHAPE_TYPE.GROUP]
        self.assertEqual(len(groups), 3)
        for a, b in zip(groups, groups[1:]):
            self.assertLessEqual(a.left + a.width, b.left)
        self.assertGreaterEqual(groups[0].left, 40 * PT - PT)
        self.assertLessEqual(groups[2].left + groups[2].width, 920 * PT + PT)
        claim = next(s for s in slide.shapes if s.name == 'Takeaway 1')
        self.assertEqual(str(claim.text_frame.paragraphs[0].runs[0].font.color.rgb), 'FFFFFF')

    def test_a_shared_slide_refuses_what_does_not_fit_in_a_column(self):
        ex, out = ROOT / 'examples', self.dir / 'x.pptx'
        cases = (
            ((ex / 'line-chart.json', ex / 'hbar-chart.json', '--out', out), 'needs its own claim: give --title'),
            ((ex / 'line-chart.json', '--out', out, '--title', 'x'), '--title is for a slide with two or three charts'),
            ((ex / 'gauge.json', ex / 'funnel.json', ex / 'slope.json', ex / 'bullet.json', '--out', out, '--title', 'x'), 'a slide holds 3 at most'),
            ((ex / 'gauge.json', ex / 'ranked-table.json', ex / 'slope.json', '--out', out, '--title', 'x'), 'shorten the label or widen the box'),
            ((ex / 'gauge.json', ex / 'sparkline.json', '--out', out, '--title', 'x'), 'a sparkline is not a chart of its own'),
        )
        for args, text in cases:
            code, _, err = run(*args)
            self.assertEqual(code, 2, text)
            self.assertIn(text, err)
            self.assertFalse(out.exists(), 'nothing is written when one chart does not fit')
        code, receipt, _ = run(ex / 'gauge.json', ex / 'funnel.json', ex / 'slope.json', '--check', '--title', 'x')
        self.assertEqual(code, 0)
        self.assertEqual([c['chart'] for c in json.loads(receipt)['charts']], ['gauge', 'funnel', 'slope'])

    def test_subtitle_and_takeaway_take_their_room_from_the_chart(self):
        ex = ROOT / 'examples'
        sub, take = 'All regions, January to June 2026', 'Move the support budget to the release team.'
        plain, both = self.dir / 'plain.pptx', self.dir / 'both.pptx'
        _, r0, _ = run(ex / 'line-chart.json', '--out', plain)
        code, r1, err = run(ex / 'line-chart.json', '--out', both, '--subtitle', sub, '--takeaway', take)
        self.assertEqual(code, 0, err)
        b0, b1 = json.loads(r0)['box_pt'], json.loads(r1)['box_pt']
        self.assertGreater(b1[1], b0[1], 'the subtitle of the slide moves the chart down')
        self.assertLess(b1[1] + b1[3], b0[1] + b0[3], 'the takeaway takes room under the chart')
        slide = Presentation(both).slides[0]
        claim = json.loads((ex / 'line-chart.json').read_text(encoding='utf-8'))['claim']
        self.assertEqual(title_block(slide), [claim, sub], 'the subtitle of the slide follows its title')
        self.assertEqual(title_block(Presentation(plain).slides[0]), [claim], 'no subtitle unless one is given')
        self.assertIn('Support tickets · tickets per month', texts(group(slide).shapes), 'the chart keeps its own title about its data')
        g = group(slide)
        takeaway = next(s for s in slide.shapes if s.name == 'Takeaway')
        bar = next(s for s in slide.shapes if s.name == 'Takeaway bar')
        self.assertEqual(takeaway.text_frame.text, take)
        self.assertTrue(takeaway.text_frame.paragraphs[0].runs[0].font.bold)
        self.assertGreaterEqual(takeaway.top, g.top + g.height, 'the takeaway stands under the chart')
        self.assertLessEqual(takeaway.top + takeaway.height, 500 * PT + PT)
        self.assertEqual(bar.top, takeaway.top)
        band = next(s for s in slide.shapes if s.name == 'Takeaway band')
        self.assertEqual((band.left, band.width), (48 * PT, 864 * PT), 'the takeaway band has the width of the chart area')
        self.assertEqual(str(takeaway.text_frame.paragraphs[0].alignment), 'CENTER (2)', 'the takeaway is centred')
        self.assertAlmostEqual((takeaway.left + takeaway.width / 2) / PT, 480, places=0)

        deck, out = self.base_deck(dark=True), self.dir / 'into.pptx'
        code, _, err = run(ex / 'gauge.json', ex / 'funnel.json', ex / 'slope.json', '--into', deck, '--replace', 'Chart area',
                           '--subtitle', sub, '--takeaway', take, '--out', out)
        self.assertEqual(code, 0, err)
        slide = Presentation(out).slides[0]
        subtitle = next(s for s in slide.shapes if s.name == 'Subtitle')
        claims = [s for s in slide.shapes if s.name.startswith('Section band')]
        takeaway = next(s for s in slide.shapes if s.name == 'Takeaway')
        self.assertEqual(subtitle.top, 120 * PT, 'in an existing slide the subtitle stands at the top of the box')
        self.assertGreaterEqual(min(c.top for c in claims) - (subtitle.top + subtitle.height), 20 * PT, 'room between the subtitle and the claims')
        self.assertEqual(takeaway.top + takeaway.height, 480 * PT)
        self.assertEqual(str(takeaway.text_frame.paragraphs[0].runs[0].font.color.rgb), 'FFFFFF')
        for g in (s for s in slide.shapes if s.shape_type == MSO_SHAPE_TYPE.GROUP):
            self.assertLessEqual(g.top + g.height, takeaway.top + 6 * PT)

        one = self.dir / 'one.pptx'
        self.assertEqual(run(ex / 'line-chart.json', '--into', deck, '--replace', 'Chart area', '--subtitle', sub, '--out', one)[0], 0)
        slide = Presentation(one).slides[0]
        have = texts(group(slide).shapes)
        self.assertIn('Support tickets · tickets per month', have, 'a subtitle of the slide does not take the place of the chart title')
        self.assertIn('Source: Sample data', have, 'the chart keeps its source')

        long = 'A takeaway that goes on and on ' * 12
        code, _, err = run(ex / 'line-chart.json', '--out', self.dir / 'x.pptx', '--takeaway', long)
        self.assertEqual(code, 2)
        self.assertIn('the takeaway needs', err)

    def test_the_title_keeps_its_distance_from_the_chart(self):
        out = self.dir / 'three.pptx'
        ex = ROOT / 'examples'
        self.assertEqual(run(ex / 'gauge.json', ex / 'funnel.json', ex / 'slope.json', '--out', out, '--title', 'One line')[0], 0)
        slide = Presentation(out).slides[0]
        title = next(s for s in slide.shapes if s.name == 'Title')
        claims = [s for s in slide.shapes if s.name.startswith('Section band')]
        self.assertGreaterEqual(min(c.top for c in claims) - (title.top + title.height), 22 * PT - 1, 'the sections do not stand against the title')

    def test_series_colours_leave_out_theme_accents_too_pale_for_the_slide(self):
        prs = Presentation(self.base_deck())
        slide = prs.slides[0]
        self.assertEqual(ch.theme_palette(slide, None, False), [], 'every accent of this theme reads on white: theme colours stay')
        brand = {f'accent{i}': c for i, c in enumerate(('007AC3', 'A6D1EA', '85BC20', 'C2DD90', 'E5202E', 'FAD2D5'), 1)}
        real = ch.rt._theme_rgb
        ch.rt._theme_rgb = lambda master, name: brand.get(name, real(master, name))
        try:
            light = ch.theme_palette(slide, None, False)
            self.assertEqual(light[:3], ['007AC3', '85BC20', 'E5202E'], 'the light tints are left out on a white slide')
            self.assertEqual(len(light), 5, 'greys fill the list')
            for c in light:
                self.assertGreaterEqual(ch._contrast(c, 'FFFFFF'), 2)
            self.assertEqual(ch.theme_palette(slide, '000000', True), [], 'on a dark slide the first five accents all read')
        finally:
            ch.rt._theme_rgb = real
        self.assertAlmostEqual(ch._contrast('000000', 'FFFFFF'), 21, places=0)

    def test_a_deck_style_makes_the_chart_follow_the_rules_of_a_brand(self):
        style = self.dir / 'style.json'
        style.write_text(json.dumps({'palette': ['112233', '445566', '778899'], 'callout': '0A0B0C', 'square': True, 'opaque': True,
                                     'inkText': True, 'minFont': 10, 'sectionRule': False}), encoding='utf-8')
        ex = ROOT / 'examples'
        spec = json.loads((ex / 'stacked-area.json').read_text(encoding='utf-8'))
        spec['annotations'] = [{'at': 'May', 'series': 'Food', 'text': 'food dips'}]
        out = self.dir / 'styled.pptx'
        code, _, err = run(self.write(spec), ex / 'grouped-bars.json', '--out', out, '--title', 'Two charts in a brand style', '--style', style)
        self.assertEqual(code, 0, err)
        slide = Presentation(out).slides[0]
        a = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
        shapes = [s for g in slide.shapes if g.shape_type == MSO_SHAPE_TYPE.GROUP for s in g.shapes]
        self.assertFalse([s.name for s in shapes if s._element.find(f'.//{a}prstGeom') is not None
                          and s._element.find(f'.//{a}prstGeom').get('prst') == 'roundRect'], 'square: no rounded rectangle')
        self.assertFalse(slide._element.findall(f'.//{a}alpha'), 'opaque: no transparent fill')
        colours = {str(r.font.color.rgb) for s in shapes if s.has_text_frame for p in s.text_frame.paragraphs for r in p.runs
                   if r.font.color and r.font.color.type is not None and r.font.color.rgb is not None} if False else set()
        for s in shapes:
            if s.has_text_frame:
                for p in s.text_frame.paragraphs:
                    for r in p.runs:
                        fill = r._r.find(f'{a}rPr/{a}solidFill')
                        if fill is not None and fill[0].tag == f'{a}srgbClr':
                            colours.add(fill[0].get('val'))
                        self.assertGreaterEqual(r.font.size.pt, 10)
        self.assertFalse(colours - {'FFFFFF', '000000'}, 'inkText: the words of a callout are not coloured')
        fills = {s._element.find(f'.//{a}solidFill')[0].get('val') for s in shapes if s._element.find(f'.//{a}solidFill') is not None}
        self.assertTrue({'112233', '445566'} <= fills, 'the palette of the style')
        self.assertIn('0A0B0C', {el.get('val') for el in slide._element.iter(f'{a}srgbClr')}, 'the callout colour of the style')
        self.assertFalse([s for s in slide.shapes if s.name.startswith('Section rule')], 'sectionRule: false')
        area = next(s for s in shapes if s.name == 'Food')
        self.assertNotEqual(str(area.fill.fore_color.rgb), '112233', 'a transparent fill becomes its solid mix with the slide')
        bad = self.dir / 'bad.json'
        bad.write_text('{"rounded": true}', encoding='utf-8')
        code, _, err = run(ex / 'bar-chart.json', '--out', self.dir / 'x.pptx', '--style', bad)
        self.assertEqual(code, 2)
        self.assertIn('unknown keys', err)

    def test_check_reports_the_fit_without_a_deck(self):
        code, receipt, _ = run(ROOT / 'examples' / 'heatmap.json', '--check')
        self.assertEqual(code, 0)
        r = json.loads(receipt)
        self.assertEqual(r['chart'], 'heatmap')
        self.assertLessEqual(r['used_pt'][1], r['box_pt'][3])
        code, _, err = run(ROOT / 'examples' / 'heatmap.json', '--check', '--box', '0,0,300,60')
        self.assertEqual(code, 2)
        self.assertIn('rows need', err)


if __name__ == '__main__':
    unittest.main()
