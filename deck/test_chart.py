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
                self.assertEqual(texts(slide.shapes)[0], spec['claim'], 'the slide title is the claim')
                if spec['chart'] == 'rankedTable':
                    continue
                page = ch.render(str(path), box[2], box[3], bare=True)['svg']
                want = [html.unescape(re.sub(r'<title>.*?</title>|<[^>]+>', '', m)) for m in re.findall(r'<text\b[^>]*>(.*?)</text>', page)]
                have = texts(g.shapes)
                self.assertEqual(sorted(t for t in want if t.strip()), sorted(have), 'the slide shows the texts of the page chart')

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
