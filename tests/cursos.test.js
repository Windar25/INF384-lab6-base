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
