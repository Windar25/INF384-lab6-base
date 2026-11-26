const path = require('path');
const express = require('express');
const repositorio = require('./data/repositorio');
const manejadorErrores = require('./middleware/errores');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', cursos: repositorio.listar().length });
});

app.use('/cursos', require('./routes/cursos'));

// Middleware de manejo de errores — debe ir después de todos los routers
app.use(manejadorErrores);

module.exports = app;
