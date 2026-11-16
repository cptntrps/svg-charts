---
name: svg-charts
description: Use when a page, report, dashboard or PowerPoint slide needs a chart (line, area, stacked area, bar, grouped bar, horizontal bar, ranked bars with a table, waterfall, pareto, scatter, diverging, dumbbell, slope, stacked, donut, treemap, heatmap, calendar, histogram, box plot, bullet, gauge, funnel, sankey, word cloud, sparkline) without a charting library. One JSON spec file per chart draws the page chart as a plain inline-SVG string and the slide chart as native, editable PowerPoint shapes in the deck theme, so the numbers agree. Gives the rules to choose the chart form and to fill the spec.
---

# svg-charts

One JSON spec per chart. `charts.js` draws it as a **plain inline-SVG string** for a page, and `deck/chart.py`
draws the same file as **native PowerPoint shapes** for a slide. No Chart.js, D3, Plotly, canvas or CDN.

## When to use this

- A single self-contained HTML page or report must carry its own charts.
- The environment blocks external scripts (strict CSP, air-gapped, email-safe).
- You render HTML server-side and want charts in the string, not after hydration.
- You want charts that follow the page theme (light/dark) through CSS variables.
- The same chart must also go on a PowerPoint slide, as shapes a person can edit, in the look of the deck.
- An agent must build charts by rule: the spec is plain JSON and the code refuses what it cannot draw honestly.

Do **not** reach for this when the page needs live pan/zoom, brushing, or
animated transitions across thousands of points. Use a full charting library
there.

## The procedure

1. Write the claim: one sentence with the finding. It decides everything else.
2. Choose the form from the reader's question (the table below).
3. Read the section of that chart in `references/chart-rules.md` and copy its file from `examples/`.
4. Fill the spec with numbers from the source. Write each number once.
5. Draw the page with `chart(spec)` and the slide with `deck/chart.py`. Both read the same file.
6. Look at the renders, then hand over ("Before you hand over").

## Choose the form

| The reader's question | Chart |
|---|---|
| How large is each of a few categories? | `barChart` (short names), `hbarChart` (long names, ranking, narrow page) |
| Which item is highest, and what are its exact numbers? Or one item of the ranking has no value | `rankedTable` |
| How do two to four series compare inside each category? | `groupedBars` |
| Do a few items make most of the total? | `pareto` |
| Is each value above or below its own target? | `bullet`; one value toward a limit: `gauge` |
| How does a value move across four or more periods? | `lineChart`; the shape only, beside a number: `sparkline` |
| Did each item rise or fall between two moments? | `slope` (direction), `dumbbell` (size of the gap) |
| Which categories rose and which fell, and by how much? | `divergingBars`, or `hbarChart` with `diverging` |
| Which steps lead from a start value to an end value? | `waterfall` |
| How does the mix change between columns? | `stackedBars` |
| How do a total and its parts move over time? | `stackedArea` |
| How is one total divided? | `donut` (6 parts at most), `treemap` (5 to 15 parts) |
| How many remain at each stage? | `funnel` |
| Where does an amount come from and where does it go? | `sankey` |
| How are the values of one measure spread? | `histogram`; per group: `boxPlot` |
| Do two measures move together? | `scatter` |
| Where is a value high and low across two dimensions? | `heatmap`; per day over weeks: `calendar` |
| Which words carry a text? | `wordCloud` |
| One number is the message | no chart: write the number large, with its unit |
| More than 12 items, or the reader needs every exact value | a table |

## The spec

```json
{
  "chart": "barChart",
  "claim": "Search brings the most orders, 27% more than Direct",
  "title": "Orders by channel", "unit": "orders, second quarter", "source": "Sample data",
  "format": { "decimals": 0 },
  "data": [
    { "label": "Search", "value": 1240, "series": "Orders" },
    { "label": "Direct", "value": 980, "series": "Orders" }
  ]
}
```

