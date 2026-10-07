(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const dep = (n) => (isNode ? require('./' + n) : g.CPUFlow[n]);
  const RegisterFile = dep('RegisterFile'), ALU = dep('ALU'), Memory = dep('Memory'), Cache = dep('Cache'), ControlUnit = dep('ControlUnit'), Pipeline = dep('Pipeline'), SimError = dep('SimError');

  const DEFAULTS = { pipelined: false, forwarding: true, unifiedMemory: false, clockMHz: 100, controlMode: 'hardwired', maxCycles: 5000, cache: { mapping: 'direct', lines: 8, blockSize: 4, ways: 2, policy: 'LRU', missPenalty: 4 } };
  function mergeConfig(a, b) {
    const o = Object.assign({}, DEFAULTS, a || {}, b || {});
    o.cache = Cache.normalize(Object.assign({}, DEFAULTS.cache, (a && a.cache) || {}, (b && b.cache) || {}));
    o.pipelined = !!o.pipelined; o.forwarding = !!o.forwarding; o.unifiedMemory = !!o.unifiedMemory;
    o.clockMHz = Math.max(1, Math.min(5000, +o.clockMHz || 100));
    o.controlMode = o.controlMode === 'microprogrammed' ? 'microprogrammed' : 'hardwired';
    o.maxCycles = Math.max(10, Math.min(100000, +o.maxCycles || 5000));
    return o;
  }
  const newStats = () => ({ cycles: 0, retired: 0, dataStalls: 0, structStalls: 0, memStalls: 0, controlStalls: 0, flushes: 0, forwards: 0, dataHazards: 0, controlHazards: 0, structHazards: 0, branches: 0, taken: 0, mix: { alu: 0, load: 0, store: 0, branch: 0, other: 0 }, stageBusy: { IF: 0, ID: 0, EX: 0, MEM: 0, WB: 0 } });

  class CPU {
    constructor(cfg) {
      this.cfg = mergeConfig(cfg);
      this.regs = new RegisterFile(8); this.mem = new Memory(1024); this.cache = new Cache(this.cfg.cache, this.mem);
      this.alu = new ALU(); this.cu = new ControlUnit(); this.pipe = new Pipeline(this);
      this.program = []; this.record = true; this.reset();
    }
    reset() {
      this.regs.reset(); this.mem.reset(); this.cache.reset(); this.alu.reset(); this.pipe.reset();
      this.pc = 0; this.ir = null; this.cir = null; this.mar = 0; this.mdr = 0; this.flags = { Z: 0, N: 0, C: 0, V: 0 };
      this.signals = this.cu.signals(null); this.cycle = 0; this.halted = false; this.finished = false; this.error = null;
      this.memOp = null; this.accessLog = []; this.lastOcc = null; this.stats = newStats();
    }
    configure(cfg) { this.cfg = mergeConfig(this.cfg, cfg); this.cache.configure(this.cfg.cache); this.reset(); }
    load(program) { this.program = program || []; this.reset(); }
    step() {
      if (this.finished || this.error) return { events: [], micro: [] };
      this.cycle++; this.stats.cycles = this.cycle;
      let r;
      try { r = this.pipe.step(); } catch (e) {
        if (!(e instanceof SimError)) throw e;
        this.error = e.message; r = { events: [{ type: 'error', msg: e.message }], micro: [{ cycle: this.cycle, stage: 'ERROR', seq: 0, n: 0, text: e.message, kind: 'err' }] };
      }
      if (!this.error && (this.halted || this.pipe.done())) this.finished = true;
      return r;
    }
  }
  CPU.mergeConfig = mergeConfig; CPU.DEFAULTS = DEFAULTS;
  if (isNode) module.exports = CPU; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.CPU = CPU; }
})(typeof window !== 'undefined' ? window : globalThis);
