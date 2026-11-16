#!/usr/bin/env node
// Draws a spec file with chart() in strict mode and prints one JSON line: { ok, chart, width, height, svg }.
// deck/chart.py calls it, so the slide has the geometry of the page chart.
//   node deck/render.mjs spec.json --width 864 --height 340 [--bare | --bare-title] [--stack-title]
// Exit 2 with the reason on stderr when the spec is bad or the content does not fit.
import { readFileSync } from 'node:fs';
import { chart } from '../charts.js';

const args = process.argv.slice(2), opt = n => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; };
try {
  const spec = JSON.parse(readFileSync(args[0], 'utf8'));
  const width = opt('width') ? +opt('width') : undefined, height = opt('height') ? +opt('height') : undefined;
  const svg = chart(spec, { width, height, strict: true, bare: args.includes('--bare') ? true : args.includes('--bare-title') ? 'title' : false,
    stackTitle: args.includes('--stack-title') });
  const box = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  process.stdout.write(JSON.stringify({ ok: true, chart: spec.chart, width: +box[1], height: +box[2], svg }) + '\n');
} catch (e) {
  if (!(e instanceof RangeError) && !(e instanceof SyntaxError) && e.code !== 'ENOENT') throw e;
  process.stderr.write(`${e.message}\n`);
  process.exit(2);
}