| Field | Meaning |
|---|---|
| `chart` | the chart type: a builder name from the table above |
| `claim` | the finding as one sentence. It is the page heading and the slide title; the chart does not draw it |
| `title` | the chart title: always about the data on the chart: the measure, by what, when ("Revenue 2025 versus revenue 2026"). It describes; it never comments. 80 characters at most, and never the claim again (the code refuses both) |
| `unit` | the unit of the values ("USD million"). It is written after the title: "title · unit" |
| `source` | the source of the numbers |
| `format` | `{ decimals, prefix, suffix }` for the values: `{ "decimals": 1, "suffix": "%" }`, `{ "prefix": "$", "suffix": "k" }`. `maxDecimals` in place of `decimals` shows up to that many decimals and no end zeros |
| `formatX` | the same for the x axis of `scatter` and `histogram` |
| `label` | the accessible name; the claim when not given |
| `width`, `height` | the size on a page; the caller and the slide box replace them |
| `annotations` | callouts: `[{ "at": "Q3", "series": "This year", "text": "highest quarter" }]`. Each draws a ring on one data point and a few bold words beside it. `at` is the label of the item or the period; `series` is the name of the series when the chart has more than one |
| the data fields | per chart type: see `references/chart-rules.md` and the builders table below |

The code refuses a spec it cannot draw honestly, with a message that names the remedy:

- a field the chart does not take (a spelling error does not pass in silence);
- a value outside the chart's domain (a negative bar, a zero slice, an unknown heatmap row);
- more items than can be told apart: 7 donut slices, 5 grouped series, 6 series that share the 5 palette colours;
- a waterfall whose steps do not reach its total, a funnel stage larger than the stage before it;
- on a slide (strict mode): no data, a label that is cut, labels that overlap, a treemap tile or a sankey
  node too small to show its name, a word without room, content taller than its box.

### Callouts

A callout draws the eye to the one data point that the claim rests on.

| Chart | `at` names | `series` names | Where the callout points |
|---|---|---|---|
| `lineChart`, `stackedArea` | a period in `labels` | a series (`stackedArea`: the top edge of that series; the total when none is named) | the point |
| `barChart`, `divergingBars`, `waterfall`, `pareto` | the label of a bar | | the end of the bar |
| `hbarChart` | the label of a row | | a dotted frame around the bar and its value; the words stand in a box on the row |
| `groupedBars` | a category | a series | the top of that bar |
| `stackedBars` | a column | a key | the top of that segment |
| `dumbbell` | a row | `aLabel` or `bLabel` | that end of the row |
| `scatter` | (give `x` and `y`) | | the coordinate |

A callout has a `style`. All but `ring` stand in a band above the plot, so the words never cover data,
and take the callout colour (`--chart-callout` on a page; a dark shade of the first series colour on a slide).

| `style` | What it draws | Fields | Use for |
|---|---|---|---|
| `box` (the default in a spec) | a dotted frame around the mark, a line, the words in a white box with a coloured border | `at`, `series?`, `text` | the one bar or point the claim rests on |
| `pill` | the words in a filled box, a line and a dot on the mark | `at`, `series?`, `text` | the same, louder; use one per slide |
| `delta` | a bracket from one mark to another, an arrow head, the change in a bubble | `from`, `to`, `series?`, `text?` (the change in percent when left out) | the difference between two bars or two points |
| `span` | a dotted, tinted frame around the marks from one to another, the words above it | `from`, `to`, `text` | a group of bars or a run of periods |
| `event` | a dotted vertical line at a period, the words in a box (`lineChart`, `stackedArea`) | `at`, `text` | a date that explains a change: a launch, a price change |
| `ring` | a small ring on the point and bold words beside it | `at`, `series?`, `text` | a dense chart with no room above the plot |

```json
"annotations": [
  { "at": "Search", "text": "27% above Direct" },
  { "from": "Direct", "to": "Search", "style": "delta" },
  { "from": "Email", "to": "Referral", "text": "Two channels under 700 orders", "style": "span" }
]
```

1. One callout per chart is the rule, two cues per slide at most. Three per chart is the limit; the code refuses a fourth.
2. The words say why the point matters ("highest quarter", "release"), in five words at most. Do not write
   the value again when the chart already shows it.
