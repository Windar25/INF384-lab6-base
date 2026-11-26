# Implementation Plan: Endpoint `POST /habilitados`

## Overview

Implementación incremental del endpoint `POST /habilitados` siguiendo el orden: validación pura → lógica de cálculo pura → ruta Express → montaje en `app.js` (incluye captura de `SyntaxError` de `express.json()`) → pruebas de propiedad (fast-check) → pruebas de integración (supertest) → gates de calidad en CI. Las funciones puras viven en `src/util/habilitados.js` para ser testeables sin Express; la ruta solo orquesta. Lenguaje: JavaScript (Node 22, CommonJS), alineado con el código existente.

## Tasks

- [ ] 1. Crear módulo de funciones puras `src/util/habilitados.js`
  - [ ] 1.1 Implementar `validarAprobados(body)`
    - Definir constantes `FORMATO_CODIGO = /^[A-Z0-9]{6}$/` y `LIMITE_APROBADOS = 60`
    - Orden de chequeos: presencia del body y de `aprobados` → tipo array → tipo de cada elemento (string) → tamaño (> 60 sobre el arreglo original, antes de deduplicar) → formato de cada elemento
    - Retornar el mensaje de error literal (string) o `null`; ningún mensaje interpola el input
    - Mensajes exactos según design: `"el cuerpo debe ser un objeto JSON con la propiedad 'aprobados'"`, `"aprobados debe ser un arreglo de strings"`, `"todos los elementos de aprobados deben ser strings"`, `"El arreglo aprobados no puede superar 60 elementos"`, `"cada elemento de aprobados debe ser un código válido de 6 caracteres alfanuméricos mayúsculas"`
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ] 1.2 Implementar `calcularHabilitados(catalogo, aprobadosSet)`
    - Filtrar cursos del catálogo cuyo `id` NO esté en `aprobadosSet`
    - Filtrar cursos cuyos `prerequisites` (default `[]`) estén todos contenidos en `aprobadosSet` (`.every`)
    - Ordenar por `cycle` ascendente, luego `id` ascendente (`localeCompare`)
    - Devolver los objetos curso con el shape del catálogo (`id, name, credits, cycle, type, prerequisites` con ids no resueltos)
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

- [ ] 2. Crear ruta `src/routes/habilitados.js` y montarla en `src/app.js`
  - [ ] 2.1 Implementar `POST /` en `src/routes/habilitados.js`
    - `router.post('/')`: en `try/catch`, validar con `validarAprobados(req.body)` → 400 `{error: mensaje}` si falla; si pasa, construir `new Set(req.body.aprobados)` (deduplica) y responder 200 con `calcularHabilitados(repositorio.listar(), set)`
    - En el `catch`, delegar a `next(err)` para el 500 genérico del middleware de errores
    - _Requirements: 4.1, 4.2, 6.4, 8.1_
  - [ ] 2.2 Montar router y capturar `SyntaxError` en `src/app.js`
    - Montar `app.use('/habilitados', require('./routes/habilitados'))` antes del middleware de errores
    - Agregar middleware de 4 parámetros que capture `SyntaxError` con `status === 400 && 'body' in err` de `express.json()` y responda 400 `{"error": "el cuerpo de la petición debe ser JSON válido"}`
    - Verificar que `npm start` levanta sin errores y que `GET /cursos` y `/health` siguen funcionando
    - _Requirements: 7.7, 8.1, 8.2_

- [ ] 3. Pruebas de propiedad (fast-check) sobre las funciones puras
  - Instalar `fast-check` como devDependency (`npm install --save-dev fast-check`)
  - [ ] 3.1 Property 1: especificación exacta de habilitados (model-based)
    - Generador: subconjuntos aleatorios de los 87 ids del catálogo + códigos válidos inexistentes (`fc.stringMatching(/^[A-Z0-9]{6}$/)`)
    - Oráculo: `{c ∈ catalogo : c.id ∉ A ∧ prereqs(c) ⊆ A}` comparado por conjunto de ids; todo devuelto pertenece al catálogo
    - `fc.assert(..., { numRuns: 100 })` en `tests/habilitados.prop.test.js`
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.6**
  - [ ] 3.2 Property 2: límite de 60 elementos
    - `fc.integer(61, 200)` como longitud con elementos válidos → mensaje exacto `"El arreglo aprobados no puede superar 60 elementos"`; longitudes ≤ 60 con elementos válidos → `null`
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [ ] 3.3 Property 3: rechazo universal de formatos inválidos
    - Generador de strings que no matchean `/^[A-Z0-9]{6}$/` (longitud ≠ 6, minúsculas, símbolos, `<script>`, unicode) embebidas en un arreglo → `validarAprobados` retorna error
    - **Validates: Requirements 6.1, 6.2**
  - [ ] 3.4 Property 4: no-reflexión del input en mensajes de error
    - Payloads maliciosos generados (HTML, JS, rutas de archivo, caracteres de control) → el mensaje de error no contiene el substring del payload, ni stack traces, ni rutas internas
    - **Validates: Requirements 6.3, 6.4, 8.2**
  - [ ] 3.5 Property 5: rechazo universal de tipos no array
    - Generador de valores no-array (strings, números, booleans, null, objetos, body ausente/vacío, arrays con elementos no-string) → `validarAprobados` retorna error
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**

