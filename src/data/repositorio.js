const path = require('path');
const fs = require('fs');

const RUTA_DATOS = path.join(__dirname, '..', '..', 'data', 'cursos.json');

// Se carga una sola vez al importar el módulo.
const { courses } = JSON.parse(fs.readFileSync(RUTA_DATOS, 'utf8'));
const porCodigo = new Map(courses.map((curso) => [curso.id, curso]));

function listar() {
  return [...porCodigo.values()];
}

function listarPorCiclo(ciclo) {
  return listar().filter((curso) => curso.cycle === ciclo);
}

function obtener(codigo) {
  const curso = porCodigo.get(codigo);
  if (!curso) return undefined;

  // Resolver cada ID de requisito en { id, name } (Requisito 2.1)
  const prerequisites = (curso.prerequisites || []).map((id) => {
    const req = porCodigo.get(id);
    return req ? { id: req.id, name: req.name } : { id, name: null };
  });

  return { ...curso, prerequisites };
}

module.exports = { listar, listarPorCiclo, obtener };