3. Point at data the claim or the section header names. A callout on another point pulls the reader away.
4. A name that is not on the chart stops the run and lists the names the chart has.
5. The other chart types take no callout: use `highlight` (`hbarChart`, `rankedTable`), `mark` (`histogram`)
   or `colors` to make one item stand out.

## Rules for the agent

These hold for every chart. The rules of each chart type are in `references/chart-rules.md`.

1. The claim goes in the heading: the page heading and the slide title are the `claim`, a full sentence
   with the finding. The `title` of the chart describes the chart: what is measured, by what, when. A reader
   who sees only the chart title must know what the marks are, and must not find an opinion in it.
2. Every number in the claim is in the chart, at the same precision. When the chart type cannot show a
   number (a part of a stacked area), write the claim without it or choose a form that shows it.
3. Use only numbers from the source, and name the source. `unit` names the unit and the period.
   A number you compute from the source (a sum, a share, a difference) is permitted: compute it with code,
   and make sure the reader can compute it again from the numbers the chart shows.
4. Write one spec file and give it to both renderers. Do not type the numbers a second time.
5. Colour says which thing a mark is. Give one series one colour. Do not give each bar its own colour.
   Use `highlight` or `colors` only for the items the claim names. One name keeps one colour across the
   charts of a report: pass the same `colors` object to each spec.
6. A value that does not exist is not zero. Leave it out or mark it the way the chart type gives
   (`null`, a note row), and say that it is missing. Missing data limits the claim: write "reported spend",
   not "spend". When the numbers of the source do not agree with each other, that is the claim: state it,
   draw what the source gives, and do not repair the numbers.
7. Do not draw more than the reader can tell apart. Join small items as "Other" and put it last.
8. One chart answers one question. For two measures of different units, draw two charts.
9. When the code refuses the spec, change the content (shorter labels, fewer items, a different form).
   Do not make the text smaller and do not edit the output by hand.

## On a page

```js
import { chart } from './charts.js';
const spec = await (await fetch('./spec.json')).json();
heading.textContent = spec.claim;                       // the page heading is the claim
const draw = () => { el.innerHTML = chart(spec, { width: Math.max(280, el.clientWidth) }); };
draw(); new ResizeObserver(draw).observe(el);
```

`chart(spec, { width, height, strict, bare })` returns the SVG string. Server-side is identical: no DOM is
needed. Pass the width of the container. `height` is the room the chart has: a chart whose height follows
its rows (`hbarChart`, `heatmap`, `bullet`, `boxPlot`, `funnel`, `calendar`) then sizes its rows to that room.
`strict: true` applies the slide checks (for a printed report or an image). `bare: true` leaves out the
title, unit and source lines. The chart title runs the width of the chart and goes to a next line only where the chart ends. On a page a label wider than its place is cut with an ellipsis and the
tooltip has the full text.

## On a slide

```sh
python3 deck/chart.py spec.json --check                          # the spec and the fit at slide size
python3 deck/chart.py spec.json --out chart.pptx                 # a new 16:9 deck: one slide, the claim as its title
python3 deck/chart.py --list deck.pptx --slide 3                 # shapes and boxes of a slide
python3 deck/chart.py spec.json --into deck.pptx --slide 3 --replace "Text Placeholder 2" --out deck2.pptx
python3 deck/chart.py spec.json --into deck.pptx --slide 3 --box 40,130,880,330 --out deck2.pptx
python3 deck/chart.py a.json b.json c.json --out slide.pptx --title "The claim of the slide"   # two or three charts side by side
```

`--out` alone writes one slide: the claim as the slide title, then the chart under its own title, with its source.
`--into` draws into a slide of an existing deck: write the claim into the slide's own title. `--replace`
gives the chart the box of a named shape and removes that shape; `--box` is x, y, width and height in
points. With both, the shape goes and the chart takes the box given. Each chart has its own title and its own source line; `--bare` leaves them out.

