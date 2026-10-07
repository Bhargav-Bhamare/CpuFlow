(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const SimError = isNode ? require('./SimError') : g.CPUFlow.SimError;

  class ALU {
    constructor() { this.reset(); }
    reset() { this.op = '-'; this.a = 0; this.b = 0; this.result = 0; this.flags = { Z: 0, N: 0, C: 0, V: 0 }; }
    static compute(op, a, b) {
      let r = 0, C = 0, V = 0;
      switch (op) {
        case 'ADD': r = (a + b) | 0; C = (a >>> 0) + (b >>> 0) > 0xFFFFFFFF ? 1 : 0; V = ((a ^ r) & (b ^ r)) < 0 ? 1 : 0; break;
        case 'SUB': r = (a - b) | 0; C = (a >>> 0) < (b >>> 0) ? 1 : 0; V = ((a ^ b) & (a ^ r)) < 0 ? 1 : 0; break;
        case 'MUL': r = Math.imul(a, b); C = a * b !== r ? 1 : 0; V = C; break;
        case 'DIV': if (b === 0) throw new SimError('Division by zero', 'DIV0'); r = Math.trunc(a / b) | 0; break;
        case 'AND': r = a & b; break;
        case 'OR': r = a | b; break;
        case 'XOR': r = a ^ b; break;
        case 'PASS': r = b | 0; break;
        default: throw new SimError('ALU: unsupported operation ' + op);
      }
      return { result: r, flags: { Z: r === 0 ? 1 : 0, N: r < 0 ? 1 : 0, C, V } };
    }
    execute(op, a, b) {
      const r = ALU.compute(op, a, b);
      this.op = op; this.a = a; this.b = b; this.result = r.result; this.flags = r.flags;
      return r;
    }
  }
  if (isNode) module.exports = ALU; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.ALU = ALU; }
})(typeof window !== 'undefined' ? window : globalThis);
