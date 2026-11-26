# Trazabilidad

Trazabilidad del spec `habilitados` (endpoint `POST /habilitados`). Los requisitos 1 a 3 pertenecen al spec `consulta-cursos`; la numeración continúa desde 4. Fuentes: `.kiro/specs/habilitados/requirements.md`, `design.md`, `tasks.md`.

## Requisito → gate → evidencia

| Requisito | Gate (herramienta y umbral) | Bloquea / avisa | Etapa | Run fallido | Run corregido |
| --- | --- | --- | --- | --- | --- |
| 4.1 Happy path: 27 cursos con ["1INF25","1INF27","1INF49"] | Tests de integración supertest (tests/habilitados.test.js, grupo 4.1) — 200 con array de 27 | Bloquea (npm test / npx jest --runInBand --coverage, exit code != 0) | Local + CI (step "Ejecutar pruebas con cobertura") | — | — |
| 4.2 Incluye 1INF29, 1INF30, 1INF31, 1INF32 | Tests de integración (grupo 4.1, test de inclusión por id) | Bloquea | Local + CI | — | — |
| 4.3 Curso sin requisitos habilitado si no está en aprobados | PBT fast-check Property 1 (100 runs) + test de borde `[]` (grupo 4.5) | Bloquea | Local + CI | — | — |
| 4.4 Curso con prerrequisito no aprobado excluido | PBT Property 1 (oráculo model-based) + test 4.1 con oráculo programático | Bloquea | Local + CI | — | — |
| 4.5 Curso en aprobados excluido aunque sus prereqs estén satisfechos | PBT Property 1 + test 4.1 (verificación de exclusión por elemento) | Bloquea | Local + CI | — | — |
| 4.6 Solo cursos del catálogo data/cursos.json | PBT Property 1 (todo devuelto pertenece al catálogo) + test borde código inexistente 1ZZZ99 (grupo 4.5) | Bloquea | Local + CI | — | — |
| 5.1 Más de 60 elementos → 400 con mensaje exacto | Tests integración grupo 4.2 (61 elementos) + PBT Property 2 (longitudes 61–200) | Bloquea | Local + CI | — | — |
| 5.2 Exactamente 60 elementos válidos → 200 | Tests integración grupo 4.2 + PBT Property 2 (longitudes 0–60 → null) | Bloquea | Local + CI | — | — |
| 5.3 5000 elementos → 400 mismo mensaje | Tests integración grupo 4.2 (caso 5000) | Bloquea | Local + CI | — | — |
| 6.1 Elemento fuera de /^[A-Z0-9]{6}$/ → 400 | Tests integración grupo 4.3 (5 variantes) + PBT Property 3 (rechazo universal) | Bloquea | Local + CI | — | — |
| 6.2 "1INF30<script>" → 400 | Tests integración grupo 4.3 (caso específico) | Bloquea | Local + CI | — | — |
| 6.3 Mensaje sin reflejar el input malicioso | PBT Property 4 (3 tests, 100 runs) + test 4.3 (body sin `<script>`, payload ni alert) | Bloquea | Local + CI | — | — |
| 6.4 Respuesta JSON con `error` string | Tests integración grupo 4.3 + PBT Property 4 (assertMensajeSeguro) | Bloquea | Local + CI | — | — |
| 7.1–7.7 Estructura y tipo del body (ausente, string, null, número, objeto, elementos no-string, vacío, no-JSON) | Tests integración grupo 4.4 (11 tests) + PBT Property 5 (3 tests); no-JSON vía middleware SyntaxError en src/app.js | Bloquea | Local + CI | — | — |
| 8.1 Error no controlado → 500 genérico vía middleware/errores.js | Tests integración grupo 4.6 (jest.spyOn sobre repositorio.listar) | Bloquea | Local + CI | — | — |
| 8.2 Sin stack traces, mensajes de excepción ni rutas internas en el 500 | Tests integración grupo 4.6 + PBT Property 4 | Bloquea | Local + CI | — | — |
| 9.1 Cobertura de líneas >= 80% | jest --coverage con coverageThreshold { global: { lines: 80 } } en jest.config.js — medición local: 82.24% | Bloquea (exit code != 0 si cae del umbral) | CI (step "Ejecutar pruebas con cobertura"); verificación local: 82.24% | — | — |
| 9.2 CI ejecuta suite completa y solo permite integrar a main si pasa | GitHub Actions .github/workflows/ci.yml (push/PR a main) | Bloquea | CI, tras npm ci | — | — |
| 9.3 Pruebas de integración supertest cubren requisitos 4–7 | tests/habilitados.test.js (32 tests en 6 grupos) + tests/habilitados.prop.test.js (5 propiedades) | Bloquea | Local + CI | — | — |

**Gates de seguridad en CI** (además de la suite, en orden de ejecución):

| Gate | Herramienta y umbral | Bloquea / avisa | Etapa | Razón |
| --- | --- | --- | --- | --- |
| Detección de secretos | gitleaks-action@v2, con fetch-depth: 0, cualquier hallazgo | Bloquea | Primera, tras checkout (antes de npm ci) | Los secretos comprometidos son el riesgo más severo y no requieren build para detectarse; necesita historial completo |
| SCA de dependencias | npm audit --audit-level=high (sin continue-on-error) | Bloquea | Tras npm ci, antes de las pruebas | Vulnerabilidades high/critical en dependencias no deben llegar a main; si no hay fix, se evalúa un override explícito documentado |
| Cobertura y tests | npx jest --runInBand --coverage, umbral líneas 80% (jest.config.js) | Bloquea | Última | La cobertura es requisito de aceptación (9.1), no informativa |

