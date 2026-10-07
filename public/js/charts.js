/* charts.js - small dependency-free SVG/DOM charts that redraw from live data. */
window.Charts = (function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const nice = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

  /* series: [{name,color,data:[y...]|[{x,y}]}] */
  function line(host, series, o) {
    o = o || {}; const W = o.w || 420, H = o.h || 190, L = 38, R = 10, T = 12, B = 24;
    host.textContent = '';
    const pts = series.map((s) => s.data.map((d, i) => (typeof d === 'object' ? d : { x: i + 1, y: d })));
    const all = [].concat.apply([], pts);
    const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': o.label || 'chart' }, host);
    if (!all.length) { const t = svg('text', { x: W / 2, y: H / 2, class: 'ch-empty', 'text-anchor': 'middle' }, s); t.textContent = o.empty || 'Run the simulation to see data'; return; }
    const xmin = o.xmin !== undefined ? o.xmin : Math.min.apply(null, all.map((p) => p.x)), xmax = o.xmax !== undefined ? o.xmax : Math.max.apply(null, all.map((p) => p.x));
    const ymin = o.ymin !== undefined ? o.ymin : 0, ymax = o.ymax !== undefined ? o.ymax : nice(Math.max.apply(null, all.map((p) => p.y)) * 1.05);
    const X = (x) => L + ((x - xmin) / ((xmax - xmin) || 1)) * (W - L - R), Y = (y) => H - B - ((y - ymin) / ((ymax - ymin) || 1)) * (H - T - B);
    for (let i = 0; i <= 4; i++) {
      const v = ymin + ((ymax - ymin) * i) / 4, y = Y(v);
      svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' }, s);
      const t = svg('text', { x: L - 5, y: y + 3, class: 'ax', 'text-anchor': 'end' }, s); t.textContent = +v.toFixed(2);
    }
    const xl = svg('text', { x: W - R, y: H - 6, class: 'ax', 'text-anchor': 'end' }, s); xl.textContent = o.xLabel || '';
    const xs = svg('text', { x: L, y: H - 6, class: 'ax' }, s); xs.textContent = xmin;
    series.forEach((se, i) => {
      const p = pts[i]; if (!p.length) return;
      const d = p.map((q, j) => (j ? 'L' : 'M') + X(q.x).toFixed(1) + ',' + Y(q.y).toFixed(1)).join(' ');
      svg('path', { d, fill: 'none', stroke: se.color, 'stroke-width': se.width || 2, 'stroke-linejoin': 'round', 'stroke-dasharray': se.dash || '', opacity: se.opacity || 1 }, s);
      if (se.marker && p.length) { const q = p[p.length - 1]; svg('circle', { cx: X(q.x), cy: Y(q.y), r: 4, fill: se.color }, s); }
    });
    if (o.vline !== undefined && o.vline >= xmin && o.vline <= xmax) svg('line', { x1: X(o.vline), x2: X(o.vline), y1: T, y2: H - B, class: 'vline' }, s);
    if (o.hline !== undefined) { const y = Y(o.hline); svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'hline' }, s); }
    if (o.marker) { svg('circle', { cx: X(o.marker.x), cy: Y(o.marker.y), r: 5, class: 'mk' }, s); }
    if (series.length > 1 || o.legend) {
      const lg = document.createElement('div'); lg.className = 'chart-legend';
      series.filter((x) => x.name).forEach((x) => { const sp = document.createElement('span'); sp.innerHTML = '<i style="background:' + x.color + '"></i>' + x.name; lg.appendChild(sp); });
      host.appendChild(lg);
    }
  }

  /* animated horizontal bars: items [{key,label,value,text,color,max}] - elements persist so widths transition */
  function hbars(host, items, o) {
    o = o || {}; const max = o.max || Math.max.apply(null, items.map((i) => i.max || i.value)) || 1;
    items.forEach((it) => {
      let row = host.querySelector('[data-k="' + it.key + '"]');
      if (!row) {
        row = document.createElement('div'); row.className = 'hbar'; row.dataset.k = it.key;
        row.innerHTML = '<span class="hl"></span><span class="ht"><i></i></span><span class="hv"></span>'; host.appendChild(row);
      }
      row.querySelector('.hl').textContent = it.label;
      const bar = row.querySelector('i'); bar.style.width = Math.max(0, Math.min(100, ((it.value || 0) / (it.max || max)) * 100)) + '%'; bar.style.background = it.color || '';
      row.querySelector('.hv').textContent = it.text !== undefined ? it.text : it.value;
    });
  }

  /* Amdahl: speedup vs s for several f, highlighting the selected one */
  function amdahl(host, f, s) {
    const S = []; for (let x = 1; x <= 64; x++) S.push(x);
    const fn = (ff) => S.map((x) => ({ x, y: 1 / ((1 - ff) + ff / x) }));
    const ser = [0.5, 0.75, 0.9, 0.95].map((ff, i) => ({ name: 'f=' + ff, color: ['#38517f', '#3f6aa8', '#4f8bd6', '#6aa9f0'][i], data: fn(ff), width: 1.4, opacity: 0.8 }));
    ser.push({ name: 'f=' + f.toFixed(2) + ' (selected)', color: '#22d3ee', data: fn(f), width: 3 });
    const lim = f < 1 ? 1 / (1 - f) : 64;
    line(host, ser, { w: 440, h: 270, ymin: 1, ymax: nice(Math.max(8, Math.min(40, 1 / (1 - 0.95) * 1.05))), xmin: 1, xmax: 64, xLabel: 's (speedup of improved part)', hline: Math.min(lim, 20), marker: { x: s, y: 1 / ((1 - f) + f / s) }, legend: true, label: 'Amdahl speedup curves' });
  }
  return { line, hbars, amdahl, nice };
})();
