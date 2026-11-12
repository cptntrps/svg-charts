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

// Axis-style text. `extra` holds attribute overrides (fill, font-size, font-weight);
// each name appears once in the output, with the override winning.
const axisText = (x, y, anchor, t, extra = '') => {
  const attrs = { 'font-size': '12', fill: AXIS };
  for (const m of extra.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return `<text x="${round2(x)}" y="${round2(y)}" text-anchor="${anchor}" ` +
    Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ') + `>${esc(t)}</text>`;
};

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
  const titleLine = (title != null ? String(title) : '') + (unit != null ? (title != null ? ' · ' : '') + unit : '');
  return { top: hasTop ? TOP_BAND : 0, bottom: source != null ? BOTTOM_BAND : 0, deco,
    titleBox: hasTop ? labelBox(4, 15, titleLine, 'start', 14, 0) : null };
}

// Builders draw their body twice when a band callout needs its own row under the
// title: the second pass shrinks the plot by that row (band.need is set in pass one).
function twoPass(body, band) {
  const g = body(0);
  return band.need ? body(LEGEND_ROW) : g;
}

// Colour of a named item: explicit `color` first, then the `colors` map by name,
// then the fallback (palette or kind colour). One name, one colour across charts.
const pickColor = (explicit, colors, names, fallback) =>
  explicit || names.map(n => n != null && colors ? colors[n] : undefined).find(Boolean) || fallback;

// Legend rows under the title band: per entry a 14x3 swatch (or a hollow/filled
// marker) in the entry colour and its name in 12px axis text, wrapped to the
// chart width. Returns the svg and the height the plot gives up.
const LEGEND_ROW = 16;
function legendRows(entries, W, y0) {
  let x = 4, row = 0, out = '';
  entries.forEach(e => {
    const w = 20 + textW(e.name, 12);
    if (x > 4 && x + w > W - 4) { x = 4; row++; }
    const y = y0 + row * LEGEND_ROW;
    out += e.marker === 'hollow' ? `<circle cx="${x + 7}" cy="${y + 8}" r="4" fill="var(--chart-paper,#fff)" stroke="${e.color}" stroke-width="2"/>`
      : e.marker === 'filled' ? `<circle cx="${x + 7}" cy="${y + 8}" r="4" fill="${e.color}"/>`
      : `<rect x="${x}" y="${y + 6.5}" width="14" height="3" rx="1.5" fill="${e.color}"/>`;
    out += `<text x="${x + 20}" y="${y + 12}" font-size="12" fill="${AXIS}">${esc(e.name)}</text>`;
    x += w + 16;
  });
  return { svg: out, height: entries.length ? (row + 1) * LEGEND_ROW + 2 : 0 };
}
// Legend entries for bar-type data that names a `series` per item; empty otherwise.
function seriesLegend(items, colors) {
  const names = [...new Set(items.map(d => d.series).filter(n => n != null))];
  return names.map((n, i) => ({ name: n, color: pickColor(null, colors, [n], palette(i)) }));
}

// Text width estimate (a string builder has no font metrics): 0.6em per character.
const textW = (s, fs) => String(s).length * fs * 0.6;
// Box of a text label with its baseline at (x, y). `m` is the clearance a callout
// keeps from it: 14px for the target label, 2px for value labels.
function labelBox(x, y, text, anchor = 'end', fs = 12, m = 14) {
  const w = textW(text, fs), x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { x0, x1: x0 + w, y0: y - fs, y1: y + 3, m };
}
// A drawn line segment a callout must not cross; sampled at 8 x positions.
const segment = (x1, y1, x2, y2, m = 2) => ({ seg: true, x1, y1, x2, y2, m });
// True when box a comes within b.m of box or segment b.
function nearBox(a, b) {
  if (!b.seg) return a.x0 < b.x1 + b.m && a.x1 > b.x0 - b.m && a.y0 < b.y1 + b.m && a.y1 > b.y0 - b.m;
  const lo = Math.max(a.x0 - b.m, Math.min(b.x1, b.x2)), hi = Math.min(a.x1 + b.m, Math.max(b.x1, b.x2));
  if (lo > hi) return false;
  for (let i = 0; i < 8; i++) {
    const x = lo + (hi - lo) * i / 7, y = b.y1 + (b.y2 - b.y1) * (x - b.x1) / ((b.x2 - b.x1) || 1);
    if (y > a.y0 - b.m && y < a.y1 + b.m) return true;
  }
  return false;
}

