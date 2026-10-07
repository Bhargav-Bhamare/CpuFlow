/* architecture.js - Architecture Mode, Flynn's classification and the I/O lab (interrupt / DMA). */
(function () {
  const { $, $$, el, esc } = UI, D = Viz.add;
  UI.tabs($('#arch-tabs'), (n) => { if (n === 'flynn') flynn(cur.f); if (n === 'io') io(cur.io); });
  const cur = { f: 'SISD', io: 'polled' };

  /* ---- Architecture mode ---- */
  const DETAIL = {
    cu: ['Control Unit', 'Decodes each instruction and sends control signals (RegWrite, ALUOp, MemRead...) to the other units. Hardwired or microprogrammed.'],
    alu: ['Arithmetic Logic Unit', 'Performs ADD, SUB, MUL, DIV, AND, OR, XOR and comparisons, and sets the Z, N, C, V flags.'],
    rf: ['Registers', 'The fastest storage in the machine. Operands are read from here and results written back. This CPU has R0-R7.'],
    cache: ['L1 Cache', 'Holds recently used blocks of main memory. A hit costs one cycle; a miss fetches a whole block from memory.'],
    mem: ['Main Memory', 'Holds the program data. Much larger and slower than the cache.'],
    io: ['I/O Controller', 'Translates between the system bus and a peripheral. Can raise interrupts or run DMA transfers.'],
    dev: ['Peripheral', 'Keyboard, disk, network card... exchanges data with the system via its controller.']
  };
  const arch = Viz.createArchScene($('#arch-svg'));
  $('#arch-svg').addEventListener('click', (e) => {
    const g = e.target.closest('.node'); if (!g) return; e.stopPropagation();
    const id = g.dataset.id, d = DETAIL[id]; if (!d) return;
    const links = Object.keys(arch.l).filter((k) => arch.l[k].from === id || arch.l[k].to === id);
    links.forEach((k, i) => arch.send(k, { text: id === arch.l[k].from ? 'out' : 'in', tone: 'cyan', delay: i * 120, dur: 500 })); arch.act(id, 'cyan', 0, 900);
    const names = { cu: 'Control Unit', alu: 'ALU', rf: 'Registers', cache: 'Cache', mem: 'Main Memory', io: 'I/O Controller', dev: 'Peripheral', cpu: 'CPU bus' };
    $('#arch-detail').innerHTML = '<h2>' + d[0] + '</h2><p>' + d[1] + '</p><h3>Connected to</h3><ul>' + Array.from(new Set(links.map((k) => names[arch.l[k].from === id ? arch.l[k].to : arch.l[k].from]))).map((n) => '<li>' + n + '</li>').join('') + '</ul>';
  });

  /* ---- Flynn ---- */
  function flynnDef(t) {
    const N = [], L = [], n = t === 'SISD' ? 1 : 4, Y = (i) => 30 + i * 70, node = (id, x, y, w, label, cls) => N.push({ id, x, y, w, h: 50, label, center: true, cls: cls || '', tip: '' });
    const lnk = (id, pts, cls) => L.push({ id, pts, cls });
    const multiI = t === 'MISD' || t === 'MIMD', multiD = t === 'SIMD' || t === 'MIMD';
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? 110 : Y(i);
      node('pu' + i, 400, y, 110, 'PU ' + (i + 1), 'pu');
      if (multiI || i === 0) { node('is' + i, 20, multiI ? y : n === 1 ? 110 : 110, 130, multiI ? 'Instr. stream ' + (i + 1) : 'Instruction stream'); node('cu' + i, 210, multiI ? y : 110, 120, multiI ? 'CU ' + (i + 1) : 'Control unit'); lnk('isc' + i, [[150, (multiI ? y : 110) + 25], [210, (multiI ? y : 110) + 25]], 'ctl'); }
      if (multiI || n === 1) lnk('cup' + i, [[330, y + 25], [400, y + 25]], 'ctl');
      if (multiD || n === 1) { node('ds' + i, 580, y, 120, multiD ? 'Data stream ' + (i + 1) : 'Data stream'); lnk('dsp' + i, [[580, y + 25], [510, y + 25]]); }
    }
    if (t === 'SIMD') for (let i = 0; i < n; i++) lnk('cup' + i, [[330, 135], [365, 135], [365, Y(i) + 25], [400, Y(i) + 25]], 'ctl');
    if (t === 'MISD') { node('ds0', 580, 30, 120, 'Data stream'); lnk('dsp0', [[580, 55], [510, 55]]); for (let i = 0; i < 3; i++) lnk('chain' + i, [[455, Y(i) + 50], [455, Y(i + 1)]]); }
    return { id: 'fl', w: 720, h: n === 1 ? 250 : 310, minWidth: 600, nodes: N, links: L };
  }
  const FL = {
    SISD: ['Single Instruction, Single Data', 'One control unit sends one instruction stream to one processing unit, which works on one data stream. Classic uniprocessor.', 'Example: a simple single-core CPU executing one instruction at a time.'],
    SIMD: ['Single Instruction, Multiple Data', 'One instruction stream is broadcast to many processing units; each applies it to its own data item in lock-step.', 'Example: vector units and GPUs adding two arrays element by element.'],
    MISD: ['Multiple Instruction, Single Data', 'Several processing units apply different instruction streams to the same data stream, as a chain. Rare in practice.', 'Example: some fault-tolerant systems running diverse computations on identical input.'],
    MIMD: ['Multiple Instruction, Multiple Data', 'Independent processors each run their own instructions on their own data, asynchronously.', 'Example: multicore CPUs and clusters.']
  };
  let fs = null;
  function flynn(t) {
    Viz.finish(); fs = new Viz.Scene($('#flynn-svg'), flynnDef(t)); fs.ids = { rf: () => 'x' }; const f = FL[t];
    $('#flynn-detail').innerHTML = '<h2>' + t + '</h2><h3>' + f[0] + '</h3><p>' + f[1] + '</p><p class="muted">' + f[2] + '</p><dl class="kv"><div><dt>Instruction streams</dt><dd>' + (t === 'SISD' || t === 'SIMD' ? 1 : 4) + '</dd></div><div><dt>Data streams</dt><dd>' + (t === 'SISD' || t === 'MISD' ? 1 : 4) + '</dd></div><div><dt>Processing units</dt><dd>' + (t === 'SISD' ? 1 : 4) + '</dd></div></dl>';
  }
  $('#flynn-go').addEventListener('click', () => {
    Viz.finish(); const t = cur.f, n = t === 'SISD' ? 1 : 4;
    for (let i = 0; i < n; i++) {
      const base = i * 160;
      ['isc', 'cup'].forEach((p, j) => fs.send(p + i, { text: 'I' + (t === 'MIMD' || t === 'MISD' ? i + 1 : 1), tone: 'cyan', delay: base * (t === 'SIMD' ? 0 : 1) + j * 450, dur: 420 }));
      if (t === 'SIMD' && i > 0) fs.send('cup' + i, { text: 'I1', tone: 'cyan', delay: 450, dur: 420 });
      if (t === 'MISD') { fs.send('dsp0', { text: 'D', tone: 'amber', delay: 0, dur: 420 }); if (i < 3) fs.send('chain' + i, { text: 'D', tone: 'amber', delay: 500 + i * 600, dur: 450 }); fs.act('pu' + i, 'green', 500 + i * 600 - (i ? 0 : 0), 500); }
      else { fs.send('dsp' + i, { text: 'D' + (i + 1), tone: 'amber', delay: base * (t === 'SIMD' ? 0 : 1), dur: 420 }); fs.act('pu' + i, 'green', base * (t === 'SIMD' ? 0 : 1) + 900, 500); }
    }
  });
  UI.segmented($('#flynn-seg'), 'f', (t) => { cur.f = t; flynn(t); });

  /* ---- I/O lab ---- */
  const ioScene = new Viz.Scene($('#io-svg'), {
    id: 'io', w: 700, h: 330, minWidth: 600,
    nodes: [{ id: 'cpu', x: 20, y: 40, w: 150, h: 80, label: 'CPU', value: 'idle', tip: 'cpu' }, { id: 'ioc', x: 275, y: 40, w: 150, h: 80, label: 'I/O Controller', tip: 'io' }, { id: 'dev', x: 530, y: 40, w: 150, h: 80, label: 'Peripheral', tip: 'dev' }, { id: 'mem', x: 275, y: 220, w: 150, h: 80, label: 'Main Memory', tip: 'mem' }, { id: 'dma', x: 530, y: 220, w: 150, h: 80, label: 'DMA Controller' }],
    links: [{ id: 'cpuIo', pts: [[170, 68], [275, 68]] }, { id: 'ioCpu', pts: [[275, 98], [170, 98]] }, { id: 'ioDev', pts: [[425, 80], [530, 80]] }, { id: 'cpuMem', pts: [[95, 120], [95, 260], [275, 260]] }, { id: 'devDma', pts: [[605, 120], [605, 220]] }, { id: 'dmaMem', pts: [[530, 260], [425, 260]] }, { id: 'cpuDma', pts: [[60, 120], [60, 320], [570, 320], [570, 300]], cls: 'ctl' }, { id: 'dmaCpu', pts: [[640, 220], [640, 150], [130, 150], [130, 120]], cls: 'ctl' }]
  });
  const IO = {
    polled: ['Programmed I/O (polling)', 'The CPU repeatedly asks the controller whether the device is ready, wasting cycles until data arrives.'],
    int: ['Interrupt-driven I/O', 'The CPU runs other work. When the device is ready it raises an interrupt request; the CPU runs a short service routine, moves one word, and returns to its task.'],
    dma: ['Direct Memory Access', 'The CPU programs a DMA controller once. The controller moves the whole block between device and memory and interrupts the CPU only when it is done.']
  };
  const P = { words: 8, period: 5, isr: 3, setup: 3 };
  function io(m) {
    Viz.finish(); ioScene.reset(); ioScene.val('cpu', 'idle');
    const busy = m === 'polled' ? P.words * P.period : m === 'int' ? P.words * P.isr : P.setup + P.isr, total = P.words * P.period;
    $('#io-detail').innerHTML = '<h2>' + IO[m][0] + '</h2><p>' + IO[m][1] + '</p><p class="hint">Model: transferring ' + P.words + ' words; the device delivers one word every ' + P.period + ' CPU time units; an interrupt service routine costs ' + P.isr + '; DMA setup costs ' + P.setup + '.</p>';
    UI.bars($('#io-meter'), [{ key: 'b', label: 'CPU time spent on I/O', value: busy, max: total, text: busy + ' / ' + total + ' units', color: '#f87171' }, { key: 'f', label: 'CPU time free for work', value: total - busy, max: total, text: total - busy + ' / ' + total + ' units', color: '#34d399' }]);
  }
  $('#io-go').addEventListener('click', () => {
    const m = cur.io, s = ioScene; Viz.finish(); s.reset();
    if (m === 'polled') {
      s.val('cpu', 'polling...'); s.act('cpu', 'amber', 0, 3200);
      for (let k = 0; k < 4; k++) { const t = k * 800; s.send('cpuIo', { text: 'ready?', delay: t, dur: 300 }); s.send('ioDev', { text: 'status', delay: t + 300, dur: 200 }); s.send('ioCpu', { text: k < 3 ? 'busy' : 'READY', tone: k < 3 ? 'amber' : 'green', delay: t + 500, dur: 280 }); }
      s.send('ioCpu', { text: 'word', tone: 'green', delay: 3300, dur: 300 }); s.send('cpuMem', { text: 'store', tone: 'cyan', delay: 3600, dur: 500, onEnd: () => s.val('cpu', 'done (never free)') }); s.act('mem', 'green', 4000, 500);
    } else if (m === 'int') {
      s.val('cpu', 'running task'); s.act('cpu', 'green', 0, 1200);
      s.send('ioDev', { text: 'ready', rev: true, tone: 'amber', delay: 800, dur: 300 }); s.send('ioCpu', { text: 'IRQ', tone: 'red', delay: 1100, dur: 300, onEnd: () => s.val('cpu', 'ISR: service') }); s.act('cpu', 'red', 1400, 900);
      s.send('cpuIo', { text: 'read', delay: 1500, dur: 280 }); s.send('ioCpu', { text: 'word', tone: 'green', delay: 1800, dur: 280 }); s.send('cpuMem', { text: 'store', delay: 2100, dur: 450, onEnd: () => s.val('cpu', 'resume task') }); s.act('mem', 'green', 2500, 400);
    } else {
      s.send('cpuDma', { text: 'setup', tone: 'purple', delay: 0, dur: 600, onEnd: () => s.val('cpu', 'free: running task') }); s.act('dma', 'purple', 500, 400); s.act('cpu', 'green', 700, 2600);
      for (let k = 0; k < 3; k++) { s.send('devDma', { text: 'data', tone: 'amber', delay: 1000 + k * 650, dur: 300 }); s.send('dmaMem', { text: 'block ' + (k + 1), tone: 'green', delay: 1300 + k * 650, dur: 300 }); s.act('mem', 'green', 1500 + k * 650, 300); }
      s.send('dmaCpu', { text: 'IRQ: done', tone: 'red', delay: 3300, dur: 600, onEnd: () => s.val('cpu', 'ISR: transfer done') }); s.act('cpu', 'red', 3800, 500);
    }
  });
  UI.segmented($('#io-seg'), 'io', (m) => { cur.io = m; io(m); });
  flynn('SISD'); io('polled');
})();
