/* visualization.js - SVG scenes + animation driver. Animations are *played from simulation events*; values always re-sync from state. */
window.Viz = (function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs, parent, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- tween manager (single rAF loop) ---------- */
  const tweens = new Set(); let raf = null;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  function tick(now) {
    raf = null;
    Array.from(tweens).forEach((tw) => {
      if (now < tw.t0) return;
      const p = Math.min(1, (now - tw.t0) / tw.dur);
      if (tw.fn) tw.fn(ease(p));
      if (p >= 1) { tweens.delete(tw); if (tw.end) tw.end(); }
    });
    if (tweens.size) raf = requestAnimationFrame(tick);
  }
  function add(delay, dur, fn, end) {
    const tw = { t0: performance.now() + delay, dur: Math.max(1, dur), fn, end }; tweens.add(tw);
    if (!raf) raf = requestAnimationFrame(tick); return tw;
  }
  function finish() {
    for (let k = 0; k < 8 && tweens.size; k++) { const arr = Array.from(tweens); tweens.clear(); arr.forEach((tw) => { if (tw.fn) tw.fn(1); if (tw.end) tw.end(); }); }
  }

  /* ---------- Scene ---------- */
  class Scene {
    constructor(svg, def) {
      this.svg = svg; this.def = def; this.n = {}; this.l = {}; this.t = {}; this.v = {};
      svg.textContent = ''; svg.setAttribute('viewBox', '0 0 ' + def.w + ' ' + def.h); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      if (def.minWidth) svg.style.minWidth = def.minWidth + 'px';
      const defs = S('defs', {}, svg);
      const mk = S('marker', { id: 'arr-' + (def.id || 'x'), viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      S('path', { d: 'M0,0 L8,4 L0,8 z', class: 'arrowhead' }, mk);
      this.gDeco = S('g', {}, svg); this.gLinks = S('g', {}, svg); this.gNodes = S('g', {}, svg); this.gPkt = S('g', { 'pointer-events': 'none' }, svg);
      (def.deco || []).forEach((d) => S(d.tag, d.attrs, this.gDeco, d.text));
      (def.links || []).forEach((k) => {
        const d = 'M' + k.pts.map((p) => p.join(',')).join(' L');
        const p = S('path', { d, class: 'link ' + (k.cls || ''), 'marker-end': k.noArrow ? '' : 'url(#arr-' + (def.id || 'x') + ')' }, this.gLinks);
        this.l[k.id] = { el: p, pts: k.pts, from: k.from, to: k.to };
        if (k.label) S('text', { x: k.lx, y: k.ly, class: 'linklabel' }, this.gLinks, k.label);
      });
      (def.nodes || []).forEach((n) => this.addNode(n));
      (def.texts || []).forEach((t) => { this.t[t.id] = S('text', { x: t.x, y: t.y, class: 'stxt ' + (t.cls || ''), 'text-anchor': t.a || 'middle' }, this.gNodes, t.text || ''); });
    }
    addNode(n) {
      const g = S('g', { class: 'node ' + (n.cls || ''), 'data-id': n.id, transform: '' }, this.gNodes);
      if (n.tip) { g.setAttribute('data-info', n.tip); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', (n.label || n.id) + ' - click for details'); }
      if (n.shape === 'alu') S('polygon', { class: 'nbox', points: [[n.x, n.y], [n.x + n.w, n.y + 32], [n.x + n.w, n.y + n.h - 32], [n.x, n.y + n.h], [n.x, n.y + n.h * 0.62], [n.x + 20, n.y + n.h / 2], [n.x, n.y + n.h * 0.38]].map((p) => p.join(',')).join(' ') }, g);
      else S('rect', { class: 'nbox', x: n.x, y: n.y, width: n.w, height: n.h, rx: n.rx === undefined ? 8 : n.rx }, g);
      if (n.label) S('text', { class: 'nlabel', x: n.center ? n.x + n.w / 2 : n.x + 8, y: n.y + 15, 'text-anchor': n.center ? 'middle' : 'start' }, g, n.label);
      if (n.value !== undefined) this.v[n.id] = S('text', { class: 'nvalue', x: n.x + n.w / 2, y: n.y + n.h / 2 + 6, 'text-anchor': 'middle' }, g, n.value);
      if (n.sub !== undefined) this.v[n.id + ':sub'] = S('text', { class: 'nsub', x: n.x + n.w / 2, y: n.y + n.h - 7, 'text-anchor': 'middle' }, g, n.sub);
      this.n[n.id] = g; return g;
    }
    has(id) { return !!(this.n[id] || this.l[id]); }
    val(id, text) { if (this.v[id]) this.v[id].textContent = text; else if (this.t[id]) this.t[id].textContent = text; }
    sub(id, text) { if (this.v[id + ':sub']) this.v[id + ':sub'].textContent = text; }
    T(delay, fn) { add(delay, 1, null, fn); }
    act(id, tone, delay, dur) {
      const g = this.n[id]; if (!g) return; const c = 'on-' + (tone || 'cyan');
      this.T(delay || 0, () => g.classList.add(c)); this.T((delay || 0) + (dur || 400), () => g.classList.remove(c));
    }
    hold(id, tone, on) { const g = this.n[id]; if (g) g.classList.toggle('on-' + tone, on); }
    glow(id, tone, delay, dur) {
      const k = this.l[id]; if (!k) return; const c = 'glow-' + (tone || 'cyan');
      this.T(delay || 0, () => k.el.classList.add(c)); this.T((delay || 0) + (dur || 400), () => k.el.classList.remove(c));
    }
    banner(text, tone) {
      const b = this.n.banner; if (!b) return; const tx = this.v.banner;
      b.className.baseVal = 'node banner ' + (text ? 'show tone-' + (tone || 'amber') : ''); tx.textContent = text || '';
    }
    /* move a labelled packet along a link; rev=true flows backwards */
    send(id, o) {
      const k = this.l[id]; if (!k) return; o = o || {};
      const delay = o.delay || 0, dur = o.dur || 400, tone = o.tone || 'cyan';
      this.glow(id, tone, delay, dur + 120);
      if (reduced()) { if (o.onEnd) this.T(delay, o.onEnd); return; }
      const pts = o.rev ? k.pts.slice().reverse() : k.pts, seg = [], tot = pts.reduce((a, p, i) => { if (!i) return 0; const d = Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); seg.push(d); return a + d; }, 0);
      let g = null; const txt = String(o.text === undefined ? '' : o.text), w = Math.max(16, txt.length * 6.4 + 10);
      add(delay, dur, (p) => {
        if (!g) { g = S('g', { class: 'pkt tone-' + tone }, this.gPkt); S('rect', { x: -w / 2, y: -9, width: w, height: 18, rx: 5 }, g); S('text', { 'text-anchor': 'middle', y: 4 }, g, txt); }
        let d = p * tot, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const a = pts[i], b = pts[i + 1] || a, f = seg[i] ? Math.min(1, d / seg[i]) : 1;
        g.setAttribute('transform', 'translate(' + (a[0] + (b[0] - a[0]) * f) + ',' + (a[1] + (b[1] - a[1]) * f) + ')');
      }, () => { if (g) g.remove(); if (o.onEnd) o.onEnd(); });
    }
    reset() { Object.values(this.n).forEach((g) => { g.setAttribute('class', g.getAttribute('class').replace(/\bon-\w+/g, '')); }); Object.values(this.l).forEach((k) => { k.el.setAttribute('class', k.el.getAttribute('class').replace(/\bglow-\w+/g, '')); }); this.banner(''); this.gPkt.textContent = ''; }
  }
  // Enter/Space on a focused node opens its info popover
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('data-info') && e.target.namespaceURI === NS) {
      e.preventDefault(); const r = e.target.getBoundingClientRect(); UI.showInfo(e.target.getAttribute('data-info'), r.left + r.width / 2, r.top + r.height / 2);
    }
  });

  /* ---------- CPU datapath scene ---------- */
  const CPU_LINKS = {
    pcIM: [[130, 53], [180, 53]], imIR: [[350, 53], [410, 53]], irCU: [[510, 53], [580, 53]],
    ctlRF: [[610, 110], [610, 138], [165, 138], [165, 160]], ctlALU: [[690, 110], [690, 150], [475, 150], [475, 186]], ctlMEM: [[760, 110], [760, 372], [475, 372], [475, 410]],
    rfA: [[300, 225], [400, 225]], rfB: [[300, 290], [400, 290]], aluFlags: [[550, 233], [590, 233]],
    wb: [[550, 300], [585, 300], [585, 395], [165, 395], [165, 356]], aluMAR: [[550, 312], [660, 312], [660, 392]],
    marCache: [[610, 420], [550, 420]], cacheMDR: [[550, 458], [610, 458]], cacheMem: [[475, 468], [475, 516]],
    mdrRF: [[660, 488], [660, 590], [110, 590], [110, 356]], fwd: [[550, 262], [572, 262], [572, 340], [350, 340], [350, 258], [400, 258]], aluPC: [[400, 200], [335, 200], [335, 112], [80, 112], [80, 78]]
  };
  function cpuDef() {
    const nodes = [
      { id: 'pc', x: 30, y: 28, w: 100, h: 50, label: 'PC', value: '0', tip: 'pc' }, { id: 'im', x: 180, y: 22, w: 170, h: 62, label: 'Instruction Memory', sub: 'program', tip: 'im' },
      { id: 'ir', x: 410, y: 28, w: 100, h: 50, label: 'IR', value: '-', tip: 'ir' }, { id: 'cu', x: 580, y: 18, w: 200, h: 92, label: 'Control Unit', value: '-', sub: 'idle', tip: 'cu' },
      { id: 'rf', x: 30, y: 160, w: 270, h: 196, label: 'Register File', tip: 'rf', cls: 'container' },
      { id: 'alu', x: 400, y: 186, w: 150, h: 136, shape: 'alu', tip: 'alu' }, { id: 'flags', x: 590, y: 204, w: 130, h: 58, label: 'FLAGS', value: 'Z0 N0 C0 V0', tip: 'flags' },
      { id: 'cache', x: 400, y: 410, w: 150, h: 58, label: 'L1 Cache', sub: 'idle', tip: 'cache' }, { id: 'mem', x: 400, y: 516, w: 150, h: 56, label: 'Main Memory', sub: 'idle', tip: 'mem' },
      { id: 'mar', x: 610, y: 392, w: 100, h: 40, label: 'MAR', value: '-', tip: 'mar' }, { id: 'mdr', x: 610, y: 448, w: 100, h: 40, label: 'MDR', value: '-', tip: 'mdr' }
    ];
    for (let i = 0; i < 8; i++) nodes.push({ id: 'r' + i, x: 40 + (i % 4) * 64, y: 192 + Math.floor(i / 4) * 78, w: 58, h: 70, label: 'R' + i, value: '0', sub: '', tip: 'rf', cls: 'cell', center: true, rx: 6 });
    nodes.push({ id: 'banner', x: 600, y: 524, w: 300, h: 46, value: '', cls: 'banner' });
    const links = Object.keys(CPU_LINKS).map((id) => ({ id, pts: CPU_LINKS[id], cls: id.indexOf('ctl') === 0 ? 'ctl' : id === 'fwd' ? 'fwdlink' : '' }));
    const texts = [
      { id: 'aluT', x: 475, y: 214, text: 'ALU', cls: 'alu-t' }, { id: 'aluOp', x: 475, y: 238, text: '-', cls: 'alu-op' }, { id: 'aluA', x: 478, y: 262, text: 'A: -', cls: 'alu-v' },
      { id: 'aluB', x: 478, y: 281, text: 'B: -', cls: 'alu-v' }, { id: 'aluR', x: 478, y: 303, text: 'R: -', cls: 'alu-r' },
      { id: 'lA', x: 310, y: 219, text: 'A', cls: 'port', a: 'start' }, { id: 'lB', x: 310, y: 284, text: 'B', cls: 'port', a: 'start' }
    ];
    return { id: 'cpu', w: 920, h: 610, minWidth: 760, nodes, links, texts };
  }
  const cpuIds = { rf: (r) => 'r' + r };
  function createCpuScene(svg) { const s = new Scene(svg, cpuDef()); s.ids = cpuIds; s.kind = 'cpu'; return s; }

  /* ---------- Architecture scene (also used by the architecture page) ---------- */
  function archDef() {
    const nodes = [
      { id: 'cu', x: 50, y: 60, w: 170, h: 70, label: 'Control Unit', value: '', tip: 'cu' }, { id: 'rf', x: 50, y: 250, w: 170, h: 90, label: 'Registers', value: 'R0-R7', tip: 'rf' },
      { id: 'alu', x: 280, y: 160, w: 150, h: 120, shape: 'alu', tip: 'alu' },
      { id: 'cache', x: 540, y: 140, w: 170, h: 64, label: 'L1 Cache', sub: 'idle', tip: 'cache' }, { id: 'mem', x: 540, y: 250, w: 170, h: 64, label: 'Main Memory', sub: 'idle', tip: 'mem' },
      { id: 'io', x: 540, y: 360, w: 170, h: 64, label: 'I/O Controller', tip: 'io' }, { id: 'dev', x: 760, y: 360, w: 110, h: 64, label: 'Peripheral', tip: 'dev' },
      { id: 'banner', x: 540, y: 20, w: 330, h: 40, value: '', cls: 'banner' }
    ];
    const L = [
      { id: 'ctlRF', from: 'cu', to: 'rf', pts: [[135, 130], [135, 250]], cls: 'ctl' }, { id: 'ctlALU', from: 'cu', to: 'alu', pts: [[220, 85], [355, 85], [355, 160]], cls: 'ctl' },
      { id: 'ctlMEM', from: 'cu', to: 'cache', pts: [[220, 70], [625, 70], [625, 140]], cls: 'ctl' },
      { id: 'rfA', from: 'rf', to: 'alu', pts: [[220, 265], [250, 265], [250, 205], [290, 205]] }, { id: 'rfB', from: 'rf', to: 'alu', pts: [[220, 290], [265, 290], [265, 235], [290, 235]] },
      { id: 'wb', from: 'alu', to: 'rf', pts: [[355, 280], [355, 315], [220, 315]] },
      { id: 'aluMAR', from: 'alu', to: 'cache', pts: [[430, 200], [540, 172]] }, { id: 'cacheMem', from: 'cache', to: 'mem', pts: [[625, 204], [625, 250]] },
      { id: 'mdrRF', from: 'cache', to: 'rf', pts: [[540, 190], [480, 190], [480, 340], [135, 340], [135, 340]], noArrow: true },
      { id: 'busIO', from: 'cpu', to: 'io', pts: [[470, 392], [540, 392]] }, { id: 'ioDev', from: 'io', to: 'dev', pts: [[710, 392], [760, 392]] },
      { id: 'memIO', from: 'mem', to: 'io', pts: [[740, 282], [740, 330], [700, 330], [700, 360]], cls: 'ctl' }
    ];
    const deco = [
      { tag: 'rect', attrs: { x: 20, y: 24, width: 450, height: 420, rx: 14, class: 'cpu-box' } }, { tag: 'text', attrs: { x: 34, y: 44, class: 'cpu-title' }, text: 'CPU' },
      { tag: 'text', attrs: { x: 540, y: 120, class: 'zone' }, text: 'Memory subsystem' }, { tag: 'text', attrs: { x: 540, y: 345, class: 'zone' }, text: 'Input / Output' }
    ];
    return { id: 'arch', w: 900, h: 460, minWidth: 640, nodes, links: L, deco, texts: [{ id: 'aluT', x: 355, y: 205, text: 'ALU', cls: 'alu-t' }, { id: 'aluOp', x: 358, y: 232, text: '-', cls: 'alu-op' }] };
  }
  function createArchScene(svg) { const s = new Scene(svg, archDef()); s.ids = { rf: () => 'rf' }; s.kind = 'arch'; return s; }

  /* ---------- play one cycle's events on a scene ---------- */
  function play(scene, events, state, dur) {
    const D = (f) => f * dur, rfId = (r) => scene.ids.rf(r);
    let banner = null; const setB = (text, tone, prio) => { if (!banner || prio >= banner.prio) banner = { text, tone, prio }; };
    scene.banner('');
    events.forEach((ev) => {
      switch (ev.type) {
        case 'fetch':
          scene.act('pc', 'cyan', 0, D(0.45)); scene.send('pcIM', { text: 'PC=' + ev.pc, dur: D(0.4), onEnd: () => scene.val('pc', ev.pc + 1) });
          scene.act('im', 'cyan', D(0.4), D(0.4)); scene.send('imIR', { text: ev.text, delay: D(0.4), dur: D(0.4), onEnd: () => scene.val('ir', ev.text) }); scene.act('ir', 'cyan', D(0.8), D(0.2));
          if (scene.kind === 'arch') { scene.act('mem', 'cyan', 0, D(0.6)); scene.act('cu', 'cyan', D(0.5), D(0.4)); }
          break;
        case 'decode': {
          const s = ev.signals;
          scene.send('irCU', { text: ev.text, tone: 'purple', dur: D(0.4) }); scene.act('cu', 'purple', D(0.3), D(0.6));
          scene.T(D(0.4), () => { scene.val('cu', s.ALUOp !== '-' ? 'ALUOp: ' + s.ALUOp : 'no ALU op'); scene.sub('cu', ev.active.filter((a) => a.indexOf('ALUOp') < 0).join(' ') || 'no other signals'); });
          if (s.RegRead || s.RegWrite) scene.glow('ctlRF', 'purple', D(0.4), D(0.5));
          if (s.ALUOp !== '-') scene.glow('ctlALU', 'purple', D(0.4), D(0.5));
          if (s.MemRead || s.MemWrite) scene.glow('ctlMEM', 'purple', D(0.4), D(0.5));
          if (s.Branch || s.PCWrite) scene.glow('aluPC', 'purple', D(0.4), D(0.4));
          break;
        }
        case 'regread':
          ev.reads.forEach((r) => {
            const lk = r.to === 'A' ? 'rfA' : 'rfB';
            scene.act(rfId(r.reg), 'cyan', D(0.1), D(0.6));
            scene.send(lk, { text: r.value, delay: D(0.15), dur: D(0.45), onEnd: () => scene.val(r.to === 'A' ? 'aluA' : 'aluB', (r.to === 'A' ? 'A: ' : 'B: ') + r.value) });
          });
          break;
        case 'alu':
          scene.act('alu', 'amber', D(0.2), D(0.6));
          scene.T(D(0.25), () => { scene.val('aluOp', ev.op); scene.val('aluA', 'A: ' + ev.a); scene.val('aluB', 'B: ' + ev.b); });
          scene.T(D(0.6), () => { scene.val('aluR', 'R: ' + ev.result); scene.val('flags', 'Z' + ev.flags.Z + ' N' + ev.flags.N + ' C' + ev.flags.C + ' V' + ev.flags.V); });
          scene.send('aluFlags', { text: 'Z' + ev.flags.Z, delay: D(0.5), dur: D(0.3), tone: 'amber' }); scene.act('flags', 'amber', D(0.7), D(0.3));
          if (scene.kind === 'arch') scene.act('alu', 'amber', 0, D(0.6));
          break;
        case 'forward':
          scene.send('fwd', { text: 'FWD ' + ev.value, tone: 'amber', delay: D(0.1), dur: D(0.5) }); setB('FORWARDING ' + ev.from + ' \u2192 ALU: R' + ev.reg + ' = ' + ev.value, 'amber', 2); break;
        case 'mem': {
          const hit = ev.hit, tone = hit ? 'green' : 'red';
          scene.send('aluMAR', { text: 'addr ' + ev.addr, delay: 0, dur: D(0.3) }); scene.act('mar', 'cyan', D(0.25), D(0.3)); scene.T(D(0.3), () => scene.val('mar', ev.addr));
          scene.send('marCache', { text: 'lookup', delay: D(0.3), dur: D(0.25) });
          scene.act('cache', tone, D(0.5), D(0.5)); scene.T(D(0.5), () => scene.sub('cache', (hit ? 'HIT' : 'MISS') + ' set ' + ev.cache.set));
          let t = 0.55;
          if (!hit) { scene.send('cacheMem', { text: 'block ' + ev.cache.block, tone: 'amber', delay: D(t), dur: D(0.2) }); scene.act('mem', 'amber', D(t), D(0.3)); t += 0.2; scene.send('cacheMem', { text: 'data', rev: true, tone: 'amber', delay: D(t), dur: D(0.2) }); t += 0.2; }
          if (ev.rw === 'READ') scene.send('cacheMDR', { text: ev.value, delay: D(Math.min(t, 0.8)), dur: D(0.25), onEnd: () => scene.val('mdr', ev.value) });
          else { scene.T(D(0.3), () => scene.val('mdr', ev.value)); if (hit) { scene.send('cacheMem', { text: ev.value, tone: 'cyan', delay: D(0.6), dur: D(0.25) }); scene.act('mem', 'cyan', D(0.7), D(0.3)); } }
          scene.T(D(0.8), () => scene.sub('mem', 'M[' + ev.addr + ']' + (ev.rw === 'WRITE' ? ' \u2190 ' : ' = ') + ev.value));
          setB('CACHE ' + (hit ? 'HIT' : 'MISS') + (hit ? '' : ' \u2192 fetch block from memory'), hit ? 'green' : 'red', 1);
          break;
        }
        case 'writeback': {
          const lk = ev.from === 'MDR' && scene.has('mdrRF') ? 'mdrRF' : 'wb', cell = rfId(ev.reg);
          scene.act('alu', 'cyan', 0, D(0.2));
          scene.send(lk, { text: ev.value, tone: 'green', delay: D(0.1), dur: D(0.65), onEnd: () => { scene.val(cell, ev.value); scene.sub(cell, ev.old + ' \u2192 ' + ev.value); } });
          scene.act(cell, 'green', D(0.7), D(0.5)); break;
        }
        case 'branch':
          if (ev.taken) { scene.send('aluPC', { text: 'PC\u2190' + ev.target, tone: 'green', delay: D(0.2), dur: D(0.5), onEnd: () => scene.val('pc', ev.target) }); scene.act('pc', 'green', D(0.6), D(0.3)); setB(ev.op + ' taken \u2192 instruction ' + ev.n, 'green', 1); }
          else setB(ev.op + ' not taken', 'cyan', 0);
          break;
        case 'stall': setB(ev.reason === 'data' ? 'STALL: waiting for R' + ev.reg : ev.reason === 'memory' ? 'STALL: waiting for main memory' : 'STALL: memory port busy', 'amber', 3); scene.act('ir', 'amber', 0, D(0.9)); break;
        case 'hazard': setB(ev.kind === 'data' ? 'DATA HAZARD DETECTED' : ev.kind === 'control' ? 'CONTROL HAZARD' : 'STRUCTURAL HAZARD', ev.kind === 'control' ? 'red' : 'amber', 4); break;
        case 'flush': setB('PIPELINE FLUSH', 'red', 5); scene.act('ir', 'red', 0, D(0.9)); scene.act('pc', 'red', 0, D(0.5)); break;
        case 'error': setB('ERROR: ' + ev.msg, 'red', 9); break;
        default: break;
      }
    });
    if (banner) scene.banner(banner.text, banner.tone);
    scene.T(dur, () => sync(scene, state));
  }
  function sync(scene, st) {
    scene.val('pc', st.pc); scene.val('ir', st.ir || '-'); scene.val('mar', st.cycle ? st.mar : '-'); scene.val('mdr', st.cycle ? st.mdr : '-');
    if (scene.kind === 'cpu') st.registers.forEach((v, i) => scene.val('r' + i, v));
    scene.val('aluOp', st.alu.op); scene.val('aluA', 'A: ' + (st.alu.op === '-' ? '-' : st.alu.a)); scene.val('aluB', 'B: ' + (st.alu.op === '-' ? '-' : st.alu.b)); scene.val('aluR', 'R: ' + (st.alu.op === '-' ? '-' : st.alu.result));
    scene.val('flags', 'Z' + st.flags.Z + ' N' + st.flags.N + ' C' + st.flags.C + ' V' + st.flags.V);
    scene.val('cu', st.signals.ALUOp !== '-' ? 'ALUOp: ' + st.signals.ALUOp : st.cycle ? 'no ALU op' : '-');
    if (st.lastCache) scene.sub('cache', (st.lastCache.hit ? 'HIT' : 'MISS') + ' set ' + st.lastCache.set); else scene.sub('cache', 'idle');
    if (st.memOp) scene.sub('mem', 'M[' + st.memOp.addr + ']' + (st.memOp.rw === 'WRITE' ? ' \u2190 ' : ' = ') + st.memOp.value); else scene.sub('mem', 'idle');
  }
  function resetScene(scene, st) { finish(); scene.reset(); if (scene.kind === 'cpu') for (let i = 0; i < 8; i++) scene.sub('r' + i, ''); scene.sub('cu', 'idle'); sync(scene, st); }

  return { Scene, add, finish, createCpuScene, createArchScene, play, sync, resetScene, reduced, S };
})();
