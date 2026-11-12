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
`boxPlot`, `calendar`, `treemap`, `funnel`, `sankey`, `gauge`, `pareto`, `wordCloud`, plus helpers `niceTicks`, `svg`, `esc`, `fin`, `palette`.

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

Open [`demo.html`](./demo.html) for every chart with sample data in light and
dark mode. The full option reference is in [`SKILL.md`](./SKILL.md).

## Test

```sh
npm test
```

The suite (node:test, no dependencies) checks every builder against a stored
snapshot and exercises the title, unit, source and annotation options.

## As a Claude skill

`SKILL.md` makes this repo installable as a skill: point your agent/tooling at
the repo and it will reach for these builders whenever a page needs charts
without a library.

## License

MIT. See [`LICENSE`](./LICENSE).
