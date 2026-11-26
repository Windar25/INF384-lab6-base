// Funciones puras para el endpoint POST /habilitados.
// No dependen de req/res ni del sistema de archivos: reciben el body y el
// catálogo como parámetros para ser testeables sin levantar Express.

const FORMATO_CODIGO = /^[A-Z0-9]{6}$/;
const LIMITE_APROBADOS = 60;

const MENSAJES = {
  body: "el cuerpo debe ser un objeto JSON con la propiedad 'aprobados'",
  tipo: 'aprobados debe ser un arreglo de strings',
  elementos: 'todos los elementos de aprobados deben ser strings',
  limite: 'El arreglo aprobados no puede superar 60 elementos',
  formato:
    'cada elemento de aprobados debe ser un código válido de 6 caracteres alfanuméricos mayúsculas',
};

// Valida el body de POST /habilitados.
// Retorna un mensaje de error literal (string) o null si es válido.
// Orden: presencia -> tipo array -> tipo de elementos -> tamaño -> formato.
// Ningún mensaje se construye a partir del input (requisito 6.3).
function validarAprobados(body) {
  // Presencia y tipo del body (requisitos 7.1, 7.7)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return MENSAJES.body;
  }
  if (!('aprobados' in body)) {
    return MENSAJES.body;
  }

  const { aprobados } = body;

  // Tipo array (requisitos 7.2, 7.3, 7.4, 7.5)
  if (!Array.isArray(aprobados)) {
    return MENSAJES.tipo;
  }

  // Tipo de cada elemento (requisito 7.6). No se interpola el valor.
  if (!aprobados.every((elemento) => typeof elemento === 'string')) {
    return MENSAJES.elementos;
  }

  // Tamaño sobre el arreglo original, antes de deduplicar (requisitos 5.1, 5.2, 5.3)
  if (aprobados.length > LIMITE_APROBADOS) {
    return MENSAJES.limite;
  }

  // Formato de cada elemento (requisitos 6.1, 6.2)
  if (!aprobados.every((elemento) => FORMATO_CODIGO.test(elemento))) {
    return MENSAJES.formato;
  }

  return null;
}

// Calcula los cursos habilitados: los cursos del catálogo que no están en
// aprobadosSet y cuyos prerrequisitos están todos contenidos en aprobadosSet.
// Orden determinista: cycle ascendente, luego id ascendente (requisito 4).
function calcularHabilitados(catalogo, aprobadosSet) {
  return catalogo
    .filter((curso) => !aprobadosSet.has(curso.id)) // requisito 4.5
    .filter((curso) =>
      (curso.prerequisites || []).every((p) => aprobadosSet.has(p))
    ) // requisitos 4.3, 4.4
    .sort((a, b) => a.cycle - b.cycle || a.id.localeCompare(b.id));
}

module.exports = { FORMATO_CODIGO, LIMITE_APROBADOS, validarAprobados, calcularHabilitados };
