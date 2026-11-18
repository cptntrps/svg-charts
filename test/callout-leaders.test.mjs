import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineChart } from '../charts.js';

const labels = ['Apr', 'May', 'Jun'];
const fixture = {
  title: 'Cost per order by month', unit: '$', source: 'Ad platform export, April to June 2025',
  labels, target: 125, valueLabels: true, legend: true, fmtY: v => '$' + v,
  series: [
    { name: 'All products', points: labels.map((x, i) => ({ x, y: [224, 171, 119][i] })) },
    { name: 'Without Product A', points: labels.map((x, i) => ({ x, y: [224, 171, 192][i] })) },
  ],
};
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const inside = (p, b) => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.y0 && p[1] < b.y1;
function crosses(a, z, b) {
  if (inside(a, b) || inside(z, b)) return true;
  for (const x of [b.x0, b.x1]) {
    const t = (x - a[0]) / (z[0] - a[0]), y = a[1] + t * (z[1] - a[1]);
    if (t > 0 && t < 1 && y > b.y0 && y < b.y1) return true;
  }
  for (const y of [b.y0, b.y1]) {
    const t = (y - a[1]) / (z[1] - a[1]), x = a[0] + t * (z[0] - a[0]);
    if (t > 0 && t < 1 && x > b.x0 && x < b.x1) return true;
  }
  return false;
}
function assertLeadersClear(out) {
  const boxes = [...out.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].flatMap(([, tag, text]) => {
    const a = attrs(tag);
    if (!(a['font-size'] === '11' && a['font-weight'] === '700') && !text.startsWith('target ')) return [];
    const width = text.length * +a['font-size'] * 0.6, x = +a.x;
    const x0 = x - (a['text-anchor'] === 'end' ? width : a['text-anchor'] === 'middle' ? width / 2 : 0);
    return [{ text, x0, x1: x0 + width, y0: +a.y - +a['font-size'], y1: +a.y + 3 }];
  });
  assert.ok(boxes.some(b => b.text === '$192') && boxes.some(b => b.text === 'target $125'));
  let count = 0;
  for (const [tag] of out.matchAll(/<(?:line|polyline)\b[^>]*>/g)) {
    const a = attrs(tag);
    if (!['1', '1.2', '1.3'].includes(a['stroke-width']) || !/--chart-(?:ink|callout)/.test(a.stroke)) continue;
    const pts = a.points ? a.points.split(' ').map(p => p.split(',').map(Number)) : [[+a.x1, +a.y1], [+a.x2, +a.y2]];
    count++;
    for (let i = 1; i < pts.length; i++) for (const box of boxes) {
      assert.ok(!crosses(pts[i - 1], pts[i], box), `leader ${JSON.stringify(pts)} crosses ${box.text}`);
    }
  }
  assert.ok(count > 0, 'annotation has a visible leader');
}
for (const style of ['ring', 'box', 'pill']) for (const [width, height] of [[600, 260], [700, 340], [420, 240]]) {
  test(`last-point ${style} leader clears both series and target labels at ${width}x${height}`, () => {
    assertLeadersClear(lineChart({ ...fixture, width, height,
      annotations: [{ index: 2, series: 0, text: '$119, under the $125 target', style }] }));
  });
}