The chart is one group of native shapes that a person can edit in PowerPoint: bars are rectangles, lines
are lines, slices are arcs, each label is a text box, and each mark has its tooltip text as its name.
One point on the slide is one pixel of the page chart, so the text keeps the size the builder gives it
(10 to 14pt). Colours and fonts come from the deck theme: accents 1 to 5 for the palette, text 1 for the
ink, so the chart takes the look of the template. An accent that is too pale to read on the slide (contrast
under 2 to 1 with the background, such as the light tint of a brand colour on white) is left out, and greys
from the text colour fill the list; the receipt then names the colours used. `--palette RRGGBB,RRGGBB` (or `--accent RRGGBB`) forces
colours. A colour you set in the spec is kept: write `var(--chart-2,#0ca37a)` for a theme colour (the page
uses the variable, or the fallback when the page does not set it; the slide uses accent 2) or `#RRGGBB` for a
fixed one. On a dark slide the ink is light; the script reads the background from the deck, and `--on dark`
sets it when the background is a picture.

`--style style.json` makes the chart follow the chart rules of a brand guide that the theme cannot carry:

| Key | Effect |
|---|---|
| `palette` | the series colours, as RRGGBB, in order |
| `callout`, `calloutDark` | the colour of callout frames, lines and boxes on a light and on a dark slide |
| `square` | `true`: no rounded corners; only circles stay round |
| `opaque` | `true`: no transparency; a transparent fill becomes its solid mix with the slide background |
| `inkText` | `true`: text is never coloured; the words of a callout and a target label take the text colour |
| `minFont` | the smallest text size in points |
| `sectionRule` | `false`: no rule above a section header |

Read the brand guide, write its rules into this file once, and pass it for every chart of that deck.

The script needs `python-pptx`, and `node` for every chart but `rankedTable` (`charts.js` computes the
geometry). Exit 0 prints one JSON line (the chart, the box, the size used). Exit 2 means nothing is written,
with the reason and the remedy. A slide never gets an ellipsis, smaller text or a missing label.

### The text on a slide

Each line of text on a slide has one job. Do not mix them:

| Line | Job | Example |
|---|---|---|
| Slide title | the claim: the finding as one sentence | "Growth came from the Team plan and from food spend" |
| Slide subtitle | about the slide: the scope, the period, the premise. It also keeps the charts off the title | "All regions; the first half of 2026 against the first half of 2025" |
| Section header | one per chart on a shared slide: a numbered comment that the chart under it proves | "① The Team plan passed the Free plan in May" |
| Chart title | always about the data on the chart: the measure, by what, when, and the unit. Never a comment | "Revenue 2025 versus revenue 2026 · USD million" |
| Takeaway | the bottom line of the slide: what the reader must conclude or do. A light band over the width, the words bold and centred | "Move the support budget to the Team plan" |

```sh
python3 deck/chart.py spec.json --out slide.pptx --subtitle "All regions, January to June 2026" --takeaway "Move the support budget to the release team"
```

- The chart title is the `title` and the `unit` of the spec, as "title · unit". It runs the width of the
  chart and goes to a next line only where the chart ends. Every chart has it, on every slide and page.
- The slide title is the `claim` of the spec (one chart) or `--title` (two or three charts). On a shared
  slide the `claim` of each spec becomes the section header above its chart.
- `--subtitle` and `--takeaway` are optional and belong to the slide. Each takes two lines at most and takes
  its room from the charts: `--check` with the same options tells if the charts still fit.
- With `--into`, the subtitle stands at the top of the box and the takeaway at its bottom, in the font of
  the template. When the template has its own places for them, write them there and do not give the options.
- `--out` keeps 22pt between the title block and the first chart or section.

### Two or three charts on one slide

```sh
python3 deck/chart.py a.json b.json --out slide.pptx --title "The claim of the slide"
python3 deck/chart.py a.json b.json c.json --into deck.pptx --slide 3 --replace "Text Placeholder 2" --out deck2.pptx
python3 deck/chart.py a.json b.json c.json --check --title "The claim of the slide"
```

Give two or three spec files. The script divides the box into equal columns with 24pt between them. Each
column is a section, from the top: the section header (a rule, a light band, a number badge and the `claim`
of the spec, 13pt, 3 lines at most), the chart title (what the data is, the width of the chart), the legend,
the plot, the source. `--out` alone needs `--title`: the
claim of the whole slide. With `--into`, write that claim into the slide's own title. When one chart does
not fit its column, nothing is written. Four or more charts are refused.

