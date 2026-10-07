(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  class SimError extends Error {
    constructor(message, code) { super(message); this.name = 'SimError'; this.code = code || 'SIM_ERROR'; }
  }
  if (isNode) module.exports = SimError; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.SimError = SimError; }
})(typeof window !== 'undefined' ? window : globalThis);
