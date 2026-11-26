const express = require('express');
const repositorio = require('../data/repositorio');
const {
  validarAprobados,
  calcularHabilitados,
} = require('../util/habilitados');

const router = express.Router();

/**
 * POST /habilitados
 *
 * Requisitos 4.1, 4.2, 6.4, 8.1
 */
router.post('/', (req, res, next) => {
  try {
    const errorValidacion = validarAprobados(req.body);
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    const aprobadosSet = new Set(req.body.aprobados); // deduplica
    const habilitados = calcularHabilitados(
      repositorio.listar(),
      aprobadosSet
    );
    return res.status(200).json(habilitados);
  } catch (err) {
    return next(err); // 500 vía middleware/errores.js
  }
});

module.exports = router;