1. The slide still makes one point. The charts are the two or three facts that support it. Charts that
   answer different questions go on different slides.
2. When the reader must compare the charts with each other, give them the same chart type, the same unit and
   the same order of items. The script does not give charts a common axis: for an exact comparison, put the
   series in one chart (`groupedBars`, `lineChart`).
3. A column of three is about 270pt wide and a column of two about 420pt. Not every form fits:

| Form | Two per slide | Three per slide |
|---|---|---|
| `hbarChart`, `bullet`, `boxPlot`, `dumbbell`, `slope`, `funnel`, `gauge`, `lineChart`, `stackedArea`, `stackedBars`, `groupedBars`, `divergingBars`, `histogram`, `scatter`, `heatmap`, `calendar`, `sankey` | yes | yes |
| `barChart`, `waterfall` | yes | only with labels of about 5 characters, or 3 to 4 bars |
| `donut` | yes | only with short slice names |
| `wordCloud` | yes | only with fewer words |
| `pareto`, `treemap` | only with fewer items or shorter labels | no |
| `rankedTable` | only with one more column at most | no |

`--check` tells for the real spec. When a form does not fit, use the form for narrow places (`hbarChart` in
place of `barChart` and `pareto`) or give the chart its own slide.

## Before you hand over

1. `--check` passes.
2. Render the page at desktop and phone width, and render the slide with the deck renderer the machine
   has (an export from PowerPoint, or a command-line renderer). Look at each image: the code checks the
   numbers and the fit, not the look. When the machine has no deck renderer, say in the hand-over that
   nobody looked at the slide.
3. The heading of the page and the title of the slide state the same claim, and every number in the claim
   is in the chart.
4. Read the chart as a person who has not seen the data. If the claim is not the first thing that person
   sees, change the form, the order or the highlight.

## Direct calls from code

Each chart type is also a named export of `charts.js`: a pure function that takes one options object and
returns the SVG string. Use a direct call when the page needs a function as an option (`fmtY`, `fmtX`,
a `line.fn` for `scatter`). Everything else is the same as the spec.

```js
import { lineChart } from './charts.js';
el.innerHTML = lineChart({ labels, series, target: 150, fmtY: v => '$' + v + 'k' });
```

Common options:

| Option | Meaning |
|---|---|
| `label` | accessible name (`aria-label`); defaults to `title` when one is given |
| `width`, `height` | svg size in px (`dumbbell` derives its height from the row count) |
| `fmtY`, `fmtX` | value formatters; default is a thousands-grouped number |
| `title` | chart title, top-left, 14px bold in `--chart-ink` |
| `unit` | unit of the values, drawn after the title as `Title · unit` in `--chart-axis-text` |
| `source` | data source, bottom-left, 10px, drawn as `Source: ...` |
| `annotations` | callouts: `[{ index, series?, text }]` for category charts, `[{ x, y, text }]` for `scatter` |
| `legend` | `true` or `"top"` draws the legend under the title, `"bottom"` under the plot, `"right"` beside the plot (series, groups, stacked keys, dumbbell ends; bar-type charts only when items name a `series`) |
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
| `groupedBars` | `categories:[...]`, `series:[{name,values:[...]}]`, `annotations?` | two or three series side by side per category (this year against last year) |
| `stackedArea` | `labels:[...]`, `series:[{name,values:[...]}]`, `totalLabels?` | how a total and its parts move over time |
| `slope` | `rows:[{label,a,b}]`, `aLabel`, `bLabel` | each item at two moments; rises, falls and flat lines take different colours |
| `bullet` | `rows:[{label,value,target}]`, `overColor?` | a value against its target or budget, one row per item |
| `histogram` | `values:[...]` with `bins: n`, or `bins:[{from,to,count}]`, `mark?:{value,text}` | how one measure is spread |
| `boxPlot` | `groups:[{label,values:[...]}]` or `[{label,min,q1,median,q3,max}]` | spread per group: range, middle half, median |
| `calendar` | `days:[{date:'YYYY-MM-DD',value}]`, `cell?` | one cell per day, weeks as columns: habits, streaks, seasons |
| `treemap` | `items:[{label,value}]` | many parts of one total, area = value |
| `funnel` | `stages:[{label,value}]` | how many remain at each stage, with the share of the first stage |
| `sankey` | `flows:[{from,to,value}]` | two columns: where an amount comes from and where it goes |
| `gauge` | `value`, `max`, `target?`, `caption?` | one value on its way to a limit or a goal |
| `pareto` | `data:[{label,value}]`, `annotations?` | ranked bars with the running share and an 80% rule |
| `wordCloud` | `words:[{text,value}]`, `minSize?`, `maxSize?` | which words or names carry a body of text; no overlap, words without room are counted in `data-omitted` |
| `rankedTable` | `rows:[{label,value,cols?,note?,flag?}]`, `columns:[...]`, `valueLabel`, `total?`, `change?`, `format?`, `highlight?` | items ranked on one measure, with the exact values and the change beside each bar |