// One callout: a ring on the point, a leader, and the text. The text sits up and
// to the right, or up and to the left (right-aligned to the point) when the point
// is in the right 35% of the plot or the text would cross the plot's right edge.
// It never overlaps an entry of geo.avoid (target and value labels, data lines):
// it moves up in 16px steps, then tries below the point, and when nothing inside
// the plot is clear it goes to the band above the plot (right-aligned, on the
// title row) with a thin leader down to the point.
// In the band the text never overprints the title line: when it would, the
// callout takes a second band row under the title (band.need asks the builder for
// the row; extraTop > 0 means the row exists). `ringOnly` draws the ring alone,
// for an annotation whose text repeats the value label already on the point.
// When the point carries its own value label (`own`), the leader is an elbow that
// runs sideways past that label and then up, so it never crosses the number.
function callout(px, py, text, geo, own, ringOnly = false) {
  const { W, L, R, top = 0, plotTop = top, bottom = Infinity, avoid = [], title = null, extraTop = 0, band = {} } = geo;
  const ring = `<circle cx="${round2(px)}" cy="${round2(py)}" r="5" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  if (ringOnly) return ring;
  const tw = textW(text, 12);
  const reach = d => own ? (d > 0 ? Math.max(px + 17, own.x1 + 3) : Math.min(px - 17, own.x0 - 3)) : px + d * 17;
  let d = px > L + 0.65 * (W - L - R) ? -1 : 1;
  if (d > 0 && reach(1) + 3 + tw > W - R) d = -1;
  const ex = reach(d);
  let tx = ex + d * 3, x0 = d > 0 ? tx : tx - tw;
  const clear = base => !avoid.some(b => nearBox({ x0, x1: x0 + tw, y0: base - 12, y1: base + 3 }, b));
  let base = py - 13, below = false, inBand = false;
  while (!clear(base) && base - 28 >= plotTop) base -= 16;
  if (!clear(base)) {
    let b2 = py + 22;
    while (!clear(b2) && b2 + 19 <= bottom) b2 += 16;
    if (clear(b2)) { base = b2; below = true; }
    else {
      inBand = true; d = -1; tx = W - 4; x0 = tx - tw; base = top > 0 ? 15 : plotTop - 2;
      if (title && x0 < title.x1 + 8) { if (extraTop > 0) base = 15 + LEGEND_ROW; else band.need = true; }
    }
  }
  const y1 = below ? py + 4 : py - 4, y2 = below ? base - 13 : base - 4;
  let leader;
  if (inBand) {
    const kx = px < x0 ? x0 - 3 : px > tx ? tx + 3 : px, ky = base + 5;
    leader = `<polyline fill="none" stroke="${INK}" stroke-width="1" points="${round2(px)},${round2(py - 5)} ${round2(px)},${round2(ky)}` +
      (kx !== px ? ` ${round2(kx)},${round2(ky)}` : '') + `"/>`;
  } else if (own) {
    leader = `<polyline fill="none" stroke="${INK}" stroke-width="1.2" points="${round2(px + d * 5)},${round2(py)} ${round2(ex)},${round2(py)} ${round2(ex)},${round2(y2)}"/>`;
  } else {
    leader = `<line x1="${round2(px + d * 4)}" y1="${round2(y1)}" x2="${round2(ex)}" y2="${round2(y2)}" stroke="${INK}" stroke-width="1.2"/>`;
  }
  return ring + leader +
    `<text x="${round2(tx)}" y="${round2(base)}" text-anchor="${d < 0 ? 'end' : 'start'}" font-size="12" font-weight="700" fill="${INK}">${esc(text)}</text>`;
}

