/* control.js - ControlViz component (hardwired vs microprogrammed) + Control Unit Lab page logic. */
window.ControlViz = (function () {
  const { $, el, esc } = UI;
  const CU = new CPUFlow.ControlUnit();
  const fromAsserts = (list) => { const s = { RegRead: 0, RegWrite: 0, ALUSrc: 0, ALUOp: '-', MemRead: 0, MemWrite: 0, MemToReg: 0, Branch: 0, PCWrite: 0 }; (list || []).forEach((a) => { if (a.indexOf('ALUOp=') === 0) s.ALUOp = a.slice(6); else s[a] = 1; }); return s; };

  function create(host, opts) {
    opts = opts || {}; let mode = opts.mode || 'hardwired', ins = null, stage = -1;
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Control unit style' }, el('button', { 'data-m': 'hardwired', text: 'Hardwired Control' }), el('button', { 'data-m': 'microprogrammed', text: 'Microprogrammed Control' }));
    const flow = el('div', { class: 'ctl-flow' }), sigHost = el('div', { class: 'sig-row' });
    host.append(seg, flow, sigHost);
    const setSig = UI.sigRow(sigHost);
    UI.segmented(seg, 'm', (m) => { mode = m; render(); opts.onMode && opts.onMode(m); });
    const box = (cls, title, body, lit) => el('div', { class: 'cbox ' + cls + (lit ? ' lit' : '') }, el('small', { text: title }), el('div', { class: 'cb', html: body }));
    const arrow = (lit) => el('div', { class: 'carrow' + (lit ? ' lit' : ''), 'aria-hidden': 'true', text: '\u2193' });
    function render() {
      UI.$$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
      flow.textContent = ''; flow.dataset.mode = mode;
      const on = !!ins;
      if (mode === 'hardwired') {
        const h = ins ? CU.hardwired(ins) : null;
        flow.append(box('', 'Instruction', ins ? '<code>' + esc(ins.text) + '</code>' : '<span class="muted">none</span>', on), arrow(on),
          box('', 'Decoder', h ? 'opcode <code>' + h.bits + '</code> \u2192 line <code>' + h.decoderLine + '</code>' : '<span class="muted">4-bit opcode decoder</span>', on), arrow(on),
          box('', 'Control logic', '<span class="muted">fixed gates: all signals settle together</span>', on), arrow(on),
          box('', 'Control signals', h ? (h.signals.join(' &middot; ') || 'none') : '<span class="muted">-</span>', on));
        setSig(ins ? CU.signals(ins) : CU.signals(null));
      } else {
        const mp = ins ? CU.microprogram(ins) : null;
        const rows = mp ? mp.words.map((w, i) => '<div class="mw' + (i === stage ? ' cur' : '') + '"><code>0x' + w.addr.toString(16).toUpperCase().padStart(2, '0') + '</code> ' + esc(w.name) + ' <em>' + (w.asserts.join(' ') || '-') + '</em></div>').join('') : '<span class="muted">micro-words for the selected opcode</span>';
        const cur = mp && stage >= 0 ? mp.words[stage] : null;
        flow.append(box('', 'Instruction', ins ? '<code>' + esc(ins.text) + '</code>' : '<span class="muted">none</span>', on), arrow(on),
          box('', 'Control address', mp ? 'opcode ' + ins.opcode + ' \u00d7 8 = <code>0x' + mp.base.toString(16).toUpperCase().padStart(2, '0') + '</code>' : '<span class="muted">opcode \u00d7 8</span>', on), arrow(on),
          box('mem', 'Control memory (one micro-word per step)', rows, on), arrow(!!cur),
          box('', 'Microinstruction register', cur ? '<code>' + esc(cur.name) + '</code> \u2192 next ' + (cur.next ? '0x' + cur.next.toString(16).toUpperCase() : 'fetch') : '<span class="muted">waiting for a step</span>', !!cur), arrow(!!cur),
          box('', 'Control signals (this step only)', cur ? (cur.asserts.join(' &middot; ') || 'none asserted') : '<span class="muted">-</span>', !!cur));
        setSig(cur ? fromAsserts(cur.asserts) : CU.signals(null));
      }
    }
    render();
    return { setIns(i, s) { ins = i; stage = s === undefined ? -1 : s; render(); }, setMode(m) { mode = m; render(); }, get mode() { return mode; } };
  }
  return { create, fromAsserts };
})();

(function () {
  if (!document.getElementById('ctl-table')) return;
  const { $, el, esc } = UI, CU = new CPUFlow.ControlUnit(), P = CPUFlow.InstructionParser;
  const lab = UI.initLab({ config: { pipelined: false } }), { engine, runner } = lab;
  const viz = ControlViz.create($('#ctl-host'), { mode: engine.cpu.cfg.controlMode, onMode: (m) => { engine.cpu.cfg.controlMode = m; UI.saveConfig(Object.assign({}, UI.loadConfig(), { controlMode: m })); } });
  const STG = { IF: -1, ID: 0, EX: 1, MEM: 2, WB: 3 };

  function table(cur) {
    const prog = engine.cpu.program, cols = CPUFlow.ControlUnit.SIGNALS;
    if (!prog.length) { $('#ctl-table').innerHTML = '<p class="hint">Load a valid program to see its signals.</p>'; return; }
    let h = '<table class="ctable"><thead><tr><th>#</th><th>Instruction</th>' + cols.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
    prog.forEach((ins) => {
      const s = CU.signals(ins);
      h += '<tr class="' + (cur === ins.n ? 'hit' : '') + '"><td>' + ins.n + '</td><td><code>' + esc(ins.text) + '</code></td>' + cols.map((c) => { const on = c === 'ALUOp' ? s.ALUOp !== '-' : !!s[c]; return '<td class="' + (on ? 'sigon' : 'sigoff') + '">' + (c === 'ALUOp' ? s.ALUOp : on ? '1' : '0') + '</td>'; }).join('') + '</tr>';
    });
    $('#ctl-table').innerHTML = h + '</tbody></table>';
  }
  engine.subscribe((st) => {
    let key = null; ['WB', 'MEM', 'EX', 'ID', 'IF'].some((k) => { if (st.stages[k] && !st.stages[k].flushed) { key = k; return true; } return false; });
    const ins = key ? st.program[st.stages[key].n - 1] : null;
    viz.setIns(ins, key ? STG[key] : -1);
    $('#ctl-now').textContent = ins ? 'I' + st.stages[key].seq + ': ' + ins.text + ' (' + UI.STAGE_NAMES[key] + ')' : 'No instruction decoded yet';
    table(ins ? ins.n : 0);
  });
  const trySig = UI.sigRow($('#ctl-try-sig'));
  function tryIt() {
    const r = P.parse($('#ctl-try').value);
    if (!r.ok) { $('#ctl-try-msg').textContent = r.errors[0].message; $('#ctl-try-msg').className = 'hint bad'; trySig(CU.signals(null)); return; }
    $('#ctl-try-msg').className = 'hint'; $('#ctl-try-msg').textContent = 'Opcode ' + r.program[0].opcode.toString(2).padStart(4, '0') + ' \u2192 ' + (CU.active(CU.signals(r.program[0])).join(' ') || 'no signals');
    trySig(CU.signals(r.program[0]));
  }
  $('#ctl-try').addEventListener('input', tryIt); tryIt();
  engine.notify('load', {});
})();
