"""Tests for deck/ranked_table.py. Run: python3 -m unittest deck/test_ranked_table.py"""
import contextlib
import io
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.util import Pt

import sys
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'deck'))
import ranked_table as rt  # noqa: E402

SPEC = ROOT / 'examples' / 'ranked-table.json'
PT = 12700


def run(*args):
    err = io.StringIO()
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
        code = rt.main([str(a) for a in args])
    return code, err.getvalue()


def group(slide):
    groups = [s for s in slide.shapes if s.shape_type == MSO_SHAPE_TYPE.GROUP and s.name == 'Ranked table']
    assert len(groups) == 1, 'one chart group on the slide'
    return groups[0]


class RankedTableDeck(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.spec = json.loads(SPEC.read_text(encoding='utf-8'))

    def write(self, spec):
        p = self.dir / 'spec.json'
        p.write_text(json.dumps(spec), encoding='utf-8')
        return p

    def test_new_deck_has_one_editable_group_with_ranked_bars(self):
        out = self.dir / 'chart.pptx'
        self.assertEqual(run(SPEC, '--out', out)[0], 0)
        slide = Presentation(out).slides[0]
        g = group(slide)
        bars = [s for s in g.shapes if s.name.startswith('Bar ')]
        self.assertEqual([b.name for b in bars], ['Bar Nordics', 'Bar Iberia', 'Bar Benelux', 'Bar Alps', 'Bar All regions'])
        self.assertAlmostEqual(bars[0].width / bars[1].width, 2.40 / 1.62, places=2)
        self.assertEqual(len({b.left for b in bars}), 1, 'all bars start on one baseline')
        texts = [s.text_frame.text for s in g.shapes if s.has_text_frame]
        for needed in ('2.40%', '▼ −0.41', '▲ +0.15', 'n.a.', '$1.2M of cost, no revenue', 'Benelux *', 'All regions'):
            self.assertIn(needed, texts)
        self.assertTrue(any(t.startswith('* Benelux: H1 2025 is above the full year.') for t in texts))
        box = (48, 120, 864, 380)
        self.assertGreaterEqual(g.left, box[0] * PT - PT)
        self.assertGreaterEqual(g.top, box[1] * PT - PT)
        self.assertLessEqual(g.left + g.width, (box[0] + box[2]) * PT + PT)
        self.assertLessEqual(g.top + g.height, (box[1] + box[3]) * PT + PT)
        self.assertIn('Nordics: FY 2025 2.40%', g._element.xpath('./p:nvGrpSpPr/p:cNvPr')[0].get('descr'))
        title = [p.text for p in next(s for s in slide.shapes if s.name == 'Title').text_frame.paragraphs]
        self.assertEqual(title, [self.spec['claim']], 'the slide title is the claim')
        self.assertIn('Travel cost per revenue dollar · travel cost / revenue', texts, 'the chart has its own title: what its data is')

    def test_into_replaces_a_named_shape_and_stays_in_its_box(self):
        deck = self.dir / 'deck.pptx'
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[5])
        slide.shapes.title.text = 'Nordics spends the most on travel per revenue dollar'
        hole = slide.shapes.add_textbox(Pt(30), Pt(130), Pt(660), Pt(300))
        hole.name = 'Chart area'
        prs.save(deck)
        out = self.dir / 'deck2.pptx'
        self.assertEqual(run(SPEC, '--into', deck, '--slide', 1, '--replace', 'Chart area', '--out', out)[0], 0)
        slide = Presentation(out).slides[0]
        self.assertNotIn('Chart area', [s.name for s in slide.shapes])
        g = group(slide)
        self.assertGreaterEqual(g.left, 30 * PT - PT)
        self.assertLessEqual(g.left + g.width, 690 * PT + PT)
        self.assertLessEqual(g.top + g.height, 430 * PT + PT)
        self.assertEqual(slide.shapes.title.text, 'Nordics spends the most on travel per revenue dollar')

    def test_a_dark_slide_gets_light_ink(self):
        deck, out = self.dir / 'dark.pptx', self.dir / 'dark2.pptx'
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        back = slide.shapes.add_shape(1, 0, 0, prs.slide_width, prs.slide_height)
        back.fill.solid()
        back.fill.fore_color.rgb = __import__('pptx').dml.color.RGBColor(0, 0, 0)
        prs.save(deck)
        self.assertEqual(run(SPEC, '--into', deck, '--box', '30,100,660,300', '--out', out)[0], 0)
        g = group(Presentation(out).slides[0])
        label = next(s for s in g.shapes if s.has_text_frame and s.text_frame.text == 'Nordics')
        self.assertEqual(str(label.text_frame.paragraphs[0].runs[0].font.color.rgb), 'FFFFFF')
        self.assertEqual(run(SPEC, '--into', deck, '--box', '30,100,660,300', '--on', 'light', '--out', out)[0], 0)
        g = group(Presentation(out).slides[0])
        label = next(s for s in g.shapes if s.has_text_frame and s.text_frame.text == 'Nordics')
        self.assertIsNotNone(label.text_frame.paragraphs[0].runs[0].font.color.theme_color)

    def test_content_that_does_not_fit_stops_the_run(self):
        out = self.dir / 'x.pptx'
        long = dict(self.spec, rows=self.spec['rows'] + [{'label': 'A region with a name that is much too long for the label column of a slide', 'value': 1}])
        code, err = run(self.write(long), '--out', out)
        self.assertEqual(code, 2)
        self.assertIn('shorten the label', err)
        many = dict(self.spec, rows=[{'label': f'Row {i}', 'value': i + 1} for i in range(30)], total=None)
        code, err = run(self.write(many), '--out', out)
        self.assertEqual(code, 2)
        self.assertIn('rows need', err)
        self.assertFalse(out.exists(), 'nothing is written when a gate fails')

    def test_a_claim_that_is_too_long_for_the_title_stops_the_run(self):
        code, err = run(self.write(dict(self.spec, claim='A very long claim ' * 14)), '--out', self.dir / 'x.pptx')
        self.assertEqual(code, 2)
        self.assertIn('shorten it', err)

    def test_a_bad_spec_stops_the_run(self):
        for change, text in (
            ({'rows': [{'label': 'a', 'value': -1}]}, 'zero or more'),
            ({'rows': [{'label': 'a', 'value': None}]}, 'needs a note'),
            ({'columns': ['a', 'b', 'c', 'd']}, 'at most 3'),
            ({'change': {'from': 0, 'to': 5}}, 'positions in columns'),
            ({'highlight': ['Nowhere']}, 'not a row label'),
        ):
            code, err = run(self.write(dict(self.spec, **change)), '--check')
            self.assertEqual(code, 2, change)
            self.assertIn(text, err)

    @unittest.skipUnless(shutil.which('node'), 'node is not installed: the page and deck comparison did not run')
    def test_the_deck_shows_the_rows_and_numbers_of_the_page(self):
        js = ("import('./charts.js').then(async c => { const fs = await import('node:fs');"
              "process.stdout.write(c.rankedTable(JSON.parse(fs.readFileSync('examples/ranked-table.json', 'utf8')))); })")
        svg = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        page_rows = re.findall(r'<title>([^:<]+):', svg)
        page_texts = set(re.findall(r'>([^<>]+)</text>', svg))
        rows, heads = rt.model(self.spec)
        self.assertEqual([r['label'] for r in rows], page_rows)
        for r in rows:
            for cell in r['cells']:
                if cell:
                    self.assertIn(cell, page_texts, f"{r['label']}: {cell}")
        for h in heads:
            self.assertIn(h, page_texts)


if __name__ == '__main__':
    unittest.main()
