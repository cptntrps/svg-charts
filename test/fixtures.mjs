// Shared inputs for the snapshot tests. Keep these stable: the snapshots in
// ./snapshots were captured from them and any change here invalidates them.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const usd = v => '$' + v + 'k';

export const fixtures = {
  lineChart: {
    label: 'Monthly revenue against plan', labels: months, target: 150, fmtY: usd,
    series: [
      { name: 'Actual', points: months.map((m, i) => ({ x: m, y: [120, 140, 135, 162, 180, 205][i] })) },
      { name: 'Forecast', dash: '5 4', points: months.map((m, i) => ({ x: m, y: [118, 132, 146, 159, 173, 187][i] })) },
    ],
  },
  barChart: {
    label: 'Orders by channel', fmtY: v => v.toLocaleString('en-US'), target: 900,
    data: [
      { label: 'Search', value: 1240 }, { label: 'Social', value: 860 },
      { label: 'Email', value: 640 }, { label: 'Direct', value: 980 }, { label: 'Referral', value: 410 },
    ],
  },
  waterfall: {
    label: 'Gross-to-net bridge', fmtY: usd,
    items: [
      { label: 'Gross', value: 300, total: true },
      { label: 'Discounts', value: -46 }, { label: 'Returns', value: -22 }, { label: 'Fees', value: -18 },
      { label: 'Net', value: 214, total: true },
    ],
  },
  scatter: {
    label: 'Spend versus orders', xLabel: 'weekly spend', yLabel: 'weekly orders',
    fmtX: v => '$' + (v / 1000) + 'k', fmtY: v => v.toLocaleString('en-US'),
    groups: [{
      name: 'Weeks', line: { from: 0, to: 20000, fn: x => x / 42 },
      points: [[6200, 150], [8100, 205], [9700, 220], [12000, 300], [14500, 330], [16800, 360], [19000, 430]]
        .map(([x, y]) => ({ x, y })),
    }],
  },
  divergingBars: {
    label: 'Change in orders by product', fmtY: v => v.toLocaleString('en-US'),
    data: [
      { label: 'A', value: 420 }, { label: 'B', value: 180 }, { label: 'C', value: -90 },
      { label: 'D', value: -260 }, { label: 'E', value: 60 },
    ],
  },
  dumbbell: {
    label: 'Cost per order, start versus end of quarter', aLabel: 'April', bLabel: 'June', fmtY: usd,
    rows: [
      { label: 'Line one', a: 58, b: 41 }, { label: 'Line two', a: 47, b: 44 },
      { label: 'All lines', a: 52, b: 43, color: 'var(--chart-ink)' },
    ],
  },
  stackedBars: {
    label: 'Spend mix by month', keys: ['top', 'mid', 'low'],
    colors: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'],
    columns: months.map((m, i) => ({
      label: m, parts: {
        top: [0.5, 0.48, 0.46, 0.44, 0.42, 0.40][i], mid: [0.3, 0.31, 0.33, 0.34, 0.35, 0.36][i], low: [0.2, 0.21, 0.21, 0.22, 0.23, 0.24][i],
      },
    })),
  },
  hbarChart: {
    label: 'Spend by store', fmtY: usd,
    data: [
      { label: 'Warehouse club with a long name', value: 4210 }, { label: 'Corner market', value: 2380 },
      { label: 'Online', value: 1675 }, { label: 'Bakery', value: 310 }, { label: 'Other', value: 0 },
    ],
  },
  donut: {
    label: 'Spend share by category', fmtY: usd, centerLabel: 'total',
    slices: [
      { label: 'Produce', value: 820 }, { label: 'Meat and fish', value: 640 }, { label: 'Dairy', value: 410 },
      { label: 'Pantry', value: 380 }, { label: 'Drinks', value: 150 }, { label: 'Other', value: 95 },
    ],
  },
  heatmap: {
    label: 'Orders by weekday and month',
    rows: ['Mon', 'Wed', 'Sat'], cols: months,
    cells: ['Mon', 'Wed', 'Sat'].flatMap((r, i) => months.map((c, j) => ({ row: r, col: c, value: (i + 1) * (j + 2) })))
      .filter(c => !(c.row === 'Wed' && c.col === months[2])),
  },
  sparkline: { label: 'Weekly spend', values: [12, 14, 13, 17, 16, 21, 19] },
  groupedBars: {
    label: 'Spend by quarter, two years', fmtY: usd, categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: 'Last year', values: [210, 240, 232, 260] }, { name: 'This year', values: [228, 251, 270, 248] }],
  },
  stackedArea: {
    label: 'Spend by category over time', fmtY: usd, labels: months,
    series: [{ name: 'Rent', values: [58, 58, 58, 60, 60, 60] }, { name: 'Food', values: [22, 25, 21, 27, 24, 29] }, { name: 'Other', values: [12, 9, 15, 11, 18, 13] }],
  },
  slope: {
    label: 'Unit price, start versus end', aLabel: 'Jan', bLabel: 'Jun', fmtY: usd,
    rows: [{ label: 'Eggs', a: 35, b: 48 }, { label: 'Salmon', a: 110, b: 135 }, { label: 'Milk', a: 53, b: 57 }, { label: 'Avocado', a: 55, b: 39 }, { label: 'Bread', a: 40, b: 40 }],
  },
  bullet: {
    label: 'Budget use by category', fmtY: usd,
    rows: [{ label: 'Groceries', value: 495, target: 600 }, { label: 'Dining and drinks', value: 487, target: 400 }, { label: 'Shopping', value: 120, target: 300 }],
  },
  histogram: {
    label: 'Basket size', values: [22, 35, 41, 44, 48, 52, 55, 57, 61, 63, 64, 68, 72, 75, 79, 84, 91, 98, 120, 164], bins: 8,
    mark: { value: 63, text: 'median 63' },
  },
  boxPlot: {
    label: 'Sleep by weekday', fmtY: v => v + ' h',
    groups: [{ label: 'Weekdays', values: [5.5, 6, 6.2, 6.4, 6.5, 6.8, 7, 7.1, 7.4, 8] }, { label: 'Weekend', min: 6, q1: 7, median: 7.8, q3: 8.4, max: 9.5 }],
  },
  calendar: {
    label: 'Workouts per day',
    days: Array.from({ length: 84 }, (_, i) => ({ date: new Date(Date.UTC(2026, 7, 3) + i * 86400000).toISOString().slice(0, 10), value: i % 9 === 4 ? null : (i * 7) % 5 })),
  },
  treemap: {
    label: 'Spend by category', fmtY: usd,
    items: [{ label: 'Rent', value: 584 }, { label: 'Groceries', value: 95 }, { label: 'Dining', value: 87 }, { label: 'Medical', value: 58 },
      { label: 'Shopping', value: 36 }, { label: 'Subscriptions', value: 29 }, { label: 'Cleaning', value: 18 }, { label: 'Transport', value: 7 }],
  },
  funnel: {
    label: 'Job search funnel',
    stages: [{ label: 'Applied', value: 120 }, { label: 'Screened', value: 42 }, { label: 'Interviewed', value: 15 }, { label: 'Offer', value: 3 }],
  },
  sankey: {
    label: 'Where the stores send the money', fmtY: usd,
    flows: [{ from: 'Walmart', to: 'Food', value: 300 }, { from: 'Walmart', to: 'Household', value: 65 }, { from: 'Costco', to: 'Food', value: 48 },
      { from: 'Costco', to: 'Household', value: 16 }, { from: 'Other', to: 'Food', value: 60 }, { from: 'Other', to: 'Pharmacy', value: 25 }],
  },
  gauge: { label: 'Budget used', value: 720, max: 1000, target: 800, caption: 'of the month budget', fmtY: usd },
  pareto: {
    label: 'Spend by item', fmtY: usd,
    data: [{ label: 'Coffee', value: 200 }, { label: 'Milk', value: 177 }, { label: 'Beef', value: 130 }, { label: 'Protein', value: 125 }, { label: 'Soda', value: 94 }, { label: 'Fish', value: 81 }, { label: 'Rest', value: 60 }],
  },
  wordCloud: {
    label: 'Words in the group chat',
    words: [['churrasco', 48], ['sábado', 41], ['trabalho', 33], ['futebol', 30], ['viagem', 24], ['aniversário', 22], ['cerveja', 21], ['reunião', 18],
      ['praia', 16], ['presente', 14], ['carro', 13], ['médico', 12], ['feriado', 11], ['pizza', 10], ['filme', 9], ['escola', 8], ['chuva', 7], ['academia', 6]]
      .map(([text, value]) => ({ text, value })),
  },
};
