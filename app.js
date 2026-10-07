const express = require('express');
const path = require('path');
const routes = require('./routes');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));
// The simulation modules are UMD files: Node uses them for the API, the browser loads the same files from /sim.
app.use('/sim', express.static(path.join(__dirname, 'simulation')));
app.use('/', routes);

app.use((req, res) => res.status(404).render('layout', { title: 'Not found', active: '', sim: false, scripts: [], styles: [], body: '<section class="page narrow"><h1>404</h1><p>That page does not exist. <a href="/">Back to CPUFlow</a></p></section>' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('layout', { title: 'Error', active: '', sim: false, scripts: [], styles: [], body: '<section class="page narrow"><h1>Something went wrong</h1><p>The server hit an error while rendering this page.</p></section>' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log('CPUFlow running at http://localhost:' + PORT));
module.exports = app;
