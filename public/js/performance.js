/* performance.js - Performance Analyzer: live metrics, formula explorer, Amdahl's Law, configuration comparison. */
(function () {
  const { $, $$ } = UI, PA = CPUFlow.PerformanceAnalyzer;
  const lab = UI.initLab({ config: {} }), { engine, runner } = lab;
  UI.bindOptions(engine, { 'opt-pipe': 'pipelined', 'opt-fwd': 'forwarding' });

  const defs = [{ id: 'ic', label: 'Instruction count' }, { id: 'cycles', label: 'Clock cycles' }, { id: 'cpi', label: 'CPI', tip: 'Total clock cycles / instruction count' }, { id: 'time', label: 'Execution time', tip: 'IC x CPI x clock cycle time' },
    { id: 'freq', label: 'Clock frequency' }, { id: 'mips', label: 'MIPS', tip: 'IC / (execution time x 10^6)' }, { id: 'eff', label: 'Pipeline efficiency', tip: 'IPC / peak IPC' }, { id: 'hit', label: 'Cache hit ratio' }, { id: 'stalls', label: 'Stalls' }, { id: 'speedup', label: 'Speedup vs sequential' }];
  const metrics = UI.metricStrip($('#perf-metrics'), defs);

  /* clock slider */
  const fq = $('#opt-freq'); fq.value = engine.cpu.cfg.clockMHz; $('#freq-val').textContent = fq.value + ' MHz';
  fq.addEventListener('input', () => { $('#freq-val').textContent = fq.value + ' MHz'; });
  fq.addEventListener('change', () => { engine.setConfig({ clockMHz: +fq.value }); UI.saveConfig(engine.cpu.cfg); });
  $('#run-all').addEventListener('click', () => { runner.pause(); if (lab.panel.isDirty()) lab.panel.load(true); engine.finish(); });

  /* live charts */
  let cpiPts = [];
  const STG = ['IF', 'ID', 'EX', 'MEM', 'WB'], COL = { alu: '#22d3ee', load: '#34d399', store: '#f59e0b', branch: '#a78bfa', other: '#64748b' };
  function charts(st, d) {
    if (d.kind === 'reset' || d.kind === 'load' || d.kind === 'config') cpiPts = [];
    else if (st.metrics.cpi !== null) cpiPts.push({ x: st.cycle, y: st.metrics.cpi });
    Charts.line($('#ch-cpi'), [{ name: 'CPI', color: '#22d3ee', data: cpiPts, marker: true }], { w: 420, h: 190, ymin: 0, xLabel: 'cycle', hline: 1, empty: 'Run the simulation to plot CPI' });
    let h = 0, m = 0; const H = [], M = []; engine.cpu.cache.series.forEach((x) => { x ? h++ : m++; H.push(h); M.push(m); });
    Charts.line($('#ch-hm'), [{ name: 'Hits', color: '#34d399', data: H }, { name: 'Misses', color: '#f87171', data: M }], { w: 420, h: 190, xLabel: 'access #', empty: 'No cache accesses yet' });
    const c = Math.max(1, st.stats.cycles);
    UI.bars($('#ch-util'), STG.map((k) => ({ key: k, label: k, value: st.stats.stageBusy[k] / c, max: 1, text: UI.pct(st.stats.stageBusy[k] / c), color: '#22d3ee' })));
    const mix = st.stats.mix, tot = Math.max(1, st.stats.retired);
    UI.bars($('#ch-mix'), Object.keys(mix).map((k) => ({ key: k, label: { alu: 'ALU / move', load: 'Load', store: 'Store', branch: 'Branch / jump', other: 'NOP / halt' }[k], value: mix[k], max: tot, text: mix[k] + ' (' + UI.pct(mix[k] / tot) + ')', color: COL[k] })));
  }

  /* formula explorer */
  const fx = { ic: $('#fx-ic'), cpi: $('#fx-cpi'), f: $('#fx-f') };
  function formulas() {
    const ic = +fx.ic.value, cpi = +fx.cpi.value, f = +fx.f.value, ct = 1000 / f, secs = PA.execTimeSeconds(ic, cpi, f), mips = PA.mips(ic, secs);
    $('#fx-ic-v').textContent = ic.toLocaleString(); $('#fx-cpi-v').textContent = cpi.toFixed(2); $('#fx-f-v').textContent = f + ' MHz';
    $('#fx-out').innerHTML = '<div><small>Clock cycle time</small><b>' + ct.toFixed(2) + ' ns</b></div><div><small>CPU time = IC \u00d7 CPI \u00d7 cycle time</small><b>' + UI.fmtTime(secs * 1e9) + '</b></div><div><small>MIPS = IC / (time \u00d7 10\u2076)</small><b>' + mips.toFixed(2) + '</b></div><div><small>Total cycles = IC \u00d7 CPI</small><b>' + Math.round(ic * cpi).toLocaleString() + '</b></div>';
  }
  Object.values(fx).forEach((i) => i.addEventListener('input', formulas)); formulas();
  $('#use-live').addEventListener('click', () => { const m = engine.getState().metrics; if (!m.instructionCount) { UI.toast('Run the simulation first', 'err'); return; } fx.ic.value = Math.min(1000000, m.instructionCount); fx.cpi.value = Math.min(10, +m.cpi.toFixed(2)); fx.f.value = m.clockMHz; formulas(); });

  /* Amdahl */
  function amdahl() {
    const f = +$('#am-f').value, s = +$('#am-s').value, sp = PA.amdahl(f, s), lim = PA.amdahlLimit(f);
    $('#am-f-v').textContent = f.toFixed(2); $('#am-s-v').textContent = s + '\u00d7'; $('#am-out').textContent = sp.toFixed(2) + '\u00d7';
    $('#am-lim').textContent = 'Limit as s \u2192 \u221e: ' + (isFinite(lim) ? lim.toFixed(2) + '\u00d7' : '\u221e');
    UI.bars($('#am-bar'), [{ key: 's', label: 'Overall speedup', value: sp, max: 64, text: sp.toFixed(2) + '\u00d7', color: '#22d3ee' }, { key: 'l', label: 'Upper limit', value: Math.min(lim, 64), max: 64, text: isFinite(lim) ? lim.toFixed(1) + '\u00d7' : '\u221e', color: '#475569' }, { key: 'i', label: 'Improved part alone', value: s, max: 64, text: s + '\u00d7', color: '#a78bfa' }]);
    Charts.amdahl($('#am-chart'), f, s);
  }
  $('#am-f').addEventListener('input', amdahl); $('#am-s').addEventListener('input', amdahl); amdahl();

  /* comparison */
  const SC = {
    pipe: { desc: 'Same program, same cache: one instruction at a time versus a 5-stage pipeline with forwarding.', A: { pipelined: false }, B: { pipelined: true, forwarding: true }, na: 'Without pipeline', nb: 'With pipeline' },
    fwd: { desc: 'Pipelined both times. Without forwarding, dependent instructions wait for write-back.', A: { pipelined: true, forwarding: false }, B: { pipelined: true, forwarding: true }, na: 'Without forwarding', nb: 'With forwarding' },
    cache: { desc: 'Tiny 2-word direct-mapped cache versus a 128-word 2-way set-associative cache (current pipeline settings).', A: { cache: { mapping: 'direct', lines: 2, blockSize: 1 } }, B: { cache: { mapping: 'set', lines: 32, blockSize: 4, ways: 2 } }, na: 'Small cache', nb: 'Large cache' }
  };
  let scKey = 'pipe';
  function compare() {
    const sc = SC[scKey], host = $('#cmp-out'); $('#cmp-desc').textContent = sc.desc;
    if (!engine.ok) { host.innerHTML = '<p class="hint">Load a valid program to compare configurations.</p>'; return; }
    host.textContent = '';
    const base = engine.cpu.cfg, r = PA.compare(engine.parsed.program, Object.assign({}, base, sc.A), Object.assign({}, base, sc.B));
    const items = []; const grp = (key, label, a, b, fmt) => { const mx = Math.max(a, b) || 1; items.push({ key: key + 'a', label: label + ' \u2013 ' + sc.na, value: a, max: mx, text: fmt(a), color: '#64748b' }, { key: key + 'b', label: label + ' \u2013 ' + sc.nb, value: b, max: mx, text: fmt(b), color: '#22d3ee' }); };
    grp('cyc', 'Cycles', r.a.cycles, r.b.cycles, (v) => v); grp('cpi', 'CPI', r.a.cpi || 0, r.b.cpi || 0, (v) => UI.fix(v)); grp('st', 'Stalls', r.a.stalls, r.b.stalls, (v) => v); grp('hit', 'Cache hit ratio', r.a.hitRatio || 0, r.b.hitRatio || 0, (v) => UI.pct(v));
    UI.bars(host, items);
    const sp = document.createElement('div'); sp.className = 'big-num'; sp.innerHTML = '<small>Speedup (' + sc.nb + ' vs ' + sc.na + ')</small><b>' + (r.speedup ? r.speedup.toFixed(2) + '\u00d7' : '-') + '</b>'; host.append(sp);
    if (r.errorA || r.errorB) UI.toast('Comparison note: ' + (r.errorA || r.errorB), 'err');
  }
  UI.segmented($('#cmp-seg'), 'cmp', (k) => { scKey = k; $('#cmp-out').textContent = ''; compare(); });

  engine.subscribe((st, d) => {
    metrics(UI.metricValues(st.metrics));
    charts(st, d);
    if (d.kind === 'load' || d.kind === 'config') compare();
  });
  engine.notify('load', {});
})();
