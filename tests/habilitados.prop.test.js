// Feature: habilitados — Pruebas de propiedad (fast-check) sobre las funciones puras
// src/util/habilitados.js: validarAprobados y calcularHabilitados.
// Los tests HTTP de integración viven en tests/habilitados.test.js (Tarea 4).

'use strict';

const fc = require('fast-check');
const { courses } = require('../data/cursos.json');
const {
  FORMATO_CODIGO,
  LIMITE_APROBADOS,
  validarAprobados,
  calcularHabilitados,
} = require('../src/util/habilitados');

const CATALOGO = courses;
const IDS_CATALOGO = CATALOGO.map((c) => c.id);

// ─── Generadores reutilizables ────────────────────────────────────────────────

const CHARS_VALIDOS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

/**
 * Genera un código válido: exactamente 6 caracteres [A-Z0-9].
 * No usa fc.stringMatching (muy costoso) ni fc.string+filter (OOM).
 */
const genCodigoValido = fc
  .array(fc.constantFrom(...CHARS_VALIDOS), { minLength: 6, maxLength: 6 })
  .map((chars) => chars.join(''));

/**
 * Genera subconjuntos únicos de aprobados: ids reales del catálogo +
 * códigos válidos extra (para simular cursos de planes distintos).
 * Se usa fc.shuffledSubarray para los ids reales (evita 87 constantFrom).
 */
const genAprobados = fc.tuple(
  fc.shuffledSubarray(IDS_CATALOGO),
  fc.array(genCodigoValido, { minLength: 0, maxLength: 5 })
).map(([reales, extra]) => {
  // Mezclar y deduplicar; respetar límite de 60
  const todos = [...new Set([...reales, ...extra])].slice(0, 60);
  return todos;
});

/**
 * Genera strings que NO matchean /^[A-Z0-9]{6}$/ (inválidos por formato).
 * Se construyen de forma directa para evitar fc.filter exhaustivo:
 *   - longitud < 6 o > 6
 *   - 6 caracteres pero con al menos una minúscula/símbolo
 *   - fragmentos HTML/JS conocidos
 */
const INVALIDOS_FIJOS = [
  '',
  'a',
  'ABC12',      // 5 chars
  'ABC1234',    // 7 chars
  'abcdef',     // minúsculas
  '1INF30<',    // símbolo
  '<script>',
  'ABC DE',     // espacio
  'ABC12\n',    // control
  'ñoño12',     // unicode
  '      ',     // solo espacios
  'INF384 ',    // espacio al final
  ' INF384',    // espacio al inicio
];

const genStringInvalido = fc.oneof(
  // Longitud diferente de 6
  fc.integer({ min: 0, max: 5 }).chain((len) =>
    fc.array(fc.constantFrom(...CHARS_VALIDOS), { minLength: len, maxLength: len }).map((c) => c.join(''))
  ),
  fc.integer({ min: 7, max: 20 }).chain((len) =>
    fc.array(fc.constantFrom(...CHARS_VALIDOS), { minLength: len, maxLength: len }).map((c) => c.join(''))
  ),
  // 6 chars pero con al menos uno fuera del rango [A-Z0-9]
  fc.array(fc.constantFrom(...CHARS_VALIDOS), { minLength: 5, maxLength: 5 })
    .map((chars) => chars.join('') + 'x'),  // 'x' es minúscula
  fc.array(fc.constantFrom(...CHARS_VALIDOS), { minLength: 5, maxLength: 5 })
    .map((chars) => chars.join('') + '<'),  // símbolo
  // Constantes fijas conocidas
  fc.constantFrom(...INVALIDOS_FIJOS)
);