// Resolve each annotation to a point through `locate(a)`, which returns
// [x, y, ownLabelBox?, valueText?] or throws. A bad index is an error, not a
// missing callout. An annotation whose text equals the value label already drawn
// on that point keeps only the ring. geo describes the plot for callout placement.
function annotate(annotations, geo, locate) {
  return annotations.map((a, i) => {
    const pt = locate(a);
    if (!pt || !fin(pt[0]) || !fin(pt[1])) throw new RangeError(`annotation ${i} does not resolve to a point`);
    return callout(pt[0], pt[1], a.text, geo, pt[2], pt[3] != null && String(a.text) === String(pt[3]));
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
  target = null, fmtY = num, title, unit, source, annotations = [], legend = false, colors, valueLabels = false, area = false } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'line chart';
  const colorOf = (s, si) => pickColor(s.color, colors, [s.name], palette(si));
  const entries = legend ? series.map((s, si) => ({ name: s.name, color: colorOf(s, si) })) : [], band = {}, W = width;
  const body = extraTop => {
    const lg = legendRows(entries, W, f.top + extraTop);
    const L = 54, R = 16, Tp = 14 + f.top + extraTop + lg.height, B = 34, H = height - f.bottom;
    const ys = series.flatMap(s => s.points.map(p => p.y)).filter(fin);
    if (!ys.length) return lg.svg + axisText(W / 2, H / 2, 'middle', 'no data');
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
    const avoid = [], placed = [], placedText = new Map();
    series.forEach((s, si) => {
      const col = colorOf(s, si);
      const pts = s.points.map(p => [labels.indexOf(p.x), p.y]).filter(p => p[0] >= 0 && fin(p[1]));
      if (area && pts.length > 1) g += `<polygon fill="${col}" fill-opacity=".14" points="${round2(X(pts[0][0]))},${round2(Y(0))} ` +
        `${pts.map(p => round2(X(p[0])) + ',' + round2(Y(p[1]))).join(' ')} ${round2(X(pts[pts.length - 1][0]))},${round2(Y(0))}"/>`;
      g += `<polyline fill="none" stroke="${col}" stroke-width="2.4" stroke-dasharray="${s.dash || ''}" ` +
        `points="${pts.map(p => round2(X(p[0])) + ',' + round2(Y(p[1]))).join(' ')}"/>`;
      g += pts.map(p => `<circle cx="${round2(X(p[0]))}" cy="${round2(Y(p[1]))}" r="3" fill="${col}">` +
        `<title>${esc(s.name)} ${esc(labels[p[0]])}: ${esc(fmtY(p[1]))}</title></circle>`).join('');
      for (let i = 1; i < pts.length; i++) avoid.push(segment(X(pts[i - 1][0]), Y(pts[i - 1][1]), X(pts[i][0]), Y(pts[i][1])));
      if (valueLabels) pts.forEach(p => {        // one 11px label above each point; a label that would overlap an earlier one is skipped
        const t = fmtY(p[1]), anchor = p[0] === 0 ? 'start' : p[0] === labels.length - 1 ? 'end' : 'middle';
        const box = labelBox(X(p[0]), Y(p[1]) - 7, t, anchor, 11, 2);
        if (placed.some(b => nearBox(box, b))) return;
        placed.push(box); avoid.push(box); placedText.set(si + ':' + p[0], t);
        g += axisText(X(p[0]), Y(p[1]) - 7, anchor, t, `fill="${INK}" font-weight="700" font-size="11"`);
      });
    });
    if (target != null && fin(target)) {
      const tl = 'target ' + fmtY(target);
      if (tIn) {
        g += `<line x1="${L}" x2="${W - R}" y1="${round2(Y(target))}" y2="${round2(Y(target))}" ` +
          `stroke="${TGT}" stroke-width="1.5" stroke-dasharray="5 4"/>` + axisText(W - R, Y(target) - 5, 'end', tl, `fill="${TGT}"`);
        avoid.push(labelBox(W - R, Y(target) - 5, tl));
      } else {
        g += axisText(W - R, Tp + 4, 'end', tl + ' is above the chart', `fill="${TGT}"`);
        avoid.push(labelBox(W - R, Tp + 4, tl + ' is above the chart'));
      }
    }
    g += annotate(annotations, { W, L, R, top: f.top, extraTop, title: f.titleBox, band, plotTop: Tp, bottom: H - B, avoid }, a => {
      const s = pick(series, a.series ?? 0, 'series'), x = pick(labels, a.index, 'index');
      const p = s.points.find(p => p.x === x);
      return p && [X(a.index), Y(p.y), undefined, placedText.get((a.series ?? 0) + ':' + a.index)];
    });
    return lg.svg + g;
  };
  return svg(W, height, f.deco + twoPass(body, band), lab);
}

// ---------- vertical bar chart ----------
// data: [{ label, value, color? }]
// Items may name a `series`; items of one series share a colour and `legend: true` lists the series.
export function barChart({ data = [], label, width = 600, height = 260,
  target = null, fmtY = num, title, unit, source, annotations = [], legend = false, colors } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'bar chart';
  const groups = seriesLegend(data, colors), entries = legend ? groups : [], band = {}, W = width;
  const colorOf = (d, i) => pickColor(d.color, colors, [d.label, d.series],
    d.series != null ? groups.find(e => e.name === d.series).color : palette(i));
  const body = extraTop => {
    const lg = legendRows(entries, W, f.top + extraTop);
    const L = 54, R = 14, Tp = 16 + f.top + extraTop + lg.height, B = 34, H = height - f.bottom;
    const vals = data.map(d => d.value).filter(fin);
    if (!vals.length) return lg.svg + axisText(W / 2, H / 2, 'middle', 'no data');
    let ymax = Math.max(...vals, target != null && fin(target) ? target : 0) * 1.12;
    const ticks = niceTicks(0, ymax); ymax = ticks[ticks.length - 1] || 1;
    const Y = v => Tp + (1 - v / ymax) * (H - Tp - B);
    const bw = (W - L - R) / data.length, avoid = [];
    let g = gridY(ticks, L, R, W, Y, fmtY);
    data.forEach((d, i) => {
      const x = L + i * bw + bw * 0.16, w = bw * 0.68, y = Y(Math.max(0, d.value)), h = Math.max(1, Math.abs(Y(d.value) - Y(0)));
      const col = colorOf(d, i);
      g += `<rect x="${round2(x)}" y="${round2(y)}" width="${round2(w)}" height="${round2(h)}" rx="3" fill="${col}">` +
        `<title>${esc(d.label)}: ${esc(fmtY(d.value))}</title></rect>`;
      g += axisText(x + w / 2, y - 5, 'middle', fmtY(d.value), `fill="${INK}" font-weight="600"`);
      avoid.push(labelBox(x + w / 2, y - 5, fmtY(d.value), 'middle', 12, 2));
      g += axisText(x + w / 2, H - 12, 'middle', d.label);
    });
    if (target != null && fin(target)) {
      const tl = 'target ' + fmtY(target);
      g += `<line x1="${L}" x2="${W - R}" y1="${round2(Y(target))}" y2="${round2(Y(target))}" ` +
        `stroke="${TGT}" stroke-width="1.5" stroke-dasharray="5 4"/>` + axisText(W - R, Y(target) - 5, 'end', tl, `fill="${TGT}"`);
      avoid.push(labelBox(W - R, Y(target) - 5, tl));
    }
    g += annotate(annotations, { W, L, R, top: f.top, extraTop, title: f.titleBox, band, plotTop: Tp, bottom: H - B, avoid }, a => {
      const d = pick(data, a.index, 'index');
      return [L + a.index * bw + bw * 0.5, Y(Math.max(0, d.value)), avoid[a.index], fmtY(d.value)];
    });
    return lg.svg + g;
  };
  return svg(W, height, f.deco + twoPass(body, band), lab);
}

// ---------- waterfall / bridge ----------
// items: [{ label, value, total? }]  total bars are drawn from zero; others step the running sum.
// `zoom: true` starts the axis below the lowest level instead of at zero, so that small steps between
// large totals stay visible; the total bars then rise from that axis start, which the lowest tick names.
export function waterfall({ items = [], label, width = 600, height = 290, fmtY = num,
  title, unit, source, annotations = [], legend = false, colors, zoom = false } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'waterfall';
  const groups = seriesLegend(items, colors), entries = legend ? groups : [], band = {}, W = width;
  const body = extraTop => {
    const lg = legendRows(entries, W, f.top + extraTop);
    const L = 54, R = 10, Tp = 18 + f.top + extraTop + lg.height, B = 46, H = height - f.bottom;
    const bars = []; let run = 0;
    for (const it of items) {
      if (it.total) { bars.push({ name: it.label, from: 0, to: it.value, kind: 'total', delta: it.value, it }); run = it.value; }
      else { bars.push({ name: it.label, from: run, to: run + it.value, kind: it.value < 0 ? 'down' : 'up', delta: it.value, it }); run += it.value; }
    }
    if (!bars.length) return lg.svg + axisText(W / 2, H / 2, 'middle', 'no data');
    const hiLevel = Math.max(...bars.map(b => Math.max(b.from, b.to)));
    const loLevel = Math.min(...bars.map(b => b.kind === 'total' ? b.to : Math.min(b.from, b.to)));
    let ymax = hiLevel * 1.12, ymin = 0;
    if (zoom && loLevel > 0 && hiLevel > loLevel) { ymin = Math.max(0, loLevel - (hiLevel - loLevel) * 0.6); ymax = hiLevel + (hiLevel - loLevel) * 0.25; }
    const ticks = niceTicks(ymin, ymax); ymax = ticks[ticks.length - 1] || 1; ymin = zoom ? ticks[0] : 0;
    const bw = (W - L - R) / bars.length, Y = v => Tp + (1 - (v - ymin) / (ymax - ymin)) * (H - Tp - B), avoid = [], valText = [];
    bars.forEach(b => { if (b.kind === 'total') b.from = ymin; });
    let g = gridY(ticks, L, R, W, Y, fmtY);
    bars.forEach((b, i) => {
      const x = L + i * bw + bw * 0.16, w = bw * 0.68, top = Y(Math.max(b.from, b.to)), h = Math.max(1, Math.abs(Y(b.from) - Y(b.to)));
      const kindCol = b.kind === 'total' ? 'var(--chart-total,#8d979d)' : b.kind === 'down' ? 'var(--chart-down,#0ca37a)' : 'var(--chart-up,#d03b3b)';
      const col = pickColor(b.it.color, colors, [b.name, b.it.series], b.it.series != null ? groups.find(e => e.name === b.it.series).color : kindCol);
      const val = b.kind === 'total' ? fmtY(b.to) : (b.delta < 0 ? '−' : '+') + fmtY(Math.abs(b.delta));
      const fs = bw < 90 ? 11 : 13;
      g += `<rect x="${round2(x)}" y="${round2(top)}" width="${round2(w)}" height="${round2(h)}" rx="3" fill="${col}">` +
        `<title>${esc(b.name)}: ${esc(val)}</title></rect>`;
      g += axisText(x + w / 2, top - 5, 'middle', val, `fill="${INK}" font-weight="600" font-size="${fs}"`);
      avoid.push(labelBox(x + w / 2, top - 5, val, 'middle', fs, 2)); valText.push(val);
      const words = String(b.name).split(' ');
      g += axisText(x + w / 2, H - 28, 'middle', words[0], `font-size="${fs}"`);
      if (words.length > 1) g += axisText(x + w / 2, H - 13, 'middle', words.slice(1).join(' '), `font-size="${fs}"`);
    });
    g += annotate(annotations, { W, L, R, top: f.top, extraTop, title: f.titleBox, band, plotTop: Tp, bottom: H - B, avoid }, a => {
      const b = pick(bars, a.index, 'index');
      return [L + a.index * bw + bw * 0.5, Y(Math.max(b.from, b.to)), avoid[a.index], valText[a.index]];
    });
    return lg.svg + g;
  };
  return svg(W, height, f.deco + twoPass(body, band), lab);
}

// ---------- scatter (optional fitted line per group) ----------
// groups: [{ name, color?, points:[{x,y, tip?}], line?:{from,to,fn} }]
export function scatter({ groups = [], label, width = 600, height = 330,
  xLabel = '', yLabel = '', fmtX = num, fmtY = num, title, unit, source, annotations = [], legend = false, colors } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'scatter';
  const colorOf = (gr, gi) => pickColor(gr.color, colors, [gr.name], palette(gi));
  const entries = legend ? groups.map((gr, gi) => ({ name: gr.name, color: colorOf(gr, gi) })) : [], band = {}, W = width;
  const body = extraTop => {
    const lg = legendRows(entries, W, f.top + extraTop);
    const L = 54, R = 16, Tp = 22 + f.top + extraTop + lg.height, B = 38, H = height - f.bottom;
    const pts = groups.flatMap(g => g.points || []);
    if (!pts.length) return lg.svg + axisText(W / 2, H / 2, 'middle', 'no data');
    const xt = niceTicks(0, Math.max(...pts.map(p => p.x)) * 1.05), XM = xt[xt.length - 1] || 1;
    const yt = niceTicks(0, Math.max(...pts.map(p => p.y)) * 1.08), YM = yt[yt.length - 1] || 1;
    const X = v => L + v / XM * (W - L - R), Y = v => Tp + (1 - v / YM) * (H - Tp - B);
    let g = gridY(yt, L, R, W, Y, fmtY);
    g += xt.map((t, i) => axisText(X(t), H - 16, i === xt.length - 1 ? 'end' : 'middle', fmtX(t))).join('');
    if (xLabel) g += axisText(W - R, H - 2, 'end', xLabel);
    if (yLabel) g += axisText(L + 4, Tp + 10, 'start', yLabel, `font-weight="600"`);
    groups.forEach((gr, gi) => {
      const col = colorOf(gr, gi);
      if (gr.line && typeof gr.line.fn === 'function') {
        const n = 30, p = [];
        for (let i = 0; i <= n; i++) { const x = gr.line.from + (gr.line.to - gr.line.from) * i / n; p.push(round2(X(x)) + ',' + round2(Y(gr.line.fn(x)))); }
        g += `<polyline fill="none" stroke="${col}" stroke-width="1.8" stroke-dasharray="6 4" points="${p.join(' ')}"/>`;
      }
      g += (gr.points || []).map(p => `<circle cx="${round2(X(p.x))}" cy="${round2(Y(p.y))}" r="4.2" fill="${col}" fill-opacity=".85">` +
        `<title>${esc(p.tip || (gr.name + ': ' + fmtX(p.x) + ', ' + fmtY(p.y)))}</title></circle>`).join('');
    });
    g += annotate(annotations, { W, L, R, top: f.top, extraTop, title: f.titleBox, band, plotTop: Tp, bottom: H - B }, a => fin(a.x) && fin(a.y) ? [X(a.x), Y(a.y)] : null);
    return lg.svg + g;
  };
  return svg(W, height, f.deco + twoPass(body, band), lab);
}

// ---------- diverging bars (change, positive and negative from zero) ----------
// data: [{ label, value, color? }]
export function divergingBars({ data = [], label, width = 600, height = 280, fmtY = num,
  title, unit, source, annotations = [], legend = false, colors } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'change';
  const groups = seriesLegend(data, colors), entries = legend ? groups : [], band = {}, W = width;
  const body = extraTop => {
    const lg = legendRows(entries, W, f.top + extraTop);
    const L = 54, R = 14, Tp = 16 + f.top + extraTop + lg.height, B = 20, H = height - f.bottom;
    const vals = data.map(d => d.value).filter(fin);
    if (!vals.length) return lg.svg + axisText(W / 2, H / 2, 'middle', 'no data');
    const lo = Math.min(0, ...vals) * 1.12, hi = Math.max(0, ...vals) * 1.12;
    const ticks = niceTicks(lo, hi); const tmin = ticks[0], tmax = ticks[ticks.length - 1] || 1;
    const Y = v => Tp + (1 - (v - tmin) / (tmax - tmin)) * (H - Tp - B);
    let g = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${round2(Y(t))}" y2="${round2(Y(t))}" ` +
      `stroke="${t === 0 ? INK : GRID}" stroke-width="${t === 0 ? 1.4 : 1}"/>` + axisText(L - 6, Y(t) + 4, 'end', fmtY(t))).join('');
    const bw = (W - L - R) / data.length, zero = Y(0), avoid = [], valText = [];
    data.forEach((d, i) => {
      const x = L + i * bw + bw * 0.16, w = bw * 0.68, yv = Y(d.value);
      const top = Math.min(zero, yv), h = Math.max(1, Math.abs(yv - zero));
      const signCol = d.value < 0 ? 'var(--chart-down,#0ca37a)' : 'var(--chart-up,#2a78d6)';
      const col = pickColor(d.color, colors, [d.label, d.series], d.series != null ? groups.find(e => e.name === d.series).color : signCol);
      const val = (d.value < 0 ? '−' : '+') + fmtY(Math.abs(d.value)), vy = d.value >= 0 ? top - 5 : top + h + 13;
      g += `<rect x="${round2(x)}" y="${round2(top)}" width="${round2(w)}" height="${round2(h)}" rx="3" fill="${col}">` +
        `<title>${esc(d.label)}: ${esc(val)}</title></rect>`;
      g += axisText(x + w / 2, vy, 'middle', val, `fill="${INK}" font-weight="600" font-size="11"`);
      avoid.push(labelBox(x + w / 2, vy, val, 'middle', 11, 2)); valText.push(val);
      g += axisText(x + w / 2, H - 4, 'middle', d.label, `font-size="11"`);
    });
    g += annotate(annotations, { W, L, R, top: f.top, extraTop, title: f.titleBox, band, plotTop: Tp, bottom: H - B, avoid }, a => {
      const d = pick(data, a.index, 'index');
      return [L + a.index * bw + bw * 0.5, Y(d.value), avoid[a.index], valText[a.index]];
    });
    return lg.svg + g;
  };
  return svg(W, height, f.deco + twoPass(body, band), lab);
}

