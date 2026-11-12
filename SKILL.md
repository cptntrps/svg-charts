---
name: svg-charts
description: Use when a page, report, or dashboard needs charts (line, area, bar, horizontal bar, waterfall, scatter, diverging, dumbbell, stacked, donut, heatmap, sparkline) without a charting library. Builds charts as plain inline-SVG strings that theme with CSS variables, render server-side or in the browser, and need no runtime, canvas, or network.
---

# svg-charts

Build charts as **plain inline-SVG strings**. No Chart.js, D3, Plotly, canvas,
or CDN. Each builder is a pure function that returns an `<svg>` string you drop
into `innerHTML` or write into a server-rendered page. The output is one
self-contained file with no external chart runtime.

## When to use this

- A single self-contained HTML page or report must carry its own charts.
- The environment blocks external scripts (strict CSP, air-gapped, email-safe).
- You render HTML server-side and want charts in the string, not after hydration.
- You want charts that follow the page theme (light/dark) through CSS variables.

Do **not** reach for this when the page needs live pan/zoom, brushing, or
animated transitions across thousands of points. Use a full charting library
there.

## How to use it

`charts.js` is one ES module with named exports. Import it, call a builder, and
insert the returned string.

```js
import { lineChart, barChart } from './charts.js';

document.getElementById('revenue').innerHTML = lineChart({
  label: 'Monthly revenue against plan',
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  series: [{ name: 'Actual', points: [
    { x: 'Jan', y: 120 }, { x: 'Feb', y: 140 }, { x: 'Mar', y: 135 },
    { x: 'Apr', y: 162 }, { x: 'May', y: 180 }, { x: 'Jun', y: 205 }] }],
  target: 150,
  fmtY: v => '$' + v + 'k',
});
```

Server-side is identical: the function returns a string, so write it straight
into the page you generate. No DOM is required to build the SVG.

## Builders

Every builder takes one options object and returns an SVG string. Common
options:

| Option | Meaning |
|---|---|
| `label` | accessible name (`aria-label`); defaults to `title` when one is given |
| `width`, `height` | svg size in px (`dumbbell` derives its height from the row count) |
| `fmtY`, `fmtX` | value formatters; default is a thousands-grouped number |
| `title` | chart title, top-left, 14px bold in `--chart-ink` |
| `unit` | unit of the values, drawn after the title as `Title · unit` in `--chart-axis-text` |
| `source` | data source, bottom-left, 10px, drawn as `Source: ...` |
| `annotations` | callouts: `[{ index, series?, text }]` for category charts, `[{ x, y, text }]` for `scatter` |
| `legend` | `true` draws a legend row under the title (series, groups, stacked keys, dumbbell ends; bar-type charts only when items name a `series`) |
| `colors` | `{ name: colour }` applied by series name, item label, stacked key, group name or row label; beats the palette, not an explicit `color` |
| `valueLabels` | `lineChart` only: `true` writes an 11px bold value above each point and skips labels that would overlap |

| Builder | Shape of data | Use for |
|---|---|---|
| `lineChart` | `series:[{name,color?,dash?,points:[{x,y}]}]`, `labels:[...]`, `target?` | trends over ordered categories |
| `barChart` | `data:[{label,value,color?}]`, `target?` | magnitude by category |
| `waterfall` | `items:[{label,value,total?}]` | how a start value bridges to an end value |
| `scatter` | `groups:[{name,color?,points:[{x,y,tip?}],line?:{from,to,fn}}]` | relationship of two measures, optional fitted line |
| `divergingBars` | `data:[{label,value,color?}]` | change that can be positive or negative |
| `dumbbell` | `rows:[{label,a,b,color?}]`, `aLabel`, `bLabel` | two states per row (before vs after) |
| `stackedBars` | `columns:[{label,parts:{key:value}}]`, `keys:[...]`, `colors:[...]` | shares that sum within each column |
| `hbarChart` | `data:[{label,value,color?,series?}]`, `highlight?:[index]`, `rowHeight?`, `diverging?` | ranked categories, long labels, narrow pages; height follows the rows; values of zero or more, or signed change per category with `diverging: true` (bars left and right of a zero line) |
| `donut` | `slices:[{label,value,color?}]`, `centerValue?`, `centerLabel?` | shares of one total, six slices at most; the list gives value and share |
| `heatmap` | `rows:[...]`, `cols:[...]`, `cells:[{row,col,value}]`, `color?`, `cellLabels?` | a value per row and column (weekday by week, category by month); height follows the rows |
| `sparkline` | `values:[...]`, `width?`, `height?`, `color?` | the shape of a short series next to a number; no axes |

`lineChart` takes `area: true` to fill under each series (volume over time). `waterfall` takes `zoom: true` to start the axis
below the lowest level instead of at zero, so small steps between large totals stay visible. `hbarChart`, `donut`, `heatmap`
and `sparkline` take `title`, `unit` and `source` (not `sparkline`) but no `annotations`. A value outside a
builder's domain (a negative bar in `hbarChart`, a zero slice in `donut`, an unknown heatmap row) throws a
`RangeError`. Extra theme hooks: `--chart-muted` (muted bars and late slices) and `--chart-paper` (text on a
dark heatmap cell).

