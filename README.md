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
`boxPlot`, `calendar`, `treemap`, `funnel`, `sankey`, `gauge`, `pareto`, `wordCloud`, `rankedTable`, plus helpers `niceTicks`, `svg`, `esc`, `fin`, `palette`.

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

`rankedTable` (ranked bars with the exact values beside them) reads a plain JSON spec.
[`deck/ranked_table.py`](./deck/ranked_table.py) draws the same file as native, editable PowerPoint shapes
that take the colours and fonts of the deck theme (needs `python-pptx`):

```sh
python3 deck/ranked_table.py examples/ranked-table.json --out chart.pptx
python3 deck/ranked_table.py examples/ranked-table.json --into deck.pptx --slide 3 --replace "Text Placeholder 2" --out deck2.pptx
```

[`SKILL.md`](./SKILL.md) has the spec, the rules for an agent and the checks.

Open [`demo.html`](./demo.html) for every chart with sample data in light and
dark mode. The full option reference is in [`SKILL.md`](./SKILL.md).

## Test

```sh
npm test
python3 -m unittest deck/test_ranked_table.py   # needs python-pptx
```

The suite (node:test, no dependencies) checks every builder against a stored
snapshot and exercises the title, unit, source and annotation options.

## As a Claude skill

`SKILL.md` makes this repo installable as a skill: point your agent/tooling at
the repo and it will reach for these builders whenever a page needs charts
without a library.

## License

MIT. See [`LICENSE`](./LICENSE).
