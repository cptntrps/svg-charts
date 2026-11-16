# svg-charts

Dependency-free charts as plain inline-SVG strings. No Chart.js, D3, Plotly,
canvas, or CDN. Each builder is a pure function that returns an `<svg>` string,
so a whole report can be one self-contained file with no external chart runtime.

- **Zero dependencies.** One small ES module (`charts.js`).
- **Server or browser.** Builders return strings; render them headless or drop
  them into `innerHTML`.
- **Themeable.** Colors come from CSS custom properties, so charts follow the
  page's light/dark mode with no JavaScript.
- **Accessible.** Each chart carries `role="img"` and an `aria-label`; data
  points carry `<title>` tooltips. All text is HTML-escaped.
- **CSP- and email-safe.** No external scripts and no inline event handlers.

## Charts

`lineChart` (with `area`), `barChart`, `hbarChart`, `waterfall`, `scatter`, `divergingBars`, `dumbbell`,
`stackedBars`, `donut`, `heatmap`, `sparkline`, `groupedBars`, `stackedArea`, `slope`, `bullet`, `histogram`,
`boxPlot`, `calendar`, `treemap`, `funnel`, `sankey`, `gauge`, `pareto`, `wordCloud`, `rankedTable`, plus `chart` (any of them from a JSON spec) and helpers `niceTicks`, `svg`, `esc`, `fin`, `palette`.

## Use

```js
import { lineChart } from './charts.js';

el.innerHTML = lineChart({
  label: 'Monthly revenue against plan',
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  series: [{ name: 'Actual', points: [
    { x: 'Jan', y: 120 }, { x: 'Feb', y: 140 }, { x: 'Mar', y: 135 },
    { x: 'Apr', y: 162 }, { x: 'May', y: 180 }, { x: 'Jun', y: 205 }] }],
  target: 150,
  fmtY: v => '$' + v + 'k',
});
```

Every builder also takes `title`, `unit`, `source` and `annotations` (one
callout per entry) for presentation-ready charts, plus `legend: true` and a
`colors` map that keeps one colour per name across every chart in a deck:

```js
barChart({
  title: 'Orders by channel', unit: 'orders', source: 'Order ledger, Q2 2026',
  data: [{ label: 'Search', value: 1240, series: 'Paid' }, { label: 'Social', value: 860, series: 'Organic' }],
  annotations: [{ index: 0, text: 'peak' }],
  legend: true, colors: { Paid: '#2a78d6', Organic: '#0ca37a' },
});
```

## One spec for the page and the deck

Every chart type also reads a plain JSON spec (`"chart": "lineChart"`, the data, a `claim`, a `format`).
`chart(spec)` draws it on a page, and [`deck/chart.py`](./deck/chart.py) draws the same file as native,
editable PowerPoint shapes that take the colours and fonts of the deck theme: bars are rectangles, lines
are lines, slices are arcs, labels are text boxes. It needs `python-pptx` and `node`.

```js
import { chart } from './charts.js';
el.innerHTML = chart(spec, { width: el.clientWidth });
```

```sh
python3 deck/chart.py examples/waterfall.json --out chart.pptx
python3 deck/chart.py examples/waterfall.json --into deck.pptx --slide 3 --replace "Text Placeholder 2" --out deck2.pptx
python3 deck/chart.py examples/gauge.json examples/funnel.json examples/slope.json --out slide.pptx --title "Three facts on one slide"
```

The code refuses a spec it cannot draw honestly (a spelling error in a field, 7 donut slices, a waterfall
that does not reach its total) and, on a slide, anything that would be cut, hidden or overlapping.
[`examples/`](./examples) has one spec per chart type. [`SKILL.md`](./SKILL.md) has the rules to choose the
form and to fill the spec, and [`references/chart-rules.md`](./references/chart-rules.md) has the rules per chart type.

Open [`demo.html`](./demo.html) for every chart with sample data in light and
dark mode. The full option reference is in [`SKILL.md`](./SKILL.md).

## Test

```sh
npm test
python3 -m unittest discover -s deck   # needs python-pptx and node
```

The suite (node:test, no dependencies) checks every builder against a stored
snapshot, exercises the title, unit, source and annotation options, and draws
every spec file. The deck tests draw every spec file as a slide and compare its
texts with those of the page chart.

## As a Claude skill

`SKILL.md` makes this repo installable as a skill: point your agent/tooling at
the repo and it will reach for these builders whenever a page needs charts
without a library.

## License

MIT. See [`LICENSE`](./LICENSE).
