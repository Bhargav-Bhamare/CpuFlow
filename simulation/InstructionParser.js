/* InstructionParser - turns assembly text into validated Instruction objects. */
(function (g) {
  const isNode = typeof module === 'object' && module.exports;
  const MEM_SIZE = 1024, MAX_INSTR = 256;
  const OPCODES = { NOP: 0, LOAD: 1, STORE: 2, ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOV: 7, AND: 8, OR: 9, XOR: 10, CMP: 11, JMP: 12, BEQ: 13, BNE: 14, HALT: 15 };
  const ARITY = { LOAD: 2, STORE: 2, ADD: 3, SUB: 3, MUL: 3, DIV: 3, AND: 3, OR: 3, XOR: 3, MOV: 2, CMP: 2, JMP: 1, BEQ: 3, BNE: 3, NOP: 0, HALT: 0 };
  const ALU_OPS = ['ADD', 'SUB', 'MUL', 'DIV', 'AND', 'OR', 'XOR'];
  const SYNTAX = {
    LOAD: 'LOAD Rd, address', STORE: 'STORE Rs, address', ADD: 'ADD Rd, Rs1, Rs2|imm', SUB: 'SUB Rd, Rs1, Rs2|imm',
    MUL: 'MUL Rd, Rs1, Rs2|imm', DIV: 'DIV Rd, Rs1, Rs2|imm', AND: 'AND Rd, Rs1, Rs2|imm', OR: 'OR Rd, Rs1, Rs2|imm',
    XOR: 'XOR Rd, Rs1, Rs2|imm', MOV: 'MOV Rd, Rs|imm', CMP: 'CMP Ra, Rb|imm', JMP: 'JMP target',
    BEQ: 'BEQ Ra, Rb, target', BNE: 'BNE Ra, Rb, target', NOP: 'NOP', HALT: 'HALT'
  };

  function num(s) {
    s = s.replace(/^#/, '');
    if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
    if (/^[-+]?0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    return null;
  }
  const fail = (m) => { const e = new Error(m); e.parse = true; throw e; };

  function parse(source) {
    const lines = String(source == null ? '' : source).split(/\r?\n/);
    const raw = [], errors = [], labels = {};
    lines.forEach((ln, i) => {
      let t = ln.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim();
      for (;;) {
        const m = t.match(/^([A-Za-z_]\w*)\s*:\s*(.*)$/);
        if (!m) break;
        const name = m[1].toUpperCase();
        if (labels[name] !== undefined) errors.push({ line: i + 1, message: 'Duplicate label ' + name });
        labels[name] = raw.length; t = m[2].trim();
      }
      if (t) raw.push({ t, line: i + 1 });
    });
    if (!raw.length) return { program: [], errors: [{ line: 0, message: 'Program is empty - enter at least one instruction' }], labels, ok: false };
    if (raw.length > MAX_INSTR) errors.push({ line: raw[MAX_INSTR].line, message: 'Program too long (max ' + MAX_INSTR + ' instructions)' });
    const count = raw.length, program = [];

    raw.forEach((r, idx) => {
      try {
        const m = r.t.match(/^(\S+)\s*(.*)$/);
        const op = m[1].toUpperCase();
        if (!(op in ARITY)) fail('Unknown instruction: ' + m[1]);
        const rest = m[2].trim();
        const ops = rest === '' ? [] : rest.split(',').map((s) => s.trim());
        if (ops.some((o) => o === '')) fail(op + ': empty operand (check for stray commas)');
        const want = ARITY[op];
        if (ops.length !== want) {
          fail(want === 0 ? op + ' takes no operands (got ' + ops.length + ')' : op + ' requires ' + want + ' operand' + (want === 1 ? '' : 's') + ' (got ' + ops.length + ') - syntax: ' + SYNTAX[op]);
        }
        const reg = (s) => {
          const q = /^R(\d+)$/i.exec(s);
          if (!q) return null;
          const k = +q[1];
          if (k > 7) fail('Invalid register ' + s.toUpperCase() + ' (valid registers are R0-R7)');
          return k;
        };
        const needReg = (s) => { const k = reg(s); if (k === null) fail("Invalid operand '" + s + "': expected a register (R0-R7)"); return k; };
        const regOrImm = (s) => {
          const k = reg(s); if (k !== null) return { reg: k };
          const v = num(s);
          if (v === null) fail("Invalid operand '" + s + "': expected a register or a number");
          if (v > 2147483647 || v < -2147483648) fail('Immediate ' + s + ' does not fit in 32 bits');
          return { imm: v };
        };
        const memOp = (s) => {
          const q = /^\[(.*)\]$/.exec(s); const inner = (q ? q[1] : s).trim();
          const k = reg(inner); if (k !== null) return { addrReg: k };
          const v = num(inner);
          if (v === null) fail("Invalid operand '" + s + "': expected a memory address or register");
          if (v < 0 || v >= MEM_SIZE) fail('Invalid memory address ' + v + ' (valid range 0-' + (MEM_SIZE - 1) + ')');
          return { addrImm: v };
        };
        const target = (s) => {
          if (/^\d+$/.test(s)) {
            const k = parseInt(s, 10);
            if (k < 1 || k > count + 1) fail('Invalid branch target ' + k + ' (program has ' + count + ' instructions; use 1-' + (count + 1) + ')');
            return { idx: k - 1, label: null };
          }
          const L = s.toUpperCase();
          if (!/^[A-Z_]\w*$/.test(L) || labels[L] === undefined) fail("Invalid branch target '" + s + "': label is not defined");
          return { idx: labels[L], label: L };
        };
        const ins = { op, opcode: OPCODES[op], idx, n: idx + 1, line: r.line, type: 'nop', dest: null, srcs: [], aReg: null, b: null, addrReg: null, addrImm: null, storeReg: null, target: null, label: null, mem: false };
        const shown = ops.map((o) => (/^r\d+$/i.test(o) ? o.toUpperCase() : o));
        if (op === 'LOAD') {
          ins.type = 'load'; ins.mem = true; ins.dest = needReg(ops[0]);
          const a = memOp(ops[1]); ins.addrReg = a.addrReg === undefined ? null : a.addrReg; ins.addrImm = a.addrImm === undefined ? null : a.addrImm;
          if (ins.addrReg !== null) ins.srcs = [ins.addrReg];
        } else if (op === 'STORE') {
          ins.type = 'store'; ins.mem = true; ins.storeReg = needReg(ops[0]);
          const a = memOp(ops[1]); ins.addrReg = a.addrReg === undefined ? null : a.addrReg; ins.addrImm = a.addrImm === undefined ? null : a.addrImm;
          ins.srcs = [ins.storeReg]; if (ins.addrReg !== null) ins.srcs.push(ins.addrReg);
        } else if (ALU_OPS.includes(op)) {
          ins.type = 'alu'; ins.dest = needReg(ops[0]); ins.aReg = needReg(ops[1]); ins.b = regOrImm(ops[2]);
          ins.srcs = [ins.aReg]; if (ins.b.reg !== undefined) ins.srcs.push(ins.b.reg);
        } else if (op === 'MOV') {
          ins.type = 'mov'; ins.dest = needReg(ops[0]); ins.b = regOrImm(ops[1]);
          if (ins.b.reg !== undefined) ins.srcs = [ins.b.reg];
        } else if (op === 'CMP') {
          ins.type = 'cmp'; ins.aReg = needReg(ops[0]); ins.b = regOrImm(ops[1]);
          ins.srcs = [ins.aReg]; if (ins.b.reg !== undefined) ins.srcs.push(ins.b.reg);
        } else if (op === 'BEQ' || op === 'BNE') {
          ins.type = 'branch'; ins.aReg = needReg(ops[0]); ins.b = { reg: needReg(ops[1]) };
          ins.srcs = [ins.aReg, ins.b.reg];
          const t = target(ops[2]); ins.target = t.idx; ins.label = t.label;
        } else if (op === 'JMP') {
          ins.type = 'jump'; const t = target(ops[0]); ins.target = t.idx; ins.label = t.label;
        } else if (op === 'HALT') ins.type = 'halt';
        ins.text = op + (shown.length ? ' ' + shown.join(', ') : '');
        program.push(ins);
      } catch (e) {
        if (!e.parse) throw e;
        errors.push({ line: r.line, message: e.message });
      }
    });
    errors.sort((a, b) => a.line - b.line);
    return { program: errors.length ? [] : program, errors, labels, ok: errors.length === 0 };
  }

  const Out = { parse, OPCODES, ARITY, SYNTAX, ALU_OPS, MEM_SIZE };
  if (isNode) module.exports = Out; else { g.CPUFlow = g.CPUFlow || {}; g.CPUFlow.InstructionParser = Out; }
})(typeof window !== 'undefined' ? window : globalThis);
