---
name: svg-charts
description: Use when a page, report, or dashboard needs charts (line, area, stacked area, bar, grouped bar, horizontal bar, waterfall, pareto, scatter, diverging, dumbbell, slope, stacked, donut, treemap, heatmap, calendar, histogram, box plot, bullet, gauge, funnel, sankey, word cloud, sparkline, ranked bars with a table) without a charting library, or when the same chart must also go on a PowerPoint slide (ranked bars with a table, as native shapes). Builds charts as plain inline-SVG strings that theme with CSS variables, render server-side or in the browser, and need no runtime, canvas, or network.
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
| `groupedBars` | `categories:[...]`, `series:[{name,values:[...]}]` | two or three series side by side per category (this year against last year) |
| `stackedArea` | `labels:[...]`, `series:[{name,values:[...]}]` | how a total and its parts move over time |
| `slope` | `rows:[{label,a,b}]`, `aLabel`, `bLabel` | each item at two moments; rises, falls and flat lines take different colours |
| `bullet` | `rows:[{label,value,target}]`, `overColor?` | a value against its target or budget, one row per item |
| `histogram` | `values:[...]` with `bins: n`, or `bins:[{from,to,count}]`, `mark?:{value,text}` | how one measure is spread |
| `boxPlot` | `groups:[{label,values:[...]}]` or `[{label,min,q1,median,q3,max}]` | spread per group: range, middle half, median |
| `calendar` | `days:[{date:'YYYY-MM-DD',value}]` | one cell per day, weeks as columns: habits, streaks, seasons |
| `treemap` | `items:[{label,value}]` | many parts of one total, area = value |
| `funnel` | `stages:[{label,value}]` | how many remain at each stage, with the share of the first stage |
| `sankey` | `flows:[{from,to,value}]` | two columns: where an amount comes from and where it goes |
| `gauge` | `value`, `max`, `target?`, `caption?` | one value on its way to a limit or a goal |
| `pareto` | `data:[{label,value}]` | ranked bars with the running share and an 80% rule |
| `wordCloud` | `words:[{text,value}]`, `minSize?`, `maxSize?` | which words or names carry a body of text; no overlap, words without room are counted in `data-omitted` |
| `rankedTable` | `rows:[{label,value,cols?,note?,flag?}]`, `columns:[...]`, `valueLabel`, `total?`, `change?`, `format?`, `highlight?` | items ranked on one measure, with the exact values and the change beside each bar; one spec file also draws the slide (see below) |

`lineChart` takes `area: true` to fill under each series (volume over time). `waterfall` takes `zoom: true` to start the axis
below the lowest level instead of at zero, so small steps between large totals stay visible. `hbarChart`, `donut`, `heatmap`
and `sparkline` take `title`, `unit` and `source` (not `sparkline`) but no `annotations`. A value outside a
builder's domain (a negative bar in `hbarChart`, a zero slice in `donut`, an unknown heatmap row) throws a
`RangeError`. Extra theme hooks: `--chart-muted` (muted bars and late slices) and `--chart-paper` (text on a
dark heatmap cell).

Helpers are also exported: `niceTicks(lo,hi,n)` (round axis steps), `svg(w,h,body,label)`
(the wrapper), `esc`, `fin`, and `palette(i)`.

## Ranked bars with a table: one spec for the page and the deck

`rankedTable` draws one row per item: the label, a bar for the measure the items are ranked by, then that
value and up to three more numbers as columns. The spec is plain JSON. `charts.js` draws it on a page and
`deck/ranked_table.py` draws the same file as native, editable PowerPoint shapes.

### When this form is right

| The reader's question | Form |
|---|---|
| Which item is highest, and what are its exact numbers? 3 to 12 items, 1 to 3 more numbers per item | `rankedTable` |
| Did each item rise or fall, and the direction is the message | `slope` or `dumbbell` |
| How does a value move across four or more ordered periods | `lineChart` |
| How large is each part of one total | `stackedBars` or `donut` |
| More than 12 items, or more than 3 more numbers per item | a table |

### The spec

```json
{
  "claim": "Nordics spends the most on travel per revenue dollar, and its first-half rate fell",
  "title": "Travel cost per revenue dollar", "unit": "travel cost / revenue", "source": "Sample ledger, FY 2025",
  "valueLabel": "FY 2025", "columns": ["H1 2025", "H1 2026"],
  "change": { "from": 0, "to": 1, "label": "Change (pp)" },
  "format": { "decimals": 2, "suffix": "%" },
  "rows": [
    { "label": "Nordics", "value": 2.40, "cols": [2.52, 2.11] },
    { "label": "Benelux", "value": 0.95, "cols": [1.31, 1.74], "flag": "H1 2025 is above the full year. Check the H2 2025 booking." },
    { "label": "Shared services", "value": null, "note": "$1.2M of cost, no revenue" }
  ],
  "total": { "label": "All regions", "value": 1.52, "cols": [1.60, 1.46] }
}
```

