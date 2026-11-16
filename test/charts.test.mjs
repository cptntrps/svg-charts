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

// 12. Band callout clears the title; an annotation that repeats the value label keeps only the ring.
const months6 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const spendRevenue = {
  title: 'Product A spend and attributed revenue by month', unit: '$k', width: 420, height: 210,
  legend: true, valueLabels: true, labels: months6, fmtY: v => '$' + v + 'k',
  series: [
    { name: 'Spend', points: months6.map((m, i) => ({ x: m, y: [120, 135, 150, 160, 170, 180][i] })) },
    { name: 'Revenue', points: months6.map((m, i) => ({ x: m, y: [150, 170, 190, 205, 225, 243][i] })) },
    // flat filler lines leave no clear row inside the plot, so the callout must take the band
    ...[20, 50, 80, 100, 210, 260].map(v => ({ name: 'L' + v, points: months6.map(m => ({ x: m, y: v })) })),
  ],
};

test('band callout never overprints the title: it takes a second band row and the plot shrinks', () => {
  const out = charts.lineChart({ ...spendRevenue, annotations: [{ index: 5, series: 1, text: '$243k revenue' }] });
  const plain = charts.lineChart(spendRevenue);
  const box = assertClearOfLines(out);
  const titleLine = spendRevenue.title + ' · ' + spendRevenue.unit, titleBox = { x0: 4, x1: 4 + titleLine.length * 14 * 0.6, y0: 1, y1: 18 };
  const overlapsTitle = box.x0 < titleBox.x1 && box.x1 > titleBox.x0 && box.y0 < titleBox.y1 && box.y1 > titleBox.y0;
  assert.ok(!overlapsTitle, `callout at y=${box.y} overprints the title`);
  assert.equal(box.y, 31, 'text sits on the second band row, under the title row');
  assert.equal(topGrid(out), topGrid(plain) + 16, 'the plot shrinks by the extra band row');
  assert.match(out, /<polyline fill="none" stroke="var\(--chart-ink[^"]*" stroke-width="1" points="/, 'thin leader kept');
  assert.ok(out.includes('>Spend</text>') && out.includes('>Revenue</text>'), 'legend still drawn');
});

test('annotation text equal to the value label keeps the ring only', () => {
  const ringOnly = charts.lineChart({ ...spendRevenue, annotations: [{ index: 5, series: 1, text: '$243k' }] });
  assert.ok(/r="5" fill="none"/.test(ringOnly), 'ring drawn');
  assert.ok(!/font-size="12" font-weight="700"/.test(ringOnly), 'no callout text');
  assert.ok(!/stroke-width="1\.2"/.test(ringOnly) && !/stroke-width="1" points=/.test(ringOnly), 'no leader');
  const withWords = charts.lineChart({ ...spendRevenue, annotations: [{ index: 5, series: 1, text: '$243k revenue' }] });
  assert.ok(/font-weight="700"[^>]*>\$243k revenue</.test(withWords), 'text that adds words is drawn');
  const bar = charts.barChart({ ...fixtures.barChart, annotations: [{ index: 0, text: '1,240' }] });
  assert.ok(/r="5" fill="none"/.test(bar) && !/font-size="12" font-weight="700"/.test(bar), 'barChart: value repeated, ring only');
});

// Builders added in 0.3.0: hbarChart, donut, heatmap, sparkline, and lineChart's area option.
test('lineChart: area fills under each series and is off by default', () => {
  assert.ok(!charts.lineChart(fixtures.lineChart).includes('<polygon'));
  const out = charts.lineChart({ ...fixtures.lineChart, area: true });
  assert.equal((out.match(/<polygon /g) || []).length, fixtures.lineChart.series.length);
});

test('hbarChart: height follows the rows, a long label is cut, a negative value throws', () => {
  const out = charts.hbarChart({ ...fixtures.hbarChart, width: 360 });
  assert.ok(out.includes('viewBox="0 0 360 152"'), out.slice(0, 80));
  assert.ok(out.includes('…'), 'long label is shortened');
  assert.ok(out.includes('<title>Warehouse club with a long name: ' + fixtures.hbarChart.fmtY(4210) + '</title>'), 'the full label stays in the tooltip');
  assert.throws(() => charts.hbarChart({ data: [{ label: 'a', value: -1 }] }), RangeError);
});

