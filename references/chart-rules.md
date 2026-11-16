# Rules per chart type

Read the section of the chart you chose. Each section gives when the form is right, the spec fields, and
the decisions that stay with you. The code sorts, scales, formats and refuses a bad spec; it cannot know
what the reader must learn. A working spec for each type is in `examples/`.

Fields that every spec takes are in `SKILL.md` ("The spec"): `chart`, `claim`, `title`, `unit`, `source`,
`format`, `label`, `width`, `height`.

## Contents

Compare amounts: [barChart](#barchart) · [hbarChart](#hbarchart) · [groupedBars](#groupedbars) ·
[rankedTable](#rankedtable) · [pareto](#pareto) · [bullet](#bullet) · [gauge](#gauge)
Change: [lineChart](#linechart) · [sparkline](#sparkline) · [slope](#slope) · [dumbbell](#dumbbell) ·
[divergingBars](#divergingbars) · [waterfall](#waterfall)
Parts of a total: [stackedBars](#stackedbars) · [stackedArea](#stackedarea) · [donut](#donut) ·
[treemap](#treemap) · [funnel](#funnel) · [sankey](#sankey)
Spread and relation: [histogram](#histogram) · [boxPlot](#boxplot) · [scatter](#scatter)
Patterns: [heatmap](#heatmap) · [calendar](#calendar) · [wordCloud](#wordcloud)

---

## barChart

Use for the amount of 3 to 8 categories with short names. Example: `examples/bar-chart.json`.

Spec: `data: [{ label, value, series? }]`, `target?`, `annotations?: [{ index, text }]`, `legend?`, `colors?`.

1. Give every item the same `series` name. The bars then share one colour. Without it each bar takes
   its own colour, and a colour that means nothing makes the reader search for a meaning.
2. Sort the items from the largest, unless the categories have their own order (months, steps, grades).
3. Use `hbarChart` when a label has more than one short word or when there are more than 8 bars.
   On a slide the code refuses labels that are wider than their bar.
4. Use `target` only when the claim compares the bars with that value.
5. Use `lineChart` when the categories are 6 or more periods and the trend is the message.

## hbarChart

Use for ranked categories, long labels, or a narrow page. The height follows the rows.
Example: `examples/hbar-chart.json`.

Spec: `data: [{ label, value, series? }]`, `highlight?: [row position]`, `diverging?`, `rowHeight?`, `legend?`, `colors?`.

1. Sort the data yourself, from the largest. The builder keeps the order you give.
2. Put "Other" last, also when it is not the smallest.
3. Use `highlight` for the rows the claim names, and for no other row.
4. Values are zero or more. For a signed change per category set `diverging: true`: bars then go left and
   right of a zero line. Say in `unit` what is subtracted from what.
5. Use `rankedTable` when the reader also needs one to three more numbers per row, or when a row has no
   value (a period that is not complete, a missing denominator). `rankedTable` shows that row with a note in
   place of the bar; its `columns` can be empty.

## groupedBars

Use to compare 2 to 4 series inside each category (this year against last year per quarter).
Example: `examples/grouped-bars.json`.

Spec: `categories: [...]`, `series: [{ name, values: [one per category] }]`, `legend?` (on), `valueLabels?` (on), `colors?`.

1. The comparison the reader makes is inside a category. When the question is the trend of each series,
   use `lineChart`.
2. Four series at most (the code refuses more) and about six categories. More: one chart per series.
3. Give the series in time order, the older first.
4. A value that does not exist is `null`, not 0. Say in the claim or the source line what is missing.

## rankedTable

Use when the reader asks "which item is highest, and what are its exact numbers?": 3 to 12 items, the bar
for the measure the items are ranked by, and zero to three more numbers per item. Use it also for a plain
ranking in which one item has no value: that item becomes a note row.
Example: `examples/ranked-table.json`.

| The reader's question | Form |
|---|---|
| Which item is highest, and what are its exact numbers? | `rankedTable` |
| Did each item rise or fall, and the direction is the message | `slope` or `dumbbell` |
| More than 12 items, or more than 3 more numbers per item | a table |

| Field | Meaning |
|---|---|
| `rows[].value` | the number the bar shows and the rows are ranked by; `null` for a row that has no value |
| `rows[].cols` | one number per name in `columns`, 3 at most; `null` shows `n.a.` |
| `rows[].note` | required when `value` is `null`: why the row has no value. It takes the place of the bar |
| `rows[].flag` | a caution about the row. The label takes a `*` and the text is written under the table |
| `valueLabel`, `columns` | the column headers |
| `change` | adds a column: `cols[to]` less `cols[from]`, with ▲ or ▼. `label`, `decimals` and `suffix` are optional |
| `total` | the last row, under a rule, with a neutral bar and a reference line through the rows above |
| `highlight` | row labels that keep the bar colour; the other bars are muted |
| `sort` | `false` keeps the given order. The default ranks from the largest value |

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
7. Use `highlight` only for the rows the claim names.

On a page below 460px, or when the bars would get less than 80px, each label moves to its own line above
its bar. On a slide the script has its own layout (`deck/ranked_table.py`, no `node` needed): a label or a
note that does not fit, more rows than the box holds at 20pt per row, or bars under 100pt stop the run.

## pareto

Use to show that a few items make most of a total. The builder sorts the bars and draws the running share
with a rule at 80%. Example: `examples/pareto.json`.

Spec: `data: [{ label, value }]`, `color?`.

1. Use it only when the items are parts of one total and the claim is about concentration.
2. Ten bars at most. Join the tail as one item and name it for what it holds ("Rest", "42 other items").
   That item is sorted with the others, so keep it smaller than the items the claim names.
3. State the share in the claim with the count: "three of seven items make 58%".

## bullet

Use for a value against its own target or budget, one row per item. Example: `examples/bullet.json`.

Spec: `rows: [{ label, value, target }]`, `overColor?`, `rowHeight?`, `colors?`.

1. Each row has its own target. For one target for all rows use `barChart` with `target`.
2. Set `overColor` when a value above the target is the bad case (a budget). Leave it out when above is good.
3. All rows share one scale. Rows of very different size hide the small ones: use one chart per size class.

## gauge

Use for one value on its way to a limit, when that one number is the whole message.
Example: `examples/gauge.json`.

Spec: `value`, `max`, `target?`, `caption?`, `color?`.

1. One gauge shows one number. For two or more values use `bullet`.
2. `max` is a real limit (a budget, a capacity). Do not invent one to fill the arc.
3. `caption` says what the limit is: "of the month budget".

## lineChart

Use for a value across four or more ordered periods. Example: `examples/line-chart.json`.

Spec: `labels: [the periods in order]`, `series: [{ name, points: [{ x, y }], dash? }]`, `target?`, `area?`,
`valueLabels?`, `annotations?: [{ index, series?, text }]`, `legend?`, `colors?`.

1. `labels` holds every period, at equal steps. A period without a value is left out of `points`; the line
   then joins its neighbours, so say in the claim or in a callout that the period is missing.
2. Five series at most. With four or five, give the series the claim names a colour in `colors` and the
   others one grey (`"var(--chart-muted,#b8c0c4)"`), so the reader sees the one that matters.
3. A forecast, a plan or an estimate takes `dash: "5 4"`. Measured values are solid lines.
4. Use `valueLabels` for one series of 8 points at most. With more, use `annotations` on the points the
   claim names.
5. Use `target` only when the claim compares the line with it.
6. Set `legend: true` when there are two or more series.
7. Use `area: true` for one series of a volume (orders, visits). Use `stackedArea` for parts of a total.

## sparkline

Use for the shape of a short series beside a number. It has no axes, no title and no values.
Example: `examples/sparkline.json`.

Spec: `values: [...]`, `color?`, and a small `width` and `height` (160 by 36).

1. The number beside it carries the value. The sparkline only shows the direction.
2. On a slide use `--into` with a small `--box` beside the number. The script refuses a slide that holds
   only a sparkline.
3. Give all sparklines in one table the same number of points and the same size.

## slope

Use for each item at two moments, when the direction of each line is the message (which rose, which fell,
which crossed). Example: `examples/slope.json`.

Spec: `rows: [{ label, a, b }]`, `aLabel`, `bLabel`, `colors?`.

1. `a` is the earlier moment. Name the two moments in `aLabel` and `bLabel`.
2. Eight rows at most. The builder colours a rise, a fall and no change differently: do not set colours
   unless the claim names one row.
3. Use only two moments that the reader can compare (the same length of period, the same measure).
4. When many values are near each other the labels stack. Use `dumbbell` (the gap per row) or
   `rankedTable` (the exact numbers) then.

## dumbbell

Use for two states per row when the size of the gap is the message. Example: `examples/dumbbell.json`.

Spec: `rows: [{ label, a, b }]`, `aLabel`, `bLabel`, `legend?`, `annotations?: [{ index, series?, text }]`, `colors?`.

1. `a` is the earlier state (hollow marker), `b` the later state (filled marker). Set `legend: true`.
2. Sort the rows by the gap or by `b`, as the claim needs. The builder keeps the order you give.
3. Each row takes 38px or points. Eight rows fit a slide.
4. Both states must have the same unit and the same length of period.

## divergingBars

Use for a change that can be positive or negative, for 3 to 8 categories with short names.
Example: `examples/diverging-bars.json`.

Spec: `data: [{ label, value }]`, `annotations?`, `legend?`, `colors?`.

1. Say in `unit` what is subtracted from what: "orders, this quarter less the last".
2. Keep the categories in an order the reader knows, or sort from the largest rise to the largest fall.
3. For long labels or more than 8 categories use `hbarChart` with `diverging: true`.

## waterfall

Use to show how a start value becomes an end value through signed steps. Example: `examples/waterfall.json`.

Spec: `items: [{ label, value, total? }]`, `zoom?`, `annotations?`, `legend?`, `colors?`.

1. The first and the last item are totals (`total: true`). The steps between them are signed changes.
2. The steps must reach the last total. The code refuses a spec where they do not: find the missing step,
   do not add a step named "Other" to close the gap unless the source has it.
   When the source itself does not reconcile, do not draw a bridge. Show the movements with `hbarChart` and
   `diverging: true`, state the gap in the claim, and name the totals in the source line. The owner of the
   numbers must resolve the gap.
3. Eight bars at most. Labels of one or two words.
4. Set `zoom: true` when the steps are small against the totals. The axis then starts above zero and its
   lowest tick says where. Do not use `zoom` when the size of a total is the message.

## stackedBars

Use for the mix inside each column, when the shares are the message and not the amounts.
Example: `examples/stacked-bars.json`.

Spec: `columns: [{ label, parts: { key: value } }]`, `keys: [the stack order]`, `legend?`, `colors?`, `annotations?`.

1. Each column is drawn as 100%. The values in `parts` can be amounts or shares; the builder divides by the
   column sum. Do not give `format`. When the amounts matter, use `groupedBars` or `stackedArea`.
2. Put the key the claim names first in `keys`. It stands on the baseline, where the reader can compare it
   across columns. The other keys float.
3. Five keys at most. Join the rest as "Other" and put it last.
4. Set `legend: true`.

## stackedArea

Use for how a total and its parts move over time. Example: `examples/stacked-area.json`.

Spec: `labels: [the periods in order]`, `series: [{ name, values: [one per label] }]`, `totalLabels?`, `legend?` (on), `colors?`.

1. The top edge is the total. When the claim names the total, set `totalLabels: true`: the chart then writes
   the total above the first and the last period. A part of the total has no label: when the claim needs the
   exact value of a part, use `groupedBars` or a table.
2. The first series stands on the baseline. Put the part the claim names there, or else the largest and
   most stable part. The reader cannot compare the parts above it exactly.
3. Five series at most. Values are zero or more.
4. When two parts cross and that crossing is the message, use `lineChart`.

## donut

Use for the shares of one total, when one or two slices are the message. Example: `examples/donut.json`.

Spec: `slices: [{ label, value }]`, `centerValue?`, `centerLabel?`, `colors?`.

1. Six slices at most (the code refuses more). Join the small ones as "Other" and put it last.
2. Sort the slices from the largest. The list at the right gives each value and share.
3. The slices must be all the parts of one total, with no overlap.
4. When the reader must compare slices of similar size, use `hbarChart`. A reader compares lengths
   better than angles.

## treemap

Use for 5 to 15 parts of one total, when one or two parts dominate. Example: `examples/treemap.json`.

Spec: `items: [{ label, value }]`, `color?`, `colors?`.

1. The area is the value. The reader sees which part dominates, not exact differences.
2. On a slide every tile must show its name (there is no tooltip). The code refuses a tile that is too
   small: join the smallest items as "Other".
3. Use `hbarChart` when the reader must rank parts of similar size.

## funnel

Use for how many remain at each stage of one process. Example: `examples/funnel.json`.

Spec: `stages: [{ label, value }]` in order, `color?`, `rowHeight?`.

1. Each stage is a part of the stage before it. The code refuses a stage that is larger than the one before.
2. Each row shows its share of the first stage. When the claim is about the loss between two stages,
   state that loss in the claim.
3. Count the same thing in every stage (people, orders), over the same period.

## sankey

Use for where an amount comes from and where it goes, in two columns. Example: `examples/sankey.json`.

Spec: `flows: [{ from, to, value }]`, `colors?`.

1. Sources stand at the left, targets at the right. A name is a source or a target, not both.
2. Five sources and about six targets at most. On a slide every node must show its name: the code refuses
   a node that is too thin, so join the small flows as "Other".
3. The widths show amounts, so all flows have one unit.
4. Use `stackedBars` when the reader must compare the mix of each source.

## histogram

Use for how the values of one measure are spread. Example: `examples/histogram.json`.

Spec: `values: [...]` with `bins: n`, or `bins: [{ from, to, count }]`; `mark?: { value, text }`; `formatX?`; `color?`.

1. Give the raw `values` and the number of bins (8 to 12). Give your own `bins` only when the ranges have a
   meaning (age bands, price bands); they must be of equal width.
2. Twenty values or more. With fewer, list the values.
3. Use `mark` for the one value the claim names (the median, a limit).
4. `unit` names what is counted: "baskets per size range".

## boxPlot

Use to compare the spread of a measure between 2 to 8 groups. Example: `examples/box-plot.json`.

Spec: `groups: [{ label, values: [...] }]` or `[{ label, min, q1, median, q3, max }]`, `rowHeight?`, `colors?`.

1. Give the raw `values` (5 or more per group) and the builder computes the five numbers. Give the five
   numbers only when the source has no raw values.
2. The box is the middle half of the values and the line in it is the median. The lines reach the lowest
   and the highest value. Say this once for readers who do not know the form, in the claim or beside the chart.
3. State in the claim the numbers that it uses (the median, the range).

## scatter

Use for the relationship between two measures, one point per item. Example: `examples/scatter.json`.

Spec: `groups: [{ name, points: [{ x, y, tip? }], line? }]`, `xLabel`, `yLabel`, `formatX?`, `annotations?: [{ x, y, text }]`, `legend?`, `colors?`.

1. `line: { "fit": "linear" }` draws the least-squares line through the points of the group.
   `line: { from, to, slope, intercept }` draws a line you computed.
2. Name both axes with `xLabel` and `yLabel`. `format` is for y and `formatX` for x.
3. A relationship in the chart is not a cause. Write the claim in the words of the data: "weeks with more
   spend have more orders".
4. Both axes start at zero. When all points are far from zero the cloud is small: say so, or use a table.
5. Five groups at most. Use `annotations` for the one or two points the claim names.

## heatmap

Use for a value per row and column (weekday by month, team by week). The height follows the rows.
Example: `examples/heatmap.json`.

Spec: `rows: [...]`, `cols: [...]`, `cells: [{ row, col, value }]`, `cellLabels?` (on), `cellHeight?`, `color?`.

1. Keep rows and columns in their natural order (weekdays, months). Sort only names that have no order.
2. A cell without data is left out of `cells`. It is drawn empty. Do not write 0 for a missing value.
3. One hue: a darker cell is a higher value. The reader sees the pattern; the numbers in the cells give
   the values. When the columns are too narrow for the numbers, the builder leaves the numbers out.
4. All cells have one unit.

## calendar

Use for one value per day over 8 weeks or more: habits, streaks, seasons. Example: `examples/calendar.json`.

Spec: `days: [{ date: "YYYY-MM-DD", value }]`, `cell?` (largest cell size), `color?`.

1. A day without a record has `value: null` (drawn empty). A day with a record of zero has `value: 0`.
2. Weeks are columns and Monday is the first row.
3. Give the period in `unit`: the chart shows only month names.

## wordCloud

Use to give an impression of which words carry a body of text. Example: `examples/word-cloud.json`.

Spec: `words: [{ text, value }]`, `minSize?`, `maxSize?`, `colors?`.

1. It shows an impression, not a ranking. When the reader must compare counts, use `hbarChart`.
2. Remove the words without meaning (articles, pronouns) before you count. Join the forms of one word.
3. Thirty words at most. On a slide every word must have room: the code refuses a cloud that leaves words out.
4. `unit` says what the size means: "tickets that hold the word".
