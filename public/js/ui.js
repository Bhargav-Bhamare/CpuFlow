/* ui.js - shared UI toolkit: DOM helpers, storage, popovers, modals, tabs, editor, terminal, runner, reusable components. */
window.UI = (function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function el(tag, props) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k === 'style') e.style.cssText = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    }
    for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c == null || c === false) continue; (Array.isArray(c) ? c : [c]).forEach((x) => e.append(x && x.nodeType ? x : document.createTextNode(x))); }
    return e;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex = (v, w) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w || 8, '0');
  const bin16 = (v) => (v >>> 0).toString(2).padStart(32, '0').slice(-16).replace(/(.{4})/g, '$1 ').trim();
  const fix = (v, d) => (v === null || v === undefined || !isFinite(v) ? '-' : (+v).toFixed(d === undefined ? 2 : d));
  const pct = (v) => (v === null || v === undefined ? '-' : (v * 100).toFixed(1) + '%');
  const fmtTime = (ns) => (ns >= 1e6 ? (ns / 1e6).toFixed(3) + ' ms' : ns >= 1e3 ? (ns / 1e3).toFixed(2) + ' \u00b5s' : Math.round(ns * 100) / 100 + ' ns');
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- storage (config + program are shared between labs) ---------- */
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const loadConfig = () => CPUFlow.CPU.mergeConfig(store.get('cpuflow.config') || {});
  const saveConfig = (c) => store.set('cpuflow.config', c);
  const loadProgram = () => store.get('cpuflow.program');
  const saveProgram = (t) => store.set('cpuflow.program', t);

  /* ---------- educational tooltips ---------- */
  const INFO = {
    pc: ['Program Counter', 'Holds the index of the next instruction to fetch. It increments after every fetch unless a branch changes it.'],
    ir: ['Instruction Register', 'Holds the instruction that was just fetched while it is decoded.'],
    cir: ['Current Instruction', 'The instruction whose control signals are currently being generated.'],
    mar: ['Memory Address Register', 'Holds the address of the memory location being read or written.'],
    mdr: ['Memory Data Register', 'Holds the data travelling to or from memory.'],
    im: ['Instruction Memory', 'Stores the program. The PC selects which instruction is read out.'],
    cu: ['Control Unit', 'Decodes the instruction and drives control signals that tell every other unit what to do.'],
    alu: ['Arithmetic Logic Unit', 'Performs arithmetic and logical operations on data, and sets the Z, N, C and V flags.'],
    rf: ['Register File', 'Eight fast storage locations (R0-R7) inside the CPU. Operands are read from here and results written back.'],
    flags: ['Status flags', 'Z zero, N negative, C carry/borrow, V overflow - set by the ALU after each operation.'],
    cache: ['Cache', 'A small, fast memory located close to the CPU that stores frequently accessed data.'],
    mem: ['Main Memory', 'Large but slow storage. Cache misses fetch whole blocks from here.'],
    io: ['I/O Controller', 'Connects peripherals to the CPU and memory, handling their speed and protocol.'],
    dev: ['Peripheral', 'A device such as a keyboard or disk that exchanges data with the system.'],
    bus: ['System bus', 'Shared wires carrying addresses, data and control signals between components.'],
    cpu: ['CPU', 'Executes instructions: control unit, ALU and registers working together.']
  };
  const pop = () => $('#popover');
  function showInfo(key, x, y) {
    const k = /^r\d$/.test(key) ? 'rf' : key; const i = INFO[k]; const p = pop(); if (!i || !p) return;
    p.innerHTML = '<b>' + esc(i[0]) + '</b><p>' + esc(i[1]) + '</p>'; p.hidden = false;
    const w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 12)) + 'px';
    p.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y + 12)) + 'px';
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-info]');
    if (t) { showInfo(t.getAttribute('data-info'), e.clientX, e.clientY); e.stopPropagation(); return; }
    if (pop() && !e.target.closest('#popover')) pop().hidden = true;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (pop()) pop().hidden = true; closeModal(); } });

  /* ---------- modal / toast / tabs / nav ---------- */
  let lastFocus = null;
  function openModal(title, content) {
    closeModal(); lastFocus = document.activeElement;
    const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('div', { class: 'modal-head' }, el('h2', { text: title }), el('button', { class: 'btn sm ghost', 'aria-label': 'Close', text: 'Close', onclick: closeModal })), el('div', { class: 'modal-body' }, content));
    const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) closeModal(); } }, box);
    $('#modal-root').append(back); const f = $('button', box); f && f.focus();
  }
  function closeModal() { const r = $('#modal-root'); if (r && r.firstChild) { r.textContent = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); } }
  function toast(msg, kind) {
    const t = el('div', { class: 'toast ' + (kind || ''), text: msg }); $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }
  function tabs(root, onChange) {
    const btns = $$('.tabbar [role=tab]', root), panels = $$(':scope > .tabpanel', root);
    const sel = (name) => {
      btns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
      panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
      onChange && onChange(name);
    };
    btns.forEach((b) => b.addEventListener('click', () => sel(b.dataset.tab)));
    return { select: sel };
  }
  function segmented(root, attr, cb) {
    const btns = $$('button', root);
    const set = (v) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(v))));
    btns.forEach((b) => b.addEventListener('click', () => { set(b.dataset[attr]); cb(b.dataset[attr]); }));
    return { set };
  }
  const nt = $('.nav-toggle');
  if (nt) nt.addEventListener('click', () => { const o = nt.getAttribute('aria-expanded') === 'true'; nt.setAttribute('aria-expanded', String(!o)); $('#navlinks').classList.toggle('open', !o); });

  /* ---------- code editor with gutter + line highlights ---------- */
  function createEditor(host, o) {
    o = o || {};
    host.classList.add('editor');
    const gutter = el('div', { class: 'ed-gutter', 'aria-hidden': 'true' }), wrap = el('div', { class: 'ed-wrap' }), hl = el('div', { class: 'ed-hl', 'aria-hidden': 'true' });
    const ta = el('textarea', { spellcheck: 'false', wrap: 'off', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Assembly program editor' });
    wrap.append(hl, ta); host.append(gutter, wrap); ta.value = o.value || '';
    let marks = {}, errs = {};
    function render() {
      const lines = ta.value.split('\n'); let n = 0, g = '', h = '';
      lines.forEach((ln, i) => {
        let t = ln.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim(), m;
        while ((m = t.match(/^[A-Za-z_]\w*\s*:\s*(.*)$/))) t = m[1].trim();
        const ins = !!t; if (ins) n++;
        const e = errs[i + 1] ? ' err' : '';
        g += '<div class="g' + e + '">' + (ins ? String(n).padStart(2, '0') : '\u00b7') + '</div>';
        h += '<div class="l ' + (marks[i + 1] || '') + e + '"></div>';
      });
      gutter.innerHTML = g; hl.innerHTML = h; sync();
    }
    const sync = () => { gutter.scrollTop = ta.scrollTop; hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; };
    ta.addEventListener('scroll', sync);
    ta.addEventListener('input', () => { render(); o.onInput && o.onInput(); });
    render();
    return {
      ta, get: () => ta.value, set(v) { ta.value = v; render(); }, focus: () => ta.focus(),
      mark(m) { marks = m || {}; render(); }, setErrors(list) { errs = {}; (list || []).forEach((e) => { if (e.line) errs[e.line] = 1; }); render(); }
    };
  }

  /* ---------- terminal log ---------- */
  function Terminal(host, max) {
    max = max || 400;
    return {
      log(text, cls) {
        const row = el('div', { class: 'tl ' + (cls || '') }, el('span', { class: 'ts', text: new Date().toTimeString().slice(0, 8) }), el('span', { class: 'tx', text }));
        host.append(row);
        while (host.children.length > max) host.firstChild.remove();
        host.scrollTop = host.scrollHeight;
      },
      line(text, cls) { const row = el('div', { class: 'tl ' + (cls || '') }, el('span', { class: 'tx', text })); host.append(row); while (host.children.length > max) host.firstChild.remove(); host.scrollTop = host.scrollHeight; },
      clear() { host.textContent = ''; }
    };
  }

  /* ---------- run controller (timing only - the engine owns the state) ---------- */
  class Runner {
    constructor(engine, o) { this.e = engine; this.base = (o && o.base) || 900; this.speed = 1; this.timer = null; this.running = false; this.fns = []; this.beforeRun = (o && o.beforeRun) || null; }
    get animMs() { return Math.max(140, Math.min(760, (this.base / this.speed) * 0.82)); }
    on(fn) { this.fns.push(fn); }
    emit() { this.fns.forEach((f) => f(this)); }
    can() { return this.e.status === 'ready' || this.e.status === 'running'; }
    prep() { this.beforeRun && this.beforeRun(); }
    start() { this.prep(); if (!this.can()) return; this.running = true; this.emit(); this.loop(); }
    loop() {
      if (!this.running) return;
      this.e.step();
      if (!this.can()) { this.running = false; this.emit(); return; }
      this.timer = setTimeout(() => this.loop(), this.base / this.speed);
    }
    pause() { this.running = false; clearTimeout(this.timer); this.emit(); }
    step() { this.pause(); this.prep(); window.Viz && Viz.finish(); this.e.step(); }
    stepInstr() { this.pause(); this.prep(); window.Viz && Viz.finish(); this.e.stepInstruction(); }
    reset() { this.pause(); window.Viz && Viz.finish(); this.prep(); this.e.reset(); }
    setSpeed(x) { this.speed = x; this.emit(); }
  }
  function bindTransport(runner, engine) {
    const root = $('.transport'); if (!root) return;
    const run = $('#btn-run'), pause = $('#btn-pause'), status = $('#sim-status');
    $$('[data-act]', root).forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'run') runner.start(); else if (a === 'pause') runner.pause(); else if (a === 'step') runner.step(); else if (a === 'stepi') runner.stepInstr(); else if (a === 'reset') runner.reset();
    }));
    const speeds = segmented($('.seg', root), 'speed', (v) => runner.setSpeed(parseFloat(v)));
    const refresh = () => {
      const s = engine.status, cyc = engine.cpu.cycle;
      const label = s === 'idle' ? 'NO PROGRAM' : s === 'finished' ? 'FINISHED' : s === 'error' ? 'ERROR' : runner.running ? 'RUNNING' : cyc > 0 ? 'PAUSED' : 'READY';
      status.textContent = label; status.dataset.state = label.toLowerCase().replace(' ', '-');
      run.hidden = runner.running; pause.hidden = !runner.running;
      const can = runner.can();
      $$('[data-act=run],[data-act=step],[data-act=stepi]', root).forEach((b) => { b.disabled = !can; });
      $('#cycle-readout').textContent = cyc;
      $('#clock-readout').textContent = fmtTime(cyc * 1000 / engine.cpu.cfg.clockMHz);
    };
    runner.on(refresh); engine.subscribe(refresh); refresh();
    document.addEventListener('keydown', (e) => {
      if (/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); runner.running ? runner.pause() : runner.start(); }
      else if (k === 'n') runner.step(); else if (k === 'i') runner.stepInstr(); else if (k === 'r') runner.reset();
    });
    return { speeds };
  }

  /* ---------- program panel: editor + load / examples / clear / error list ---------- */
  function bindProgramPanel(engine, editor, hooks) {
    hooks = hooks || {};
    let dirty = true;
    const errBox = $('#prog-errors'), count = $('#prog-count');
    function show(p) {
      errBox.innerHTML = p.ok ? '' : p.errors.map((e) => '<div class="perr"><b>' + (e.line ? 'Line ' + e.line : 'Program') + '</b> ' + esc(e.message) + '</div>').join('');
      editor.setErrors(p.ok ? [] : p.errors);
      count.textContent = p.ok ? p.program.length + ' instructions' : p.errors.length + ' error' + (p.errors.length > 1 ? 's' : '');
    }
    function load(quiet) {
      const text = editor.get(); saveProgram(text);
      const p = engine.loadProgram(text); dirty = false; show(p);
      hooks.onLoad && hooks.onLoad(p);
      if (!quiet) p.ok ? toast('Program loaded: ' + p.program.length + ' instructions', 'ok') : toast('Fix ' + p.errors.length + ' error' + (p.errors.length > 1 ? 's' : '') + ' before running', 'err');
      return p;
    }
    editor.ta.addEventListener('input', () => {
      dirty = true; clearTimeout(bindProgramPanel.t);
      bindProgramPanel.t = setTimeout(() => { const p = CPUFlow.InstructionParser.parse(editor.get()); show(p); }, 350);
    });
    $('#btn-load').addEventListener('click', () => load());
    $('#btn-clear').addEventListener('click', () => { editor.set(''); editor.focus(); dirty = true; errBox.textContent = ''; count.textContent = ''; });
    $('#btn-examples').addEventListener('click', () => {
      const list = el('div', { class: 'examples' });
      CPUFlow.Programs.forEach((pr) => list.append(el('button', { class: 'example', onclick: () => { editor.set(pr.code); closeModal(); load(); } }, el('b', { text: pr.name }), el('span', { text: pr.desc }), el('pre', { text: pr.code }))));
      openModal('Example programs', list);
    });
    return { load, ensure() { if (dirty) load(true); }, isDirty: () => dirty, show };
  }
  function bindOptions(engine, map) {
    Object.keys(map).forEach((id) => {
      const inp = $('#' + id); if (!inp) return;
      inp.checked = !!engine.cpu.cfg[map[id]];
      inp.addEventListener('change', () => { const patch = {}; patch[map[id]] = inp.checked; engine.setConfig(patch); saveConfig(engine.cpu.cfg); });
    });
  }

  /* ---------- reusable components ---------- */
  function registerBank(host) {
    const cards = [], prev = new Array(8).fill(0);
    for (let i = 0; i < 8; i++) {
      const c = el('div', { class: 'reg', 'data-info': 'r' + i, tabindex: '0', 'aria-label': 'Register R' + i }, el('span', { class: 'rn', text: 'R' + i }), el('b', { class: 'rv', text: '0' }), el('span', { class: 'rh', text: hex(0) }), el('span', { class: 'rb', text: bin16(0) }), el('span', { class: 'rc' }));
      host.append(c); cards.push(c);
    }
    return {
      update(regs, silent) {
        regs.forEach((v, i) => {
          const c = cards[i];
          c.querySelector('.rv').textContent = v; c.querySelector('.rh').textContent = hex(v); c.querySelector('.rb').textContent = bin16(v); c.querySelector('.rb').title = (v >>> 0).toString(2).padStart(32, '0');
          if (silent) { c.querySelector('.rc').textContent = ''; c.classList.remove('changed'); }
          else if (v !== prev[i]) { c.querySelector('.rc').textContent = 'OLD ' + prev[i] + ' \u2192 NEW ' + v; c.classList.remove('changed'); void c.offsetWidth; c.classList.add('changed'); }
          prev[i] = v;
        });
      }
    };
  }
  function metricStrip(host, defs) {
    const nodes = {};
    defs.forEach((d) => { const b = el('b', { text: '-' }); nodes[d.id] = b; host.append(el('div', { class: 'metric', title: d.tip || '' }, el('small', { text: d.label }), b)); });
    return (vals) => defs.forEach((d) => { if (vals[d.id] !== undefined && nodes[d.id].textContent !== String(vals[d.id])) { nodes[d.id].textContent = vals[d.id]; nodes[d.id].classList.remove('tick'); void nodes[d.id].offsetWidth; nodes[d.id].classList.add('tick'); } });
  }
  const metricValues = (m) => ({
    cycles: m.cycles, ic: m.instructionCount, cpi: fix(m.cpi), mips: fix(m.mips), time: fmtTime(m.execTimeNs), hit: pct(m.hitRatio),
    stalls: m.stalls, speedup: m.speedup === null ? '-' : fix(m.speedup) + 'x', eff: pct(m.efficiency), freq: m.clockMHz + ' MHz', fwd: m.forwards, flush: m.flushes
  });
  const METRIC_DEFS = [
    { id: 'cycles', label: 'Clock cycles' }, { id: 'ic', label: 'Instructions' }, { id: 'cpi', label: 'CPI', tip: 'Total clock cycles / instruction count' },
    { id: 'mips', label: 'MIPS', tip: 'Instruction count / (execution time x 10^6)' }, { id: 'time', label: 'Exec time', tip: 'Cycles x clock cycle time' },
    { id: 'hit', label: 'Cache hit ratio' }, { id: 'stalls', label: 'Stall cycles' }, { id: 'speedup', label: 'Speedup', tip: 'Versus the same program on the non-pipelined machine' }
  ];
  function sigRow(host) {
    const names = ['RegRead', 'RegWrite', 'ALUSrc', 'ALUOp', 'MemRead', 'MemWrite', 'MemToReg', 'Branch', 'PCWrite'], map = {};
    names.forEach((n) => { const c = el('span', { class: 'sig', 'data-name': n }, el('i'), el('span', { text: n }), el('em', { text: 'OFF' })); host.append(c); map[n] = c; });
    return (s) => names.forEach((n) => {
      const on = n === 'ALUOp' ? s.ALUOp !== '-' : !!s[n];
      map[n].classList.toggle('on', on);
      map[n].querySelector('em').textContent = n === 'ALUOp' ? s.ALUOp : on ? 'ON' : 'OFF';
    });
  }
  function memoryViewer(host, mem) {
    let base = 0, follow = true, last = null;
    const info = el('div', { class: 'mv-tools' });
    const addr = el('input', { 'aria-label': 'Go to address', placeholder: 'addr', value: '0', inputmode: 'numeric', class: 'mv-in' });
    const chk = el('input', { type: 'checkbox', checked: 'checked', id: 'mv-follow-' + Math.random().toString(36).slice(2, 6) });
    const body = el('div', { class: 'mv-grid', role: 'grid', 'aria-label': 'Memory' });
    const clamp = (b) => Math.max(0, Math.min(mem.size - 128, b));
    const go = (a) => { base = clamp(Math.floor(a / 8) * 8 - 24); render(); };
    info.append(el('button', { class: 'btn sm', text: '\u25c0', 'aria-label': 'Previous page', onclick: () => { base = clamp(base - 64); render(); } }), addr,
      el('button', { class: 'btn sm', text: 'Go', onclick: () => { const v = parseInt(addr.value, addr.value.toLowerCase().startsWith('0x') ? 16 : 10); if (!isNaN(v) && v >= 0 && v < mem.size) go(v); } }),
      el('button', { class: 'btn sm', text: '\u25b6', 'aria-label': 'Next page', onclick: () => { base = clamp(base + 64); render(); } }),
      el('label', { class: 'chk' }, chk, 'Follow access'));
    chk.addEventListener('change', () => { follow = chk.checked; });
    body.addEventListener('wheel', (e) => { e.preventDefault(); base = clamp(base + (e.deltaY > 0 ? 8 : -8)); render(); }, { passive: false });
    host.append(info, body);
    function render() {
      let h = '<div class="mv-head"><span>Address</span>' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => '<span>+' + i + '</span>').join('') + '</div>';
      for (let r = 0; r < 16; r++) {
        const a0 = base + r * 8; h += '<div class="mv-row"><span class="mv-a">' + hex(a0, 4) + '</span>';
        for (let c = 0; c < 8; c++) {
          const a = a0 + c; let cls = 'mv-c';
          if (mem.modified.has(a)) cls += ' mod';
          if (last && last.addr === a) cls += last.type === 'write' ? ' wr' : ' rd';
          h += '<span class="' + cls + '" title="' + hex(a, 4) + '">' + mem.peek(a) + '</span>';
        }
        h += '</div>';
      }
      body.innerHTML = h;
    }
    render();
    return { update(l) { last = l || null; if (follow && last && (last.addr < base || last.addr >= base + 128)) base = clamp(Math.floor(last.addr / 8) * 8 - 24); render(); }, render };
  }
  function cacheTable(host, cache, last) {
    const cfg = cache.cfg, snap = cache.snapshot(); let h = '<table class="ctable"><thead><tr><th>Set</th><th>Way</th><th>V</th><th>Tag</th><th>Block @</th><th>Data (words)</th></tr></thead><tbody>';
    snap.forEach((set, si) => set.forEach((l, wi) => {
      const hit = last && last.set === si && last.way === wi;
      h += '<tr class="' + (hit ? (last.hit ? 'hit' : 'miss') : '') + (l.valid ? '' : ' empty') + '"><td>' + (wi === 0 ? si : '') + '</td><td>' + wi + '</td><td>' + l.valid + '</td><td>' + (l.valid ? l.tag.toString(2).padStart(1, '0') + ' <i>(' + l.tag + ')</i>' : '-') + '</td><td>' + (l.valid ? l.base : '-') + '</td><td class="cd">' + (l.valid ? l.data.map((w, i) => '<span class="' + (hit && last.offset === i ? 'cur' : '') + '">' + w + '</span>').join('') : '') + '</td></tr>';
    }));
    host.innerHTML = '<div class="ct-wrap">' + h + '</tbody></table></div><p class="hint">' + cfg.lines + ' lines &middot; ' + cfg.sets + ' set' + (cfg.sets > 1 ? 's' : '') + ' &times; ' + cfg.ways + ' way' + (cfg.ways > 1 ? 's' : '') + ' &middot; ' + cfg.blockSize + '-word blocks &middot; ' + cfg.policy + '</p>';
  }
  function describeEvent(ev) {
    switch (ev.type) {
      case 'fetch': return { cls: 'fetch', text: 'FETCH I' + ev.seq + ': ' + ev.text };
      case 'decode': return { cls: 'ctl', text: 'DECODE I' + ev.seq + ': ' + (ev.active.join(' ') || 'no control signals') };
      case 'alu': return { cls: 'alu', text: 'ALU ' + ev.op + ': ' + ev.a + ', ' + ev.b + ' \u2192 ' + ev.result };
      case 'forward': return { cls: 'fwd', text: 'FORWARD ' + ev.from + ' \u2192 EX: R' + ev.reg + ' = ' + ev.value };
      case 'mem': return { cls: ev.hit ? 'hit' : 'miss', text: 'CACHE ' + (ev.hit ? 'HIT' : 'MISS') + ' \u2013 ' + ev.rw + ' M[' + ev.addr + '] = ' + ev.value };
      case 'writeback': return { cls: 'wb', text: 'R' + ev.reg + ' \u2190 ' + ev.value + '  (was ' + ev.old + ')' };
      case 'branch': return { cls: ev.taken ? 'branch' : '', text: ev.op + (ev.taken ? ' TAKEN \u2192 instruction ' + ev.n : ' not taken') };
      case 'hazard': return { cls: 'hz-' + ev.kind, text: ev.msg };
      case 'stall': return { cls: 'stall', text: 'STALL (' + ev.reason + ')' + (ev.reg !== undefined ? ' waiting for R' + ev.reg : '') };
      case 'flush': return { cls: 'hz-control', text: 'PIPELINE FLUSH: ' + ev.seqs.map((s) => 'I' + s).join(', ') + ' squashed' };
      case 'retire': return null;
      case 'error': return { cls: 'err', text: 'ERROR: ' + ev.msg };
      default: return null;
    }
  }
  const STAGE_NAMES = { IF: 'FETCH', ID: 'DECODE', EX: 'EXECUTE', MEM: 'MEMORY', WB: 'WRITE BACK' };
  function stageStrip(host) {
    const chips = {};
    Object.keys(STAGE_NAMES).forEach((k) => { const c = el('div', { class: 'stg', 'data-stage': k }, el('small', { text: STAGE_NAMES[k] }), el('b', { text: '-' })); host.append(c); chips[k] = c; });
    return (stages) => Object.keys(chips).forEach((k) => {
      const s = stages[k], c = chips[k];
      c.classList.toggle('on', !!s); c.classList.toggle('held', !!(s && s.held)); c.classList.toggle('flushed', !!(s && s.flushed));
      c.querySelector('b').textContent = s ? 'I' + s.seq + ' ' + s.text : '-';
    });
  }
  const bars = (host, items, o) => window.Charts.hbars(host, items, o);

  return { $, $$, el, esc, hex, bin16, fix, pct, fmtTime, reduced, store, loadConfig, saveConfig, loadProgram, saveProgram, INFO, showInfo, openModal, closeModal, toast, tabs, segmented, createEditor, Terminal, Runner, bindTransport, bindProgramPanel, bindOptions, registerBank, metricStrip, metricValues, METRIC_DEFS, sigRow, memoryViewer, cacheTable, describeEvent, stageStrip, STAGE_NAMES, bars };
})();

/* Shared lab bootstrap: engine + editor + program panel + runner + transport */
UI.initLab = function (o) {
  o = o || {};
  const engine = new CPUFlow.SimulationEngine(Object.assign(UI.loadConfig(), o.config || {}));
  const editor = UI.createEditor(UI.$('#editor'), { value: UI.loadProgram() || o.program || CPUFlow.Programs[0].code });
  const panel = UI.bindProgramPanel(engine, editor, { onLoad: o.onLoad });
  const runner = new UI.Runner(engine, { beforeRun: () => { if (panel.isDirty()) panel.load(true); } });
  UI.bindTransport(runner, engine);
  panel.load(true);
  return { engine, editor, panel, runner };
};
