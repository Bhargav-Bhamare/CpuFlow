/* about.js - concept explainers built on the real simulator classes. */
(function () {
  const { $, $$, el, esc } = UI, PA = CPUFlow.PerformanceAnalyzer;
  UI.tabs($('#about-tabs'), (n) => { if (n === 'pipe') pipe(); if (n === 'haz') haz(cur.hz); });
  const cur = { pp: 'seq', hz: 'data' };

  /* organization */
  const org = Viz.createArchScene($('#org-svg'));
  $('#org-svg').addEventListener('click', (e) => { const g = e.target.closest('.node'); if (!g) return; e.stopPropagation(); const i = UI.INFO[g.dataset.id]; if (!i) return; $('#org-detail').textContent = i[0] + ': ' + i[1]; org.act(g.dataset.id, 'cyan', 0, 900); Object.keys(org.l).filter((k) => org.l[k].from === g.dataset.id || org.l[k].to === g.dataset.id).forEach((k) => org.send(k, { text: '\u2022', dur: 500 })); });

  /* instruction cycle */
  const CYC = [['Fetch', 'Read the instruction at address PC into the IR, then add 1 to the PC.'], ['Decode', 'The control unit works out what the instruction means and reads source registers.'], ['Execute', 'The ALU performs the operation (or computes a memory address).'], ['Memory', 'Loads and stores access the cache / main memory. Other instructions skip this.'], ['Write back', 'The result is written to the destination register.']];
  const row = $('#cyc-row'); let timer = null;
  CYC.forEach((c, i) => row.append(el('button', { class: 'cyc-chip', onclick: () => { clearTimeout(timer); pick(i); } }, el('b', { text: String(i + 1) }), c[0])));
  function pick(i) { $$('.cyc-chip', row).forEach((b, j) => b.classList.toggle('on', j === i)); $('#cyc-detail').textContent = CYC[i][0] + ': ' + CYC[i][1]; }
  $('#cyc-play').addEventListener('click', () => { clearTimeout(timer); let i = 0; (function go() { pick(i); i++; if (i < 5) timer = setTimeout(go, 1200); })(); });

  /* pipelining */
  function grid(rows, cMax) {
    let h = '<table class="timeline"><thead><tr><th class="sticky">Instr.</th>'; for (let c = 1; c <= cMax; c++) h += '<th>' + c + '</th>'; h += '</tr></thead><tbody>';
    rows.forEach((r) => { const m = {}; r.cells.forEach((x) => { m[x.c] = x; }); h += '<tr><th class="sticky"><b>I' + r.seq + '</b>' + (r.text ? ' <code>' + esc(r.text) + '</code>' : '') + '</th>'; for (let c = 1; c <= cMax; c++) { const x = m[c]; h += x ? '<td class="cell ' + x.st + '" style="animation-delay:' + c * 70 + 'ms"><span>' + (x.st === 'flush' ? 'X' : x.s + (x.st === 'stall' ? '*' : '')) + '</span></td>' : '<td></td>'; } h += '</tr>'; });
    return h + '</tbody></table>';
  }
  function pipe() {
    const n = +$('#pp-n').value, p = cur.pp === 'pipe'; $('#pp-n-v').textContent = n;
    const rows = [], ST = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    for (let i = 0; i < n; i++) { const cells = ST.map((s, j) => ({ c: (p ? i : i * 5) + j + 1, s, st: 'ok' })); rows.push({ seq: i + 1, cells }); }
    const cyc = p ? n + 4 : 5 * n;
    $('#pp-grid').innerHTML = grid(rows, cyc);
    $('#pp-detail').textContent = (p ? 'Pipelined: n + 4 = ' : 'Sequential: 5 \u00d7 n = ') + cyc + ' cycles for ' + n + ' instructions. ' + 'Speedup of pipelining over sequential: ' + (5 * n) + ' / ' + (n + 4) + ' = ' + (5 * n / (n + 4)).toFixed(2) + '\u00d7 (approaches 5 as n grows).';
  }
  UI.segmented($('#pp-seg'), 'pp', (v) => { cur.pp = v; pipe(); }); $('#pp-n').addEventListener('input', pipe); pipe();

  /* cache */
  const mem = new CPUFlow.Memory(1024), cache = new CPUFlow.Cache({ mapping: 'direct', lines: 4, blockSize: 2 }, mem), cb = $('#cc-btns');
  [0, 1, 2, 8, 0, 9, 16, 1].forEach((a, i) => cb.append(el('button', { class: 'btn sm', onclick: () => access(a) }, 'Read ' + a)));
  cb.append(el('button', { class: 'btn sm danger', onclick: () => { cache.reset(); draw(null); $('#cc-detail').textContent = 'Cache cleared.'; } }, 'Clear'));
  function draw(res) {
    $('#cc-lines').innerHTML = cache.snapshot().map((s, i) => { const l = s[0]; return '<div class="ccl ' + (res && res.set === i ? (res.hit ? 'hit' : 'miss') : '') + '"><small>line ' + i + '</small><b>' + (l.valid ? 'tag ' + l.tag : 'empty') + '</b><span>' + (l.valid ? l.data.join(' | ') : '- | -') + '</span></div>'; }).join('');
  }
  function access(a) { const r = cache.access(a, false); draw(r); $('#cc-detail').textContent = 'Address ' + a + ' \u2192 block ' + r.block + ', line ' + r.set + ': ' + (r.hit ? 'HIT (data was already cached)' : 'MISS (block loaded from memory' + (r.evicted ? ', replacing another block' : '') + ')') + '. Hit ratio so far: ' + UI.pct(cache.metrics().hitRatio); }
  draw(null);

  /* hazards (rendered from real pipeline runs) */
  const HZ = {
    data: { prog: 'ADD R1, R2, R3\nSUB R4, R1, R5\nOR R6, R4, R1', cfg: { pipelined: true, forwarding: false }, txt: 'RAW dependency: SUB needs R1 before ADD has written it back. With no forwarding the pipeline stalls (*). Turning forwarding on removes the stalls.' },
    control: { prog: 'MOV R1, 5\nMOV R2, 5\nBEQ R1, R2, 6\nADD R3, R3, 1\nSUB R4, R4, 1\nHALT', cfg: { pipelined: true, forwarding: true }, txt: 'The branch is resolved in EX. When it is taken the two younger instructions already in IF and ID are wrong-path and are flushed (X).' },
    struct: { prog: 'LOAD R1, 8\nADD R2, R2, 1\nADD R3, R3, 1\nADD R4, R4, 1', cfg: { pipelined: true, forwarding: true, unifiedMemory: true, cache: { missPenalty: 1 } }, txt: 'With a single memory port, a LOAD in MEM blocks instruction fetch in the same cycle: a structural hazard (bubble in IF).' }
  };
  function haz(k) {
    const h = HZ[k], e = new CPUFlow.SimulationEngine(h.cfg); e.loadProgram(h.prog); e.finish();
    const rows = e.getTimeline(12); rows.forEach((r) => { r.seq = r.seq; });
    $('#hz-grid').innerHTML = grid(rows, e.cpu.cycle); const s = e.cpu.stats;
    $('#hz-detail').textContent = h.txt + '  Result: ' + e.cpu.cycle + ' cycles, ' + s.dataStalls + ' data stall' + (s.dataStalls === 1 ? '' : 's') + ', ' + s.flushes + ' flushed, ' + s.structStalls + ' structural stall' + (s.structStalls === 1 ? '' : 's') + '.';
  }
  UI.segmented($('#hz-seg'), 'hz', (v) => { cur.hz = v; haz(v); });

  /* CPI / MIPS / Amdahl */
  const bar = (host, items) => UI.bars(host, items);
  function cpi() { const ic = +$('#cp-ic').value, cy = +$('#cp-cy').value, v = cy / ic; $('#cp-ic-v').textContent = ic; $('#cp-cy-v').textContent = cy; $('#cp-out').textContent = v.toFixed(2); bar($('#cp-bar'), [{ key: 'a', label: 'This CPI', value: v, max: 10, text: v.toFixed(2), color: '#22d3ee' }, { key: 'b', label: 'Ideal pipeline CPI', value: 1, max: 10, text: '1.00', color: '#34d399' }]); }
  $('#cp-ic').addEventListener('input', cpi); $('#cp-cy').addEventListener('input', cpi); cpi();
  function mips() { const f = +$('#mp-f').value, c = +$('#mp-c').value, v = f / c; $('#mp-f-v').textContent = f; $('#mp-c-v').textContent = c.toFixed(1); $('#mp-out').textContent = v.toFixed(1); bar($('#mp-bar'), [{ key: 'a', label: 'MIPS = f / CPI', value: v, max: 4000, text: v.toFixed(1), color: '#22d3ee' }]); }
  $('#mp-f').addEventListener('input', mips); $('#mp-c').addEventListener('input', mips); mips();
  function amd() {
    const f = +$('#ad-f').value, s = +$('#ad-s').value, sp = PA.amdahl(f, s), lim = PA.amdahlLimit(f), nw = (1 - f) + f / s;
    $('#ad-f-v').textContent = f.toFixed(2); $('#ad-s-v').textContent = s + '\u00d7'; $('#ad-out').textContent = sp.toFixed(2) + '\u00d7'; $('#ad-lim').textContent = 'Limit: ' + (isFinite(lim) ? lim.toFixed(2) + '\u00d7' : '\u221e');
    $('#ad-split').innerHTML = '<div class="as"><small>Before</small><div class="seg-bar"><i class="ser" style="flex:' + (1 - f) + '">not improved ' + (1 - f).toFixed(2) + '</i><i class="imp" style="flex:' + f + '">improved ' + f.toFixed(2) + '</i></div></div><div class="as"><small>After (time = ' + nw.toFixed(3) + ')</small><div class="seg-bar" style="width:' + nw * 100 + '%"><i class="ser" style="flex:' + (1 - f) + '"></i><i class="imp" style="flex:' + f / s + '"></i></div></div>';
  }
  $('#ad-f').addEventListener('input', amd); $('#ad-s').addEventListener('input', amd); amd();
  pick(0);
})();