- [ ] 4. Pruebas de integración con supertest (`tests/habilitados.test.js`)
  - [ ] 4.1 Happy path y exclusión (HTTP)
    - `{"aprobados": ["1INF25","1INF27","1INF49"]}` → 200 con array de exactamente 27 elementos, contiene `1INF29`, `1INF30`, `1INF31`, `1INF32`; cada elemento excluido de aprobados y con prerrequisitos satisfechos
    - _Requirements: 4.1, 4.2, 4.4, 4.5_
  - [ ] 4.2 Límite de tamaño (HTTP)
    - 61 elementos → 400 con mensaje exacto; 60 elementos válidos → 200; 5000 elementos → 400 mismo mensaje
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 4.3 Formato inválido y no-reflexión (HTTP)
    - `"1INF30<script>"` → 400; el body de error no contiene `<script>`; respuesta JSON con `error` string
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 4.4 Estructura y tipos del body (HTTP)
    - `aprobados` ausente, string, null, número 42, objeto, elemento no-string, body vacío, body no-JSON (Content-Type JSON malformado) → todos 400
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [ ] 4.5 Bordes de diseño (HTTP)
    - Duplicados → 200 con mismo resultado que sin duplicados; código inexistente `"1ZZZ99"` → 200; `[]` → 200 (cursos sin prerrequisitos); orden determinista (cycle asc, id asc) en dos llamadas consecutivas
    - _Requirements: 4.3, 4.6_
  - [ ] 4.6 Error interno 500 con stub
    - Mock de `../src/data/repositorio` para que `listar()` lance → 500 con `{"error": "error interno del servidor"}`, sin stack traces ni rutas en el cuerpo
    - _Requirements: 8.1, 8.2_

- [ ] 5. Gates de calidad en CI
  - [ ] 5.1 Actualizar `jest.config.js` y verificar cobertura
    - Agregar `coverageThreshold: { global: { lines: 80 } }` a `jest.config.js`
    - Ejecutar `npx jest --runInBand --coverage` localmente: suite completa en verde y cobertura ≥ 80% líneas
    - _Requirements: 9.1, 9.3_
  - [ ] 5.2 Actualizar `.github/workflows/ci.yml` con los tres gates bloqueantes
    - `actions/checkout@v4` con `fetch-depth: 0` (gitleaks necesita historial completo)
    - Step gitleaks (`gitleaks/gitleaks-action@v2` con `GITHUB_TOKEN`) inmediatamente tras el checkout, antes de `npm ci`
    - Step `npm audit --audit-level=high` (sin `continue-on-error`) tras `npm ci`, antes de las pruebas
    - Step final `npx jest --runInBand --coverage --coverageThreshold='{"global":{"lines":80}}'`
    - _Requirements: 9.1, 9.2_

- [ ] 6. Verificación final
  - Ejecutar `npx jest --runInBand --coverage` completo (unit + PBT + integración) y confirmar verde con cobertura ≥ 80%
  - Verificar que ningún mensaje de error del endpoint refleja el input (revisar los cuerpos de los tests 4.3 y 4.6)
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 4.1, 6.3, 8.2, 9.1_

## Notes

- Las subtareas marcadas con `*` son opcionales; en este plan ninguna lo es porque las pruebas son requisito de aceptación (9.1, 9.3)
- `aprobados: []` es válido (cursos sin prerrequisitos habilitados); propiedad ausente es 400
- El límite de 60 se evalúa sobre el arreglo original (con duplicados), antes de deduplicar con `Set`
- El servidor de desarrollo (`npm start`) se ejecuta manualmente en la terminal del usuario, nunca en este workflow
- Referencia de estilo: `.kiro/specs/consulta-cursos/tasks.md`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["6"] }
  ]
}
```