Helpers are also exported: `niceTicks(lo,hi,n)` (round axis steps), `svg(w,h,body,label)`
(the wrapper), `esc`, `fin`, and `palette(i)`.

## Title, units, source and callouts

Pass `title`, `unit` and `source` to make a chart stand on its own in a slide or
report. The title and unit share one line in a 22px band at the top; the source
sits in a 16px band at the bottom. The plot shrinks to make room and the svg
keeps the `height` you passed (`dumbbell` grows instead, because its height
follows the rows). Output is unchanged when none of these options is given.

`annotations` draws one callout per entry: a 5px ring on the point, a short
leader, and the text in 12px bold ink. The text goes up and to the right; when
the point is in the right 35% of the plot, or the text would cross the plot's
right edge, it goes up and to the left, right-aligned to the point. The text
never overlaps a value label, the `target` label or, on `lineChart`, a data
line: it moves up in 16px steps, then tries below the point, and when nothing
inside the plot is clear it sits in the band above the plot (right-aligned on
the title row) with a thin leader down to the point. In the band the text never
overprints the title: when it would, the chart adds a second 16px band row for
it and the plot shrinks by that row. On bar-type builders the leader is an
elbow that runs past the bar's own value label, so it never crosses the number.
An annotation whose text equals the value label already on that point (a bar
value, or a `valueLabels` point) keeps only the ring. The point is located per
builder:

| Builder | Annotation fields | Point |
|---|---|---|
| `lineChart` | `index`, `series?` (default 0) | the series point at `labels[index]` |
| `barChart`, `waterfall` | `index` | the top of the bar |
| `divergingBars` | `index` | the end of the bar (top for positive, bottom for negative) |
| `scatter` | `x`, `y` | the data coordinate |
| `dumbbell` | `index`, `series?` (0 = `a`, 1 = `b`) | that end of the row |
| `stackedBars` | `index`, `series?` (key position) | the top of that segment |

An `index` or `series` outside the data throws a `RangeError`; a callout never
disappears silently.

## Legend, one colour per name, value labels

`legend: true` lists the series (`lineChart`), groups (`scatter`), keys
(`stackedBars`) or the two ends (`dumbbell`, hollow marker for `aLabel`, filled
for `bLabel`) in a 16px row under the title band, with a 14x3 swatch and the
name. The row wraps when the names are wider than the chart, and the plot
shrinks by the rows used. `barChart`, `waterfall` and `divergingBars` draw a
legend only when their items carry a `series` name; items of one series share
a colour.

`colors` keeps one colour per name across a whole deck: pass the same
`{ 'Product A': '#2a78d6', ... }` object to every chart and each builder looks
up its series name, item label, stacked key, group name or row label in it. An
explicit per-item `color` still wins. `stackedBars` accepts either this object
or the older array by key position.

```js
const colors = { 'Product A': '#2a78d6', 'Product B': '#d98500' };
lineChart({ series: [{ name: 'Product A', points }], legend: true, colors, valueLabels: true });
barChart({ data: [{ label: 'Q1', value: 12, series: 'Product A' }, { label: 'Q2', value: 9, series: 'Product B' }], legend: true, colors });
stackedBars({ keys: ['Product A', 'Product B'], columns, legend: true, colors });
```

```js
barChart({
  title: 'Cost per order', unit: '$', source: 'Finance ledger, Q2 2026',
  data: [{ label: 'Apr', value: 58 }, { label: 'May', value: 49 }, { label: 'Jun', value: 41 }],
  annotations: [{ index: 2, text: 'quarter low' }],
});
```

## Theming

Charts read their colors from CSS custom properties on the host page, so they
follow light/dark mode with no JS. Set these where you like (defaults in
parentheses):

```css
:root {
  --chart-grid: #e4e6e5;        /* gridlines */
  --chart-axis-text: #6f7980;   /* tick labels */
  --chart-ink: #141716;         /* value labels */
  --chart-target: #c0392b;      /* target line */
  --chart-1: #2a78d6; --chart-2: #0ca37a; --chart-3: #8d5bd6;
  --chart-4: #d98500; --chart-5: #d03b3b;   /* series palette */
  --chart-up: #2a78d6; --chart-down: #0ca37a; --chart-total: #8d979d;
}
@media (prefers-color-scheme: dark) {
  :root { --chart-grid:#2a2f2d; --chart-axis-text:#9aa3a0; --chart-ink:#eef2f0; }
}
```

Per-series `color` options override the palette when you pass them.

## Rules the builders already follow

- **Accessible.** Each SVG carries `role="img"` and an `aria-label` from `label`;
  points carry `<title>` tooltips. Always pass a meaningful `label`.
- **Safe text.** Every label and value is HTML-escaped before it enters the SVG.
- **Honest axes.** Axes start at zero for magnitude charts and use round
  `niceTicks` steps; a `target` above the data is reported in words instead of
  silently clipped.
- **Compact output.** Coordinates are rounded to two decimals.

## Verify

Run `npm test` (node:test, no dependencies). Open `demo.html` in a browser (or
render it headless) to see every builder with sample data in both light and
dark mode, plus one chart with title, unit, source and callouts. That page is
the reference for the option shapes and the theme variables.
