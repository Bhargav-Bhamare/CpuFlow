(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  class RegisterFile {
    constructor(n) { this.n = n || 8; this.reset(); }
    reset() { this.r = new Array(this.n).fill(0); this.last = null; }
    read(i) { return this.r[i]; }
    write(i, v) { const old = this.r[i]; this.r[i] = v | 0; this.last = { reg: i, old, value: this.r[i] }; return this.last; }
    snapshot() { return this.r.slice(); }
  }
  if (isNode) module.exports = RegisterFile; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.RegisterFile = RegisterFile; }
})(typeof window !== 'undefined' ? window : globalThis);
