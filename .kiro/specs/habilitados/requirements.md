# Requirements Document

## Introduction

Esta especificación define el endpoint `POST /habilitados` para la API REST de consulta de la malla de Ingeniería Informática (PUCP). El endpoint recibe la lista de cursos aprobados por un estudiante y devuelve los cursos que quedan habilitados: aquellos que no están en la lista de aprobados y cuyos prerrequisitos están todos contenidos en esa lista. La numeración continúa desde el requisito 4 porque los requisitos 1, 2 y 3 pertenecen al spec `consulta-cursos`.

## Glossary

- **API**: Servicio REST Express.js que expone los endpoints de consulta de la malla.
- **Curso**: Registro del catálogo `data/cursos.json` con los campos `id`, `name`, `credits`, `cycle`, `type` y `prerequisites`.
- **Aprobados**: Lista de códigos de cursos (strings) enviada en el cuerpo de la petición bajo la propiedad `aprobados`.
- **Curso_Habilitado**: Curso que no pertenece a Aprobados y cuyos códigos en `prerequisites` están todos incluidos en Aprobados.
- **Formato_Codigo**: Expresión regular `/^[A-Z0-9]{6}$/` que todo elemento de Aprobados debe cumplir.
- **CI**: Pipeline de integración continua de GitHub Actions definido en `.github/workflows/ci.yml`.
- **Suite_Pruebas**: Conjunto de pruebas unitarias e integración del proyecto (Jest y supertest).

## Requirements

### Requirement 4: Cálculo de cursos habilitados

**User Story:** Como estudiante, quiero enviar la lista de cursos que he aprobado, para que la API me devuelva los cursos que puedo cursar a continuación.

#### Acceptance Criteria

1. WHEN la API recibe `POST /habilitados` con `{"aprobados": ["1INF25", "1INF27", "1INF49"]}`, THEN THE API SHALL responder HTTP 200 con un array JSON de cursos habilitados de tamaño exactamente 27.
2. WHILE la API construye la respuesta, THE API SHALL incluir en la lista de habilitados los cursos `1INF29`, `1INF30`, `1INF31` y `1INF32` para la entrada del criterio 1.
3. WHEN un curso tiene `prerequisites` vacío, THEN THE API SHALL considerar ese curso como Curso_Habilitado siempre que su propio `id` no esté en Aprobados.
4. WHEN un curso tiene al menos un prerrequisito que no está en Aprobados, THEN THE API SHALL excluir ese curso de la respuesta.
5. WHEN un curso está incluido en Aprobados, THEN THE API SHALL excluir ese curso de la respuesta aunque todos sus prerrequisitos estén satisfechos.
6. WHILE la API construye la lista de habilitados, THE API SHALL considerar únicamente los cursos del catálogo `data/cursos.json`.

### Requirement 5: Validación del tamaño de la entrada

**User Story:** Como operador de la API, quiero limitar el tamaño del arreglo de entrada, para que listas masivas no provoquen denegación de servicio.

#### Acceptance Criteria

1. WHEN la propiedad `aprobados` contiene más de 60 elementos, THEN THE API SHALL responder HTTP 400 con el cuerpo `{"error": "El arreglo aprobados no puede superar 60 elementos"}`.
2. WHEN la propiedad `aprobados` contiene exactamente 60 elementos válidos, THEN THE API SHALL procesar la petición y responder HTTP 200.
3. WHEN la propiedad `aprobados` contiene 5000 elementos, THEN THE API SHALL responder HTTP 400 con el mensaje del criterio 1.

### Requirement 6: Formato de códigos y sanitización sin fuga de errores

**User Story:** Como operador de la API, quiero que se rechacen códigos malformados sin reflejar el contenido del input, para evitar XSS y fuga de información interna.

#### Acceptance Criteria

1. WHEN algún elemento de `aprobados` no cumple el Formato_Codigo, THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
2. WHEN un elemento de `aprobados` es `"1INF30<script>"`, THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
3. WHILE la API construye el mensaje de error del criterio 1, THE API SHALL omitir el contenido literal del elemento rechazado, sin incluir stack traces, rutas internas del sistema de archivos, ni el valor del input malicioso.
4. WHEN la API responde el error del criterio 1, THEN THE API SHALL responder en formato JSON con la propiedad `error` de tipo string.

### Requirement 7: Validación de estructura y tipo del body

**User Story:** Como desarrollador de la API, quiero validar la estructura del body, para que entradas malformadas no lleguen a la lógica de negocio.

#### Acceptance Criteria

1. WHEN el cuerpo de la petición no incluye la propiedad `aprobados`, THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
2. WHEN la propiedad `aprobados` es un string (ej. `{"aprobados": "1INF25"}`), THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
3. WHEN la propiedad `aprobados` es `null`, THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
4. WHEN la propiedad `aprobados` es un número (ej. `{"aprobados": 42}`), THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
5. WHEN la propiedad `aprobados` es un objeto plano (ej. `{"aprobados": {"a": 1}}`), THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
6. WHEN algún elemento del array `aprobados` no es de tipo string, THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.
7. WHEN el cuerpo de la petición está vacío, THEN THE API SHALL responder HTTP 400 con un mensaje de error claro.

### Requirement 8: Manejo de errores internos

**User Story:** Como operador de la API, quiero que los fallos inesperados del endpoint no expongan detalles internos, para mantener la seguridad del servicio.

#### Acceptance Criteria

1. IF se produce un error no controlado durante el procesamiento de `POST /habilitados`, THEN THE API SHALL responder HTTP 500 con `{"error": "error interno del servidor"}` mediante el middleware en `src/middleware/errores.js`.
2. WHILE la API responde un error 500, THE API SHALL omitir stack traces, mensajes de excepción y rutas internas del cuerpo de la respuesta.

### Requirement 9: Cobertura y pipeline de CI

**User Story:** Como responsable de calidad, quiero que la suite de pruebas y la cobertura validen los cambios, para que solo código verificado llegue a main.

#### Acceptance Criteria

1. THE Proyecto SHALL mantener una cobertura de líneas igual o mayor a 80% medida con `jest --coverage`.
2. WHEN se ejecuta el pipeline CI de GitHub Actions sobre un pull request, THEN THE CI SHALL ejecutar la suite completa de pruebas (unitarias e integración) y SHALL permitir la integración a main solo si todas pasan.
3. THE Suite_Pruebas SHALL incluir pruebas de integración con supertest que cubran los criterios de los requisitos 4 a 7 mediante respuestas HTTP observables.