// ---------- dumbbell (two points per row, e.g. before vs after) ----------
// rows: [{ label, a, b, color? }]
// Height follows the row count, so here the bands add to the height instead of shrinking the plot.
// Its legend names the two ends: a hollow marker for `aLabel`, a filled one for `bLabel`.
export function dumbbell({ rows = [], label, width = 600, aLabel = 'A', bLabel = 'B', fmtY = num,
  title, unit, source, annotations = [], legend = false, colors } = {}) {
  const plotH = Math.max(120, 16 + 28 + rows.length * 38), bandTop = title != null || unit != null ? TOP_BAND : 0;
  const entries = legend ? [{ name: aLabel, color: INK, marker: 'hollow' }, { name: bLabel, color: INK, marker: 'filled' }] : [];
  const lab = label ?? title ?? 'dumbbell', W = width, band = {};
  const vals = rows.flatMap(r => [r.a, r.b]).filter(fin);
  // The body returns the whole svg: the height depends on the band row too.
  const body = extraTop => {
    const lg = legendRows(entries, W, bandTop + extraTop);
    const f = frame({ title, unit, source, H: plotH + bandTop + extraTop + lg.height + (source != null ? BOTTOM_BAND : 0) });
    const deco = f.deco + lg.svg;
    const L = 150, R = 20, Tp = 16 + f.top + extraTop + lg.height, B = 28, H = plotH + f.top + extraTop + lg.height, height = H + f.bottom;
    if (!vals.length) return svg(W, height, deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals) * 1.05), xmax = ticks[ticks.length - 1] || 1, xmin = ticks[0];
    const X = v => L + (v - xmin) / (xmax - xmin) * (W - L - R);
    const rowH = (H - Tp - B) / rows.length;
    let g = ticks.map(t => `<line x1="${round2(X(t))}" x2="${round2(X(t))}" y1="${Tp}" y2="${H - B}" stroke="${GRID}"/>` +
      axisText(X(t), H - B + 16, 'middle', fmtY(t))).join('');
    rows.forEach((r, i) => {
      const y = Tp + (i + 0.5) * rowH, col = pickColor(r.color, colors, [r.label], palette(i));
      g += axisText(L - 10, y + 4, 'end', r.label, `fill="${INK}"`);
      g += `<line x1="${round2(X(r.a))}" x2="${round2(X(r.b))}" y1="${round2(y)}" y2="${round2(y)}" stroke="${col}" stroke-width="2"/>`;
      g += `<circle cx="${round2(X(r.a))}" cy="${round2(y)}" r="5" fill="var(--chart-paper,#fff)" stroke="${col}" stroke-width="2"><title>${esc(r.label)} ${esc(aLabel)}: ${esc(fmtY(r.a))}</title></circle>`;
      g += `<circle cx="${round2(X(r.b))}" cy="${round2(y)}" r="5" fill="${col}"><title>${esc(r.label)} ${esc(bLabel)}: ${esc(fmtY(r.b))}</title></circle>`;
    });
    g += annotate(annotations, { W, L, R, top: f.top, extraTop, title: f.titleBox, band, plotTop: Tp, bottom: H - B }, a => {
      const r = pick(rows, a.index, 'index'), s = pick([r.a, r.b], a.series ?? 0, 'series');
      return [X(s), Tp + (a.index + 0.5) * rowH];
    });
    return svg(W, height, deco + g, lab);
  };
  return twoPass(body, band);
}

