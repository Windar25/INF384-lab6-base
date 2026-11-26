const repositorio = require('../src/data/repositorio');

describe('repositorio de cursos', () => {
  describe('listar()', () => {
    test('devuelve los 87 cursos de la malla', () => {
      expect(repositorio.listar()).toHaveLength(87);
    });

    test('cada curso tiene los campos del modelo de datos', () => {
      for (const curso of repositorio.listar()) {
        expect(curso).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            credits: expect.any(Number),
            type: expect.stringMatching(/^(obligatorio|electivo)$/),
            prerequisites: expect.any(Array),
          }),
        );
      }
    });
  });

  describe('listarPorCiclo(ciclo)', () => {
    test('el ciclo 10 tiene 3 cursos', () => {
      const cursos = repositorio.listarPorCiclo(10);

      expect(cursos).toHaveLength(3);
      expect(cursos.every((curso) => curso.cycle === 10)).toBe(true);
    });

    test('devuelve un arreglo vacío para un ciclo sin cursos', () => {
      expect(repositorio.listarPorCiclo(4)).toEqual([]);
    });
  });

  describe('obtener(codigo)', () => {
    test('devuelve 1INF30 con su requisito 1INF25 resuelto (id y nombre)', () => {
      const curso = repositorio.obtener('1INF30');

      expect(curso.name).toBe('Programación 3');
      expect(curso.cycle).toBe(6);
      // Los requisitos se resuelven a { id, name } (Requisito 2.1)
      expect(curso.prerequisites).toEqual([{ id: '1INF25', name: 'Programación 2' }]);
    });

    test('devuelve undefined si el código no existe', () => {
      expect(repositorio.obtener('XXX999')).toBeUndefined();
    });
  });
});
