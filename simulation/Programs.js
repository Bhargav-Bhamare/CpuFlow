(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const Programs = [
    { id: 'arith', name: 'Basic Arithmetic', desc: 'Loads, ALU operations and a store - the plain instruction cycle.', code: 'LOAD R1, 10\nLOAD R2, 20\nADD R3, R1, R2\nSUB R4, R3, R1\nSTORE R4, 100' },
    { id: 'memory', name: 'Memory Access', desc: 'Store to memory, then read it back through the cache.', code: 'LOAD R1, 100\nSTORE R1, 200\nLOAD R2, 200' },
    { id: 'hazard', name: 'Dependency / Hazard Demo', desc: 'Back-to-back RAW dependencies. Enable the pipeline, then toggle forwarding.', code: 'LOAD R1, 10\nADD R2, R1, R3\nSUB R4, R2, R5' },
    { id: 'cache', name: 'Cache Demo', desc: 'Repeated and neighbouring addresses: misses, then hits.', code: 'LOAD R1, 100\nLOAD R2, 100\nLOAD R3, 104\nLOAD R4, 100' },
    { id: 'branch', name: 'Branch Demo', desc: 'A taken BEQ skips ADD. In the pipeline it flushes wrong-path instructions.', code: 'LOAD R1, 10\nLOAD R2, 10\nCMP R1, R2\nBEQ R1, R2, 6\nADD R3, R3, R4' },
    { id: 'loop', name: 'Loop (branches + hazards)', desc: 'Counts down from 3 using a label and BNE.', code: 'MOV R1, 3\nMOV R2, 0\nloop: ADD R2, R2, R1\nSUB R1, R1, 1\nBNE R1, R0, loop\nSTORE R2, 300' }
  ];
  if (isNode) module.exports = Programs; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.Programs = Programs; }
})(typeof window !== 'undefined' ? window : globalThis);