// ---------- stacked bars (shares that sum per column) ----------
// columns: [{ label, parts: { key: value, ... } }]; keys give the stack order.
// colors: an array by key position, or an object by key name.
export function stackedBars({ columns = [], keys = [], colors = [], label, width = 600, height = 280, fmtY = v => Math.round(v * 100) + '%',
  title, unit, source, annotations = [], legend = false } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'stacked';
  const colorOf = (k, ki) => (Array.isArray(colors) ? colors[ki] : colors[k]) || palette(ki);
  const entries = legend ? keys.map((k, ki) => ({ name: k, color: colorOf(k, ki) })) : [], band = {}, W = width;
  const body = extraTop => {
    const lg = legendRows(entries, W, f.top + extraTop);
    const L = 44, R = 14, Tp = 14 + f.top + extraTop + lg.height, B = 30, H = height - f.bottom;
    if (!columns.length || !keys.length) return lg.svg + axisText(W / 2, H / 2, 'middle', 'no data');
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
        g += `<rect x="${round2(x)}" y="${round2(y0)}" width="${round2(w)}" height="${round2(h)}" fill="${colorOf(k, ki)}">` +
          `<title>${esc(c.label)} ${esc(k)}: ${esc(fmtY(share))}</title></rect>`;
      });
      g += axisText(x + w / 2, H - 10, 'middle', c.label);
    });
    g += annotate(annotations, { W, L, R, top: f.top, extraTop, title: f.titleBox, band, plotTop: Tp, bottom: H - B }, a => {
      pick(columns, a.index, 'index'); pick(keys, a.series ?? 0, 'series');
      return [L + a.index * bw + bw * 0.5, tops[a.index][a.series ?? 0]];
    });
    return lg.svg + g;
  };
  return svg(W, height, f.deco + twoPass(body, band), lab);
}

