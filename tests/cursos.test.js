const request = require('supertest');
const app = require('../src/app');

// Campos esperados en cada objeto de respuesta
const CAMPOS_REQUERIDOS = ['id', 'name', 'credits', 'cycle', 'type'];

describe('GET /cursos', () => {
  // Requisito 1.1 — devuelve todos los cursos con los campos correctos
  test('1.1 devuelve 200 con todos los cursos y los campos requeridos', async () => {
    const res = await request(app).get('/cursos');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    // Cada curso debe tener todos los campos requeridos
    res.body.forEach((curso) => {
      CAMPOS_REQUERIDOS.forEach((campo) => {
        expect(curso).toHaveProperty(campo);
      });
    });
  });

  // Requisito 1.2 — filtra correctamente por ciclo válido
  test('1.2 con ?ciclo=6 devuelve solo los cursos del ciclo 6', async () => {
    const res = await request(app).get('/cursos?ciclo=6');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    // Todos los cursos devueltos deben ser del ciclo solicitado
    res.body.forEach((curso) => {
      expect(curso.cycle).toBe(6);
    });
  });

  test('1.2 con ?ciclo=5 devuelve solo los cursos del ciclo 5', async () => {
    const res = await request(app).get('/cursos?ciclo=5');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    res.body.forEach((curso) => {
      expect(curso.cycle).toBe(5);
    });
  });

  test('1.2 con ?ciclo=10 devuelve solo los cursos del ciclo 10', async () => {
    const res = await request(app).get('/cursos?ciclo=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    res.body.forEach((curso) => {
      expect(curso.cycle).toBe(10);
    });
  });

  // Requisito 1.3 — ciclo fuera del rango válido → 400
  test('1.3 con ?ciclo=4 (menor a 5) devuelve 400 con mensaje de error', async () => {
    const res = await request(app).get('/cursos?ciclo=4');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'ciclo debe ser un entero entre 5 y 10' });
  });

  test('1.3 con ?ciclo=11 (mayor a 10) devuelve 400 con mensaje de error', async () => {
    const res = await request(app).get('/cursos?ciclo=11');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'ciclo debe ser un entero entre 5 y 10' });
  });

  test('1.3 con ?ciclo=abc (no numérico) devuelve 400 con mensaje de error', async () => {
    const res = await request(app).get('/cursos?ciclo=abc');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'ciclo debe ser un entero entre 5 y 10' });
  });

  test('1.3 con ?ciclo=6.5 (no entero) devuelve 400 con mensaje de error', async () => {
    const res = await request(app).get('/cursos?ciclo=6.5');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'ciclo debe ser un entero entre 5 y 10' });
  });
});

describe('GET /cursos/:codigo', () => {
  // Requisito 2.1 — curso existente devuelve el detalle con requisitos resueltos
  test('2.1 con un código existente devuelve 200 con el curso y sus requisitos (id y nombre)', async () => {
    const res = await request(app).get('/cursos/1INF30');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('1INF30');
    expect(res.body.name).toBe('Programación 3');
    expect(res.body.credits).toBe(5.0);
    expect(res.body.cycle).toBe(6);
    expect(res.body.type).toBe('obligatorio');

    // Los requisitos deben incluir código y nombre de cada uno
    expect(Array.isArray(res.body.prerequisites)).toBe(true);
    expect(res.body.prerequisites.length).toBeGreaterThan(0);
    res.body.prerequisites.forEach((req) => {
      expect(req).toHaveProperty('id');
      expect(req).toHaveProperty('name');
      expect(typeof req.name).toBe('string');
      expect(req.name.length).toBeGreaterThan(0);
    });

    // 1INF30 requiere 1INF25 (Programación 2)
    expect(res.body.prerequisites).toContainEqual({
      id: '1INF25',
      name: 'Programación 2',
    });
  });

  test('2.1 un curso sin requisitos devuelve prerequisites vacíos', async () => {
    const res = await request(app).get('/cursos/1INF25');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('1INF25');
    expect(res.body.prerequisites).toEqual([]);
  });

  test('2.1 un curso con varios requisitos los resuelve todos con id y nombre', async () => {
    // Buscar un curso con más de un requisito en los datos reales
    const lista = await request(app).get('/cursos');
    const conVarios = lista.body.filter(
      (c) => c.prerequisites && c.prerequisites.length > 1
    );

    if (conVarios.length > 0) {
      const res = await request(app).get(`/cursos/${conVarios[0].id}`);
      expect(res.status).toBe(200);
      res.body.prerequisites.forEach((req) => {
        expect(req).toHaveProperty('id');
        expect(req).toHaveProperty('name');
      });
    }
  });

  // Requisito 2.2 — código inexistente → 404
  test('2.2 con un código inexistente devuelve 404 con mensaje de error', async () => {
    const res = await request(app).get('/cursos/NOEXISTE99');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'curso no encontrado' });
  });
});

// ─── Requisito 3.1 — Middleware de manejo de errores ────────────────────────
// Usamos una app Express mínima que registra primero la ruta que lanza el error
// y luego el middleware de errores, garantizando el orden correcto.
describe('Middleware de errores (requisito 3.1)', () => {
  let appError;

  beforeAll(() => {
    const express = require('express');
    const manejadorErrores = require('../src/middleware/errores');

    appError = express();
    appError.get('/__test_error__', (req, res, next) => {
      next(new Error('fallo inesperado'));
    });
    // El middleware de errores debe registrarse después de las rutas
    appError.use(manejadorErrores);
  });

  test('3.1 un error no controlado responde 500 con mensaje genérico', async () => {
    const res = await request(appError).get('/__test_error__');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'error interno del servidor' });
  });

  test('3.1 el mensaje de error no expone detalles internos', async () => {
    const res = await request(appError).get('/__test_error__');

    expect(res.status).toBe(500);
    // No debe haber stack trace ni mensaje de la excepción real
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('message');
    expect(JSON.stringify(res.body)).not.toContain('fallo inesperado');
  });
});
