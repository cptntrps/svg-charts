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
  const tl = out.match(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="end" font-size="12" fill="var\(--chart-target[^>]*>(target [^<]*)</);
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

// 8. Callouts never sit over a value label (the bold number above each bar).
test('barChart: callout text clears the value labels and the target label', () => {
  const out = charts.barChart({
    label: 'x', target: 1000, data: [{ label: 'A', value: 700 }, { label: 'B', value: 800 }, { label: 'C', value: 960 }],
    annotations: [{ index: 2, text: 'just under target' }, { index: 0, text: 'low' }],
  });
  calloutClearsTarget(out);
  const labels = [...out.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="middle" font-size="(\d+)" fill="[^"]*" font-weight="600">([^<]*)</g)]
    .map(m => { const w = m[4].length * +m[3] * 0.6; return { x0: +m[1] - w / 2, x1: +m[1] + w / 2, y0: +m[2] - +m[3], y1: +m[2] + 3, text: m[4] }; });
  assert.equal(labels.length, 3, 'three value labels');
  for (const m of out.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(start|end)" font-size="12" font-weight="700"[^>]*>([^<]*)</g)) {
    const w = m[4].length * CHAR, x0 = m[3] === 'end' ? +m[1] - w : +m[1];
    const box = { x0, x1: x0 + w, y0: +m[2] - 12, y1: +m[2] + 3 };
    for (const l of labels) {
      const overlap = box.x0 < l.x1 && box.x1 > l.x0 && box.y0 < l.y1 && box.y1 > l.y0;
      assert.ok(!overlap, `callout "${m[4]}" overlaps value label "${l.text}"`);
    }
  }
  // The elbow leader runs sideways below the number and then up outside it.
  const leaders = [...out.matchAll(/<polyline fill="none" stroke="var\(--chart-ink[^"]*" stroke-width="1.2" points="([^"]*)"/g)]
    .map(m => m[1].split(' ').map(p => p.split(',').map(Number)));
  assert.equal(leaders.length, 2, 'two elbow leaders');
  for (const [[, sy], [ex, ey], [vx]] of leaders) {
    assert.equal(ex, vx, 'the second segment is vertical');
    for (const l of labels) {
      const horizontalCrosses = sy === ey && sy > l.y0 && sy < l.y1 && Math.min(ex, vx) < l.x1 && Math.max(ex, vx) > l.x0;
      const verticalCrosses = vx > l.x0 && vx < l.x1;
      assert.ok(!horizontalCrosses && !verticalCrosses, `leader crosses value label "${l.text}"`);
    }
  }
});

// 9. Well-formed attributes: no element repeats an attribute name. Checked on
//    every builder, plain and with all four options.
const withOptions = { title: 'T', unit: 'u', source: 'S' };
const annotated = {
  lineChart: [{ index: 1, series: 1, text: 'a' }], barChart: [{ index: 1, text: 'a' }], waterfall: [{ index: 1, text: 'a' }],
  scatter: [{ x: 12000, y: 300, text: 'a' }], divergingBars: [{ index: 3, text: 'a' }], dumbbell: [{ index: 0, series: 1, text: 'a' }],
  stackedBars: [{ index: 2, series: 1, text: 'a' }],
};
function assertUniqueAttributes(out, where) {
  const tags = [...out.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)];
  assert.ok(tags.length > 0, `${where}: tags found`);
  assert.equal((out.match(/<[a-zA-Z]/g) || []).length, tags.length, `${where}: every opening tag parses as name plus quoted attributes`);
  for (const [, name, attrs] of tags) {
    const names = [...attrs.matchAll(/([\w:-]+)=/g)].map(m => m[1]);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    assert.ok(!dup, `${where}: <${name}> repeats attribute ${dup}`);
  }
}
for (const name of Object.keys(fixtures)) {
  test(`${name}: no element repeats an attribute`, () => {
    assertUniqueAttributes(charts[name](fixtures[name]), name);
    assertUniqueAttributes(charts[name]({ ...fixtures[name], ...withOptions, annotations: annotated[name] }), name + ' with options');
  });
}

// 10. lineChart callouts clear the other series' line segments.
function calloutBox(out) {
  const ct = out.match(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(start|end)" font-size="12" font-weight="700"[^>]*>([^<]*)</);
  assert.ok(ct, 'callout text found');
  const w = ct[4].length * CHAR, x0 = ct[3] === 'end' ? +ct[1] - w : +ct[1];
  return { x0, x1: x0 + w, y0: +ct[2] - 12, y1: +ct[2] + 3, y: +ct[2], text: ct[4] };
}
function seriesSegments(out) {
  return [...out.matchAll(/<polyline fill="none" stroke="[^"]*" stroke-width="2.4"[^>]*points="([^"]*)"/g)].flatMap(m => {
    const pts = m[1].split(' ').map(p => p.split(',').map(Number));
    return pts.slice(1).map((p, i) => [pts[i], p]);
  });
}
function assertClearOfLines(out) {
  const box = calloutBox(out), segs = seriesSegments(out);
  assert.ok(segs.length >= 2, 'series segments found');
  for (const [[ax, ay], [bx, by]] of segs) {
    const lo = Math.max(box.x0, Math.min(ax, bx)), hi = Math.min(box.x1, Math.max(ax, bx));
    if (lo > hi) continue;
    for (let i = 0; i < 8; i++) {
      const x = lo + (hi - lo) * i / 7, y = ay + (by - ay) * (x - ax) / ((bx - ax) || 1);
      assert.ok(y <= box.y0 || y >= box.y1, `callout "${box.text}" [y ${box.y0}..${box.y1}] crosses a series segment at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
  }
  return box;
}
const twoSeries = {
  label: 'x', labels: ['Apr', 'May', 'Jun'], target: 125, fmtY: v => '$' + v,
  series: [
    { name: 'Cost', points: [{ x: 'Apr', y: 131 }, { x: 'May', y: 124 }, { x: 'Jun', y: 119 }] },
    { name: 'Plan', points: [{ x: 'Apr', y: 150 }, { x: 'May', y: 160 }, { x: 'Jun', y: 192 }] },
  ],
  annotations: [{ index: 2, series: 0, text: '$119, under the $125 target' }],
};

test('lineChart: callout text clears the other series segment and the target label', () => {
  const out = charts.lineChart(twoSeries);
  assertClearOfLines(out);
  calloutClearsTarget(out);
});

test('lineChart: callout goes to the top band when nothing inside the plot is clear', () => {
  // Flat lines every 20 units from 20 to 360 in a 200px chart leave no clear row inside the plot.
  const flat = v => ({ name: 'L' + v, points: ['Apr', 'May', 'Jun'].map(x => ({ x, y: v })) });
  const out = charts.lineChart({
    ...twoSeries, title: 'Cost per order', unit: '$', height: 200,
    series: [...twoSeries.series, ...Array.from({ length: 18 }, (_, i) => flat(20 + 20 * i))],
  });
  const box = assertClearOfLines(out);
  assert.equal(box.y, 15, 'text sits on the title row');
  calloutClearsTarget(out);
  assert.match(out, /<polyline fill="none" stroke="var\(--chart-ink[^"]*" stroke-width="1" points="/, 'thin leader to the point');
});

// 11. Legend, colour map and line value labels.
const topGrid = out => Math.min(...[...out.matchAll(/<line x1="\d+" x2="\d+" y1="([\d.]+)" y2="[\d.]+" stroke="var\(--chart-grid/g)].map(m => +m[1]));

test('legend: names present and the plot top moves down by the legend height', () => {
  for (const [name, opts] of [['lineChart', fixtures.lineChart], ['scatter', fixtures.scatter], ['stackedBars', fixtures.stackedBars]]) {
    const plain = charts[name](opts), withLegend = charts[name]({ ...opts, legend: true });
    const names = name === 'stackedBars' ? opts.keys : (opts.series || opts.groups).map(s => s.name);
    for (const n of names) assert.ok(withLegend.includes(`>${n}</text>`), `${name}: legend names ${n}`);
    assert.equal(topGrid(withLegend), topGrid(plain) + 18, `${name}: one legend row is 18px`);
  }
  const db = charts.dumbbell({ ...fixtures.dumbbell, legend: true });
  assert.ok(db.includes('>April</text>') && db.includes('>June</text>'), 'dumbbell legend names both ends');
  assert.ok(db.includes('viewBox="0 0 600 176"'), 'dumbbell grows by the legend row');
});

test('legend wraps to a second row when wider than the chart', () => {
  const series = Array.from({ length: 6 }, (_, i) => ({ name: 'Series ' + i, points: [{ x: 'Jan', y: i + 1 }] }));   // 6 x 94px in 400px: two rows
  const out = charts.lineChart({ label: 'x', labels: ['Jan'], series, legend: true, width: 400 });
  assert.equal(topGrid(out), topGrid(charts.lineChart({ label: 'x', labels: ['Jan'], series, width: 400 })) + 2 * 16 + 2);
});

test('legend on barChart only when items name a series', () => {
  const plain = charts.barChart(fixtures.barChart);
  assert.equal(charts.barChart({ ...fixtures.barChart, legend: true }), plain, 'no series: legend ignored');
  const data = fixtures.barChart.data.map((d, i) => ({ ...d, series: i % 2 ? 'Product B' : 'Product A' }));
  const out = charts.barChart({ ...fixtures.barChart, data, legend: true });
  assert.ok(out.includes('>Product A</text>') && out.includes('>Product B</text>'));
  assert.equal(topGrid(out), topGrid(plain) + 18);
  const fills = [...out.matchAll(/<rect [^>]*rx="3" fill="([^"]*)"/g)].map(m => m[1]);
  assert.equal(fills[0], fills[2], 'items of one series share a colour');
  assert.notEqual(fills[0], fills[1]);
});

test('colors maps one name to one fill across builders', () => {
  const colors = { 'Product A': '#ff0000', 'Product B': '#00ff00' };
  const bar = charts.barChart({ label: 'x', data: [{ label: 'Product B', value: 2 }, { label: 'Product A', value: 1 }], colors });
  const stacked = charts.stackedBars({ label: 'x', keys: ['Product B', 'Product A'], colors, columns: [{ label: 'Q1', parts: { 'Product A': 1, 'Product B': 1 } }] });
  const line = charts.lineChart({ label: 'x', labels: ['Jan'], series: [{ name: 'Product A', points: [{ x: 'Jan', y: 1 }] }], colors });
  const dots = charts.scatter({ label: 'x', groups: [{ name: 'Product A', points: [{ x: 1, y: 1 }] }], colors });
  const rows = charts.dumbbell({ label: 'x', rows: [{ label: 'Product A', a: 1, b: 2 }], colors });
  assert.ok(bar.includes('<rect x="') && bar.match(/rx="3" fill="#ff0000"/) && bar.match(/rx="3" fill="#00ff00"/), 'barChart by label');
  assert.ok(stacked.match(/fill="#ff0000"><title>Q1 Product A/), 'stackedBars by key');
  assert.ok(line.includes('stroke="#ff0000"'), 'lineChart by series name');
  assert.ok(dots.includes('fill="#ff0000"'), 'scatter by group name');
  assert.ok(rows.includes('stroke="#ff0000"'), 'dumbbell by row label');
  const explicit = charts.barChart({ label: 'x', data: [{ label: 'Product A', value: 1, color: '#0000ff' }], colors });
  assert.ok(explicit.includes('rx="3" fill="#0000ff"'), 'an explicit item color wins over the map');
});

test('lineChart valueLabels: one 11px bold label per point, overlapping ones skipped', () => {
  const out = charts.lineChart({ ...fixtures.lineChart, valueLabels: true });
  const labels = [...out.matchAll(/<text x="[\d.]+" y="[\d.]+" text-anchor="(?:start|middle|end)" font-size="11" fill="[^"]*" font-weight="700">([^<]*)</g)].map(m => m[1]);
  assert.ok(labels.includes('$205k') && labels.includes('$120k'), 'labels use fmtY');
  assert.ok(labels.length < 12 && labels.length >= 6, `overlapping labels are skipped, most stay (${labels.length} of 12)`);
  assert.ok(!charts.lineChart(fixtures.lineChart).includes('font-size="11"'), 'off by default');
});