const MUTED = 'var(--chart-muted,#b8c0c4)';
const PAPER = 'var(--chart-paper,#fff)';
// Shorten a label to the width it has (0.6em per character), with an ellipsis.
const fit = (s, px, fs = 12) => {
  const t = String(s), n = Math.max(1, Math.floor(px / (fs * 0.6)));
  return t.length > n ? t.slice(0, Math.max(1, n - 1)) + '…' : t;
};

// ---------- horizontal bar chart (ranked categories, long labels, narrow pages) ----------
// data: [{ label, value, color?, series? }]; values must be zero or more (use divergingBars for signed change).
// Height follows the row count. All bars share one colour unless items name a `series` or a `color`;
// `highlight: [index, ...]` keeps those bars in colour and mutes the others.
export function hbarChart({ data = [], label, width = 600, rowHeight = 28, fmtY = num,
  title, unit, source, legend = false, colors, highlight = null } = {}) {
  const lab = label ?? title ?? 'bar chart', W = width;
  const groups = seriesLegend(data, colors), entries = legend ? groups : [];
  const bandTop = title != null || unit != null ? TOP_BAND : 0;
  const lg = legendRows(entries, W, bandTop);
  const Tp = bandTop + lg.height + 6, plotH = Math.max(1, data.length) * rowHeight;
  const height = Tp + plotH + 6 + (source != null ? BOTTOM_BAND : 0);
  const f = frame({ title, unit, source, H: height });
  const vals = data.map(d => d.value);
  if (!vals.length) return svg(W, height + 24, f.deco + lg.svg + axisText(W / 2, Tp + 18, 'middle', 'no data'), lab);
  vals.forEach((v, i) => { if (!fin(v) || v < 0) throw new RangeError(`hbarChart value ${i} must be a number of zero or more`); });
  if (highlight) highlight.forEach(i => pick(data, i, 'highlight'));
  const L = Math.min(Math.ceil(Math.max(...data.map(d => textW(d.label, 12)))) + 12, Math.round(W * 0.42));
  const valW = Math.max(...data.map(d => textW(fmtY(d.value), 12))) + 10;
  const hi = Math.max(...vals) || 1, X = v => L + v / hi * (W - L - valW);
  let g = '';
  data.forEach((d, i) => {
    const bh = Math.min(18, rowHeight - 8), by = Tp + i * rowHeight + (rowHeight - bh) / 2;
    const base = d.series != null ? groups.find(e => e.name === d.series).color : palette(0);
    const col = highlight && !highlight.includes(i) ? MUTED : pickColor(d.color, colors, [d.label, d.series], base);
    const w = Math.max(1, X(d.value) - L);
    g += axisText(L - 8, by + bh / 2 + 4, 'end', fit(d.label, L - 12), `fill="${INK}"`);
    g += `<rect x="${L}" y="${round2(by)}" width="${round2(w)}" height="${bh}" rx="3" fill="${col}">` +
      `<title>${esc(d.label)}: ${esc(fmtY(d.value))}</title></rect>`;
    g += axisText(L + w + 6, by + bh / 2 + 4, 'start', fmtY(d.value), `fill="${INK}" font-weight="600"`);
  });
  return svg(W, height, f.deco + lg.svg + g, lab);
}

