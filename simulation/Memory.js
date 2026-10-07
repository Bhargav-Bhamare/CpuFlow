/* Word-addressed main memory. Memory[A] is initialised to A so LOAD R1, 20 yields 20. */
(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const SimError = isNode ? require('./SimError') : g.CPUFlow.SimError;
  class Memory {
    constructor(size) { this.size = size || 1024; this.data = new Int32Array(this.size); this.reset(); }
    reset() { for (let i = 0; i < this.size; i++) this.data[i] = i; this.modified = new Set(); this.last = null; this.reads = 0; this.writes = 0; }
    check(a) { if (!Number.isInteger(a) || a < 0 || a >= this.size) throw new SimError('Invalid memory address ' + a + ' (valid range 0-' + (this.size - 1) + ')', 'BAD_ADDR'); }
    read(a) { this.check(a); this.reads++; this.last = { addr: a, type: 'read', value: this.data[a] }; return this.data[a]; }
    write(a, v) { this.check(a); this.writes++; this.data[a] = v | 0; this.modified.add(a); this.last = { addr: a, type: 'write', value: this.data[a] }; }
    peek(a) { return this.data[a]; }
    readBlock(start, len) { const o = []; for (let i = 0; i < len; i++) o.push(this.data[start + i]); return o; }
  }
  if (isNode) module.exports = Memory; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.Memory = Memory; }
})(typeof window !== 'undefined' ? window : globalThis);
