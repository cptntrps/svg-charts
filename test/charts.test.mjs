import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as charts from '../charts.js';
import { fixtures } from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotPath = name => join(here, 'snapshots', name + '.svg');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

// 1. Without the new options every builder produces the output captured
//    before title/unit/source/annotations existed (byte for byte).
for (const name of Object.keys(fixtures)) {
  test(`${name}: output without title/unit/source/annotations matches the snapshot`, () => {
    const out = charts[name](fixtures[name]);
    if (UPDATE) { writeFileSync(snapshotPath(name), out); return; }
    assert.equal(out, readFileSync(snapshotPath(name), 'utf8'));
  });
}

// 2. barChart renders all four options.
test('barChart: title, unit, source and annotation text are in the svg', () => {
  const out = charts.barChart({ ...fixtures.barChart, title: 'T', unit: '$', source: 'S', annotations: [{ index: 1, text: 'peak' }] });
  assert.ok(out.includes('>T'), 'title');
  assert.ok(out.includes('$'), 'unit');
  assert.ok(out.includes('Source: S'), 'source');
  assert.ok(out.includes('peak'), 'annotation text');
});

// 3. lineChart annotation on series 1, index 2 rings that point.
test('lineChart: the annotation ring sits on the series point', () => {
  const out = charts.lineChart({ ...fixtures.lineChart, annotations: [{ series: 1, index: 2, text: 'dip' }] });
  const point = out.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="3" fill="[^"]*"><title>Forecast Mar:/);
  assert.ok(point, 'series point circle found');
  const ring = out.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="5" fill="none"/);
  assert.ok(ring, 'annotation ring found');
  assert.ok(Math.abs(+ring[1] - +point[1]) <= 0.5, `ring cx ${ring[1]} near point cx ${point[1]}`);
  assert.ok(Math.abs(+ring[2] - +point[2]) <= 0.5, `ring cy ${ring[2]} near point cy ${point[2]}`);
});

// 4. The aria-label falls back to the title when no label is passed.
test('title becomes the aria-label when label is absent', () => {
  const { label, ...rest } = fixtures.barChart;
  assert.ok(charts.barChart({ ...rest, title: 'Orders' }).includes('aria-label="Orders"'));
});

// 5. The plot shrinks for the bands; the svg keeps the caller height.
test('bands keep the svg height and move the plot', () => {
  const plain = charts.barChart(fixtures.barChart);
  const framed = charts.barChart({ ...fixtures.barChart, title: 'T', source: 'S' });
  assert.ok(framed.includes('viewBox="0 0 600 260"'));
  const gridYs = s => [...s.matchAll(/<line x1="54" x2="586" y1="([\d.]+)" y2="[\d.]+" stroke="var\(--chart-grid/g)].map(m => +m[1]);
  const p = gridYs(plain), q = gridYs(framed);
  assert.equal(q[0], p[0] - 16, 'bottom gridline moves up above the source band');
  assert.equal(q.at(-1), p.at(-1) + 22, 'top gridline moves down under the title band');
});

// 6. A bad annotation index fails loudly instead of vanishing.
test('annotation index out of range throws', () => {
  assert.throws(() => charts.barChart({ ...fixtures.barChart, annotations: [{ index: 9, text: 'x' }] }), RangeError);
});

// 7. The callout text clears the target label: the lead case is a point at the
//    right edge just under the target, with a long text.
const CHAR = 12 * 0.6;   // the width estimate charts.js uses for 12px text
function calloutClearsTarget(out) {
  const tl = out.match(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="end" font-size="12" fill="[^"]*" fill="var\(--chart-target[^>]*>(target [^<]*)</);
  const ct = out.match(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(start|end)" font-size="12" font-weight="700"[^>]*>([^<]*)</);
  assert.ok(tl && ct, 'target label and callout text found');
  const labelX0 = +tl[1] - tl[3].length * CHAR, labelY0 = +tl[2] - 12, labelY1 = +tl[2] + 3;
  const w = ct[4].length * CHAR, textX1 = ct[3] === 'end' ? +ct[1] : +ct[1] + w;
  const textY0 = +ct[2] - 12, textY1 = +ct[2] + 3;
  const yGap = Math.max(labelY0 - textY1, textY0 - labelY1);
  assert.ok(textX1 < labelX0 || yGap >= 14, `callout [${ct[1]},${ct[2]}] "${ct[4]}" collides with target label [${tl[1]},${tl[2]}] (x1=${textX1}, labelX0=${labelX0}, yGap=${yGap})`);
  return { ct, tl };
}

test('lineChart: callout text clears the target label at the right edge', () => {
  const labels = ['Apr', 'May', 'Jun'];
  const out = charts.lineChart({
    label: 'x', labels, target: 125, fmtY: v => '$' + v,
    series: [{ name: 'Cost', points: [{ x: 'Apr', y: 131 }, { x: 'May', y: 124 }, { x: 'Jun', y: 119 }] }],
    annotations: [{ index: 2, text: '$119, under the $125 target' }],
  });
  const { ct } = calloutClearsTarget(out);
  assert.equal(ct[3], 'end', 'text is right-aligned to a point in the right 35% of the plot');
  assert.ok(+ct[1] <= 584, 'text does not cross the plot right edge');
});

test('barChart: callout text clears the target label on the last bar', () => {
  const out = charts.barChart({
    label: 'x', target: 1000, data: [{ label: 'A', value: 700 }, { label: 'B', value: 800 }, { label: 'C', value: 960 }],
    annotations: [{ index: 2, text: 'just under target' }],
  });
  calloutClearsTarget(out);
});

test('callout flips left when the text would cross the right edge', () => {
  const out = charts.barChart({ label: 'x', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }],
    annotations: [{ index: 2, text: 'a very long callout text for the last bar' }] });
  assert.match(out, /text-anchor="end" font-size="12" font-weight="700"/);
});