// ---------- donut (shares of one total, few slices) ----------
// slices: [{ label, value, color? }]; values must be more than zero. The centre shows
// `centerValue` (default: the formatted total) over `centerLabel`. The list on the right
// gives each slice its value and its share. Slices after the fifth take the muted colour.
export function donut({ slices = [], label, width = 600, height = 220, fmtY = num,
  title, unit, source, colors, centerValue, centerLabel } = {}) {
  const f = frame({ title, unit, source, H: height }), lab = label ?? title ?? 'donut', W = width, H = height - f.bottom;
  if (!slices.length) return svg(W, height, f.deco + axisText(W / 2, H / 2, 'middle', 'no data'), lab);
  slices.forEach((s, i) => { if (!fin(s.value) || s.value <= 0) throw new RangeError(`donut slice ${i} must be a number above zero`); });
  const total = slices.reduce((a, s) => a + s.value, 0);
  const top = f.top + 8, avail = H - top - 8;
  const r = Math.min(avail / 2, W * 0.2), cx = r + 6, cy = top + avail / 2, sw = r * 0.36, rm = r - sw / 2, C = 2 * Math.PI * rm;
  let acc = 0, g = '';
  const colorOf = (s, i) => pickColor(s.color, colors, [s.label], i < 5 ? palette(i) : MUTED);
  slices.forEach((s, i) => {
    const frac = s.value / total, gap = slices.length > 1 ? 1.5 : 0;
    g += `<circle cx="${round2(cx)}" cy="${round2(cy)}" r="${round2(rm)}" fill="none" stroke="${colorOf(s, i)}" stroke-width="${round2(sw)}" ` +
      `stroke-dasharray="${round2(Math.max(0.5, frac * C - gap))} ${round2(C)}" stroke-dashoffset="${round2(-acc * C)}" ` +
      `transform="rotate(-90 ${round2(cx)} ${round2(cy)})"><title>${esc(s.label)}: ${esc(fmtY(s.value))} (${Math.round(frac * 100)}%)</title></circle>`;
    acc += frac;
  });
  const cv = centerValue ?? fmtY(total), inner = 2 * (r - sw) - 6;
  g += axisText(cx, cy + (centerLabel != null ? 2 : 6), 'middle', cv, `fill="${INK}" font-weight="700" font-size="${textW(cv, 17) > inner ? 12 : 17}"`);
  if (centerLabel != null) g += axisText(cx, cy + 16, 'middle', fit(centerLabel, inner, 10), `font-size="10"`);
  const x0 = cx + r + 18, rowH = Math.min(24, avail / slices.length), y0 = cy - rowH * slices.length / 2;
  slices.forEach((s, i) => {
    const y = y0 + i * rowH + rowH / 2, right = fmtY(s.value) + ' · ' + Math.round(s.value / total * 100) + '%';
    g += `<rect x="${round2(x0)}" y="${round2(y - 5)}" width="10" height="10" rx="2" fill="${colorOf(s, i)}"/>`;
    g += axisText(x0 + 16, y + 4, 'start', fit(s.label, W - 4 - textW(right, 12) - (x0 + 16) - 8), `fill="${INK}"`);
    g += axisText(W - 4, y + 4, 'end', right, `font-weight="600" fill="${INK}"`);
  });
  return svg(W, height, f.deco + g, lab);
}

