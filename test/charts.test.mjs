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
