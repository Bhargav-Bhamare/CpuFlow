const express = require('express');
const c = require('../controllers/simulationController');
const router = express.Router();

router.get('/', c.page('index', { title: 'CPUFlow - See what happens inside a CPU', active: 'home', sim: false, scripts: ['visualization.js', 'home.js'], styles: [] }));
router.get('/simulator', c.page('simulator', { title: 'CPU Simulator - CPUFlow', active: 'simulator', sim: true, scripts: ['charts.js', 'visualization.js', 'control.js', 'simulator.js'], styles: ['simulator.css', 'labs.css'] }));
router.get('/pipeline', c.page('pipeline', { title: 'Pipeline Lab - CPUFlow', active: 'pipeline', sim: true, scripts: ['charts.js', 'visualization.js', 'pipeline.js'], styles: ['simulator.css', 'pipeline.css'] }));
router.get('/cache', c.page('cache', { title: 'Cache & Memory Lab - CPUFlow', active: 'cache', sim: true, scripts: ['charts.js', 'visualization.js', 'cache.js'], styles: ['simulator.css', 'labs.css'] }));
router.get('/control-unit', c.page('control-unit', { title: 'Control Unit Lab - CPUFlow', active: 'control', sim: true, scripts: ['visualization.js', 'control.js'], styles: ['simulator.css', 'labs.css'] }));
router.get('/performance', c.page('performance', { title: 'Performance Analyzer - CPUFlow', active: 'performance', sim: true, scripts: ['charts.js', 'visualization.js', 'performance.js'], styles: ['simulator.css', 'labs.css'] }));
router.get('/architecture', c.page('architecture', { title: 'Architecture, Flynn & I/O - CPUFlow', active: 'architecture', sim: true, scripts: ['charts.js', 'visualization.js', 'architecture.js'], styles: ['labs.css'] }));
router.get('/about', c.page('about', { title: 'Concepts - CPUFlow', active: 'about', sim: true, scripts: ['charts.js', 'visualization.js', 'about.js'], styles: ['labs.css'] }));

router.get('/api/health', c.health);
router.get('/api/programs', c.programs);
router.post('/api/parse', c.parse);
router.post('/api/run', c.run);

module.exports = router;