// ---------- heatmap (a value per row and column: weekday by week, category by month) ----------
// rows: [name, ...]; cols: [name, ...]; cells: [{ row, col, value }]. A missing cell is drawn empty.
// One hue; the opacity follows the value from the lowest (or zero) to the highest. Height follows the rows.
export function heatmap({ rows = [], cols = [], cells = [], label, width = 600, cellHeight, fmtY = num,
  title, unit, source, color, cellLabels = true } = {}) {
  const lab = label ?? title ?? 'heatmap', W = width, bandTop = title != null || unit != null ? TOP_BAND : 0;
  const L = rows.length ? Math.min(Math.ceil(Math.max(...rows.map(r => textW(r, 11)))) + 10, Math.round(W * 0.3)) : 10;
  const cw = (W - L - 4) / Math.max(1, cols.length), ch = cellHeight ?? Math.max(18, Math.min(34, cw));
  const Tp = bandTop + 20, plotH = Math.max(1, rows.length) * ch, scaleY = Tp + plotH + 8;
  const height = scaleY + 14 + (source != null ? BOTTOM_BAND : 0);
  const f = frame({ title, unit, source, H: height }), col = color || palette(0);
  const at = new Map();
  cells.forEach((c, i) => {
    if (!rows.includes(c.row) || !cols.includes(c.col)) throw new RangeError(`heatmap cell ${i} names an unknown row or column`);
    if (c.value != null && !fin(c.value)) throw new RangeError(`heatmap cell ${i} value is not a number`);
    if (c.value != null) at.set(c.row + '\u0000' + c.col, c.value);
  });
  const vals = [...at.values()];
  if (!vals.length) return svg(W, height, f.deco + axisText(W / 2, Tp + plotH / 2, 'middle', 'no data'), lab);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals), op = v => hi === lo ? 1 : 0.1 + 0.9 * (v - lo) / (hi - lo);
  const every = Math.max(1, Math.ceil((Math.max(...cols.map(c => textW(c, 11))) + 6) / cw));
  let g = cols.map((c, j) => j % every === 0 ? axisText(L + (j + 0.5) * cw, Tp - 6, 'middle', c, `font-size="11"`) : '').join('');
  const showVal = cellLabels && cw >= Math.max(...vals.map(v => textW(fmtY(v), 10))) + 4;
  rows.forEach((r, i) => {
    g += axisText(L - 6, Tp + (i + 0.5) * ch + 4, 'end', fit(r, L - 8, 11), `font-size="11"`);
    cols.forEach((c, j) => {
      const v = at.get(r + '\u0000' + c), x = L + j * cw + 1, y = Tp + i * ch + 1;
      const box = `x="${round2(x)}" y="${round2(y)}" width="${round2(cw - 2)}" height="${round2(ch - 2)}" rx="3"`;
      if (v == null) { g += `<rect ${box} fill="${GRID}" fill-opacity=".5"><title>${esc(r)} ${esc(c)}: no data</title></rect>`; return; }
      g += `<rect ${box} fill="${col}" fill-opacity="${round2(op(v))}"><title>${esc(r)} ${esc(c)}: ${esc(fmtY(v))}</title></rect>`;
      if (showVal) g += axisText(x + cw / 2 - 1, y + ch / 2 + 2.5, 'middle', fmtY(v), `font-size="10" font-weight="600" fill="${op(v) > 0.55 ? PAPER : INK}"`);
    });
  });
  const loW = textW(fmtY(lo), 10), sx = L + loW + 6;
  g += axisText(L, scaleY + 10, 'start', fmtY(lo), `font-size="10"`);
  for (let k = 0; k < 5; k++) g += `<rect x="${round2(sx + k * 16)}" y="${scaleY}" width="14" height="12" rx="2" fill="${col}" fill-opacity="${round2(0.1 + 0.9 * k / 4)}"/>`;
  g += axisText(sx + 5 * 16 + 4, scaleY + 10, 'start', fmtY(hi), `font-size="10"`);
  return svg(W, height, f.deco + g, lab);
}

// ---------- sparkline (the shape of a short series, no axes) ----------
// values: [number, ...]. A dot marks the last value.
export function sparkline({ values = [], width = 120, height = 32, color, label } = {}) {
  const v = values.filter(fin), col = color || palette(0);
  if (v.length < 2) return svg(width, height, '', label ?? 'sparkline');
  const lo = Math.min(...v), hi = Math.max(...v), pad = 4;
  const X = i => pad + i * (width - 2 * pad) / (v.length - 1);
  const Y = y => hi === lo ? height / 2 : pad + (1 - (y - lo) / (hi - lo)) * (height - 2 * pad);
  return svg(width, height,
    `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${v.map((y, i) => round2(X(i)) + ',' + round2(Y(y))).join(' ')}"/>` +
    `<circle cx="${round2(X(v.length - 1))}" cy="${round2(Y(v[v.length - 1]))}" r="2.8" fill="${col}"/>`, label ?? 'sparkline');
}


export default { lineChart, barChart, waterfall, scatter, divergingBars, dumbbell, stackedBars, hbarChart, donut, heatmap, sparkline, niceTicks, svg, esc, fin, palette };
