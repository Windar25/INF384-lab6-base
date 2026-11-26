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
app.use('/habilitados', require('./routes/habilitados'));

// Captura SyntaxError de express.json() cuando el body no es JSON válido (requisitos 7.7, 8.1, 8.2)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res
      .status(400)
      .json({ error: 'el cuerpo de la petición debe ser JSON válido' });
  }
  return next(err);
});

// Middleware de manejo de errores — debe ir después de todos los routers
app.use(manejadorErrores);

module.exports = app;