test('hbarChart: highlight mutes the other bars and rejects a bad index', () => {
  const out = charts.hbarChart({ ...fixtures.hbarChart, highlight: [0] });
  assert.equal((out.match(/fill="var\(--chart-muted/g) || []).length, fixtures.hbarChart.data.length - 1);
  assert.throws(() => charts.hbarChart({ ...fixtures.hbarChart, highlight: [9] }), RangeError);
});

test('donut: one arc per slice, shares sum to the total, a zero slice throws', () => {
  const out = charts.donut(fixtures.donut);
  assert.equal((out.match(/<circle /g) || []).length, fixtures.donut.slices.length);
  assert.ok(out.includes('>' + fixtures.donut.fmtY(2495) + '<'), 'centre shows the total');
  assert.ok(out.includes(fixtures.donut.fmtY(820) + ' · 33%'), 'list shows value and share');
  assert.throws(() => charts.donut({ slices: [{ label: 'a', value: 0 }] }), RangeError);
});

test('heatmap: a missing cell is drawn empty, an unknown row throws', () => {
  const out = charts.heatmap(fixtures.heatmap);
  assert.equal((out.match(/: no data<\/title>/g) || []).length, 1);
  assert.throws(() => charts.heatmap({ rows: ['a'], cols: ['x'], cells: [{ row: 'b', col: 'x', value: 1 }] }), RangeError);
});

test('sparkline: one line and one end dot; fewer than two values gives an empty svg', () => {
  const out = charts.sparkline(fixtures.sparkline);
  assert.ok(out.includes('<polyline') && (out.match(/<circle /g) || []).length === 1);
  assert.ok(!charts.sparkline({ values: [1] }).includes('<polyline'));
});

test('waterfall: zoom starts the axis above zero and keeps the default output unchanged', () => {
  const items = [{ label: 'Start', value: 8762, total: true }, { label: 'Up', value: 410 }, { label: 'Down', value: -140 }, { label: 'End', value: 9032, total: true }];
  const plain = charts.waterfall({ items }), zoomed = charts.waterfall({ items, zoom: true });
  assert.ok(plain.includes('>0<'), 'default axis starts at zero');
  assert.ok(!zoomed.includes('>0<'), 'zoomed axis does not start at zero');
  const stepHeight = s => +s.match(/height="([\d.]+)" rx="3" fill="[^"]*"><title>Up:/)[1];
  assert.ok(stepHeight(zoomed) > stepHeight(plain) * 3, 'the step is at least three times taller');
});

test('hbarChart: diverging draws signed bars on both sides of a zero line', () => {
  const data = [{ label: 'Groceries', value: 495 }, { label: 'Shopping', value: -1114 }, { label: 'Flat', value: 0 }];
  const out = charts.hbarChart({ data, diverging: true, width: 360 });
  assert.ok(out.includes('>+495<') && out.includes('>−1,114<'), 'signed value labels');
  const zero = +out.match(/<line x1="([\d.]+)"/)[1];
  const x = name => +out.match(new RegExp('<rect x="([\\d.]+)"[^>]*><title>' + name))[1];
  assert.ok(x('Shopping') < zero && Math.abs(x('Groceries') - zero) < 0.01, 'negative bar left of zero, positive from zero');
  assert.throws(() => charts.hbarChart({ data }), /diverging: true/);
});

// Builders added in 0.4.0.
test('0.4.0 builders: each draws its marks and refuses values outside its domain', () => {
  const count = (out, re) => (out.match(re) || []).length, F = fixtures;
  assert.equal(count(charts.groupedBars(F.groupedBars), /<rect [^>]*><title>/g), 8);
  assert.throws(() => charts.groupedBars({ categories: ['a'], series: [{ name: 's', values: [-1] }] }), RangeError);
  assert.equal(count(charts.stackedArea(F.stackedArea), /<polygon /g), 3);
  const sl = charts.slope(F.slope);
  assert.equal(count(sl, /<line [^>]*stroke-width="2.2"/g), 5);
  assert.ok(sl.includes('var(--chart-up') && sl.includes('var(--chart-down') && sl.includes('var(--chart-muted'), 'rise, fall and flat lines differ');
  const bu = charts.bullet({ ...F.bullet, overColor: 'red' });
  assert.equal(count(bu, /fill="red"/g), 2, 'the row over its target takes overColor on bar and text');
  const hi = charts.histogram(F.histogram);
  const heights = [...hi.matchAll(/<title>[^<]*: (\d+)<\/title>/g)].map(m => +m[1]);
  assert.equal(heights.reduce((a, b) => a + b, 0), F.histogram.values.length, 'every value lands in one bin');
  assert.ok(hi.includes('median 63'));
  assert.throws(() => charts.histogram({ bins: [{ from: 2, to: 1, count: 1 }] }), RangeError);
  const bx = charts.boxPlot(F.boxPlot);
  assert.ok(bx.includes('median 6.65 h') && bx.includes('median 7.8 h'), 'quartiles from raw values and from a summary');
  assert.throws(() => charts.boxPlot({ groups: [{ label: 'x', min: 2, q1: 1, median: 3, q3: 4, max: 5 }] }), RangeError);
  const ca = charts.calendar(F.calendar);
  assert.equal(count(ca, /<rect [^>]*><title>2026-/g), 84);
  assert.equal(count(ca, /: no data<\/title>/g), F.calendar.days.filter(d => d.value == null).length);
  assert.throws(() => charts.calendar({ days: [{ date: '11/12/2026', value: 1 }] }), RangeError);
  const tm = charts.treemap(F.treemap);
  const tiles = [...tm.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
  assert.equal(tiles.length, 8);
  const share = tiles[0][2] * tiles[0][3] / tiles.reduce((a, t) => a + t[2] * t[3], 0);
  assert.ok(Math.abs(share - 584 / 914) < 0.03, 'tile area follows the value');
  assert.throws(() => charts.treemap({ items: [{ label: 'a', value: 0 }] }), RangeError);
  assert.ok(charts.funnel(F.funnel).includes('>3 · 3%<'), 'a stage shows its share of the first stage');
  const sk = charts.sankey(F.sankey);
  assert.equal(count(sk, /<path /g), 6); assert.equal(count(sk, /<rect /g), 6);
  assert.throws(() => charts.sankey({ flows: [{ from: 'a', to: 'b', value: 0 }] }), RangeError);
  assert.ok(charts.gauge(F.gauge).includes('stroke-dasharray="72 100"'));
  assert.throws(() => charts.gauge({ value: 1, max: 0 }), RangeError);
  const pa = charts.pareto({ ...F.pareto, data: [...F.pareto.data].reverse() });
  assert.ok(pa.indexOf('Coffee:') < pa.indexOf('Milk:') && pa.includes('running share 100%'), 'sorted from the largest, ends at 100%');
});

test('wordCloud: no word overlaps another, the largest is the biggest, a word with no room is counted', () => {
  const out = charts.wordCloud({ ...fixtures.wordCloud, width: 358, height: 240 });
  const words = [...out.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="middle" font-size="(\d+)"[^>]*>([^<]+)<title>/g)]
    .map(m => { const fs = +m[3], w = m[4].length * fs * 0.58 + 6, h = fs * 1.12; return { t: m[4], fs, x: +m[1] - w / 2, y: +m[2] - h * 0.78, w, h }; });
  assert.equal(words.length + +out.match(/data-omitted="(\d+)"/)[1], fixtures.wordCloud.words.length);
  assert.ok(words.length >= 14, 'most words find a place: ' + words.length);
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
    const a = words[i], b = words[j];
    assert.ok(!(a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01), `${a.t} overlaps ${b.t}`);
  }
  assert.equal(words[0].t, 'churrasco'); assert.equal(words[0].fs, 40);
  const crowded = charts.wordCloud({ words: Array.from({ length: 80 }, (_, i) => ({ text: 'palavra' + i, value: 80 - i })), width: 200, height: 120 });
  assert.ok(+crowded.match(/data-omitted="(\d+)"/)[1] > 0);
  assert.throws(() => charts.wordCloud({ words: [{ text: '', value: 1 }] }), RangeError);
});

// rankedTable (0.6.0): ranked bars with the exact values beside them; one spec for the page and the deck.
test('rankedTable: rows rank by value, the note row and the total come last, bars follow the values', () => {
  const F = fixtures.rankedTable, out = charts.rankedTable(F);
  const order = [...out.matchAll(/<title>([^:<]+):/g)].map(m => m[1]);
  assert.deepEqual(order, ['Nordics', 'Iberia', 'Benelux', 'Alps', 'Shared services', 'All regions']);
  const bars = [...out.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="14" rx="3" fill="([^"]+)"/g)];
  assert.equal(bars.length, 5, 'four ranked rows and the total have a bar; the note row has none');
  assert.ok(Math.abs(+bars[0][1] / +bars[1][1] - 2.40 / 1.62) < 0.01, 'bar width follows the value');
  assert.ok(bars[4][2].startsWith('var(--chart-total'), 'the total bar takes the neutral colour');
  assert.ok(out.includes('$1.2M of cost, no revenue') && (out.match(/>n\.a\.</g) || []).length === 3, 'the note row shows its note and n.a.');
  assert.ok(out.includes('>▼ −0.41<') && out.includes('>▲ +0.15<') && out.includes('>▼ −0.14<'), 'change is the later column less the earlier one');
  assert.ok(out.includes('>Benelux *<') && out.includes('>* Benelux: H1 2025 is above the full year.'), 'a flag marks the label and writes a footnote');
  assert.equal((out.match(/stroke="var\(--chart-axis-text/g) || []).length, 5, 'the reference line marks the five rows that have a bar');
  const flat = charts.rankedTable({ ...F, rows: [{ label: 'Flat', value: 1, cols: [1.2, 1.2] }], total: null });
  assert.ok(flat.includes('>0.00<') && !flat.includes('▲') && !flat.includes('▼'), 'no mark when the change rounds to zero');
});

test('rankedTable: a narrow chart stacks label over bar; highlight mutes the other rows; sort: false keeps the order', () => {
  const F = fixtures.rankedTable, narrow = charts.rankedTable({ ...F, width: 358 });
  assert.ok(/<text x="4" y="[\d.]+" text-anchor="start"[^>]*>Nordics</.test(narrow), 'the label starts its own line');
  assert.ok(!narrow.includes('stroke="var(--chart-axis-text'), 'no reference line across the labels');
  assert.ok(+narrow.match(/viewBox="0 0 358 (\d+)"/)[1] > +charts.rankedTable(F).match(/viewBox="0 0 600 (\d+)"/)[1], 'stacked rows are taller');
  const hl = charts.rankedTable({ ...F, highlight: ['Nordics'] });
  assert.equal((hl.match(/fill="var\(--chart-muted/g) || []).length, 3);
  assert.throws(() => charts.rankedTable({ ...F, highlight: ['Nowhere'] }), RangeError);
  const kept = charts.rankedTable({ ...F, sort: false });
  assert.ok(kept.indexOf('<title>Iberia:') < kept.indexOf('<title>Nordics:'));
});

test('rankedTable: a spec the chart cannot show honestly throws', () => {
  const row = { label: 'a', value: 1, cols: [1, 2] }, base = { columns: ['x', 'y'], rows: [row] };
  assert.throws(() => charts.rankedTable({ ...base, rows: [{ ...row, value: -1 }] }), /zero or more/);
  assert.throws(() => charts.rankedTable({ ...base, rows: [{ label: 'b', value: null }] }), /needs a note/);
  assert.throws(() => charts.rankedTable({ ...base, rows: [{ ...row, cols: [1] }] }), /cols needs 2/);
  assert.throws(() => charts.rankedTable({ ...base, columns: ['w', 'x', 'y', 'z'] }), /at most 3/);
  assert.throws(() => charts.rankedTable({ ...base, change: { from: 0, to: 2 } }), /positions in columns/);
  assert.throws(() => charts.rankedTable({ ...base, total: { label: 't' } }), /total needs a value/);
  assert.ok(charts.rankedTable({}).includes('no data'));
  const neg = charts.rankedTable({ ...base, format: { decimals: 1, prefix: '$' }, rows: [{ label: 'a', value: 1, cols: [2, -4.1] }], change: { from: 0, to: 1 } });
  assert.ok(neg.includes('>−$4.1<') && neg.includes('>▼ −6.1<'), 'a negative number in a column takes the minus sign of the change column');
});

// ---------- chart(spec): one JSON spec for every chart type ----------
import { readdirSync } from 'node:fs';
const exDir = join(here, '..', 'examples');
const examples = readdirSync(exDir).filter(f => f.endsWith('.json')).map(f => [f, JSON.parse(readFileSync(join(exDir, f), 'utf8'))]);

test('examples: there is one spec file for each chart type', () => {
  assert.deepEqual(examples.map(([, s]) => s.chart).sort(), Object.keys(charts.chartTypes).sort());
});

for (const [file, spec] of examples) {
  test(`examples/${file}: draws at slide size in strict mode and at phone width`, () => {
    const slide = charts.chart(spec, { width: 864, height: 360, strict: true });
    assert.ok(slide.startsWith('<svg '), 'an svg');
    assert.ok(+slide.match(/viewBox="0 0 864 ([\d.]+)"/)[1] <= 360.5, 'inside the room it has');
    assert.ok(spec.claim && spec.claim.length > 20, 'the example has a claim');
    assert.ok(!slide.includes(spec.claim.slice(0, 20) + '</text>'), 'the chart does not draw the claim');
    assert.ok(charts.chart(spec, { width: 358 }).startsWith('<svg '));
  });
}

test('chart: a bad spec names the problem', () => {
  const bar = { chart: 'barChart', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] };
  assert.throws(() => charts.chart({ ...bar, chart: 'pie' }), /"chart" must be one of/);
  assert.throws(() => charts.chart({ ...bar, dat: [] }), /does not take "dat"/);
  assert.throws(() => charts.chart({ chart: 'stackedBars', format: { decimals: 1 }, keys: ['a'], columns: [] }), /remove "format"/);
  assert.throws(() => charts.chart({ ...bar, formatX: {} }), /remove "formatX"/);
  assert.throws(() => charts.chart([]), /must be an object/);
});

test('chart: more items than a reader can tell apart are refused', () => {
  const slices = Array.from({ length: 7 }, (_, i) => ({ label: 'S' + i, value: i + 1 }));
  assert.throws(() => charts.chart({ chart: 'donut', slices }), /6 slices at most/);
  const series = n => Array.from({ length: n }, (_, i) => ({ name: 'S' + i, values: [1, 2], points: [{ x: 'a', y: 1 }] }));
  assert.throws(() => charts.chart({ chart: 'groupedBars', categories: ['a', 'b'], series: series(5) }), /4 series at most/);
  assert.throws(() => charts.chart({ chart: 'lineChart', labels: ['a'], series: series(6) }), /share the 5 palette colours/);
  const coloured = Object.fromEntries(series(6).map(s => [s.name, '#888888']));
  assert.ok(charts.chart({ chart: 'lineChart', labels: ['a'], series: series(6), colors: coloured }).startsWith('<svg '));
});

test('chart: a waterfall must reach its total and a funnel only loses', () => {
  const items = [{ label: 'Start', value: 10, total: true }, { label: 'Step', value: -3 }, { label: 'End', value: 8, total: true }];
  assert.throws(() => charts.chart({ chart: 'waterfall', items }), /reach 7 and the total says 8/);
  items[2].value = 7;
  assert.ok(charts.chart({ chart: 'waterfall', items }).includes('End'));
  assert.throws(() => charts.chart({ chart: 'funnel', stages: [{ label: 'a', value: 3 }, { label: 'b', value: 5 }] }), /a funnel only loses/);
});

test('chart: format is the JSON form of fmtY and formatX of fmtX', () => {
  const out = charts.chart({ chart: 'barChart', format: { decimals: 1, prefix: '$', suffix: 'k' }, data: [{ label: 'A', value: 1234.56 }] });
  assert.ok(out.includes('>$1,234.6k<'));
  const sc = charts.chart({ chart: 'scatter', formatX: { suffix: ' km' }, groups: [{ name: 'g', points: [{ x: 10, y: 1 }, { x: 20, y: 2 }, { x: 30, y: 4 }], line: { fit: 'linear' } }] });
  assert.ok(sc.includes(' km<'), 'x ticks take formatX');
  assert.ok(/<polyline[^>]*stroke-dasharray="6 4"/.test(sc), 'the fitted line is drawn');
  assert.throws(() => charts.chart({ chart: 'scatter', groups: [{ name: 'g', points: [{ x: 1, y: 1 }], line: { fit: 'linear' } }] }), /3 points or more/);
});

test('chart: a chart whose height follows its rows uses the room it has', () => {
  const data = n => Array.from({ length: n }, (_, i) => ({ label: 'Row ' + i, value: i + 1 }));
  const h = out => +out.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1];
  assert.ok(h(charts.chart({ chart: 'hbarChart', data: data(10) }, { width: 600, height: 300 })) <= 300);
  assert.ok(h(charts.chart({ chart: 'hbarChart', data: data(10) }, { width: 600, height: 300 })) > 260, 'rows grow to use the room');
  assert.equal(h(charts.chart({ chart: 'hbarChart', data: data(3) }, { width: 600, height: 300 })), 132, 'rows stop at the largest row size');
  assert.throws(() => charts.chart({ chart: 'hbarChart', data: data(30) }, { width: 600, height: 300 }), /30 rows need 612px of height and have 300px/);
  assert.throws(() => charts.chart({ chart: 'dumbbell', rows: data(12).map(d => ({ label: d.label, a: 1, b: 2 })) }, { width: 600, height: 300 }), /needs \d+px of height and has 300px/);
  const days = Array.from({ length: 365 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10), value: i % 4 }));
  assert.ok(h(charts.chart({ chart: 'calendar', days }, { width: 864, height: 360 })) <= 360);
});

test('chart strict: nothing is cut, hidden or overlapping', () => {
  const opt = { width: 600, height: 300, strict: true };
  assert.throws(() => charts.chart({ chart: 'barChart', data: [] }, opt), /no data to draw/);
  const long = [{ label: 'A warehouse club with a very long name that cannot fit in the label column of this chart', value: 5 }, { label: 'B', value: 3 }];
  assert.throws(() => charts.chart({ chart: 'hbarChart', data: long }, opt), /is cut: shorten it/);
  assert.ok(charts.chart({ chart: 'hbarChart', data: long }, { ...opt, strict: false }).includes('…'), 'a page cuts the label and keeps the tooltip');
  const bars = Array.from({ length: 12 }, (_, i) => ({ label: 'Category number ' + i, value: i + 1 }));
  assert.throws(() => charts.chart({ chart: 'barChart', data: bars }, opt), /wider than its bar slot/);
  const items = [{ label: 'Big', value: 1000 }, { label: 'Tiny item', value: 1 }];
  assert.throws(() => charts.chart({ chart: 'treemap', items }, opt), /"Tiny item" is too small to show its name/);
  const words = Array.from({ length: 80 }, (_, i) => ({ text: 'averylongword' + i, value: 80 - i }));
  assert.throws(() => charts.chart({ chart: 'wordCloud', words }, opt), /words have no room/);
});

test('chart: bare leaves out title, unit and source', () => {
  const spec = examples.find(([, s]) => s.chart === 'barChart')[1];
  assert.ok(charts.chart(spec).includes('Source: Sample data'));
  const bare = charts.chart(spec, { bare: true });
  assert.ok(!bare.includes('Source:') && !bare.includes(spec.title));
});

test('lineChart: a value label does not sit on the target line', () => {
  const spec = examples.find(([, s]) => s.chart === 'lineChart')[1], out = charts.chart(spec, { width: 864, height: 360 });
  const targetY = +out.match(/y1="([\d.]+)" y2="[\d.]+" stroke="var\(--chart-target/)[1];
  const labels = [...out.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="11"[^>]*>(\d+)<\/text>/g)].map(m => [+m[1], m[2]]);
  assert.equal(labels.length, 6, 'each point keeps its value');
  for (const [y, t] of labels) assert.ok(targetY < y - 13 || targetY > y + 5, `label ${t} at ${y} is clear of the target line at ${targetY}`);
});

test('donut: on a wide chart the values stay near their labels', () => {
  const out = charts.donut({ ...fixtures.donut, width: 1000, height: 300 });
  const label = +out.match(/<text x="([\d.]+)"[^>]*>Produce</)[1], value = +out.match(/<text x="([\d.]+)"[^>]*text-anchor="end"[^>]*>[^<]*33%</)?.[1];
  assert.ok(value - label <= 380, `value column ${value} is within 380px of the labels at ${label}`);
});

test('stackedArea: totalLabels writes the first and the last total', () => {
  const spec = examples.find(([, s]) => s.chart === 'stackedArea')[1], out = charts.chart(spec, { width: 864, height: 360 });
  assert.ok(out.includes('>$92k</text>') && out.includes('>$102k</text>'), 'the totals the claim names are in the chart');
  assert.ok(!charts.chart({ ...spec, totalLabels: false }).includes('>$92k</text>'));
});

test('frame: the chart title runs the width of the chart and goes to a next line only where the chart ends', () => {
  const spec = examples.find(([, s]) => s.chart === 'heatmap')[1];
  const lines = s => [...s.matchAll(/<text x="4" y="(\d+)" font-size="14" font-weight="700"[^>]*>(.*?)<\/text>/g)].map(m => [+m[1], m[2].replace(/<[^>]+>/g, '')]);
  const wide = lines(charts.chart(spec, { width: 864 })), narrow = lines(charts.chart(spec, { width: 272, strict: true }));
  assert.deepEqual(wide, [[15, `${spec.title} · ${spec.unit}`]], 'one line when it fits');
  assert.equal(narrow.length, 2, 'two lines at 272px');
  assert.equal(narrow.map(l => l[1]).join(' '), `${spec.title} · ${spec.unit}`, 'no word is lost and none is cut');
  assert.deepEqual(narrow.map(l => l[0]), [15, 31]);
  assert.ok(narrow[0][1].length * 14 * 0.6 * 0.86 > 272 * 0.6, 'the first line is filled before the break, it does not stop after the title');
  const firstRow = s => Math.min(...[...s.matchAll(/<rect x="[\d.]+" y="([\d.]+)"[^>]*rx="3"/g)].map(m => +m[1]));
  assert.ok(firstRow(charts.chart(spec, { width: 272 })) >= 38 + 20, 'the cells start under the two lines');
  assert.throws(() => charts.chart({ ...spec, title: 'A title that has very many words in it to say what the data is', unit: 'and a unit that goes on for a long time after it' }, { width: 200, strict: true }), /is cut/);
});

test('dumbbell: a narrow chart gives the label column only the width of its labels', () => {
  const spec = examples.find(([, s]) => s.chart === 'dumbbell')[1];
  const grid = s => [...s.matchAll(/<line x1="([\d.]+)" x2="\1" y1="[\d.]+" y2="[\d.]+" stroke="var\(--chart-grid/g)].map(m => +m[1]);
  assert.equal(grid(charts.chart(spec, { width: 600 }))[0], 150);
  assert.ok(grid(charts.chart(spec, { width: 272 }))[0] < 100);
});

test('legend: top, bottom and right take their room from the plot', () => {
  const spec = examples.find(([, s]) => s.chart === 'stackedArea')[1];
  const draw = legend => charts.chart({ ...spec, legend }, { width: 600, height: 300 });
  const swatches = s => [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="14" height="3"/g)].map(m => [+m[1], +m[2]]);
  const names = s => [...s.matchAll(/<text x="[\d.]+" y="[\d.]+" font-size="12" fill="var\(--chart-axis-text,#6f7980\)">(Food|Rent|Other)<\/text>/g)].map(m => m[1]);
  const plot = s => { const m = s.match(/<line x1="([\d.]+)" x2="([\d.]+)" y1="([\d.]+)" y2="\3" stroke="var\(--chart-grid/); return { right: +m[2], bottom: +m[3] }; };
  const top = draw('top'), bottom = draw('bottom'), right = draw('right');
  assert.equal(top, draw(true), 'true is the top position');
  assert.ok(swatches(top).every(([, y]) => y < 60), 'top: under the title');
  assert.ok(swatches(bottom).every(([, y]) => y > plot(bottom).bottom + 20 && y < 300 - 16), 'bottom: under the axis labels, above the source');
  assert.ok(plot(bottom).bottom < plot(top).bottom, 'bottom: the plot gives up height');
  assert.ok(swatches(right).every(([x]) => x > plot(right).right), 'right: beside the plot');
  assert.ok(plot(right).right < plot(top).right, 'right: the plot gives up width');
  assert.deepEqual(names(top), ['Food', 'Rent', 'Other']);
  assert.deepEqual(names(right), ['Other', 'Rent', 'Food'], 'right: the order of the stack, top first');
  assert.throws(() => draw('left'), /legend must be true, false, "top", "bottom" or "right"/);
  assert.ok(!draw(false).includes('width="14" height="3"'));
});

test('legend right on a line chart follows the line ends', () => {
  const pts = ys => ['a', 'b'].map((x, i) => ({ x, y: ys[i] }));
  const out = charts.lineChart({ labels: ['a', 'b'], legend: 'right', series: [{ name: 'Low', points: pts([5, 1]) }, { name: 'High', points: pts([1, 9]) }, { name: 'Mid', points: pts([3, 4]) }] });
  assert.deepEqual([...out.matchAll(/>(Low|High|Mid)<\/text>/g)].map(m => m[1]), ['High', 'Mid', 'Low']);
});

test('legend positions keep the height of a chart whose height follows its rows', () => {
  const spec = examples.find(([, s]) => s.chart === 'dumbbell')[1], h = s => +s.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1];
  const top = charts.chart({ ...spec, legend: 'top' }), bottom = charts.chart({ ...spec, legend: 'bottom' }), right = charts.chart({ ...spec, legend: 'right' });
  assert.ok(Math.abs(h(top) - h(bottom)) <= 4, 'bottom adds the room the top legend took');
  assert.ok(h(right) < h(top), 'right takes width, not height');
});

test('chart: the title says what the chart shows, the claim has the finding', () => {
  const spec = examples.find(([, s]) => s.chart === 'barChart')[1];
  assert.throws(() => charts.chart({ ...spec, title: spec.claim }), /"title" repeats the claim/);
  assert.throws(() => charts.chart({ ...spec, title: 'Orders by channel rose in every region and Search now brings the most of them, by far' }), /the limit is 80/);
  for (const [file, s] of examples) if (s.title) assert.ok(s.title.length <= 80 && s.title !== s.claim, file);
});

test('callouts: a callout names its point by label and series name', () => {
  const ex = n => examples.find(([, s]) => s.chart === n)[1];
  const ring = s => { const m = s.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="5" fill="none"/); return m && [+m[1], +m[2]]; };
  const bars = charts.chart(ex('groupedBars'), { width: 864, height: 360, strict: true });
  const bar = bars.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*><title>Q4 This year: \$248k<\/title>/);
  assert.ok(Math.abs(ring(bars)[0] - (+bar[1] + +bar[3] / 2)) < 1 && Math.abs(ring(bars)[1] - +bar[2]) < 1, 'the ring sits on the top of the named bar');
  assert.ok(bars.includes('>below last year</text>'));
  const area = charts.chart({ ...ex('stackedArea'), annotations: [{ at: 'May', series: 'Food', text: 'dip' }] }, { width: 864, height: 360, strict: true });
  assert.ok(ring(area) && area.includes('>dip</text>'));
  const par = charts.chart({ ...ex('pareto'), annotations: [{ at: 'Beef', text: 'third' }] }, { width: 864, height: 360, strict: true });
  const beef = par.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*><title>Beef:/);
  assert.ok(Math.abs(ring(par)[0] - (+beef[1] + +beef[3] / 2)) < 1, 'pareto: the named bar, in the sorted order');
  const hb = charts.chart(ex('hbarChart'), { width: 864, height: 300, strict: true });
  const text = hb.match(/<text x="([\d.]+)"[^>]*font-weight="700">49% of the spend<\/text>/);
  assert.ok(text && +text[1] < 864, 'hbarChart: the callout stands on the row, inside the chart');
  assert.equal(charts.chart({ ...ex('lineChart'), annotations: [{ at: 'Mar', text: 'release' }] }), charts.chart({ ...ex('lineChart'), annotations: [{ index: 2, text: 'release' }] }));
});

test('callouts: a point that is not on the chart, or too many callouts, is refused', () => {
  const spec = examples.find(([, s]) => s.chart === 'barChart')[1];
  assert.throws(() => charts.chart({ ...spec, annotations: [{ at: 'Nowhere', text: 'x' }] }), /is not on the chart. The chart has: Search, Direct/);
  assert.throws(() => charts.chart({ ...examples.find(([, s]) => s.chart === 'lineChart')[1], annotations: [{ at: 'Mar', series: 'Nobody', text: 'x' }] }), /names the series "Nobody"/);
  assert.throws(() => charts.chart({ ...spec, annotations: ['Search', 'Direct', 'Social', 'Email'].map(at => ({ at, text: 'x' })) }), /4 callouts/);
  assert.throws(() => charts.chart({ ...spec, annotations: [{ at: 'Search' }] }), /needs "text"/);
  assert.throws(() => charts.chart({ ...examples.find(([, s]) => s.chart === 'donut')[1], annotations: [{ at: 'Produce', text: 'x' }] }), /donut does not take "annotations"/);
});

test('format: maxDecimals shows up to that many decimals and no end zeros', () => {
  const out = charts.chart({ chart: 'barChart', format: { prefix: '$', maxDecimals: 2 }, data: [{ label: 'A', value: 1.5 }, { label: 'B', value: 2 }, { label: 'C', value: 1.234 }] });
  assert.ok(out.includes('>$1.5<') && out.includes('>$2<') && out.includes('>$1.23<'));
});

test('chart strict: a box too low for a readable plot is refused', () => {
  const bar = examples.find(([, s]) => s.chart === 'barChart')[1], line = examples.find(([, s]) => s.chart === 'lineChart')[1];
  assert.throws(() => charts.chart(bar, { width: 400, height: 100, strict: true }), /the box is too low/);
  assert.throws(() => charts.chart({ ...line, legend: true }, { width: 400, height: 150, strict: true }), /the plot gets \d+px of height and needs 60/);
  assert.ok(charts.chart(bar, { width: 400, height: 200, strict: true }).startsWith('<svg '));
  for (const [file, s] of examples) if (s.chart !== 'sparkline') assert.ok(charts.chart(s, { width: 864, height: 360, strict: true }), file);
});
