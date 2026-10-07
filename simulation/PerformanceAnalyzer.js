/* PerformanceAnalyzer - every number here is derived from simulation counters (nothing is hard-coded). */
(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const dep = (n) => (isNode ? require('./' + n) : g.CPUFlow[n]);
  const CPU = dep('CPU');

  const PA = {
    metrics(cpu, baseline) {
      const st = cpu.stats, cfg = cpu.cfg, ic = st.retired, cyc = st.cycles;
      const cpi = ic ? cyc / ic : null, cycleNs = 1000 / cfg.clockMHz, timeNs = cyc * cycleNs;
      const cm = cpu.cache.metrics(), stalls = st.dataStalls + st.structStalls + st.memStalls;
      const busy = Object.values(st.stageBusy).reduce((a, b) => a + b, 0);
      const baseCpi = baseline && baseline.ic ? baseline.cycles / baseline.ic : null;
      return {
        instructionCount: ic, cycles: cyc, cpi, clockMHz: cfg.clockMHz, cycleNs, execTimeNs: timeNs,
        mips: ic && timeNs ? ic / (timeNs * 1e-9) / 1e6 : null,
        efficiency: cyc ? ic / cyc : null, utilization: cyc ? busy / (5 * cyc) : null,
        stalls, dataStalls: st.dataStalls, structStalls: st.structStalls, memStalls: st.memStalls, controlStalls: st.controlStalls,
        flushes: st.flushes, forwards: st.forwards, dataHazards: st.dataHazards, controlHazards: st.controlHazards, structHazards: st.structHazards,
        cacheAccesses: cm.accesses, hits: cm.hits, misses: cm.misses, hitRatio: cm.hitRatio, missRatio: cm.missRatio, amat: cm.amat,
        speedup: baseCpi && cyc && ic ? (ic * baseCpi) / cyc : null, baselineCpi: baseCpi
      };
    },
    /* Run a parsed program to completion without any UI (used for baselines and comparisons). */
    runHeadless(program, cfg) {
      const cpu = new CPU(cfg); cpu.record = false; cpu.load(program);
      let guard = 0;
      while (!cpu.finished && !cpu.error && guard++ < cpu.cfg.maxCycles) cpu.step();
      if (!cpu.finished && !cpu.error) cpu.error = 'Cycle limit reached (' + cpu.cfg.maxCycles + ')';
      return cpu;
    },
    baseline(program, cfg) {
      const cpu = PA.runHeadless(program, Object.assign({}, cfg, { pipelined: false }));
      return { cycles: cpu.stats.cycles, ic: cpu.stats.retired, error: cpu.error };
    },
    compare(program, cfgA, cfgB) {
      const a = PA.runHeadless(program, cfgA), b = PA.runHeadless(program, cfgB);
      const base = { cycles: a.stats.cycles, ic: a.stats.retired };
      const ma = PA.metrics(a, base), mb = PA.metrics(b, base);
      return { a: ma, b: mb, speedup: mb.cycles ? ma.cycles / mb.cycles : null, errorA: a.error, errorB: b.error };
    },
    execTimeSeconds(ic, cpi, clockMHz) { return (ic * cpi) / (clockMHz * 1e6); },
    mips(ic, seconds) { return seconds ? ic / (seconds * 1e6) : 0; },
    amdahl(f, s) { return 1 / ((1 - f) + f / s); },
    amdahlLimit(f) { return f >= 1 ? Infinity : 1 / (1 - f); }
  };
  if (isNode) module.exports = PA; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.PerformanceAnalyzer = PA; }
})(typeof window !== 'undefined' ? window : globalThis);