// ─── Property 1: Especificación exacta de habilitados (model-based) ──────────
// Validates: Requirements 4.3, 4.4, 4.5, 4.6
describe('Feature: habilitados, Property 1: especificación exacta de habilitados', () => {
  test('el resultado coincide con el oráculo {c : c.id ∉ A ∧ prereqs(c) ⊆ A}', () => {
    fc.assert(
      fc.property(genAprobados, (aprobados) => {
        const aprobadosSet = new Set(aprobados);
        const resultado = calcularHabilitados(CATALOGO, aprobadosSet);

        // Oráculo independiente: modelo de referencia simple, no reutiliza la función bajo prueba
        const esperado = CATALOGO.filter(
          (c) =>
            !aprobadosSet.has(c.id) &&
            (c.prerequisites || []).every((p) => aprobadosSet.has(p))
        );

        // Comparación por conjunto de ids (requisitos 4.3–4.6)
        const idsResultado = resultado.map((c) => c.id).sort();
        const idsEsperado = esperado.map((c) => c.id).sort();
        expect(idsResultado).toEqual(idsEsperado);

        // Todo curso devuelto pertenece al catálogo (requisito 4.6)
        resultado.forEach((curso) => {
          expect(IDS_CATALOGO).toContain(curso.id);
        });
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: Límite de 60 elementos ─────────────────────────────────────
// Validates: Requirements 5.1, 5.2, 5.3
describe('Feature: habilitados, Property 2: límite de 60 elementos', () => {
  test('longitudes 61–200 con elementos válidos → mensaje exacto del límite', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 61, max: 200 }),
        genCodigoValido,
        (longitud, codigoBase) => {
          // Rellena con variantes del código base para garantizar longitud exacta
          const aprobados = Array.from(
            { length: longitud },
            (_, i) => codigoBase.slice(0, 5) + CHARS_VALIDOS[i % CHARS_VALIDOS.length]
          );
          const error = validarAprobados({ aprobados });
          expect(error).toBe('El arreglo aprobados no puede superar 60 elementos');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('longitudes 0–60 con elementos válidos → validación pasa (null)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        genCodigoValido,
        (longitud, codigoBase) => {
          const aprobados = Array.from(
            { length: longitud },
            (_, i) => codigoBase.slice(0, 5) + CHARS_VALIDOS[i % CHARS_VALIDOS.length]
          );
          expect(validarAprobados({ aprobados })).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Rechazo universal de formatos inválidos ─────────────────────
// Validates: Requirements 6.1, 6.2
describe('Feature: habilitados, Property 3: rechazo universal de formatos inválidos', () => {
  test('un elemento con formato inválido hace fallar la validación', () => {
    fc.assert(
      fc.property(genStringInvalido, (invalido) => {
        // Verificar primero que el generador realmente produce inválidos
        expect(FORMATO_CODIGO.test(invalido)).toBe(false);

        const aprobados = [invalido];
        const error = validarAprobados({ aprobados });
        expect(error).not.toBeNull();
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: No-reflexión del input en mensajes de error ─────────────────
// Validates: Requirements 6.3, 6.4, 8.2
describe('Feature: habilitados, Property 4: no-reflexión del input en mensajes de error', () => {
  const MENSAJES_VALIDOS = new Set([
    "el cuerpo debe ser un objeto JSON con la propiedad 'aprobados'",
    'aprobados debe ser un arreglo de strings',
    'todos los elementos de aprobados deben ser strings',
    'El arreglo aprobados no puede superar 60 elementos',
    'cada elemento de aprobados debe ser un código válido de 6 caracteres alfanuméricos mayúsculas',
  ]);

  // Genera payloads maliciosos con caracteres seguros para OOM
  const genPayload = fc.oneof(
    // Fragmento HTML
    fc.array(fc.constantFrom(...CHARS_VALIDOS), { minLength: 1, maxLength: 5 })
      .map((c) => `<script>${c.join('')}</script>`),
    // Ruta de archivo
    fc.array(fc.constantFrom(...CHARS_VALIDOS), { minLength: 1, maxLength: 5 })
      .map((c) => `../../etc/${c.join('')}`),
    // SQL injection
    fc.array(fc.constantFrom(...CHARS_VALIDOS), { minLength: 1, maxLength: 5 })
      .map((c) => `${c.join('')}'; DROP TABLE`),
    // Minúsculas con relleno
    fc.array(fc.constantFrom('abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 10 })
      .map((c) => c.join(''))
  );

  const assertMensajeSeguro = (payload, error) => {
    expect(typeof error).toBe('string');
    // El mensaje debe ser exactamente uno de los mensajes predefinidos
    expect(MENSAJES_VALIDOS.has(error)).toBe(true);
    // No contiene el payload completo ni partes distintivas (requisito 6.3)
    if (payload.length <= 20) {
      // Solo verificar no-reflejo para payloads cortos y manejables
      expect(error).not.toContain(payload);
    }
    // Sin stack traces ni rutas internas (requisitos 6.4, 8.2)
    expect(error).not.toMatch(/at\s+\w+\s+\(/);
    expect(error).not.toContain('node_modules');
    expect(error).not.toContain('.js:');
  };

  test('payload malicioso como elemento del arreglo → mensaje sin reflejo del input', () => {
    fc.assert(
      fc.property(genPayload, (payload) => {
        const error = validarAprobados({ aprobados: [payload] });
        expect(error).not.toBeNull();
        assertMensajeSeguro(payload, error);
      }),
      { numRuns: 100 }
    );
  });

  test('payload malicioso como valor de aprobados (no array) → mensaje sin reflejo', () => {
    fc.assert(
      fc.property(genPayload, (payload) => {
        const error = validarAprobados({ aprobados: payload });
        expect(error).not.toBeNull();
        assertMensajeSeguro(payload, error);
      }),
      { numRuns: 100 }
    );
  });

  test('payload malicioso como body completo → mensaje sin reflejo', () => {
    fc.assert(
      fc.property(genPayload, (payload) => {
        const error = validarAprobados(payload);
        expect(error).not.toBeNull();
        assertMensajeSeguro(payload, error);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Rechazo universal de tipos no array ─────────────────────────
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
describe('Feature: habilitados, Property 5: rechazo universal de tipos no array', () => {
  // Valores que no son arrays de strings
  const genNoArray = fc.oneof(
    fc.string({ minLength: 0, maxLength: 20 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.constant(null),
    fc.record({ algo: fc.integer({ min: 0, max: 100 }) }),
    fc.constant(undefined)
  );

  test('aprobados con valor no array → error de validación', () => {
    fc.assert(
      fc.property(genNoArray, (valor) => {
        const error = validarAprobados({ aprobados: valor });
        expect(error).not.toBeNull();
        expect(typeof error).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  test('body ausente, vacío o sin la propiedad aprobados → error de validación', () => {
    // Casos fijos (requisitos 7.1, 7.7)
    const casosInvalidos = [undefined, null, {}, { otra: [] }, [], 'string', 42, true];
    casosInvalidos.forEach((body) => {
      expect(validarAprobados(body)).not.toBeNull();
    });
  });

  // Requisito 7.6: arrays con elementos no-string
  const genNoString = fc.oneof(
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.constant(null),
    fc.record({ x: fc.integer({ min: 0, max: 100 }) })
  );

  test('array con elementos no-string → error de validación', () => {
    fc.assert(
      fc.property(
        fc.array(genNoString, { minLength: 1, maxLength: 10 }),
        (elementos) => {
          const error = validarAprobados({ aprobados: elementos });
          expect(error).not.toBeNull();
          expect(typeof error).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
