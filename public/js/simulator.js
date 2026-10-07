/* simulator.js - the main CPU simulator page. Renders strictly from engine state; animations are played from engine events. */
(function () {
  const { $, $$, el } = UI;
  let scenes = null, mode = 'exec';
  const lab = UI.initLab({ onLoad: () => { if (scenes) { const st = engine.getState(); Viz.resetScene(cpuScene, st); Viz.resetScene(archScene, st); } } });
  const { engine, editor, panel, runner } = lab;
  const cpuScene = Viz.createCpuScene($('#cpu-svg')), archScene = Viz.createArchScene($('#arch-svg'));
  scenes = true;
  const regbank = UI.registerBank($('#regbank')), term = UI.Terminal($('#terminal')), microlog = UI.Terminal($('#microlog'));
  const stageStrip = UI.stageStrip($('#stage-strip')), sigs = UI.sigRow($('#sig-row')), metrics = UI.metricStrip($('#metrics'), UI.METRIC_DEFS);
  const mv = UI.memoryViewer($('#memview'), engine.cpu.mem), ctl = ControlViz.create($('#ctl-host'), { mode: engine.cpu.cfg.controlMode });
  const tabsApi = UI.tabs($('#bottom-tabs'));
  const ACTIVE = () => (mode === 'exec' ? cpuScene : archScene);
  const STG = { IF: -1, ID: 0, EX: 1, MEM: 2, WB: 3 };

  UI.bindOptions(engine, { 'opt-pipe': 'pipelined', 'opt-fwd': 'forwarding', 'opt-uni': 'unifiedMemory' });
  UI.segmented($('#mode-seg'), 'mode', (m) => { Viz.finish(); mode = m; $('#cpu-svg').hidden = m !== 'exec'; $('#arch-svg').hidden = m !== 'arch'; Viz.sync(ACTIVE(), engine.getState()); });
  $('#clear-term').addEventListener('click', () => term.clear()); $('#clear-micro').addEventListener('click', () => microlog.clear());
  $('#callout-run').addEventListener('click', () => runner.start());

  function focus(st) { let key = null; ['WB', 'MEM', 'EX', 'ID', 'IF'].some((k) => { if (st.stages[k] && !st.stages[k].flushed) { key = k; return true; } return false; }); return key; }

  const TRACE = [['pc', 'PC'], ['im', 'Instruction Memory'], ['ir', 'IR'], ['dec', 'Decoder / Control Unit'], ['rf', 'Register read'], ['alu', 'ALU'], ['mem', 'Cache / Memory'], ['wr', 'Write register']];
  const TSTAGE = { IF: [0, 1, 2], ID: [3, 4], EX: [5], MEM: [6], WB: [7] };
  function trace(st) {
    const host = $('#trace'), key = focus(st);
    if (!key) { host.innerHTML = '<p class="hint">Run or step the program to trace an instruction through the CPU.</p>'; return; }
    const sd = st.stages[key], ins = st.program[sd.n - 1], order = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    const skip = { rf: !ins.srcs.length, alu: ins.type === 'nop' || ins.type === 'halt' || ins.type === 'jump', mem: !ins.mem, wr: ins.dest === null };
    let h = '<div class="trace-title">Instruction #' + sd.n + ' (I' + sd.seq + '): <code>' + UI.esc(ins.text) + '</code></div><ol class="trace">';
    TRACE.forEach((t, i) => {
      const stg = order.find((o) => TSTAGE[o].includes(i)), idx = order.indexOf(stg), cur = order.indexOf(key);
      const cls = skip[t[0]] ? 'skip' : idx < cur ? 'done' : idx === cur ? 'now' : '';
      h += '<li class="' + cls + '"><span>' + t[1] + (t[0] === 'wr' && ins.dest !== null ? ' R' + ins.dest : '') + '</span><em>' + (skip[t[0]] ? 'not used' : stg) + '</em></li>';
    });
    host.innerHTML = h + '</ol>';
  }

  engine.subscribe((st, d) => {
    const reset = d.kind === 'reset' || d.kind === 'load' || d.kind === 'config';
    $('#v-pc').textContent = st.pc; $('#v-ir').textContent = st.ir || '-'; $('#v-mar').textContent = st.cycle ? st.mar : '-'; $('#v-mdr').textContent = st.cycle ? st.mdr : '-'; $('#v-cir').textContent = st.cir || '-';
    regbank.update(st.registers, reset);
    $('#alu-op').textContent = st.alu.op; $('#alu-a').textContent = st.alu.op === '-' ? '-' : st.alu.a; $('#alu-b').textContent = st.alu.op === '-' ? '-' : st.alu.b; $('#alu-r').textContent = st.alu.op === '-' ? '-' : st.alu.result;
    $('#alu-flags').innerHTML = ['Z', 'N', 'C', 'V'].map((f) => '<span class="flag' + (st.flags[f] ? ' on' : '') + '">' + f + '<b>' + st.flags[f] + '</b></span>').join('');
    $('#m-addr').textContent = st.memOp ? st.memOp.addr + ' (' + UI.hex(st.memOp.addr, 4) + ')' : '-'; $('#m-rw').textContent = st.memOp ? st.memOp.rw : '-'; $('#m-val').textContent = st.memOp ? st.memOp.value : '-';
    metrics(UI.metricValues(st.metrics)); stageStrip(st.stages); sigs(st.signals);
    mv.update(st.memOp ? { addr: st.memOp.addr, type: st.memOp.rw.toLowerCase() } : null);
    UI.cacheTable($('#cache-mini'), engine.cpu.cache, st.lastCache);
    trace(st);
    const key = focus(st); ctl.setIns(key ? st.program[st.stages[key].n - 1] : null, key ? STG[key] : -1);
    const marks = {}; ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach((k) => { const s = st.stages[k]; if (s && !s.flushed && st.program[s.n - 1]) marks[st.program[s.n - 1].line] = { IF: 'hl-fetch', ID: 'hl-decode', EX: 'hl-exec', MEM: 'hl-exec', WB: 'hl-wb' }[k]; });
    editor.mark(marks);
    $('#demo-callout').hidden = !(engine.ok && st.cycle === 0);

    if (reset) {
      Viz.resetScene(cpuScene, st); Viz.resetScene(archScene, st); Viz.finish();
      $('#micro-now-lines').innerHTML = '<span class="muted">Waiting for the first clock cycle</span>';
      if (d.kind === 'load') { term.log('CPU initialized', 'sys'); st.parseErrors.length ? term.log('Program rejected: ' + st.parseErrors.length + ' error(s)', 'err') : term.log('Program loaded: ' + st.programLength + ' instructions', 'sys'); }
      else if (d.kind === 'reset') term.log('CPU reset', 'sys'); else term.log('Configuration changed - CPU reset (' + (st.config.pipelined ? 'pipelined' : 'sequential') + ')', 'sys');
      return;
    }
    if (d.kind === 'step') {
      term.line('> Cycle ' + st.cycle, 'cyc');
      d.events.forEach((ev) => { const x = UI.describeEvent(ev); if (x) term.log(x.text, x.cls); });
      let last = -1; d.micro.forEach((m) => { if (m.cycle !== last) { microlog.line('> Cycle ' + m.cycle, 'cyc'); last = m.cycle; } microlog.line('  ' + m.stage + (m.seq ? ' [I' + m.seq + ']' : '') + ': ' + m.text, m.kind); });
      const lastCycle = d.micro.length ? d.micro[d.micro.length - 1].cycle : st.cycle;
      $('#micro-now-lines').innerHTML = d.micro.filter((m) => m.cycle === lastCycle).slice(0, 7).map((m) => '<div class="mo ' + m.kind + '"><b>' + m.stage + '</b> ' + UI.esc(m.text) + '</div>').join('') || '<span class="muted">idle</span>';
      term.log('Cycle ' + st.cycle + ' completed', 'sys');
      Viz.play(ACTIVE(), d.events, st, runner.animMs);
      if (st.status === 'finished') { term.log('Program finished: ' + st.metrics.instructionCount + ' instructions in ' + st.cycle + ' cycles (CPI ' + UI.fix(st.metrics.cpi) + ')', 'ok'); UI.toast('Program finished in ' + st.cycle + ' cycles', 'ok'); }
      if (st.status === 'error') UI.toast(st.error, 'err');
    } else Viz.sync(ACTIVE(), st);
  });
  engine.notify('load', {});
  panel.ensure();
})();
