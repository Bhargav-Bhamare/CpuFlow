/* pipeline.js - Pipeline Lab: animated stage lanes, timeline, hazard detection log, forwarding arcs. */
(function () {
  const { $, el, esc } = UI, PA = CPUFlow.PerformanceAnalyzer;
  const lab = UI.initLab({ config: { pipelined: true }, program: CPUFlow.Programs[2].code });
  const { engine, runner } = lab;
  const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'], DESC = { IF: 'Instruction Fetch', ID: 'Decode + register read', EX: 'ALU / branch resolve', MEM: 'Cache / memory access', WB: 'Register write-back' };
  UI.bindOptions(engine, { 'opt-pipe': 'pipelined', 'opt-fwd': 'forwarding', 'opt-uni': 'unifiedMemory' });

  /* lanes */
  const lanes = $('#lanes'); lanes.classList.add('lanes');
  const boxes = {}; const row = el('div', { class: 'lane-row' });
  STAGES.forEach((s) => { const b = el('div', { class: 'lane-box', 'data-stage': s }, el('b', { text: s }), el('small', { text: DESC[s] })); row.append(b); boxes[s] = b; });
  const layer = el('div', { class: 'tok-layer' }), svgNS = 'http://www.w3.org/2000/svg';
  const arcs = document.createElementNS(svgNS, 'svg'); arcs.setAttribute('class', 'lane-svg'); arcs.innerHTML = '<defs><marker id="fa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#f59e0b"/></marker></defs>';
  lanes.append(row, layer, arcs);
  const toks = {};
  function pos(stage) { const b = boxes[stage]; return { x: b.offsetLeft + 8, y: b.offsetTop + 46, w: b.offsetWidth - 16 }; }
  function renderLanes(st) {
    const seen = {};
    STAGES.forEach((k) => {
      const s = st.stages[k]; if (!s) return; seen[s.seq] = 1;
      let t = toks[s.seq];
      if (!t) { t = el('div', { class: 'tok' }, el('b', { text: 'I' + s.seq }), el('span', { text: s.text })); layer.append(t); toks[s.seq] = t; const p0 = pos('IF'); t.style.transform = 'translate(' + p0.x + 'px,' + (p0.y - 24) + 'px)'; t.style.width = p0.w + 'px'; void t.offsetWidth; }
      const p = pos(k); t.style.width = p.w + 'px'; t.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
      t.classList.toggle('stall', !!s.held && !s.flushed); t.classList.toggle('flush', !!s.flushed); t.classList.remove('gone');
    });
    Object.keys(toks).forEach((q) => { if (!seen[q]) { const t = toks[q]; delete toks[q]; t.classList.add('gone'); setTimeout(() => t.remove(), 500); } });
    STAGES.forEach((k) => boxes[k].classList.toggle('busy', !!st.stages[k] && !st.stages[k].flushed));
  }
  function clearLanes() { Object.keys(toks).forEach((q) => { toks[q].remove(); delete toks[q]; }); arcs.querySelectorAll('path.fa').forEach((p) => p.remove()); STAGES.forEach((k) => boxes[k].classList.remove('busy')); }
  function arc(from) {
    const a = pos(from), b = pos('EX'), x1 = a.x + a.w / 2, x2 = b.x + b.w / 2, y = 38;
    const p = document.createElementNS(svgNS, 'path'); p.setAttribute('class', 'fa'); p.setAttribute('marker-end', 'url(#fa)');
    p.setAttribute('d', 'M' + x1 + ',' + y + ' C' + x1 + ',' + (y - 34) + ' ' + x2 + ',' + (y - 34) + ' ' + x2 + ',' + (y + 2)); arcs.append(p);
    setTimeout(() => p.remove(), runner.animMs + 500);
  }

  /* timeline */
  function renderTimeline(st) {
    const rows = engine.getTimeline(14), cMax = st.cycle, cMin = Math.max(1, cMax - 27), host = $('#timeline');
    if (!cMax) { host.innerHTML = '<p class="hint">Run the program to build the timeline.</p>'; return; }
    let h = '<table class="timeline"><thead><tr><th class="sticky">Instruction</th>';
    for (let c = cMin; c <= cMax; c++) h += '<th>' + c + '</th>';
    h += '</tr></thead><tbody>';
    rows.forEach((r) => {
      h += '<tr><th class="sticky"><b>I' + r.seq + '</b> <code>' + esc(r.text) + '</code></th>';
      const map = {}; r.cells.forEach((x) => { map[x.c] = x; });
      for (let c = cMin; c <= cMax; c++) {
        const x = map[c]; if (!x) { h += '<td></td>'; continue; }
        const lbl = x.st === 'flush' ? 'X' : x.s + (x.st === 'stall' ? '*' : x.st === 'fwd' ? '\u21a9' : '');
        h += '<td class="cell ' + x.st + (c === cMax ? ' new' : '') + '"><span>' + lbl + '</span></td>';
      }
      h += '</tr>';
    });
    host.innerHTML = h + '</tbody></table>'; host.scrollLeft = host.scrollWidth;
  }

  /* metrics, hazards, comparison */
  const metrics = UI.metricStrip($('#metrics'), [{ id: 'cycles', label: 'Clock cycles' }, { id: 'ic', label: 'Instructions' }, { id: 'cpi', label: 'CPI' }, { id: 'dstall', label: 'Data stalls' }, { id: 'fwd', label: 'Forwarding paths' }, { id: 'flush', label: 'Flushed instr.' }, { id: 'haz', label: 'Hazards detected' }, { id: 'eff', label: 'Pipeline efficiency', tip: 'IPC / peak IPC (1 instruction per cycle)' }]);
  const hz = UI.Terminal($('#hazard-log'), 200), banner = $('#hazard-banner');
  $('#clear-hz').addEventListener('click', () => hz.clear());
  function compare() {
    if (!engine.ok) return;
    const base = engine.cpu.cfg, prog = engine.parsed.program;
    const run = (o) => PA.runHeadless(prog, Object.assign({}, base, o));
    const a = run({ pipelined: false }), b = run({ pipelined: true, forwarding: false }), c = run({ pipelined: true, forwarding: true });
    const mx = Math.max(a.stats.cycles, b.stats.cycles, c.stats.cycles);
    UI.bars($('#pipe-compare'), [
      { key: 'a', label: 'Sequential', value: a.stats.cycles, max: mx, text: a.stats.cycles + ' cyc', color: '#64748b' },
      { key: 'b', label: 'Pipelined, no forwarding', value: b.stats.cycles, max: mx, text: b.stats.cycles + ' cyc', color: '#f59e0b' },
      { key: 'c', label: 'Pipelined + forwarding', value: c.stats.cycles, max: mx, text: c.stats.cycles + ' cyc', color: '#22d3ee' }
    ]);
  }
  engine.subscribe((st, d) => {
    const m = st.metrics;
    metrics({ cycles: m.cycles, ic: m.instructionCount, cpi: UI.fix(m.cpi), dstall: m.dataStalls, fwd: m.forwards, flush: m.flushes, haz: m.dataHazards + m.controlHazards + m.structHazards, eff: UI.pct(m.efficiency) });
    $('#pipe-mode-note').textContent = st.config.pipelined ? 'Pipelined' + (st.config.forwarding ? ' with forwarding' : ', no forwarding') : 'Pipeline disabled: one instruction at a time';
    renderLanes(st); renderTimeline(st);
    if (d.kind !== 'step') {
      clearLanes(); renderLanes(st); hz.clear(); banner.innerHTML = '<span class="muted">No hazards yet</span>'; banner.className = 'hazard-banner';
      if (d.kind === 'load' || d.kind === 'config') compare();
      return;
    }
    d.events.forEach((ev) => {
      if (ev.type === 'forward') { arc(ev.from === 'EX/MEM' ? 'MEM' : 'WB'); hz.log('FORWARDING ' + ev.from + ' \u2192 EX  (R' + ev.reg + ' = ' + ev.value + ')', 'fwd'); banner.className = 'hazard-banner fwd'; banner.innerHTML = '<b>FORWARDING</b> ' + ev.from + ' \u2192 EX: R' + ev.reg + ' = ' + ev.value; }
      else if (ev.type === 'hazard') { const k = { data: 'DATA HAZARD DETECTED', control: 'CONTROL HAZARD \u2013 PIPELINE FLUSH', structural: 'STRUCTURAL HAZARD' }[ev.kind]; hz.log(ev.msg, 'hz-' + ev.kind); banner.className = 'hazard-banner ' + ev.kind; banner.innerHTML = '<b>' + k + '</b> ' + esc(ev.msg.replace(/^[A-Z ]+: /, '')); }
      else if (ev.type === 'stall' && ev.reason === 'data') hz.log('STALL: I' + ev.seq + ' held in ID (waiting for R' + ev.reg + ')', 'stall');
      else if (ev.type === 'stall' && ev.reason === 'memory') hz.log('STALL: pipeline frozen - main memory access', 'stall');
      else if (ev.type === 'flush') { hz.log('Flushed ' + ev.seqs.map((s) => 'I' + s).join(', '), 'hz-control'); }
      else if (ev.type === 'error') hz.log('ERROR: ' + ev.msg, 'err');
    });
    if (st.status === 'finished') UI.toast('Finished in ' + st.cycle + ' cycles, CPI ' + UI.fix(st.metrics.cpi), 'ok');
    if (st.status === 'error') UI.toast(st.error, 'err');
  });
  window.addEventListener('resize', () => renderLanes(engine.getState()));
  engine.notify('load', {});
})();
