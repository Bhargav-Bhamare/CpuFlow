/* Configurable L1 data cache: direct / fully associative / set associative, FIFO or LRU, write-through + write-allocate. */
(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const clampPow2 = (n, lo, hi) => { n = Math.max(lo, Math.min(hi, (n | 0) || lo)); let p = lo; while (p * 2 <= n) p *= 2; return p; };

  class Cache {
    constructor(cfg, mem) { this.mem = mem; this.configure(cfg); }
    static normalize(c) {
      c = c || {};
      const lines = clampPow2(c.lines || 8, 2, 64), blockSize = clampPow2(c.blockSize || 4, 1, 16);
      const mapping = ['direct', 'fully', 'set'].includes(c.mapping) ? c.mapping : 'direct';
      const ways = mapping === 'direct' ? 1 : mapping === 'fully' ? lines : Math.min(clampPow2(c.ways || 2, 2, 16), lines);
      return { mapping, lines, blockSize, ways, sets: lines / ways, policy: c.policy === 'FIFO' ? 'FIFO' : 'LRU', hitTime: 1, missPenalty: Math.max(1, Math.min(50, (c.missPenalty | 0) || 4)) };
    }
    configure(cfg) { this.cfg = Cache.normalize(cfg); this.reset(); }
    reset() {
      const { sets, ways, blockSize } = this.cfg;
      this.sets = Array.from({ length: sets }, () => Array.from({ length: ways }, () => ({ valid: 0, tag: 0, base: 0, data: new Array(blockSize).fill(0), loaded: 0, used: 0 })));
      this.clock = 0; this.accesses = 0; this.hits = 0; this.misses = 0; this.series = []; this.last = null;
    }
    decompose(addr) {
      const { blockSize, sets } = this.cfg, block = Math.floor(addr / blockSize);
      return { offset: addr % blockSize, block, index: block % sets, tag: Math.floor(block / sets) };
    }
    access(addr, isWrite, value) {
      this.mem.check(addr);
      const d = this.decompose(addr), set = this.sets[d.index], cfg = this.cfg;
      this.clock++; this.accesses++;
      let way = set.findIndex((l) => l.valid && l.tag === d.tag);
      const hit = way >= 0; let evicted = null;
      if (hit) this.hits++;
      else {
        this.misses++;
        way = set.findIndex((l) => !l.valid);
        if (way < 0) {
          way = 0;
          const key = cfg.policy === 'FIFO' ? 'loaded' : 'used';
          for (let i = 1; i < set.length; i++) if (set[i][key] < set[way][key]) way = i;
          evicted = { tag: set[way].tag, base: set[way].base, way };
        }
        const l = set[way];
        l.valid = 1; l.tag = d.tag; l.base = d.block * cfg.blockSize; l.data = this.mem.readBlock(l.base, cfg.blockSize); l.loaded = this.clock;
      }
      const line = set[way]; line.used = this.clock;
      let out;
      if (isWrite) { line.data[d.offset] = value | 0; this.mem.write(addr, value); out = value | 0; } else out = line.data[d.offset];
      const res = { hit, set: d.index, way, tag: d.tag, offset: d.offset, block: d.block, addr, write: !!isWrite, value: out, evicted, latency: hit ? cfg.hitTime : cfg.hitTime + cfg.missPenalty };
      this.last = res; this.series.push(hit ? 1 : 0); if (this.series.length > 500) this.series.shift();
      return res;
    }
    metrics() {
      const a = this.accesses, mr = a ? this.misses / a : 0;
      return { accesses: a, hits: this.hits, misses: this.misses, hitRatio: a ? this.hits / a : null, missRatio: a ? mr : null, amat: this.cfg.hitTime + mr * this.cfg.missPenalty };
    }
    snapshot() { return this.sets.map((s) => s.map((l) => ({ valid: l.valid, tag: l.tag, base: l.base, data: l.data.slice() }))); }
  }
  if (isNode) module.exports = Cache; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.Cache = Cache; }
})(typeof window !== 'undefined' ? window : globalThis);
