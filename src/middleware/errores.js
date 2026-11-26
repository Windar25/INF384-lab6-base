'use strict';

/**
 * Middleware de manejo de errores (requisito 3.1).
 * Captura cualquier error no controlado por las rutas y responde
 * con un mensaje genérico, sin filtrar detalles internos.
 */
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'error interno del servidor' });
}

module.exports = manejadorErrores;
