// Small hand-rolled SVG charts (no dependencies, works offline).
import { fmtCompact, fmt } from './store.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// Rounded-top column path: square at the baseline, 4px radius at the data end.
function colPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * data: [{label, value, key, active}]
 * opts: {width, height, action, avg}
 */
export function columnChart(data, { width = 320, height = 170, action = '', avg = null } = {}) {
  const padL = 40, padR = 6, padT = 26, padB = 22;
  const W = Math.max(200, width), H = height;
  const pw = W - padL - padR, ph = H - padT - padB;
  const max = niceMax(Math.max(...data.map((d) => d.value), avg || 0));
  const n = data.length;
  const slot = pw / n;
  const bw = Math.min(24, slot * 0.62);
  const y = (v) => padT + ph - (v / max) * ph;
  const maxChars = Math.max(...data.map((d) => String(d.label).length));
  const every = maxChars * 6.6 + 6 > slot ? 2 : 1;
  let g = '';
  for (const f of [0, 0.5, 1]) {
    const yy = y(max * f);
    g += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="${f === 0 ? 'c-base' : 'c-grid'}"/>`;
    g += `<text x="${padL - 6}" y="${yy + 4}" text-anchor="end" class="c-tick">${fmtCompact(max * f)}</text>`;
  }
  let bars = '', labels = '', hits = '', tip = '';
  data.forEach((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * ph);
    bars += `<path d="${colPath(cx - bw / 2, padT + ph - h, bw, h)}" class="${d.active ? 'c-bar-on' : 'c-bar'}"/>`;
    if (i % every === 0 || d.active)
      labels += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="c-x${d.active ? ' on' : ''}">${d.label}</text>`;
    if (action) hits += `<rect x="${padL + slot * i}" y="0" width="${slot}" height="${H}" fill="transparent" data-action="${action}" data-key="${d.key}"><title>${d.label}: ${fmt(d.value)}</title></rect>`;
    if (d.active && d.value > 0) {
      const txt = fmtCompact(d.value);
      const tw = txt.length * 7 + 14;
      const tx = Math.min(Math.max(cx - tw / 2, 2), W - tw - 2);
      const ty = Math.max(2, padT + ph - h - 24);
      tip = `<rect x="${tx}" y="${ty}" width="${tw}" height="20" rx="6" class="c-tip"/><text x="${tx + tw / 2}" y="${ty + 14}" text-anchor="middle" class="c-tip-t">${txt}</text>`;
    }
  });
  let avgLine = '';
  if (avg && avg > 0) {
    const yy = y(avg);
    avgLine = `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="c-avg"/>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img">${g}${avgLine}${bars}${labels}${tip}${hits}</svg>`;
}
