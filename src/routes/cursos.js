const express = require('express');
const repositorio = require('../data/repositorio');

const router = express.Router();

/**
 * GET /cursos
 * GET /cursos?ciclo=N  (N entero entre 5 y 10)
 *
 * Requisitos 1.1, 1.2, 1.3
 */
router.get('/', (req, res) => {
  const { ciclo } = req.query;

  // Sin filtro → devuelve todos los cursos (Requisito 1.1)
  if (ciclo === undefined) {
    return res.json(repositorio.listar());
  }

  // Validar que sea un entero entre 5 y 10 (Requisito 1.3)
  const cicloNum = Number(ciclo);
  const esEnteroValido =
    Number.isInteger(cicloNum) && cicloNum >= 5 && cicloNum <= 10;

  if (!esEnteroValido) {
    return res
      .status(400)
      .json({ error: 'ciclo debe ser un entero entre 5 y 10' });
  }

  // Filtrar por ciclo (Requisito 1.2)
  return res.json(repositorio.listarPorCiclo(cicloNum));
});

/**
 * GET /cursos/:codigo
 *
 * Requisitos 2.1, 2.2
 */
router.get('/:codigo', (req, res) => {
  const curso = repositorio.obtener(req.params.codigo);

  if (!curso) {
    return res.status(404).json({ error: 'curso no encontrado' });
  }

  return res.json(curso);
});

module.exports = router;