| Field | Meaning |
|---|---|
| `rows[].value` | the number the bar shows and the rows are ranked by; `null` for a row that has no value |
| `rows[].cols` | one number per name in `columns`, 3 at most; `null` shows `n.a.` |
| `rows[].note` | required when `value` is `null`: why the row has no value. It takes the place of the bar |
| `rows[].flag` | a caution about the row. The label takes a `*` and the text is written under the table |
| `valueLabel`, `columns` | the column headers |
| `change` | adds a column: `cols[to]` less `cols[from]`, with ▲ or ▼. `label`, `decimals` and `suffix` are optional |
| `total` | the last row, under a rule, with a neutral bar and a reference line through the rows above |
| `format` | `{ decimals, prefix, suffix }` for every value. On a page, `fmtY` (a function) can replace it |
| `highlight` | row labels that keep the bar colour; the other bars are muted |
| `sort` | `false` keeps the given order. The default ranks from the largest value |
| `claim` | the finding as one sentence. It is the page heading and the slide title; the chart itself does not draw it |
| `title`, `unit`, `source` | the short name of the measure, its unit, the source of the numbers |

### Rules for the agent

The code sorts, formats, computes the change and refuses a bad spec. These decisions stay with you:

1. The bar is the one measure the reader ranks the items by. Use a full period that is the same for every item.
2. Columns hold the exact numbers that support the claim. Periods that are not a sequence (a full year and
   two first halves) go in columns. Do not draw them as one line.
3. The change is the later column less the earlier column. Name its unit in the header: "pp" for a change
   between two percentages. Give the values at the precision the chart shows, so a reader who subtracts
   the two columns gets the change shown.
4. An item without a denominator or without data is a note row (`value: null` with a `note`). Do not
   draw it as a zero bar. Do not remove it when its amount is part of the total.
5. When the total includes an amount that the rows above cannot show, say so in the claim or in a `flag`.
6. Put a `flag` on a row whose numbers do not agree with each other (a half above its full year, a change
   of sign). Do not present the change of that row as a finding before someone checks it.
7. The claim goes in the heading: the page heading and the slide title are the `claim`, a full sentence
   with the finding. `title` in the spec is only the short name of the measure.
8. Use `highlight` only for the rows the claim names.
9. Use only numbers from the source, and name the source.
10. Write one spec file and give it to both renderers. Do not type the numbers a second time.

### On a page

```js
import { rankedTable } from './charts.js';
const spec = await (await fetch('./spec.json')).json();
heading.textContent = spec.claim;                       // the page heading is the claim
const draw = () => { el.innerHTML = rankedTable({ ...spec, width: Math.max(280, el.clientWidth) }); };
draw(); new ResizeObserver(draw).observe(el);
```

Pass the width of the container. Below 460px, or when the bars would get less than 80px, each label
moves to its own line above its bar and the reference line is left out. A label wider than its column is
cut with an ellipsis; the tooltip of the row has the full label and every value.

### On a slide

```sh
python3 deck/ranked_table.py spec.json --check                       # the spec only
python3 deck/ranked_table.py spec.json --out chart.pptx              # a new 16:9 deck: one slide, the claim as its title
python3 deck/ranked_table.py --list deck.pptx --slide 3              # shapes and boxes of a slide
python3 deck/ranked_table.py spec.json --into deck.pptx --slide 3 --replace "Text Placeholder 2" --out deck2.pptx
python3 deck/ranked_table.py spec.json --into deck.pptx --slide 3 --box 40,130,880,330 --out deck2.pptx
```

`--into` draws the chart only (no title, no source): write the claim into the slide's own title and the
source into its footnote. `--replace` gives the chart the box of a named shape and removes that shape; `--box` is
x, y, width and height in points. The chart is one group of native shapes: bars, text boxes and rules that
a person can edit in PowerPoint. Bar colour (accent 1), ink and font come from the deck theme, so the chart
takes the look of the template. On a dark slide the ink is light; the script reads the background from the
deck, and `--on dark` sets it when the background is a picture. `--accent RRGGBB` forces a bar colour.

The script needs `python-pptx`. Exit 0 prints one JSON line (rows in draw order, the box, the row height).
Exit 2 means the chart is not written, with the reason: a label or a note that does not fit, more rows than
the box can hold at 20pt per row, bars that would get less than 100pt, or a bad spec. A slide never gets an
ellipsis or smaller text: shorten the label, reduce the rows, or give a larger box.

### Before you hand over

1. `--check` passes and the rows print in the order you expect.
2. Render the page at desktop and phone width, and render the slide with the deck renderer the machine
   has (PowerPoint, or a command-line renderer). Look at each image: the code checks the numbers and the
   fit, not the look.
3. The heading of the page and the title of the slide state the same claim, and every number in the claim
   is in the chart.

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

Run `npm test` (node:test, no dependencies) and `python3 -m unittest deck/test_ranked_table.py` (needs `python-pptx`;
one test compares the rows and numbers of the slide with those of the page). Open `demo.html` in a browser (or
render it headless) to see every builder with sample data in both light and
dark mode, plus one chart with title, unit, source and callouts. That page is
the reference for the option shapes and the theme variables.
