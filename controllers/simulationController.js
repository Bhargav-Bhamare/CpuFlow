const path = require('path');
const sim = (n) => require(path.join('..', 'simulation', n));
const Parser = sim('InstructionParser'), Engine = sim('SimulationEngine'), Programs = sim('Programs');

// Renders a view to a string, then wraps it in layout.ejs (so pages contain only their own markup).
exports.page = (view, meta) => (req, res, next) => {
  res.app.render(view, meta, (err, body) => {
    if (err) return next(err);
    res.render('layout', Object.assign({}, meta, { body }));
  });
};

exports.health = (req, res) => res.json({ ok: true, name: 'CPUFlow' });
exports.programs = (req, res) => res.json(Programs);

// POST /api/parse { source } -> parser result (errors include line numbers)
exports.parse = (req, res) => {
  const r = Parser.parse(String((req.body && req.body.source) || ''));
  res.json({ ok: r.ok, errors: r.errors, instructions: r.program.map((i) => ({ n: i.n, text: i.text, line: i.line })) });
};

// POST /api/run { source, config } -> runs the program to completion on the server and returns the final state
exports.run = (req, res) => {
  const body = req.body || {};
  const e = new Engine(body.config || {});
  const p = e.loadProgram(String(body.source || ''));
  if (!p.ok) return res.status(400).json({ ok: false, errors: p.errors });
  e.finish();
  const s = e.getState();
  res.json({ ok: !s.error, error: s.error, cycles: s.cycle, registers: s.registers, metrics: s.metrics, config: s.config });
};
