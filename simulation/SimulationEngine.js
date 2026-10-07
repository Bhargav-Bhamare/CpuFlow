/* SimulationEngine - owns the clock. The UI subscribes and renders from getState(); it never mutates CPU state. */
(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const dep = (n) => (isNode ? require('./' + n) : g.CPUFlow[n]);
  const CPU = dep('CPU'), Parser = dep('InstructionParser'), PA = dep('PerformanceAnalyzer');

  class SimulationEngine {
    constructor(cfg) {
      this.cfg = CPU.mergeConfig(cfg); this.cpu = new CPU(this.cfg);
      this.listeners = []; this.source = ''; this.parsed = null; this.status = 'idle'; this.baseline = null;
    }
    subscribe(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
    notify(kind, delta) { const s = this.getState(); this.listeners.forEach((fn) => fn(s, Object.assign({ kind, events: [], micro: [] }, delta))); }
    get ok() { return !!(this.parsed && this.parsed.ok); }

    loadProgram(text) {
      this.source = text; this.parsed = Parser.parse(text);
      this.cpu.load(this.parsed.ok ? this.parsed.program : []);
      this.computeBaseline(); this.status = this.ok ? 'ready' : 'idle';
      this.notify('load', {}); return this.parsed;
    }
    computeBaseline() { this.baseline = this.ok ? PA.baseline(this.parsed.program, this.cpu.cfg) : null; }
    setConfig(patch) {
      this.cpu.configure(patch); this.cfg = this.cpu.cfg; this.computeBaseline();
      this.status = this.ok ? 'ready' : 'idle'; this.notify('config', {});
    }
    reset() { this.cpu.reset(); this.status = this.ok ? 'ready' : 'idle'; this.notify('reset', {}); }

    _advance() {
      const cpu = this.cpu;
      if (!this.ok || cpu.finished || cpu.error) return null;
      const r = cpu.step();
      if (!cpu.finished && !cpu.error && cpu.cycle >= cpu.cfg.maxCycles) {
        cpu.error = 'Cycle limit reached (' + cpu.cfg.maxCycles + ') - possible infinite loop'; r.events.push({ type: 'error', msg: cpu.error });
      }
      this.status = cpu.error ? 'error' : cpu.finished ? 'finished' : 'running';
      return r;
    }
    step() { const r = this._advance(); if (r) this.notify('step', r); return r; }
    stepInstruction() {
      const start = this.cpu.stats.retired, all = { events: [], micro: [] };
      let guard = 0, r;
      do { r = this._advance(); if (r) { all.events.push(...r.events); all.micro.push(...r.micro); } guard++; }
      while (r && this.cpu.stats.retired === start && guard < 100);
      if (guard > 1 || r) this.notify('step', all);
      return all;
    }
    finish() { let r; while ((r = this._advance())) { /* run silently */ } this.notify('finish', {}); }

    getTimeline(maxRows) { const rows = Array.from(this.cpu.pipe.rows.values()); return rows.slice(-(maxRows || 16)); }
    getState() {
      const c = this.cpu, S = c.lastOcc || { IF: null, ID: null, EX: null, MEM: null, WB: null };
      const stages = {};
      Object.keys(S).forEach((k) => { const d = S[k]; stages[k] = d ? { seq: d.seq, n: d.ins.n, text: d.ins.text, held: c.pipe.S[k] === d, flushed: d.flushed } : null; });
      return {
        pc: c.pc, ir: c.ir ? c.ir.text : null, cir: c.cir ? c.cir.ins.text : null, mar: c.mar, mdr: c.mdr,
        registers: c.regs.snapshot(), flags: Object.assign({}, c.flags), alu: { op: c.alu.op, a: c.alu.a, b: c.alu.b, result: c.alu.result, flags: Object.assign({}, c.alu.flags) },
        signals: Object.assign({}, c.signals), cycle: c.cycle, stats: c.stats, metrics: PA.metrics(c, this.baseline),
        stages, memOp: c.memOp, lastCache: c.cache.last, cacheCfg: c.cache.cfg, status: this.status, error: c.error,
        config: c.cfg, finished: c.finished, programLength: c.program.length, program: c.program, parseErrors: this.parsed ? this.parsed.errors : []
      };
    }
  }
  if (isNode) module.exports = SimulationEngine; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.SimulationEngine = SimulationEngine; }
})(typeof window !== 'undefined' ? window : globalThis);
