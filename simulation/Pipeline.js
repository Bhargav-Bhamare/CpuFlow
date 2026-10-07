/*
 * Pipeline - the 5-stage (IF ID EX MEM WB) machine. With cfg.pipelined=false only one instruction is in flight at a
 * time (classic multi-cycle execution), so the same stage logic drives both modes.
 *
 * Per cycle (S = what is in each stage during this cycle):
 *   fetch -> WB commit -> MEM access -> EX (ALU, forwarding, branch) -> ID (decode, hazard detect) -> advance latches
 */
(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
  const SYM = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', AND: '&', OR: '|', XOR: '^' };

  class Pipeline {
    constructor(cpu) { this.cpu = cpu; this.reset(); }
    reset() { this.S = { IF: null, ID: null, EX: null, MEM: null, WB: null }; this.seq = 0; this.fetchStopped = false; this.seen = new Set(); this.rows = new Map(); }
    empty() { const S = this.S; return !S.IF && !S.ID && !S.EX && !S.MEM && !S.WB; }
    done() { return this.empty() && (this.fetchStopped || this.cpu.pc >= this.cpu.program.length); }

    step() {
      const cpu = this.cpu, cfg = cpu.cfg, S = this.S, st = cpu.stats, t = cpu.cycle, n = cpu.program.length;
      const ev = [], mo = [];
      const M = (stage, d, text, kind) => mo.push({ cycle: t, stage, seq: d ? d.seq : 0, n: d ? d.ins.n : 0, text, kind: kind || '' });
      const lab = (d) => 'I' + d.seq;

      /* ---------- FETCH ---------- */
      if (!S.IF && cpu.pc < n && !this.fetchStopped) {
        const free = cfg.pipelined || (!S.ID && !S.EX && !S.MEM && !S.WB);
        if (free) {
          if (cfg.pipelined && cfg.unifiedMemory && S.MEM && S.MEM.ins.mem) {
            st.structStalls++; st.structHazards++;
            ev.push({ type: 'hazard', kind: 'structural', seq: S.MEM.seq, msg: 'STRUCTURAL HAZARD: ' + lab(S.MEM) + ' (' + S.MEM.ins.op + ') is using the single memory port - instruction fetch must wait' });
            ev.push({ type: 'stall', reason: 'structural', seq: S.MEM.seq });
          } else {
            const ins = cpu.program[cpu.pc];
            const d = { seq: ++this.seq, idx: cpu.pc, ins, a: 0, bv: 0, result: 0, wbVal: 0, addr: null, storeVal: 0, started: false, extra: 0, fwd: [], fwdCycle: 0, decoded: false, flushed: false, taken: false, sig: null };
            cpu.mar = cpu.pc; cpu.mdr = cpu.pc; cpu.ir = ins; S.IF = d;
            this.rows.set(d.seq, { seq: d.seq, idx: d.idx, n: ins.n, text: ins.text, cells: [] });
            if (this.rows.size > 400) this.rows.delete(this.rows.keys().next().value);
            ev.push({ type: 'fetch', seq: d.seq, idx: d.idx, n: ins.n, text: ins.text, pc: cpu.pc });
            M('FETCH', d, 'MAR <- PC  (' + cpu.pc + ')'); M('FETCH', d, 'MDR <- IM[MAR]  (' + ins.text + ')'); M('FETCH', d, 'IR <- MDR'); M('FETCH', d, 'PC <- PC + 1');
            cpu.pc++;
            if (ins.op === 'HALT') this.fetchStopped = true;
          }
        }
      }
      const occ = { IF: S.IF, ID: S.ID, EX: S.EX, MEM: S.MEM, WB: S.WB };
      cpu.lastOcc = occ;

      /* ---------- WRITE BACK ---------- */
      if (S.WB) {
        const d = S.WB, ins = d.ins;
        if (ins.dest !== null) {
          const r = cpu.regs.write(ins.dest, d.wbVal);
          ev.push({ type: 'writeback', seq: d.seq, reg: ins.dest, old: r.old, value: r.value, from: ins.type === 'load' ? 'MDR' : 'ALU' });
          M('WRITEBACK', d, 'R' + ins.dest + ' <- ' + r.value + (ins.type === 'load' ? '  (MDR)' : '  (ALU result)'));
        } else M('WRITEBACK', d, 'no register write');
        st.retired++;
        st.mix[ins.type === 'alu' || ins.type === 'mov' || ins.type === 'cmp' ? 'alu' : ins.type === 'load' ? 'load' : ins.type === 'store' ? 'store' : ins.type === 'branch' || ins.type === 'jump' ? 'branch' : 'other']++;
        ev.push({ type: 'retire', seq: d.seq });
        if (ins.op === 'HALT') cpu.halted = true;
      }

      /* ---------- MEMORY ---------- */
      let memStall = false, memOut = null;
      if (S.MEM) {
        const d = S.MEM, ins = d.ins;
        if (!d.started) {
          d.started = true;
          if (ins.mem) {
            const isStore = ins.type === 'store';
            cpu.mar = d.addr;
            const r = isStore ? cpu.cache.access(d.addr, true, d.storeVal) : cpu.cache.access(d.addr, false);
            d.extra = r.latency - 1;
            if (isStore) cpu.mdr = d.storeVal; else { d.wbVal = r.value; cpu.mdr = r.value; }
            cpu.memOp = { addr: d.addr, rw: isStore ? 'WRITE' : 'READ', value: r.value, hit: r.hit };
            cpu.accessLog.push({ addr: d.addr, write: isStore }); if (cpu.accessLog.length > 4000) cpu.accessLog.shift();
            ev.push({ type: 'mem', seq: d.seq, rw: isStore ? 'WRITE' : 'READ', addr: d.addr, value: r.value, hit: r.hit, cache: r });
            M('MEMORY', d, 'MAR <- ' + d.addr);
            M('MEMORY', d, 'CACHE ' + (r.hit ? 'HIT' : 'MISS') + '  (set ' + r.set + ', tag ' + r.tag + ')', r.hit ? 'hit' : 'miss');
            if (!r.hit) M('MEMORY', d, 'block ' + r.block + ' <- Main Memory  (' + cfg.cache.missPenalty + ' extra cycles)', 'miss');
            M('MEMORY', d, isStore ? 'M[MAR] <- MDR  (' + d.storeVal + ')' : 'MDR <- M[MAR]  (' + r.value + ')');
          } else M('MEMORY', d, 'no memory access');
        }
        if (d.extra > 0) { d.extra--; memStall = true; st.memStalls++; M('MEMORY', d, 'waiting for main memory...', 'miss'); ev.push({ type: 'stall', reason: 'memory', seq: d.seq }); } else memOut = d;
      }

      /* ---------- EXECUTE ---------- */
      let exOut = null, redirect = null;
      if (S.EX && !memStall) {
        const d = S.EX, ins = d.ins;
        const rd = (reg) => {
          let v = cpu.regs.read(reg);
          if (cfg.pipelined && cfg.forwarding) {
            const m = S.MEM, w = S.WB; let from = null;
            if (m && m.ins.dest === reg && m.ins.type !== 'load') { v = m.wbVal; from = 'EX/MEM'; }
            else if (w && w.ins.dest === reg) { v = w.wbVal; from = 'MEM/WB'; }
            if (from) { d.fwd.push({ reg, from, value: v }); d.fwdCycle = t; st.forwards++; ev.push({ type: 'forward', seq: d.seq, reg, from, value: v }); M('EXECUTE', d, 'FORWARD ' + from + ' -> ALU : R' + reg + ' = ' + v, 'fwd'); }
          }
          return v;
        };
        const alu = (op, a, b, extra) => {
          const r = cpu.alu.execute(op, a, b); cpu.flags = r.flags;
          ev.push({ type: 'alu', seq: d.seq, op, a, b, result: r.result, flags: r.flags, addr: !!extra });
          return r;
        };
        switch (ins.type) {
          case 'alu': {
            const A = rd(ins.aReg), B = ins.b.reg !== undefined ? rd(ins.b.reg) : ins.b.imm;
            const r = alu(ins.op, A, B); d.result = d.wbVal = r.result;
            M('EXECUTE', d, 'R' + ins.dest + ' <- ' + ins.text.split(', ').slice(1).join(' ' + SYM[ins.op] + ' ') + '   (' + A + ' ' + SYM[ins.op] + ' ' + B + ' = ' + r.result + ')');
            break;
          }
          case 'mov': {
            const B = ins.b.reg !== undefined ? rd(ins.b.reg) : ins.b.imm;
            const r = alu('PASS', 0, B); d.result = d.wbVal = r.result; M('EXECUTE', d, 'R' + ins.dest + ' <- ' + B + '  (ALU pass-through)');
            break;
          }
          case 'cmp': {
            const A = rd(ins.aReg), B = ins.b.reg !== undefined ? rd(ins.b.reg) : ins.b.imm;
            const r = alu('SUB', A, B); M('EXECUTE', d, 'flags <- ' + A + ' - ' + B + '   (Z=' + r.flags.Z + ' N=' + r.flags.N + ' C=' + r.flags.C + ')');
            break;
          }
          case 'load': case 'store': {
            const base = ins.addrReg !== null ? rd(ins.addrReg) : 0, off = ins.addrImm !== null ? ins.addrImm : 0;
            if (ins.type === 'store') d.storeVal = rd(ins.storeReg);
            const r = alu('ADD', base, off, true); d.addr = r.result; cpu.mem.check(d.addr);
            M('EXECUTE', d, 'effective address = ' + base + ' + ' + off + ' = ' + d.addr);
            break;
          }
          case 'branch': {
            const A = rd(ins.aReg), B = rd(ins.b.reg);
            alu('SUB', A, B);
            d.taken = ins.op === 'BEQ' ? A === B : A !== B;
            st.branches++; if (d.taken) st.taken++;
            d.sig = cpu.cu.signals(ins, { taken: d.taken }); cpu.signals = d.sig;
            ev.push({ type: 'branch', seq: d.seq, op: ins.op, a: A, b: B, taken: d.taken, target: ins.target, n: ins.target + 1, predicted: 'not taken' });
            M('EXECUTE', d, ins.op + ': R' + ins.aReg + '(' + A + ') ' + (ins.op === 'BEQ' ? '==' : '!=') + ' R' + ins.b.reg + '(' + B + ') ? ' + (d.taken ? 'TAKEN -> PC <- ' + ins.target : 'not taken'), d.taken ? 'branch' : '');
            if (d.taken) redirect = ins.target;
            break;
          }
          case 'jump': {
            d.taken = true; st.branches++; st.taken++; redirect = ins.target;
            d.sig = cpu.cu.signals(ins, { taken: true }); cpu.signals = d.sig;
            ev.push({ type: 'branch', seq: d.seq, op: 'JMP', a: 0, b: 0, taken: true, target: ins.target, n: ins.target + 1, predicted: 'not taken' });
            M('EXECUTE', d, 'JMP: PC <- ' + ins.target, 'branch');
            break;
          }
          default: M('EXECUTE', d, ins.op === 'HALT' ? 'HALT: stop fetching' : 'no operation');
        }
        exOut = d;
      }

      /* ---------- DECODE ---------- */
      let idStall = false;
      if (S.ID) {
        const d = S.ID, ins = d.ins;
        if (!d.decoded) {
          d.decoded = true; d.sig = cpu.cu.signals(ins); cpu.signals = d.sig; cpu.cir = d;
          ev.push({ type: 'decode', seq: d.seq, n: ins.n, text: ins.text, signals: d.sig, active: cpu.cu.active(d.sig) });
          M('DECODE', d, 'IR -> Control Unit  (opcode ' + ins.opcode.toString(2).padStart(4, '0') + ')');
          M('DECODE', d, 'signals: ' + (cpu.cu.active(d.sig).join(' ') || 'none'), 'ctl');
        }
        if (!memStall) {
          if (cfg.pipelined && ins.srcs.length) {
            for (const [name, p] of [['EX', S.EX], ['MEM', S.MEM]]) {
              if (!p || p.ins.dest === null || !ins.srcs.includes(p.ins.dest)) continue;
              const reg = p.ins.dest, needStall = cfg.forwarding ? (name === 'EX' && p.ins.type === 'load') : true;
              const key = d.seq + ':' + p.seq + ':' + reg;
              if (!this.seen.has(key)) {
                this.seen.add(key); st.dataHazards++;
                ev.push({ type: 'hazard', kind: 'data', seq: d.seq, producer: p.seq, reg, resolution: needStall ? 'stall' : 'forward', msg: 'DATA HAZARD DETECTED: ' + lab(d) + ' reads R' + reg + ', written by ' + lab(p) + ' (' + p.ins.op + ') - ' + (needStall ? (cfg.forwarding ? 'load-use: 1 stall, then forward' : 'no forwarding: stall until write-back') : 'resolved by forwarding') });
              }
              if (needStall) { idStall = true; d.waitReg = reg; }
            }
          }
          if (idStall) {
            st.dataStalls++; ev.push({ type: 'stall', reason: 'data', seq: d.seq, reg: d.waitReg });
            M('DECODE', d, 'STALL: waiting for R' + d.waitReg, 'stall');
          } else {
            const reads = [];
            if (ins.type === 'alu' || ins.type === 'cmp' || ins.type === 'branch') { reads.push({ reg: ins.aReg, to: 'A' }); if (ins.b.reg !== undefined) reads.push({ reg: ins.b.reg, to: 'B' }); }
            else if (ins.type === 'mov' && ins.b.reg !== undefined) reads.push({ reg: ins.b.reg, to: 'B' });
            else if (ins.type === 'store') { reads.push({ reg: ins.storeReg, to: 'B' }); if (ins.addrReg !== null) reads.push({ reg: ins.addrReg, to: 'A' }); }
            else if (ins.type === 'load' && ins.addrReg !== null) reads.push({ reg: ins.addrReg, to: 'A' });
            if (reads.length) {
              reads.forEach((r) => { r.value = cpu.regs.read(r.reg); M('DECODE', d, 'ALU.' + r.to + ' <- R' + r.reg + '  (' + r.value + ')'); });
              ev.push({ type: 'regread', seq: d.seq, reads });
            }
          }
        }
      }

      /* ---------- ADVANCE LATCHES ---------- */
      const N = { IF: null, ID: null, EX: null, MEM: null, WB: null };
      let flushed = [];
      if (memStall) { N.MEM = S.MEM; N.EX = S.EX; N.ID = S.ID; N.IF = S.IF; }
      else {
        N.WB = memOut; N.MEM = exOut;
        if (redirect !== null) {
          flushed = [S.ID, S.IF].filter(Boolean); flushed.forEach((f) => { f.flushed = true; });
          cpu.pc = redirect; this.fetchStopped = false;
          if (cfg.pipelined && flushed.length) {
            st.flushes += flushed.length; st.controlStalls += flushed.length; st.controlHazards++;
            ev.push({ type: 'hazard', kind: 'control', seq: exOut.seq, msg: 'CONTROL HAZARD: ' + lab(exOut) + ' (' + exOut.ins.op + ') taken - PIPELINE FLUSH, ' + flushed.length + ' instruction' + (flushed.length > 1 ? 's' : '') + ' squashed' });
            ev.push({ type: 'flush', seqs: flushed.map((f) => f.seq), branch: exOut.seq });
          }
        } else if (idStall) { N.ID = S.ID; N.IF = S.IF; }
        else { N.EX = S.ID; N.ID = S.IF; }
      }
      this.S = N;

      /* ---------- TIMELINE + UTILISATION ---------- */
      STAGES.forEach((stg) => {
        const d = occ[stg]; if (!d) return;
        let state = 'ok';
        if (d.flushed) state = 'flush'; else if (N[stg] === d) state = 'stall'; else if (stg === 'EX' && d.fwdCycle === t) state = 'fwd';
        if (state !== 'flush' && state !== 'stall') st.stageBusy[stg]++;
        if (cpu.record) { const r = this.rows.get(d.seq); if (r) r.cells.push({ c: t, s: stg, st: state }); }
      });
      return { events: ev, micro: mo };
    }
  }
  Pipeline.STAGES = STAGES;
  if (isNode) module.exports = Pipeline; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.Pipeline = Pipeline; }
})(typeof window !== 'undefined' ? window : globalThis);
