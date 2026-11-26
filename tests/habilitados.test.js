const request = require('supertest');
const app = require('../src/app');
const { courses } = require('../data/cursos.json');

// Catálogo como mapa para el oráculo (requisitos 4.4, 4.5, 4.6)
const porCodigo = new Map(courses.map((curso) => [curso.id, curso]));

// Códigos válidos del catálogo para armar arreglos de tamaño arbitrario
const CODIGOS = courses.map((curso) => curso.id);

const APROBADOS_BASE = ['1INF25', '1INF27', '1INF49'];

// Oráculo independiente del endpoint: la especificación de habilitados
// (requisitos 4.3, 4.4, 4.5, 4.6)
function habilitadosEsperados(aprobados) {
  const s = new Set(aprobados);
  return courses
    .filter((curso) => !s.has(curso.id))
    .filter((curso) => (curso.prerequisites || []).every((p) => s.has(p)));
}

// ─── Subtarea 4.1 — Happy path y exclusión ─────────────────────────────────

describe('POST /habilitados — happy path y exclusión (4.1)', () => {
  // Requisitos 4.1, 4.2
  test('con ["1INF25","1INF27","1INF49"] responde 200 con exactamente 27 habilitados', async () => {
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(27);
  });

  // Requisito 4.2
  test('incluye 1INF29, 1INF30, 1INF31 y 1INF32', async () => {
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    const ids = res.body.map((curso) => curso.id);
    expect(ids).toContain('1INF29');
    expect(ids).toContain('1INF30');
    expect(ids).toContain('1INF31');
    expect(ids).toContain('1INF32');
  });

  // Requisitos 4.4, 4.5 — exclusión de aprobados y prerrequisitos satisfechos
  test('cada elemento devuelto no está en aprobados y tiene todos sus prerrequisitos satisfechos', async () => {
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    const aprobados = new Set(APROBADOS_BASE);
    expect(res.body.length).toBeGreaterThan(0);

    res.body.forEach((curso) => {
      // Requisito 4.5: excluido si está en aprobados
      expect(aprobados.has(curso.id)).toBe(false);
      // Pertenencia al catálogo (requisito 4.6)
      expect(porCodigo.has(curso.id)).toBe(true);
      // Requisito 4.4: todos los prerrequisitos en aprobados
      const prereqs = (porCodigo.get(curso.id).prerequisites || []);
      prereqs.forEach((p) => {
        expect(aprobados.has(p)).toBe(true);
      });
    });

    // Coincidencia exacta con el oráculo (por conjunto de ids)
    const ids = res.body.map((curso) => curso.id).sort();
    const esperados = habilitadosEsperados(APROBADOS_BASE)
      .map((curso) => curso.id)
      .sort();
    expect(ids).toEqual(esperados);
  });

  // Requisito 4.3 — curso sin prerrequisitos y no aprobado está habilitado
  test('un curso sin prerrequisitos y no aprobado aparece en la respuesta', async () => {
    const sinPrereqNoAprobado = courses.find(
      (curso) =>
        (curso.prerequisites || []).length === 0 &&
        !APROBADOS_BASE.includes(curso.id)
    );
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    const ids = res.body.map((curso) => curso.id);
    expect(ids).toContain(sinPrereqNoAprobado.id);
  });

  // Requisito 4.4 — curso con prerrequisito pendiente queda excluido
  test('un curso con prerrequisito no aprobado queda excluido', async () => {
    // Buscar un curso que requiere algo fuera de APROBADOS_BASE
    const pendiente = courses.find(
      (curso) =>
        (curso.prerequisites || []).some(
          (p) => !APROBADOS_BASE.includes(p)
        ) && !APROBADOS_BASE.includes(curso.id)
    );
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    const ids = res.body.map((curso) => curso.id);
    expect(ids).not.toContain(pendiente.id);
  });
});

// ─── Subtarea 4.2 — Límite de tamaño ───────────────────────────────────────

describe('POST /habilitados — límite de tamaño (4.2)', () => {
  const MENSAJE = 'El arreglo aprobados no puede superar 60 elementos';

  // Requisito 5.1
  test('61 elementos válidos responde 400 con mensaje exacto', async () => {
    const aprobados = CODIGOS.slice(0, 61);
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: MENSAJE });
  });

  // Requisito 5.2
  test('exactamente 60 elementos válidos responde 200', async () => {
    const aprobados = CODIGOS.slice(0, 60);
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Requisito 5.3
  test('5000 elementos responde 400 con el mismo mensaje', async () => {
    const aprobados = Array.from(
      { length: 5000 },
      (_, i) => CODIGOS[i % CODIGOS.length]
    );
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: MENSAJE });
  });
});

// ─── Subtarea 4.3 — Formato inválido y no-reflexión ────────────────────────

describe('POST /habilitados — formato inválido y no-reflexión (4.3)', () => {
  // Requisitos 6.1, 6.2
  test('"1INF30<script>" responde 400', async () => {
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: ['1INF30<script>'] });

    expect(res.status).toBe(400);
  });

  // Requisitos 6.3, 6.4
  test('el body de error no refleja el input ni <script>; es JSON con error string', async () => {
    const payload = '1INF30<script>alert(1)</script>';
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: [payload] });

    expect(res.status).toBe(400);
    const cuerpo = JSON.stringify(res.body);

    expect(cuerpo).not.toContain('<script>');
    expect(cuerpo).not.toContain(payload);
    expect(cuerpo).not.toContain('alert');
    // Formato JSON con propiedad error string (requisito 6.4)
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  // Requisito 6.1 — otros formatos inválidos
  test.each([
    ['lowercase', ['1inf25']],
    ['longitud incorrecta', ['1INF2']],
    ['símbolos', ['1INF30!']],
    ['espacios', [' 1INF30']],
    ['vacío', ['']],
  ])('código inválido (%s) responde 400', async (_nombre, aprobados) => {
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });
});

