/* Engine tests: run with `npm test` (plain Node, no framework). */
const assert = require('assert');
const Parser = require('../simulation/InstructionParser');
const Engine = require('../simulation/SimulationEngine');
const PA = require('../simulation/PerformanceAnalyzer');
const ALU = require('../simulation/ALU');
const Cache = require('../simulation/Cache');
const Memory = require('../simulation/Memory');
const Programs = require('../simulation/Programs');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const run = (code, cfg) => { const e = new Engine(cfg); const p = e.loadProgram(code); assert(p.ok, JSON.stringify(p.errors)); e.finish(); return e.getState(); };

t('parser: errors are specific', () => {
  const m = (s) => Parser.parse(s).errors[0].message;
  assert(/Invalid register R9/.test(m('ADD R9, R1, R2')));
  assert(/ADD requires 3 operands/.test(m('ADD R1, R2')));
  assert(/Unknown instruction: XYZ/.test(m('XYZ R1')));
  assert(/Invalid memory address 5000/.test(m('LOAD R1, 5000')));
  assert(/Invalid branch target/.test(m('JMP 9')));
  assert(/label is not defined/.test(m('JMP nowhere')));
  assert(/expected a register/.test(m('ADD R1, 5, R2')));
});
t('ALU arithmetic + flags', () => {
  assert.strictEqual(ALU.compute('ADD', 20, 30).result, 50);
  assert.strictEqual(ALU.compute('SUB', 5, 5).flags.Z, 1);
  assert.strictEqual(ALU.compute('MUL', 6, 7).result, 42);
  assert.strictEqual(ALU.compute('DIV', 7, 2).result, 3);
  assert.strictEqual(ALU.compute('XOR', 6, 3).result, 5);
  assert.throws(() => ALU.compute('DIV', 1, 0), /Division by zero/);
});
t('sequential: basic arithmetic', () => {
  const s = run(Programs[0].code);
  assert.deepStrictEqual(s.registers.slice(1, 5), [10, 20, 30, 20]);
  assert.strictEqual(s.stats.retired, 5);
});
t('memory program: store then load', () => { const s = run(Programs[1].code); assert.strictEqual(s.registers[2], 100); });
t('cache demo: 2 hits, 2 misses', () => { const s = run(Programs[3].code); assert.strictEqual(s.metrics.hits, 2); assert.strictEqual(s.metrics.misses, 2); });
t('sequential and pipelined give identical architectural results', () => {
  Programs.forEach((p) => {
    const a = run(p.code, { pipelined: false }), b = run(p.code, { pipelined: true, forwarding: true }), c = run(p.code, { pipelined: true, forwarding: false });
    assert.deepStrictEqual(b.registers, a.registers, p.id + ' fwd'); assert.deepStrictEqual(c.registers, a.registers, p.id + ' nofwd');
    assert.strictEqual(b.stats.retired, a.stats.retired, p.id);
  });
});
t('pipeline: hazard demo stalls without forwarding, fewer with', () => {
  const nf = run(Programs[2].code, { pipelined: true, forwarding: false }), f = run(Programs[2].code, { pipelined: true, forwarding: true });
  assert(nf.stats.dataStalls > f.stats.dataStalls); assert.strictEqual(f.stats.dataStalls, 1); assert(f.stats.forwards >= 2);
});
t('pipeline: ALU-only dependency needs 0 stalls with forwarding, 2 without', () => {
  const code = 'ADD R1, R2, 1\nADD R3, R1, 1';
  assert.strictEqual(run(code, { pipelined: true, forwarding: true }).stats.dataStalls, 0);
  assert.strictEqual(run(code, { pipelined: true, forwarding: false }).stats.dataStalls, 2);
  assert.strictEqual(run(code, { pipelined: true, forwarding: true }).cycle, 6);
});
t('pipeline: ideal CPI approaches 1 (n+4 cycles)', () => { assert.strictEqual(run('MOV R1,1\nMOV R2,2\nMOV R3,3\nMOV R4,4', { pipelined: true }).cycle, 8); });
t('sequential: 5 cycles per ALU instruction', () => { assert.strictEqual(run('MOV R1,1\nMOV R2,2', { pipelined: false }).cycle, 10); });
t('branch: taken BEQ flushes wrong-path instructions in the pipeline', () => {
  const s = run(Programs[4].code, { pipelined: true });
  assert.strictEqual(s.stats.flushes, 1); assert.strictEqual(s.stats.controlHazards, 1); assert.strictEqual(s.registers[3], 0);
  const w = run('MOV R1, 5\nMOV R2, 5\nBEQ R1, R2, 6\nADD R3, R3, 1\nSUB R4, R4, 1\nHALT', { pipelined: true });
  assert.strictEqual(w.stats.flushes, 2); assert.strictEqual(w.registers[3], 0); assert.strictEqual(w.registers[4], 0);
});
t('loop with label computes 3+2+1', () => { const s = run(Programs[5].code, { pipelined: true }); assert.strictEqual(s.registers[2], 6); assert.strictEqual(s.registers[1], 0); });
t('structural hazard only with unified memory', () => {
  const code = 'LOAD R1, 8\nADD R2, R2, 1\nADD R3, R3, 1\nADD R4, R4, 1';
  assert(run(code, { pipelined: true, unifiedMemory: true }).stats.structStalls > 0);
  assert.strictEqual(run(code, { pipelined: true, unifiedMemory: false }).stats.structStalls, 0);
});
t('runtime errors do not crash: division by zero', () => { const s = run('MOV R1, 5\nDIV R2, R1, R3'); assert(/Division by zero/.test(s.error)); assert.strictEqual(s.status, 'error'); });
t('runtime errors: bad indirect address', () => { const s = run('MOV R1, 5000\nLOAD R2, R1'); assert(/Invalid memory address/.test(s.error)); });
t('infinite loop is stopped by the cycle limit', () => { const s = run('loop: JMP loop', { maxCycles: 200 }); assert(/Cycle limit/.test(s.error)); });
t('determinism: same program + config = same result', () => {
  const a = run(Programs[5].code, { pipelined: true }), b = run(Programs[5].code, { pipelined: true });
  assert.deepStrictEqual(a.stats, b.stats); assert.deepStrictEqual(a.registers, b.registers);
});
t('reset restores the initial state', () => {
  const e = new Engine({ pipelined: true }); e.loadProgram(Programs[0].code); const before = JSON.stringify(e.getState()); e.finish(); e.reset();
  assert.strictEqual(JSON.stringify(e.getState()), before);
});
t('step / step-instruction behave', () => {
  const e = new Engine({}); e.loadProgram(Programs[0].code); e.step(); assert.strictEqual(e.cpu.cycle, 1); e.stepInstruction(); assert.strictEqual(e.cpu.stats.retired, 1);
});
t('cache mapping: direct conflicts, 2-way does not; LRU vs FIFO', () => {
  const mk = (c) => new Cache(Object.assign({ lines: 4, blockSize: 1 }, c), new Memory(1024));
  const d = mk({ mapping: 'direct' }); [0, 4, 0, 4].forEach((a) => d.access(a)); assert.strictEqual(d.hits, 0);
  const s = mk({ mapping: 'set', ways: 2 }); [0, 4, 0, 4].forEach((a) => s.access(a)); assert.strictEqual(s.hits, 2);
  const f = mk({ mapping: 'fully' }); [0, 1, 2, 3, 4, 0].forEach((a) => f.access(a)); assert.strictEqual(f.hits, 0); // FIFO-like order: 0 evicted by 4... LRU too
  const lru = mk({ mapping: 'fully', policy: 'LRU' }), fifo = mk({ mapping: 'fully', policy: 'FIFO' });
  [0, 1, 2, 3, 0, 4, 0].forEach((a) => { lru.access(a); fifo.access(a); });
  assert.strictEqual(lru.hits, 2); assert.strictEqual(fifo.hits, 1);
});
t('metrics are derived: CPI, MIPS, exec time', () => {
  const s = run(Programs[0].code, { clockMHz: 100 }), m = s.metrics;
  assert.strictEqual(m.cpi, m.cycles / m.instructionCount); assert.strictEqual(m.execTimeNs, m.cycles * 10);
  assert(Math.abs(m.mips - 100 / m.cpi) < 1e-9);
});
t('speedup vs sequential is computed from a real baseline', () => {
  const s = run(Programs[4].code, { pipelined: true, forwarding: true }), seq = run(Programs[4].code, { pipelined: false });
  assert(Math.abs(s.metrics.speedup - seq.cycle / s.cycle) < 1e-9);
  assert(Math.abs(seq.metrics.speedup - 1) < 1e-9);
});
t("Amdahl's law", () => { assert(Math.abs(PA.amdahl(0.8, 8) - 1 / (0.2 + 0.1)) < 1e-9); assert.strictEqual(PA.amdahlLimit(0.9).toFixed(1), '10.0'); });
console.log('\n' + n + ' test groups passed');
