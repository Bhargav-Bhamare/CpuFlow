/* home.js - hero animation: one instruction cycling through the CPU. */
(function () {
  const svg = document.getElementById('hero-svg'); if (!svg) return;
  const s = new Viz.Scene(svg, {
    id: 'hero', w: 570, h: 350,
    nodes: [{ id: 'im', x: 30, y: 20, w: 150, h: 60, label: 'Instruction Memory', value: 'ADD R3,R1,R2', cls: 'small' }, { id: 'cu', x: 250, y: 20, w: 150, h: 60, label: 'Control Unit', value: '-' },
      { id: 'rf', x: 30, y: 150, w: 150, h: 70, label: 'Registers', value: 'R1=10  R2=20' }, { id: 'alu', x: 250, y: 150, w: 150, h: 70, label: 'ALU', value: '-' },
      { id: 'cache', x: 250, y: 270, w: 150, h: 60, label: 'Cache', value: '-' }, { id: 'mem', x: 440, y: 270, w: 100, h: 60, label: 'Memory', value: '-' }],
    links: [{ id: 'imCU', pts: [[180, 50], [250, 50]] }, { id: 'ctlRF', pts: [[290, 80], [290, 112], [105, 112], [105, 150]], cls: 'ctl' }, { id: 'ctlALU', pts: [[360, 80], [360, 150]], cls: 'ctl' },
      { id: 'rfALU', pts: [[180, 176], [250, 176]] }, { id: 'wb', pts: [[250, 204], [180, 204]] }, { id: 'aluC', pts: [[325, 220], [325, 270]] }, { id: 'cM', pts: [[400, 300], [440, 300]] }]
  });
  const steps = Array.from(document.querySelectorAll('#hero-steps li')), status = document.getElementById('hero-status-text'), still = Viz.reduced();
  const names = ['FETCH', 'DECODE', 'EXECUTE', 'MEMORY', 'WRITE BACK']; let k = 0, round = 0;
  function mark(i) { steps.forEach((l, j) => l.classList.toggle('on', j === i)); status.textContent = names[i] + ' \u00b7 ADD R3, R1, R2'; }
  function stage() {
    mark(k); const hit = round % 2 === 1, T = 1000;
    if (k === 0) { s.val('cu', '-'); s.val('alu', '-'); s.val('cache', '-'); s.val('mem', '-'); s.val('rf', 'R1=10  R2=20'); s.act('im', 'cyan', 0, T * 0.8); s.send('imCU', { text: 'ADD R3,R1,R2', dur: T * 0.7 }); }
    if (k === 1) { s.act('cu', 'purple', 0, T * 0.8); s.val('cu', 'ALUOp: ADD'); s.glow('ctlRF', 'purple', 0, T * 0.7); s.glow('ctlALU', 'purple', 0, T * 0.7); }
    if (k === 2) { s.act('rf', 'cyan', 0, T * 0.5); s.send('rfALU', { text: '10 , 20', dur: T * 0.5 }); s.act('alu', 'amber', T * 0.5, T * 0.4); s.T(T * 0.6, () => s.val('alu', '10+20=30')); }
    if (k === 3) { s.send('aluC', { text: 'addr', dur: T * 0.4 }); s.act('cache', hit ? 'green' : 'red', T * 0.4, T * 0.5); s.val('cache', hit ? 'HIT' : 'MISS'); if (!hit) { s.send('cM', { text: 'block', tone: 'amber', delay: T * 0.5, dur: T * 0.3 }); s.act('mem', 'amber', T * 0.7, T * 0.3); s.val('mem', 'fill'); } }
    if (k === 4) { s.send('wb', { text: '30', tone: 'green', dur: T * 0.6, onEnd: () => s.val('rf', 'R3=30') }); s.act('rf', 'green', T * 0.6, T * 0.4); }
    k = (k + 1) % 5; if (k === 0) round++;
    setTimeout(stage, still ? 1600 : 1100);
  }
  stage();
})();
