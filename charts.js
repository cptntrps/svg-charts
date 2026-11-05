/*!
 * svg-charts: dependency-free inline-SVG charts.
 * Every builder returns an SVG string. No runtime, no canvas, no DOM required
 * (render server-side or drop the string into innerHTML). Colors come from CSS
 * custom properties so the host page controls the theme, including dark mode.
 *
 * MIT licensed.
 */

// ---------- small helpers ----------
export const fin = v => typeof v === 'number' && Number.isFinite(v);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const round2 = v => fin(v) ? +v.toFixed(2) : 0;      // keep SVG coordinates compact
const num = v => fin(v) ? v.toLocaleString('en-US') : 'n/a';

// "Nice" axis ticks: round steps (1/2/5 x 10^n) spanning [lo, hi].
export function niceTicks(lo, hi, n = 5) {
  const span = (hi - lo) || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const r = step0 / mag;
  const step = (r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1) * mag;
  const out = [];
  const top = Math.ceil(hi / step - 1e-9) * step;
  for (let v = Math.floor(lo / step + 1e-9) * step; v <= top + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// SVG wrapper. Every chart is labelled for screen readers (role="img").
export function svg(w, h, body, label) {
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" ` +
    `role="img" aria-label="${esc(label || 'chart')}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

// Theme hooks (override by setting these CSS custom properties on the page):
//   --chart-grid, --chart-axis-text, --chart-ink, --chart-target
const GRID = 'var(--chart-grid,#e4e6e5)';
const AXIS = 'var(--chart-axis-text,#6f7980)';
const INK = 'var(--chart-ink,#141716)';
const TGT = 'var(--chart-target,#c0392b)';
const PALETTE = ['var(--chart-1,#2a78d6)', 'var(--chart-2,#0ca37a)', 'var(--chart-3,#8d5bd6)',
  'var(--chart-4,#d98500)', 'var(--chart-5,#d03b3b)'];
export const palette = i => PALETTE[i % PALETTE.length];

const axisText = (x, y, anchor, t, extra = '') =>
  `<text x="${round2(x)}" y="${round2(y)}" text-anchor="${anchor}" font-size="12" fill="${AXIS}" ${extra}>${esc(t)}</text>`;

// Title, unit and source frame. The top band (22px) holds "Title · unit" and the
// bottom band (16px) holds "Source: ...". Builders add the bands to their own
// margins so the plot shrinks and the svg keeps the height the caller passed.
const TOP_BAND = 22, BOTTOM_BAND = 16;
function frame({ title, unit, source, H }) {
  const hasTop = title != null || unit != null;
  let deco = '';
  if (hasTop) {
    const u = unit != null ? `<tspan font-weight="400" fill="${AXIS}">${title != null ? ' · ' : ''}${esc(unit)}</tspan>` : '';
    deco += `<text x="4" y="15" font-size="14" font-weight="700" fill="${INK}">${title != null ? esc(title) : ''}${u}</text>`;
  }
  if (source != null) deco += `<text x="4" y="${H - 4}" font-size="10" fill="${AXIS}">Source: ${esc(source)}</text>`;
  return { top: hasTop ? TOP_BAND : 0, bottom: source != null ? BOTTOM_BAND : 0, deco };
}

// One callout: a ring on the point, a short leader up and to the right (left
// when the text would run off the right edge), and the text.
function callout(px, py, text, W) {
  const d = px > W - 96 ? -1 : 1;
  return `<circle cx="${round2(px)}" cy="${round2(py)}" r="5" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    `<line x1="${round2(px + d * 4)}" y1="${round2(py - 4)}" x2="${round2(px + d * 17)}" y2="${round2(py - 17)}" stroke="${INK}" stroke-width="1.2"/>` +
    `<text x="${round2(px + d * 20)}" y="${round2(py - 13)}" text-anchor="${d < 0 ? 'end' : 'start'}" font-size="12" font-weight="700" fill="${INK}">${esc(text)}</text>`;
}

// Resolve each annotation to a point through `locate(a)`, which returns [x, y]
// or throws. A bad index is an error, not a missing callout.
function annotate(annotations, W, locate) {
  return annotations.map((a, i) => {
    const pt = locate(a);
    if (!pt || !fin(pt[0]) || !fin(pt[1])) throw new RangeError(`annotation ${i} does not resolve to a point`);
    return callout(pt[0], pt[1], a.text, W);
  }).join('');
}

const pick = (arr, i, what) => {
  if (!Number.isInteger(i) || i < 0 || i >= arr.length) throw new RangeError(`annotation ${what} ${i} is out of range`);
  return arr[i];
};

function gridY(ticks, L, R, W, Y, fmt) {
  return ticks.map(t =>
    `<line x1="${L}" x2="${W - R}" y1="${round2(Y(t))}" y2="${round2(Y(t))}" stroke="${GRID}" stroke-width="1"/>` +
    axisText(L - 6, Y(t) + 4, 'end', fmt(t))).join('');
}

// ---------- line chart (multi-series) ----------
// series: [{ name, color?, dash?, points:[{x,y}] }]; labels: the ordered x categories.
export function lineChart({ series = [], labels = [], label, width = 600, height = 280,
  target = null, fmtY = num, title, unit, source, annotations = [] } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'line chart';
  const L = 54, R = 16, Tp = 14 + f.top, B = 34, W = width, H = height - f.bottom;
  const ys = series.flatMap(s => s.points.map(p => p.y)).filter(fin);
  if (!ys.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  let ymax = Math.max(...ys) * 1.1;
  const tIn = target != null && fin(target) && target <= ymax * 2;
  if (tIn) ymax = Math.max(ymax, target * 1.1);
  const ticks = niceTicks(0, ymax); ymax = ticks[ticks.length - 1] || 1;
  const X = i => L + (labels.length < 2 ? 0 : i * (W - L - R) / (labels.length - 1));
  const Y = v => Tp + (1 - v / ymax) * (H - Tp - B);
  let g = gridY(ticks, L, R, W, Y, fmtY);
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor((W - L - R) / 72))));
  g += labels.map((x, i) => (i % every === 0 || i === labels.length - 1)
    ? axisText(X(i), H - 12, i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle', x) : '').join('');
  series.forEach((s, si) => {
    const col = s.color || palette(si);
    const pts = s.points.map(p => [labels.indexOf(p.x), p.y]).filter(p => p[0] >= 0 && fin(p[1]));
    g += `<polyline fill="none" stroke="${col}" stroke-width="2.4" stroke-dasharray="${s.dash || ''}" ` +
      `points="${pts.map(p => round2(X(p[0])) + ',' + round2(Y(p[1]))).join(' ')}"/>`;
    g += pts.map(p => `<circle cx="${round2(X(p[0]))}" cy="${round2(Y(p[1]))}" r="3" fill="${col}">` +
      `<title>${esc(s.name)} ${esc(labels[p[0]])}: ${esc(fmtY(p[1]))}</title></circle>`).join('');
  });
  if (target != null && fin(target)) {
    if (tIn) g += `<line x1="${L}" x2="${W - R}" y1="${round2(Y(target))}" y2="${round2(Y(target))}" ` +
      `stroke="${TGT}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
      axisText(W - R, Y(target) - 5, 'end', 'target ' + fmtY(target), `fill="${TGT}"`);
    else g += axisText(W - R, Tp + 4, 'end', 'target ' + fmtY(target) + ' is above the chart', `fill="${TGT}"`);
  }
  g += annotate(annotations, W, a => {
    const s = pick(series, a.series ?? 0, 'series'), x = pick(labels, a.index, 'index');
    const p = s.points.find(p => p.x === x);
    return p && [X(a.index), Y(p.y)];
  });
  return svg(W, height, f.deco + g, lab);
}

// ---------- vertical bar chart ----------
// data: [{ label, value, color? }]
export function barChart({ data = [], label, width = 600, height = 260,
  target = null, fmtY = num, title, unit, source, annotations = [] } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'bar chart';
  const L = 54, R = 14, Tp = 16 + f.top, B = 34, W = width, H = height - f.bottom;
  const vals = data.map(d => d.value).filter(fin);
  if (!vals.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  let ymax = Math.max(...vals, target != null && fin(target) ? target : 0) * 1.12;
  const ticks = niceTicks(0, ymax); ymax = ticks[ticks.length - 1] || 1;
  const Y = v => Tp + (1 - v / ymax) * (H - Tp - B);
  const bw = (W - L - R) / data.length;
  let g = gridY(ticks, L, R, W, Y, fmtY);
  data.forEach((d, i) => {
    const x = L + i * bw + bw * 0.16, w = bw * 0.68, y = Y(Math.max(0, d.value)), h = Math.max(1, Math.abs(Y(d.value) - Y(0)));
    const col = d.color || palette(i);
    g += `<rect x="${round2(x)}" y="${round2(y)}" width="${round2(w)}" height="${round2(h)}" rx="3" fill="${col}">` +
      `<title>${esc(d.label)}: ${esc(fmtY(d.value))}</title></rect>`;
    g += axisText(x + w / 2, y - 5, 'middle', fmtY(d.value), `fill="${INK}" font-weight="600"`);
    g += axisText(x + w / 2, H - 12, 'middle', d.label);
  });
  if (target != null && fin(target)) g += `<line x1="${L}" x2="${W - R}" y1="${round2(Y(target))}" y2="${round2(Y(target))}" ` +
    `stroke="${TGT}" stroke-width="1.5" stroke-dasharray="5 4"/>` + axisText(W - R, Y(target) - 5, 'end', 'target ' + fmtY(target), `fill="${TGT}"`);
  g += annotate(annotations, W, a => {
    const d = pick(data, a.index, 'index');
    return [L + a.index * bw + bw * 0.5, Y(Math.max(0, d.value))];
  });
  return svg(W, height, f.deco + g, lab);
}

// ---------- waterfall / bridge ----------
// items: [{ label, value, total? }]  total bars are drawn from zero; others step the running sum.
export function waterfall({ items = [], label, width = 600, height = 290, fmtY = num,
  title, unit, source, annotations = [] } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'waterfall';
  const L = 54, R = 10, Tp = 18 + f.top, B = 46, W = width, H = height - f.bottom;
  const bars = []; let run = 0;
  for (const it of items) {
    if (it.total) { bars.push({ name: it.label, from: 0, to: it.value, kind: 'total', delta: it.value }); run = it.value; }
    else { bars.push({ name: it.label, from: run, to: run + it.value, kind: it.value < 0 ? 'down' : 'up', delta: it.value }); run += it.value; }
  }
  if (!bars.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  let ymax = Math.max(...bars.map(b => Math.max(b.from, b.to))) * 1.12;
  const ticks = niceTicks(0, ymax); ymax = ticks[ticks.length - 1] || 1;
  const bw = (W - L - R) / bars.length, Y = v => Tp + (1 - v / ymax) * (H - Tp - B);
  let g = gridY(ticks, L, R, W, Y, fmtY);
  bars.forEach((b, i) => {
    const x = L + i * bw + bw * 0.16, w = bw * 0.68, top = Y(Math.max(b.from, b.to)), h = Math.max(1, Math.abs(Y(b.from) - Y(b.to)));
    const col = b.kind === 'total' ? 'var(--chart-total,#8d979d)' : b.kind === 'down' ? 'var(--chart-down,#0ca37a)' : 'var(--chart-up,#d03b3b)';
    const val = b.kind === 'total' ? fmtY(b.to) : (b.delta < 0 ? '−' : '+') + fmtY(Math.abs(b.delta));
    g += `<rect x="${round2(x)}" y="${round2(top)}" width="${round2(w)}" height="${round2(h)}" rx="3" fill="${col}">` +
      `<title>${esc(b.name)}: ${esc(val)}</title></rect>`;
    g += axisText(x + w / 2, top - 5, 'middle', val, `fill="${INK}" font-weight="600" font-size="${bw < 90 ? 11 : 13}"`);
    const words = String(b.name).split(' '), fs = bw < 90 ? 11 : 13;
    g += axisText(x + w / 2, H - 28, 'middle', words[0], `font-size="${fs}"`);
    if (words.length > 1) g += axisText(x + w / 2, H - 13, 'middle', words.slice(1).join(' '), `font-size="${fs}"`);
  });
  g += annotate(annotations, W, a => {
    const b = pick(bars, a.index, 'index');
    return [L + a.index * bw + bw * 0.5, Y(Math.max(b.from, b.to))];
  });
  return svg(W, height, f.deco + g, lab);
}

// ---------- scatter (optional fitted line per group) ----------
// groups: [{ name, color?, points:[{x,y, tip?}], line?:{from,to,fn} }]
export function scatter({ groups = [], label, width = 600, height = 330,
  xLabel = '', yLabel = '', fmtX = num, fmtY = num, title, unit, source, annotations = [] } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'scatter';
  const L = 54, R = 16, Tp = 22 + f.top, B = 38, W = width, H = height - f.bottom;
  const pts = groups.flatMap(g => g.points || []);
  if (!pts.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  const xt = niceTicks(0, Math.max(...pts.map(p => p.x)) * 1.05), XM = xt[xt.length - 1] || 1;
  const yt = niceTicks(0, Math.max(...pts.map(p => p.y)) * 1.08), YM = yt[yt.length - 1] || 1;
  const X = v => L + v / XM * (W - L - R), Y = v => Tp + (1 - v / YM) * (H - Tp - B);
  let g = gridY(yt, L, R, W, Y, fmtY);
  g += xt.map((t, i) => axisText(X(t), H - 16, i === xt.length - 1 ? 'end' : 'middle', fmtX(t))).join('');
  if (xLabel) g += axisText(W - R, H - 2, 'end', xLabel);
  if (yLabel) g += axisText(L + 4, Tp + 10, 'start', yLabel, `font-weight="600"`);
  groups.forEach((gr, gi) => {
    const col = gr.color || palette(gi);
    if (gr.line && typeof gr.line.fn === 'function') {
      const n = 30, p = [];
      for (let i = 0; i <= n; i++) { const x = gr.line.from + (gr.line.to - gr.line.from) * i / n; p.push(round2(X(x)) + ',' + round2(Y(gr.line.fn(x)))); }
      g += `<polyline fill="none" stroke="${col}" stroke-width="1.8" stroke-dasharray="6 4" points="${p.join(' ')}"/>`;
    }
    g += (gr.points || []).map(p => `<circle cx="${round2(X(p.x))}" cy="${round2(Y(p.y))}" r="4.2" fill="${col}" fill-opacity=".85">` +
      `<title>${esc(p.tip || (gr.name + ': ' + fmtX(p.x) + ', ' + fmtY(p.y)))}</title></circle>`).join('');
  });
  g += annotate(annotations, W, a => fin(a.x) && fin(a.y) ? [X(a.x), Y(a.y)] : null);
  return svg(W, height, f.deco + g, lab);
}

// ---------- diverging bars (change, positive and negative from zero) ----------
// data: [{ label, value, color? }]
export function divergingBars({ data = [], label, width = 600, height = 280, fmtY = num,
  title, unit, source, annotations = [] } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'change';
  const L = 54, R = 14, Tp = 16 + f.top, B = 20, W = width, H = height - f.bottom;
  const vals = data.map(d => d.value).filter(fin);
  if (!vals.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  const lo = Math.min(0, ...vals) * 1.12, hi = Math.max(0, ...vals) * 1.12;
  const ticks = niceTicks(lo, hi); const tmin = ticks[0], tmax = ticks[ticks.length - 1] || 1;
  const Y = v => Tp + (1 - (v - tmin) / (tmax - tmin)) * (H - Tp - B);
  let g = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${round2(Y(t))}" y2="${round2(Y(t))}" ` +
    `stroke="${t === 0 ? INK : GRID}" stroke-width="${t === 0 ? 1.4 : 1}"/>` + axisText(L - 6, Y(t) + 4, 'end', fmtY(t))).join('');
  const bw = (W - L - R) / data.length, zero = Y(0);
  data.forEach((d, i) => {
    const x = L + i * bw + bw * 0.16, w = bw * 0.68, yv = Y(d.value);
    const top = Math.min(zero, yv), h = Math.max(1, Math.abs(yv - zero));
    const col = d.color || (d.value < 0 ? 'var(--chart-down,#0ca37a)' : 'var(--chart-up,#2a78d6)');
    g += `<rect x="${round2(x)}" y="${round2(top)}" width="${round2(w)}" height="${round2(h)}" rx="3" fill="${col}">` +
      `<title>${esc(d.label)}: ${esc((d.value < 0 ? '−' : '+') + fmtY(Math.abs(d.value)))}</title></rect>`;
    g += axisText(x + w / 2, d.value >= 0 ? top - 5 : top + h + 13, 'middle', (d.value < 0 ? '−' : '+') + fmtY(Math.abs(d.value)), `fill="${INK}" font-weight="600" font-size="11"`);
    g += axisText(x + w / 2, H - 4, 'middle', d.label, `font-size="11"`);
  });
  g += annotate(annotations, W, a => {
    const d = pick(data, a.index, 'index');
    return [L + a.index * bw + bw * 0.5, Y(d.value)];
  });
  return svg(W, height, f.deco + g, lab);
}

// ---------- dumbbell (two points per row, e.g. before vs after) ----------
// rows: [{ label, a, b, color? }]
// Height follows the row count, so here the bands add to the height instead of shrinking the plot.
export function dumbbell({ rows = [], label, width = 600, aLabel = 'A', bLabel = 'B', fmtY = num,
  title, unit, source, annotations = [] } = {}) {
  const plotH = Math.max(120, 16 + 28 + rows.length * 38);
  const f = frame({ title, unit, source, H: plotH + (title != null || unit != null ? TOP_BAND : 0) + (source != null ? BOTTOM_BAND : 0) });
  const lab = label ?? title ?? 'dumbbell';
  const L = 150, R = 20, Tp = 16 + f.top, B = 28, W = width, H = plotH + f.top, height = H + f.bottom;
  const vals = rows.flatMap(r => [r.a, r.b]).filter(fin);
  if (!vals.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals) * 1.05), xmax = ticks[ticks.length - 1] || 1, xmin = ticks[0];
  const X = v => L + (v - xmin) / (xmax - xmin) * (W - L - R);
  const rowH = (H - Tp - B) / rows.length;
  let g = ticks.map(t => `<line x1="${round2(X(t))}" x2="${round2(X(t))}" y1="${Tp}" y2="${H - B}" stroke="${GRID}"/>` +
    axisText(X(t), H - B + 16, 'middle', fmtY(t))).join('');
  rows.forEach((r, i) => {
    const y = Tp + (i + 0.5) * rowH, col = r.color || palette(i);
    g += axisText(L - 10, y + 4, 'end', r.label, `fill="${INK}"`);
    g += `<line x1="${round2(X(r.a))}" x2="${round2(X(r.b))}" y1="${round2(y)}" y2="${round2(y)}" stroke="${col}" stroke-width="2"/>`;
    g += `<circle cx="${round2(X(r.a))}" cy="${round2(y)}" r="5" fill="var(--chart-paper,#fff)" stroke="${col}" stroke-width="2"><title>${esc(r.label)} ${esc(aLabel)}: ${esc(fmtY(r.a))}</title></circle>`;
    g += `<circle cx="${round2(X(r.b))}" cy="${round2(y)}" r="5" fill="${col}"><title>${esc(r.label)} ${esc(bLabel)}: ${esc(fmtY(r.b))}</title></circle>`;
  });
  g += annotate(annotations, W, a => {
    const r = pick(rows, a.index, 'index'), s = pick([r.a, r.b], a.series ?? 0, 'series');
    return [X(s), Tp + (a.index + 0.5) * rowH];
  });
  return svg(W, height, f.deco + g, lab);
}

// ---------- stacked bars (shares that sum per column) ----------
// columns: [{ label, parts: { key: value, ... } }]; keys + colors give the stack order.
export function stackedBars({ columns = [], keys = [], colors = [], label, width = 600, height = 280, fmtY = v => Math.round(v * 100) + '%',
  title, unit, source, annotations = [] } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'stacked';
  const L = 44, R = 14, Tp = 14 + f.top, B = 30, W = width, H = height - f.bottom;
  if (!columns.length || !keys.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  const totals = columns.map(c => keys.reduce((a, k) => a + (c.parts[k] || 0), 0));
  const norm = columns.map((c, i) => totals[i] > 0 ? totals[i] : 1);
  const Y = v => Tp + (1 - v) * (H - Tp - B);               // v is a 0..1 share
  let g = [0, 0.25, 0.5, 0.75, 1].map(t => `<line x1="${L}" x2="${W - R}" y1="${round2(Y(t))}" y2="${round2(Y(t))}" stroke="${GRID}"/>` +
    axisText(L - 6, Y(t) + 4, 'end', fmtY(t))).join('');
  const bw = (W - L - R) / columns.length, tops = columns.map(() => []);   // segment top per column and key
  columns.forEach((c, i) => {
    const x = L + i * bw + bw * 0.16, w = bw * 0.68; let acc = 0;
    keys.forEach((k, ki) => {
      const share = (c.parts[k] || 0) / norm[i]; if (share <= 0) { tops[i][ki] = Y(acc); return; }
      const y0 = Y(acc + share), h = Math.abs(Y(acc) - Y(acc + share)); acc += share; tops[i][ki] = y0;
      g += `<rect x="${round2(x)}" y="${round2(y0)}" width="${round2(w)}" height="${round2(h)}" fill="${colors[ki] || palette(ki)}">` +
        `<title>${esc(c.label)} ${esc(k)}: ${esc(fmtY(share))}</title></rect>`;
    });
    g += axisText(x + w / 2, H - 10, 'middle', c.label);
  });
  g += annotate(annotations, W, a => {
    pick(columns, a.index, 'index'); pick(keys, a.series ?? 0, 'series');
    return [L + a.index * bw + bw * 0.5, tops[a.index][a.series ?? 0]];
  });
  return svg(W, height, f.deco + g, lab);
}

export default { lineChart, barChart, waterfall, scatter, divergingBars, dumbbell, stackedBars, niceTicks, svg, esc, fin, palette };
