/* cache.js - Cache & Memory Lab. Drives the real Cache class directly; animation follows each access result. */
(function () {
  const { $, el } = UI, PA = CPUFlow.PerformanceAnalyzer;
  const mem = new CPUFlow.Memory(1024), stored = UI.loadConfig();
  const cache = new CPUFlow.Cache(stored.cache, mem);
  const sel = { map: $('#c-map'), lines: $('#c-lines'), block: $('#c-block'), ways: $('#c-ways'), pol: $('#c-pol'), pen: $('#c-pen') };

  /* scene: CPU - L1 - memory with moving packets */
  const scene = new Viz.Scene($('#cache-svg'), {
    id: 'cl', w: 780, h: 200, minWidth: 640,
    nodes: [{ id: 'cpu', x: 20, y: 50, w: 140, h: 100, label: 'CPU', value: 'idle', tip: 'cpu' }, { id: 'cache', x: 290, y: 50, w: 200, h: 100, label: 'L1 Cache', value: '-', sub: '', tip: 'cache' }, { id: 'mem', x: 620, y: 50, w: 140, h: 100, label: 'Main Memory', value: '-', tip: 'mem' }],
    links: [{ id: 'req', pts: [[160, 82], [290, 82]] }, { id: 'resp', pts: [[290, 124], [160, 124]] }, { id: 'fill', pts: [[490, 82], [620, 82]] }, { id: 'blk', pts: [[620, 124], [490, 124]] }]
  });
  scene.ids = { rf: () => 'x' };

  function applyCfg(norm) {
    if (norm) { sel.map.value = cache.cfg.mapping; sel.lines.value = cache.cfg.lines; sel.block.value = cache.cfg.blockSize; sel.ways.value = String(Math.min(cache.cfg.ways, 8)); sel.pol.value = cache.cfg.policy; sel.pen.value = cache.cfg.missPenalty; }
    sel.ways.disabled = sel.map.value !== 'set';
    const c = cache.cfg;
    $('#c-geom').textContent = c.lines + ' lines = ' + c.sets + ' set' + (c.sets > 1 ? 's' : '') + ' \u00d7 ' + c.ways + ' way' + (c.ways > 1 ? 's' : '') + ' \u00b7 capacity ' + c.lines * c.blockSize + ' words \u00b7 ' + c.policy + ' replacement';
  }
  function reconfigure() {
    cache.configure({ mapping: sel.map.value, lines: +sel.lines.value, blockSize: +sel.block.value, ways: +sel.ways.value, policy: sel.pol.value, missPenalty: +sel.pen.value });
    UI.saveConfig(Object.assign(UI.loadConfig(), { cache: cache.cfg })); applyCfg(true); queue.length = 0; scene.reset(); Viz.finish(); setVerdict('idle'); renderAll(null);
  }
  Object.values(sel).forEach((s) => s.addEventListener('change', reconfigure));

  /* address bit breakdown */
  function bits(res) {
    const c = cache.cfg, off = Math.log2(c.blockSize), idx = Math.log2(c.sets), tag = 10 - off - idx;
    const b = res ? res.addr.toString(2).padStart(10, '0') : '??????????';
    const part = (s, e, cls, name) => '<div class="ab ' + cls + '" style="flex:' + Math.max(e - s, 0.4) + '"><code>' + (e - s ? b.slice(s, e) : '-') + '</code><small>' + name + ' (' + (e - s) + ' bit' + (e - s === 1 ? '' : 's') + ')' + (res ? ' = ' + (name === 'tag' ? res.tag : name === 'index' ? res.set : res.offset) : '') + '</small></div>';
    $('#addr-bits').innerHTML = part(0, tag, 'tag', 'tag') + part(tag, tag + idx, 'idx', 'index') + part(tag + idx, 10, 'off', 'offset');
    $('#addr-note').textContent = c.mapping === 'fully' ? 'Fully associative: no index bits - any block can go in any line' : c.mapping === 'direct' ? 'Direct mapped: index picks exactly one line' : 'Set associative: index picks a set, tag is compared in every way';
  }
  const setVerdict = (s) => { const v = $('#verdict'); v.dataset.state = s; v.textContent = s === 'hit' ? 'CACHE HIT' : s === 'miss' ? 'CACHE MISS' : 'IDLE'; };

  /* metrics, chart, hierarchy */
  const metrics = UI.metricStrip($('#cache-metrics'), [{ id: 'acc', label: 'Total accesses' }, { id: 'hits', label: 'Hits' }, { id: 'miss', label: 'Misses' }, { id: 'hr', label: 'Hit ratio' }, { id: 'mr', label: 'Miss ratio' }, { id: 'amat', label: 'Avg. memory access time', tip: 'hit time + miss ratio x miss penalty (cycles)' }]);
  function renderMetrics() { const m = cache.metrics(); metrics({ acc: m.accesses, hits: m.hits, miss: m.misses, hr: UI.pct(m.hitRatio).replace(/(\.\d)\d*%/, '$1%'), mr: UI.pct(m.missRatio), amat: UI.fix(m.amat) + ' cyc' }); }
  function renderChart() {
    let h = 0, m = 0; const H = [], M = [];
    cache.series.forEach((x) => { x ? h++ : m++; H.push(h); M.push(m); });
    Charts.line($('#hm-chart'), [{ name: 'Hits', color: '#34d399', data: H }, { name: 'Misses', color: '#f87171', data: M }], { w: 420, h: 190, xLabel: 'access #', empty: 'Send a request to start the chart' });
  }
  const LEVELS = [
    { k: 'reg', n: 'Registers', lat: '~0.3 ns', cap: '~1 KB', cost: '$$$$$', sp: 100, ca: 5, co: 100 }, { k: 'l1', n: 'L1 Cache', lat: '~1 ns', cap: '32-64 KB', cost: '$$$$', sp: 88, ca: 20, co: 82 },
    { k: 'l2', n: 'L2 Cache', lat: '~4 ns', cap: '256 KB-1 MB', cost: '$$$', sp: 72, ca: 35, co: 66 }, { k: 'l3', n: 'L3 Cache', lat: '~12 ns', cap: '8-32 MB', cost: '$$', sp: 58, ca: 50, co: 52 },
    { k: 'ram', n: 'RAM', lat: '~80 ns', cap: '8-64 GB', cost: '$', sp: 36, ca: 72, co: 30 }, { k: 'disk', n: 'Storage (SSD/HDD)', lat: '~100 \u00b5s+', cap: '0.5-8 TB', cost: '\u00a2', sp: 10, ca: 100, co: 8 }
  ];
  const hier = $('#hierarchy');
  hier.innerHTML = LEVELS.map((l) => '<div class="lv" data-k="' + l.k + '"><b>' + l.n + '</b><span class="bar sp" title="speed"><i style="width:' + l.sp + '%"></i></span><span class="bar ca" title="capacity"><i style="width:' + l.ca + '%"></i></span><span class="bar co" title="cost per bit"><i style="width:' + l.co + '%"></i></span><em>' + l.lat + ' &middot; ' + l.cap + ' &middot; ' + l.cost + '</em></div>').join('') + '<div class="hier-key"><span class="sp">speed</span><span class="ca">capacity</span><span class="co">cost / bit</span></div><p class="hint">Typical orders of magnitude. Only L1 is simulated here; L2/L3 are shown for context on the path to RAM.</p>';
  function hierPath(hit) { hier.querySelectorAll('.lv').forEach((e) => { const k = e.dataset.k; e.classList.toggle('path', hit === null ? false : k === 'reg' || k === 'l1' || (!hit && k !== 'disk')); e.classList.toggle('miss', hit === false && k !== 'reg' && k !== 'l1' && k !== 'disk'); }); }

  const mv = UI.memoryViewer($('#memview'), mem);
  function renderAll(res) { UI.cacheTable($('#cache-table'), cache, res); renderMetrics(); renderChart(); bits(res); mv.update(res ? { addr: res.addr, type: res.write ? 'write' : 'read' } : null); }

  /* request pipeline (queued so patterns animate one after another) */
  const queue = []; let busy = false;
  function animate(res, dur) {
    scene.reset(); const D = (f) => f * dur;
    scene.val('cpu', (res.write ? 'WRITE ' : 'READ ') + res.addr); scene.act('cpu', 'cyan', 0, D(0.3));
    scene.send('req', { text: (res.write ? 'W ' : 'R ') + res.addr, dur: D(0.3) });
    scene.val('cache', 'set ' + res.set + ' tag ' + res.tag); scene.sub('cache', res.hit ? 'HIT' : 'MISS' + (res.evicted ? ' (evict block @' + res.evicted.base + ')' : ''));
    scene.act('cache', res.hit ? 'green' : 'red', D(0.3), D(0.5));
    let t = 0.55;
    if (!res.hit) { scene.send('fill', { text: 'blk ' + res.block, tone: 'amber', delay: D(t), dur: D(0.2) }); scene.act('mem', 'amber', D(t + 0.1), D(0.3)); scene.val('mem', 'block @' + res.block * cache.cfg.blockSize); t += 0.2; scene.send('blk', { text: cache.cfg.blockSize + ' words', tone: 'amber', delay: D(t), dur: D(0.2) }); t += 0.2; }
    scene.send('resp', { text: String(res.value), tone: 'green', delay: D(Math.min(t, 0.8)), dur: D(0.25) });
  }
  function request(addr, write, value, dur) {
    let res;
    try { res = write ? cache.access(addr, true, value) : cache.access(addr, false); } catch (e) { UI.toast(e.message, 'err'); return false; }
    setVerdict(res.hit ? 'hit' : 'miss'); renderAll(res); animate(res, dur);
    hierPath(res.hit); return true;
  }
  function pump() {
    if (busy || !queue.length) return; busy = true; const q = queue.shift(), dur = queue.length > 2 ? 160 : 420;
    request(q.a, q.w, q.v, dur); setTimeout(() => { busy = false; pump(); }, dur * 1.25 + 40);
  }
  function enqueue(list) { list.forEach((a) => queue.push(typeof a === 'object' ? a : { a, w: false })); pump(); }
  const parseAddr = (s) => { s = String(s).trim(); const v = /^0x/i.test(s) ? parseInt(s, 16) : /^\d+$/.test(s) ? parseInt(s, 10) : NaN; return v; };

  $('#req-go').addEventListener('click', () => {
    const a = parseAddr($('#req-addr').value); if (isNaN(a) || a < 0 || a > 1023) { UI.toast('Invalid memory address (valid range 0-1023)', 'err'); return; }
    const vs = $('#req-val').value.trim(); let v = null; if (vs !== '') { v = parseInt(vs, /^0x/i.test(vs) ? 16 : 10); if (isNaN(v)) { UI.toast('Invalid write value', 'err'); return; } }
    enqueue([{ a, w: v !== null, v }]);
  });
  $('#req-addr').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#req-go').click(); });
  $('#pat-seq').addEventListener('click', () => enqueue(Array.from({ length: 16 }, (_, i) => i)));
  $('#pat-loop').addEventListener('click', () => { const l = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) l.push(40 + i); enqueue(l); });
  $('#pat-rand').addEventListener('click', () => enqueue(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))));
  $('#pat-conflict').addEventListener('click', () => { const stride = cache.cfg.sets * cache.cfg.blockSize, n = cache.cfg.ways + 1, l = []; for (let r = 0; r < 3; r++) for (let k = 0; k < n; k++) l.push(8 + k * stride); enqueue(l); UI.toast('Addresses ' + n + ' blocks apart by ' + stride + ' words all map to the same set', 'ok'); });
  $('#pat-prog').addEventListener('click', () => {
    const text = UI.loadProgram() || CPUFlow.Programs[0].code, p = CPUFlow.InstructionParser.parse(text);
    if (!p.ok) { UI.toast('The saved program has errors - fix it in the Simulator first', 'err'); return; }
    const cpu = PA.runHeadless(p.program, { pipelined: false }); if (!cpu.accessLog.length) { UI.toast('That program makes no memory accesses', 'err'); return; }
    enqueue(cpu.accessLog.map((x) => ({ a: x.addr, w: x.write, v: x.addr })));
  });
  $('#c-reset').addEventListener('click', () => { queue.length = 0; cache.reset(); mem.reset(); scene.reset(); Viz.finish(); setVerdict('idle'); hierPath(null); scene.val('cpu', 'idle'); scene.val('cache', '-'); scene.sub('cache', ''); scene.val('mem', '-'); renderAll(null); mv.render(); });

  applyCfg(true); setVerdict('idle'); renderAll(null);
})();
