/* Control unit: derives control signals; models both hardwired and microprogrammed organisations. */
(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const SIGNALS = ['RegRead', 'RegWrite', 'ALUSrc', 'ALUOp', 'MemRead', 'MemWrite', 'MemToReg', 'Branch', 'PCWrite'];
  const NAMES = ['NOP', 'LOAD', 'STORE', 'ADD', 'SUB', 'MUL', 'DIV', 'MOV', 'AND', 'OR', 'XOR', 'CMP', 'JMP', 'BEQ', 'BNE', 'HALT'];

  class ControlUnit {
    signals(ins, ctx) {
      const s = { RegRead: 0, RegWrite: 0, ALUSrc: 0, ALUOp: '-', MemRead: 0, MemWrite: 0, MemToReg: 0, Branch: 0, PCWrite: 0 };
      if (!ins) return s;
      const imm = ins.b && ins.b.imm !== undefined ? 1 : 0;
      s.RegRead = ins.srcs.length ? 1 : 0;
      switch (ins.type) {
        case 'alu': s.RegWrite = 1; s.ALUSrc = imm; s.ALUOp = ins.op; break;
        case 'load': s.RegWrite = 1; s.ALUSrc = 1; s.ALUOp = 'ADD'; s.MemRead = 1; s.MemToReg = 1; break;
        case 'store': s.ALUSrc = 1; s.ALUOp = 'ADD'; s.MemWrite = 1; break;
        case 'mov': s.RegWrite = 1; s.ALUSrc = imm; s.ALUOp = 'PASS'; break;
        case 'cmp': s.ALUSrc = imm; s.ALUOp = 'SUB'; break;
        case 'branch': s.ALUOp = 'SUB'; s.Branch = 1; s.PCWrite = ctx && ctx.taken ? 1 : 0; break;
        case 'jump': s.Branch = 1; s.PCWrite = 1; break;
        default: break;
      }
      return s;
    }
    active(sig) { return SIGNALS.filter((k) => (k === 'ALUOp' ? sig.ALUOp !== '-' : !!sig[k])).map((k) => (k === 'ALUOp' ? 'ALUOp=' + sig.ALUOp : k)); }
    hardwired(ins) {
      const bits = ins.opcode.toString(2).padStart(4, '0');
      return { opcode: ins.opcode, bits, decoderLine: 'DEC_' + ins.op, signals: this.active(this.signals(ins)) };
    }
    /* Microprogrammed control: opcode selects a control-store address; each micro-word asserts a subset of the signals. */
    microprogram(ins) {
      const s = this.signals(ins), base = ins.opcode * 8, a = [];
      const w = (name, asserts) => ({ addr: base + a.length, name, asserts });
      a.push(w('DECODE / REG READ', [].concat(s.RegRead ? ['RegRead'] : [], s.ALUSrc ? ['ALUSrc'] : [])));
      a.push(w('EXECUTE', [].concat(s.ALUOp !== '-' ? ['ALUOp=' + s.ALUOp] : [], s.Branch ? ['Branch'] : [])));
      a.push(w('MEMORY', [].concat(s.MemRead ? ['MemRead'] : [], s.MemWrite ? ['MemWrite'] : [])));
      a.push(w('WRITE BACK', [].concat(s.RegWrite ? ['RegWrite'] : [], s.MemToReg ? ['MemToReg'] : [], s.PCWrite ? ['PCWrite'] : [])));
      a.forEach((x, i) => { x.next = i < a.length - 1 ? x.addr + 1 : 0; });
      return { opcode: ins.opcode, base, words: a };
    }
  }
  ControlUnit.SIGNALS = SIGNALS; ControlUnit.NAMES = NAMES;
  if (isNode) module.exports = ControlUnit; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.ControlUnit = ControlUnit; }
})(typeof window !== 'undefined' ? window : globalThis);