Nota: las columnas "Run fallido" y "Run corregido" se completarán con los enlaces a los runs de GitHub Actions tras el primer push a main / primer PR. Verificación local previa al push: 63/63 tests en verde, 5 suites, cobertura de líneas global 82.24%, exit code 0.

## Cambios a la propuesta de Kiro

| Documento | Qué propuso Kiro | Qué cambió | Por qué |
| --- | --- | --- | --- |
| requirements.md | Límite máximo de 100 elementos en "aprobados" | Límite reducido a 60 elementos (criterios 5.1–5.3 y mensaje de error actualizados) | Medida más conservadora frente a denegación de servicio por listas masivas: 60 códigos bastan para cubrir toda la malla (87 cursos con prereqs de ciclos 5–10) y acota el costo de validación por elemento |
| design.md | Gate SCA con `npm audit --audit-level=high` como advisory (con `continue-on-error: true`), razonado para contexto de laboratorio educativo | Gate SCA BLOQUEANTE: se eliminó `continue-on-error: true` y se actualizó la razón técnica en la tabla de gates y el YAML propuesto | Vulnerabilidades high/critical en dependencias comprometen el servicio y no deben llegar a main; silenciarlas con continue-on-error solo pospone el hallazgo. Si no existe fix, el equipo debe evaluar un override explícito y documentado |

## Mapeo requisito → implementación → prueba

| Requisito | Archivo(s) de implementación | Prueba(s) que lo verifican |
| --- | --- | --- |
| 4.1, 4.2 | src/routes/habilitados.js (orquestación POST), src/util/habilitados.js (calcularHabilitados) | tests/habilitados.test.js, grupo 4.1 (5 tests) |
| 4.3, 4.4, 4.5, 4.6 | src/util/habilitados.js (filtro por exclusiones + .every sobre prereqs) | tests/habilitados.prop.test.js Property 1; tests/habilitados.test.js grupos 4.1 y 4.5 |
| 5.1, 5.2, 5.3 | src/util/habilitados.js (LIMITE_APROBADOS = 60, chequeo sobre el arreglo original) | tests/habilitados.prop.test.js Property 2; tests/habilitados.test.js grupo 4.2 |
| 6.1, 6.2 | src/util/habilitados.js (FORMATO_CODIGO = /^[A-Z0-9]{6}$/) | tests/habilitados.prop.test.js Property 3; tests/habilitados.test.js grupo 4.3 |
| 6.3, 6.4 | src/util/habilitados.js (MENSAJES constantes literales, sin interpolación) | tests/habilitados.prop.test.js Property 4; tests/habilitados.test.js grupo 4.3 |
| 7.1–7.7 | src/util/habilitados.js (validarAprobados: presencia, tipo array, tipo de elementos), src/app.js (middleware SyntaxError de express.json() → 400) | tests/habilitados.prop.test.js Property 5; tests/habilitados.test.js grupo 4.4 |
| 8.1, 8.2 | src/routes/habilitados.js (try/catch → next(err)), src/middleware/errores.js (500 genérico), src/app.js (orden de middlewares) | tests/habilitados.test.js grupo 4.6 (jest.spyOn sobre repositorio.listar) |
| 9.1, 9.2 | jest.config.js (coverageThreshold), .github/workflows/ci.yml (3 gates bloqueantes: gitleaks, npm audit high, jest --coverage) | Verificación en pipeline: 63/63 tests, cobertura 82.24% |
| 9.3 | tests/habilitados.test.js (32 tests supertest), tests/habilitados.prop.test.js (5 propiedades fast-check) | Suite completa (63 tests, 5 suites) |

## Decisiones de diseño (casos borde, design.md)

| Caso borde | Decisión | Razón |
| --- | --- | --- |
| Códigos duplicados en "aprobados" (ej. ["1INF25","1INF25"]) | Aceptar; se deduplican con Set. El límite de 60 se evalúa sobre el arreglo original (con duplicados) | Los duplicados no alteran la semántica del cálculo (la relación "está aprobado" es de pertenencia); evaluar el límite sobre el original impide evadir el tope rellenando con repeticiones |
| Código inexistente con formato válido (ej. "1ZZZ99") | Ignorar; no invalida la petición (HTTP 200) | La malla cambia entre planes de estudios; un código que hoy no existe puede existir mañana. Alternativa rechazada: devolver 400, porque acoplaría el endpoint a una versión exacta del catálogo y rompería clientes legítimos tras cada actualización de la malla |
| Formato de salida de los cursos habilitados | Igual al shape del catálogo: id, name, credits, cycle, type, prerequisites (ids no resueltos) | Consistencia con GET /cursos y con el objeto de data/cursos.json; los clientes ya consumen ese shape |
| Ordenamiento de la respuesta | Determinista: cycle ascendente, luego id ascendente (localeCompare) | Respuestas estables entre llamadas y versiones; tests y clientes no dependen del orden de inserción del catálogo |
| "aprobados": [] vs propiedad ausente | [] es válido (devuelve los cursos sin prerrequisitos); la ausencia de la propiedad es 400 | Un estudiante sin aprobados sigue siendo una consulta válida; sin la propiedad el body no cumple el contrato |
| Content-Type / body no JSON | express.json() lanza SyntaxError; middleware dedicado en src/app.js responde 400 {"error": "el cuerpo de la petición debe ser JSON válido"} | Sin el middleware, Express propagaría el SyntaxError al manejador de errores y respondería 500, que es incorrecto para un error del cliente (requisitos 7.7, 8.1) |
| Límite evaluado antes de deduplicar | validarAprobados chequea length > 60 sobre el arreglo recibido; el Set se construye después, en la ruta | Impide que 5000 elementos "válidos únicos" o repetidos lleguen a la lógica de cálculo; el costo de validación queda acotado (requisitos 5.1, 5.3) |
