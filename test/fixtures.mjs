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
};