`lineChart` takes `area: true` to fill under each series (volume over time). `waterfall` takes `zoom: true` to start the axis
below the lowest level instead of at zero, so small steps between large totals stay visible. `hbarChart`, `donut`, `heatmap`
and `sparkline` take `title`, `unit` and `source` (not `sparkline`) but no `annotations`. A value outside a
builder's domain (a negative bar in `hbarChart`, a zero slice in `donut`, an unknown heatmap row) throws a
`RangeError`. Extra theme hooks: `--chart-muted` (muted bars and late slices) and `--chart-paper` (text on a
dark heatmap cell).

Helpers are also exported: `chartTypes` (the chart types and the fields each takes), `niceTicks(lo,hi,n)`
(round axis steps), `svg(w,h,body,label)` (the wrapper), `esc`, `fin`, and `palette(i)`.

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

In a direct call, an annotation gives positions: `index` and `series` are numbers. In a spec, give names with
`at` and `series` (see "Callouts").

| Builder | Annotation fields | Point |
|---|---|---|
| `groupedBars` | `index` (category), `series?` (default 0) | the top of that bar |
| `stackedArea` | `index` (period), `series?` (default: the last, which is the total) | the top edge of that series |
| `pareto` | `index` (the bar as drawn, from the largest) | the top of the bar |
| `hbarChart` | `index` (row) | the end of the bar; the text stands on the row |
| `lineChart` | `index`, `series?` (default 0) | the series point at `labels[index]` |
| `barChart`, `waterfall` | `index` | the top of the bar |
| `divergingBars` | `index` | the end of the bar (top for positive, bottom for negative) |
| `scatter` | `x`, `y` | the data coordinate |
| `dumbbell` | `index`, `series?` (0 = `a`, 1 = `b`) | that end of the row |
| `stackedBars` | `index`, `series?` (key position) | the top of that segment |

An `index` or `series` outside the data throws a `RangeError`; a callout never
disappears silently.

## Legend, one colour per name, value labels

The legend has three positions. Choose by what the reader does with it:

| `legend` | Where | Use when |
|---|---|---|
| `true`, `"top"` | rows under the title | the default: the reader learns the colours before the data. It costs 18px of height |
| `"right"` | one entry per line beside the plot | lines and stacks on a wide chart or a full slide. The entries stand in the order of the marks (line ends from the top, a stack from the top), so the eye goes straight across. It costs the width of the longest name; do not use it for two or three charts on one slide |
| `"bottom"` | rows under the plot, above the source | the template or the house style asks for it. The reader finds it last, far from the title |

Use one position for all charts of a deck or a report.

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

Run `npm test` (node:test, no dependencies) and `python3 -m unittest discover -s deck` (needs `python-pptx`;
the tests draw every file in `examples/` as a slide and compare its texts with those of the page). Open
`demo.html` in a browser (or render it headless) to see every builder with sample data in both light and
dark mode, and every spec file of `examples/` drawn through `chart(spec)`.