// ─── Subtarea 4.4 — Estructura y tipos del body ────────────────────────────

describe('POST /habilitados — estructura y tipos del body (4.4)', () => {
  // Requisitos 7.1–7.7
  test.each([
    ['aprobados ausente', {}],
    ['aprobados string', { aprobados: '1INF25' }],
    ['aprobados null', { aprobados: null }],
    ['aprobados número', { aprobados: 42 }],
    ['aprobados objeto', { aprobados: { a: 1 } }],
    ['elemento no-string', { aprobados: [1, '1INF25'] }],
    ['elemento boolean', { aprobados: ['1INF25', true] }],
    ['elemento null', { aprobados: ['1INF25', null] }],
    ['elemento objeto', { aprobados: ['1INF25', {}] }],
  ])('%s responde 400 con error claro', async (_nombre, body) => {
    const res = await request(app).post('/habilitados').send(body);

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  // Requisito 7.7 — body vacío
  test('body vacío responde 400', async () => {
    const res = await request(app).post('/habilitados').send();

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  // Requisito 7.7 — body no-JSON
  test('body no-JSON (malformado) responde 400', async () => {
    const res = await request(app)
      .post('/habilitados')
      .set('Content-Type', 'application/json')
      .send('no-json{');

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });
});

// ─── Subtarea 4.5 — Bordes de diseño ───────────────────────────────────────

describe('POST /habilitados — bordes de diseño (4.5)', () => {
  // Duplicados → mismo resultado que sin duplicados
  test('duplicados devuelven el mismo resultado que sin duplicados', async () => {
    const conDuplicados = ['1INF25', '1INF25', '1INF27', '1INF49'];

    const resDup = await request(app)
      .post('/habilitados')
      .send({ aprobados: conDuplicados });
    const resSin = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    expect(resDup.status).toBe(200);
    expect(resDup.body).toEqual(resSin.body);
  });

  // Código inexistente con formato válido
  test('código inexistente "1ZZZ99" responde 200', async () => {
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: ['1ZZZ99'] });

    expect(res.status).toBe(200);
    // Todos los habilitados corresponden al oráculo con {"1ZZZ99"}
    const esperados = habilitadosEsperados(['1ZZZ99'])
      .map((c) => c.id)
      .sort();
    expect(res.body.map((c) => c.id).sort()).toEqual(esperados);
  });

  // Arreglo vacío → cursos sin prerrequisitos
  test('aprobados vacío responde 200 con los cursos sin prerrequisitos', async () => {
    const res = await request(app).post('/habilitados').send({ aprobados: [] });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const sinPrereqs = courses
      .filter((curso) => (curso.prerequisites || []).length === 0)
      .map((c) => c.id)
      .sort();
    expect(res.body.map((c) => c.id).sort()).toEqual(sinPrereqs);
  });

  // Orden determinista: cycle asc, luego id asc
  test('respuesta ordenada por cycle asc y luego id asc, determinista entre llamadas', async () => {
    const r1 = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });
    const r2 = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const ids1 = r1.body.map((c) => c.id);
    const ids2 = r2.body.map((c) => c.id);
    expect(ids1).toEqual(ids2); // determinista

    // Orden cycle asc, id asc
    const pares = r1.body.map((c) => ({ cycle: c.cycle, id: c.id }));
    for (let i = 1; i < pares.length; i += 1) {
      const prev = pares[i - 1];
      const curr = pares[i];
      const correcto =
        prev.cycle < curr.cycle ||
        (prev.cycle === curr.cycle && prev.id.localeCompare(curr.id) < 0);
      expect(correcto).toBe(true);
    }
  });
});

// ─── Subtarea 4.6 — Error interno 500 con stub ─────────────────────────────

describe('POST /habilitados — error interno 500 (4.6)', () => {
  // Requisitos 8.1, 8.2
  test('si listar() lanza, responde 500 genérico sin detalles internos', async () => {
    const repositorio = require('../src/data/repositorio');
    const espia = jest
      .spyOn(repositorio, 'listar')
      .mockImplementation(() => {
        throw new Error('fallo catastrófico /etc/passwd C:\\secreto\\ruta');
      });

    try {
      const res = await request(app)
        .post('/habilitados')
        .send({ aprobados: APROBADOS_BASE });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'error interno del servidor' });

      const cuerpo = JSON.stringify(res.body);
      // Requisito 8.2: sin stack, mensaje de excepción ni rutas internas
      expect(cuerpo).not.toContain('fallo catastrófico');
      expect(cuerpo).not.toContain('/etc/passwd');
      expect(cuerpo).not.toContain('secreto');
      expect(cuerpo).not.toContain('stack');
      expect(cuerpo).not.toContain('at ');
    } finally {
      espia.mockRestore();
    }
  });

  test('tras restaurar el stub, el endpoint vuelve a funcionar', async () => {
    const res = await request(app)
      .post('/habilitados')
      .send({ aprobados: APROBADOS_BASE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(27);
  });
});
