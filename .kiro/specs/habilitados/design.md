# Design Document — Endpoint `POST /habilitados`

## Overview

Este diseño extiende la API REST de consulta de la malla (Express.js, Node 22) con el endpoint `POST /habilitados`. El endpoint recibe `{"aprobados": [...]}` (códigos de cursos aprobados) y devuelve los cursos habilitados: los cursos del catálogo `data/cursos.json` (87 cursos) que no están en `aprobados` y cuyos prerrequisitos están todos contenidos en `aprobados`.

El diseño se divide en tres frentes:

1. **Endpoint y lógica de negocio**: nueva ruta `src/routes/habilitados.js`, función pura de cálculo `calcularHabilitados` y función pura de validación `validarAprobados`, montadas en `src/app.js`.
2. **Gates de calidad en CI** (todos bloqueantes): cobertura Jest ≥ 80%, SCA con `npm audit --audit-level=high` y detección de secretos con gitleaks en `.github/workflows/ci.yml`.
3. **Suite de pruebas**: `tests/habilitados.test.js` con supertest (integración) y pruebas de propiedad con fast-check (jest-fast-check o `fast-check` directo) para la lógica pura.

Los requisitos cubiertos son los 4 al 9 de `requirements.md` (los 1 al 3 pertenecen al spec `consulta-cursos`, ya implementado).

## Architecture

### Diagrama de componentes

```mermaid
flowchart LR
    Cliente -->|POST /habilitados| App[app.js\nexpress.json + routers + middleware errores]
    App --> Ruta[routes/habilitados.js]
    Ruta --> Validar[validarAprobados\nfunción pura - 400 con mensajes claros]
    Validar -->|válido| Calc[calcularHabilitados\nfunción pura - Set + filtro]
    Ruta -->|inválido| Resp400[400 JSON {error}]
    Calc --> Repo[data/repositorio.js\nlistar()]
    Repo --> Catalogo[data/cursos.json]
    Calc --> Resp200[200 array de cursos]
    Ruta -->|error inesperado| ErrMW[middleware/errores.js\n500 genérico]
    ErrMW --> Resp500[500 {error: 'error interno del servidor'}]
```

### Flujo de la petición

1. `express.json()` (ya montado en `app.js`) parsea el body. Un body malformado o con `Content-Type` no JSON produce `SyntaxError` que llega al middleware de errores; se captura explícitamente y se responde 400 (ver Error Handling).
2. `POST /habilitados` delega en `validarAprobados(body)`. Si hay error, responde 400 con `{error: <mensaje>}` y no toca la lógica de negocio.
3. Si la validación pasa, `calcularHabilitados(catalogo, aprobados)` computa la lista.
4. La respuesta 200 es un array JSON de cursos habilitados, ordenado y con shape consistente con `GET /cursos`.
5. Cualquier excepción no controlada la captura `src/middleware/errores.js` (reuso, sin cambios) con 500 genérico.

### Decisiones de arquitectura

- **Funciones puras separadas de la ruta**: `calcularHabilitados` y `validarAprobados` no dependen de `req`/`res` ni del sistema de archivos (reciben el catálogo y el arreglo como parámetros). Esto las hace directamente testeables con property-based testing sin levantar el servidor, y testeables vía HTTP con supertest a través de la ruta.
- **Repositorio sin cambios**: `repositorio.listar()` ya expone el catálogo completo; el cálculo solo necesita iterarlo. No se agregan métodos al repositorio.
- **Middleware de errores reusado tal cual**: el 500 genérico de `src/middleware/errores.js` ya cumple los requisitos 8.1 y 8.2. Solo se agrega, en `app.js`, un manejo previo del `SyntaxError` de `express.json()` para responder 400 en vez de 500 (un body JSON malformado es un error del cliente, no interno).

## Components and Interfaces

### `src/routes/habilitados.js` (nuevo)

```javascript
const express = require('express');
const repositorio = require('../data/repositorio');
const { validarAprobados } = require('../util/habilitados'); // validación pura
// o co-locadas en el mismo módulo si se prefiere menos archivos

const router = express.Router();

router.post('/', (req, res, next) => {
  try {
    const errorValidacion = validarAprobados(req.body);
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }
    const aprobados = new Set(req.body.aprobados); // deduplica
    const habilitados = calcularHabilitados(repositorio.listar(), aprobados);
    return res.status(200).json(habilitados);
  } catch (err) {
    return next(err); // 500 vía middleware/errores.js
  }
});

module.exports = router;
```

Montaje en `src/app.js`: `app.use('/habilitados', require('./routes/habilitados'));` antes del middleware de errores.

### `validarAprobados(body)` — función pura de validación

Orden de chequeos (retorna `string` de error o `null`):

1. **Presencia y tipo del body**: `body` ausente, no objeto, o sin la propiedad `aprobados` → `"el cuerpo debe ser un objeto JSON con la propiedad 'aprobados'"` (requisitos 7.1, 7.7).
2. **Tipo array**: `Array.isArray(body.aprobados) === false` → `"aprobados debe ser un arreglo de strings"` (requisitos 7.2, 7.3, 7.4, 7.5).
3. **Tipo de cada elemento**: cualquier elemento no string → `"todos los elementos de aprobados deben ser strings"` (requisito 7.6). No se interpola el valor del elemento en el mensaje.
4. **Tamaño**: `body.aprobados.length > 60` → `"El arreglo aprobados no puede superar 60 elementos"` (texto exacto del requisito 5.1; se evalúa sobre el arreglo original, antes de deduplicar).
5. **Formato de cada elemento**: `!/^[A-Z0-9]{6}$/.test(elemento)` → `"cada elemento de aprobados debe ser un código válido de 6 caracteres alfanuméricos mayúsculas"` (requisitos 6.1, 6.2). El mensaje es genérico: nunca incluye el valor del elemento.

**Invariantes de seguridad del mensaje**: todos los mensajes son constantes literales; ninguna rama construye el mensaje a partir del input. Esto satisface por construcción el requisito 6.3 (sin reflejo del payload, sin stack traces, sin rutas).

### `calcularHabilitados(catalogo, aprobadosSet)` — función pura de cálculo

```javascript
function calcularHabilitados(catalogo, aprobadosSet) {
  return catalogo
    .filter((curso) => !aprobadosSet.has(curso.id))            // requisito 4.5
    .filter((curso) =>
      (curso.prerequisites || []).every((p) => aprobadosSet.has(p)) // requisitos 4.3, 4.4
    )
    .sort((a, b) => a.cycle - b.cycle || a.id.localeCompare(b.id)); // orden determinista
}
```

- Un curso con `prerequisites: []` pasa `.every(...)` trivialmente → habilitado si no está aprobado (requisito 4.3).
- `aprobadosSet` es un `Set`, así que la verificación de pertenencia es O(1) y los duplicados del arreglo de entrada no afectan la semántica.
- Solo se itera el catálogo; los códigos aprobados inexistentes no participan en nada (requisito 4.6).

### `src/util/habilitados.js` (nuevo, opcional como módulo separado)

Aloja `validarAprobados`, `calcularHabilitados` y la constante `FORMATO_CODIGO = /^[A-Z0-9]{6}$/` / `LIMITE_APROBADOS = 60`. Separarlo en `src/util/` (siguiendo el patrón de `src/util/formato.js`) permite importar las funciones puras en los tests de propiedad sin tocar Express.

### Montaje y middleware en `src/app.js`

```javascript
// body JSON malformado → 400, no 500 (antes del router, junto a express.json)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'el cuerpo de la petición debe ser JSON válido' });
  }
  return next(err);
});

app.use('/habilitados', require('./routes/habilitados'));
```

### Interfaces resumidas

| Componente | Interfaz | Responsabilidad |
|---|---|---|
| `routes/habilitados.js` | `POST /` | Orquestar validación → cálculo → respuesta |
| `util/habilitados.js` | `validarAprobados(body) → string\|null` | Validar estructura, tipo, tamaño y formato (requisitos 5, 6, 7) |
| `util/habilitados.js` | `calcularHabilitados(catalogo, set) → Curso[]` | Cálculo puro de habilitados (requisito 4) |
| `middleware/errores.js` | sin cambios | 500 genérico (requisito 8) |
| `data/repositorio.js` | `listar()` | Fuente del catálogo (requisito 4.6) |

## Data Models

### Entrada

```json
{
  "aprobados": ["1INF25", "1INF27", "1INF49"]
}
```

- `aprobados`: array de 0 a 60 strings, cada una matcheando `/^[A-Z0-9]{6}$/`.

### Salida (200)

Array de objetos curso con el mismo shape que `GET /cursos` (ver Decisión de borde 3):

```json
[
  {
    "id": "1INF29",
    "name": "Sistemas Operativos",
    "credits": 2.5,
    "cycle": 6,
    "type": "obligatorio",
    "prerequisites": ["1INF25", "1INF27", "1INF49"]
  }
]
```

`prerequisites` se devuelve como array de **ids** (no resuelto a `{id, name}`): el consumidor de este endpoint ya conoce o puede consultar los detalles vía `GET /cursos/:codigo`, y para decidir qué cursar el id es suficiente. Esto difiere deliberadamente de `GET /cursos/:codigo` (que resuelve) y coincide con el shape plano del catálogo.

### Salida de error (400/500)

```json
{ "error": "mensaje claro y constante" }
```

## Decisiones de casos borde (no definidos en el pedido)

| # | Caso | Decisión | Razón |
|---|---|---|---|
| 1 | Códigos duplicados (`["1INF25","1INF25"]`) | **Aceptar**. Se deduplican con `Set`. El límite de 60 se evalúa sobre el arreglo original (con duplicados), así que `["X","X",... 61 veces]` → 400. | Un duplicado no altera la semántica del cálculo (pertenencia a un conjunto). Rechazarlo obligaría al cliente a hacer un paso de deduplicación que no cambia nada observable. Mantener el límite sobre el arreglo original preserva el propósito del requisito 5: acotar el costo de procesamiento del payload recibido. |
| 2 | Código inexistente con formato válido (`"1ZZZ99"`) | **Ignorar** (no invalida la petición; simplemente no habilita nada). | La malla cambia entre planes de estudios; un estudiante que aprobó un curso que ya no existe en el catálogo vigente no debería recibir un 400. Semánticamente, "1ZZZ99 ∉ catálogo" es irrelevante para el cálculo porque el cálculo solo itera el catálogo (requisito 4.6). **Alternativa considerada**: rechazar con 400 (`"el código 1ZZZ99 no existe"`) — más estricto, detecta typos, pero acopla el endpoint al contenido exacto del catálogo vigente y rompe a clientes con planes antiguos. Trade-off: aceptamos un typo silencioso a cambio de tolerancia a versiones de malla; el cuerpo de error además no podría incluir el valor (requisito 6.3), lo que hace el rechazo poco informativo. |
| 3 | Formato de salida de cada curso | Mismo shape que `GET /cursos` del catálogo: `id, name, credits, cycle, type, prerequisites` (ids, no resueltos). | Consistencia con el endpoint existente: un cliente que ya consume `GET /cursos` reutiliza los mismos tipos. Resolver prerrequisitos aquí duplicaría lo que hace `GET /cursos/:codigo` y agrandaría la respuesta. |
| 4 | Ordenamiento de la respuesta | `cycle` ascendente, luego `id` ascendente (lexicográfico). | Determinismo: tests estables (el requisito 4.1 exige "tamaño exactamente 27", el 4.2 exige ids concretos) y clientes que pueden confiar en el orden sin paginación ni cabeceras de orden. `cycle` primero porque es el eje natural de una malla curricular. |
| 5 | `aprobados: []` vs propiedad ausente | `[]` es **válido** (200 con todos los cursos sin prerrequisitos y no vacíos de aprobación; en este catálogo, todos los cursos de ciclo 5 con `prerequisites: []`). Propiedad ausente → 400 (requisito 7.1). | Un estudiante que aún no aprobó nada es un caso legítimo: los cursos sin prerrequisitos están habilitados por el requisito 4.3. La ausencia, en cambio, es una estructura incompleta. |
| 6 | `Content-Type` no JSON / body no parseable | `express.json()` lanza `SyntaxError` → se captura y responde **400** `{"error": "el cuerpo de la petición debe ser JSON válido"}`. | Un body malformado es un error del cliente (requisito 7.7: "cuerpo vacío" → 400). Sin esta captura, el SyntaxError caería al middleware genérico y devolvería 500, violando la semántica. Peticiones sin body con `Content-Length: 0` también llegan con `req.body` vacío → 400 por 7.1. |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Las propiedades 1 a 5 se validan sobre las funciones puras `validarAprobados` y `calcularHabilitados` con la librería **fast-check** (`fast-check` v3, integrada a Jest con `fc.assert` en tests normales; no se implementa PBT desde cero). Cada propiedad corre con mínimo 100 iteraciones. Los criterios de ejemplo (4.1, 4.2, 5.2, 5.3, 6.2, 8.1) se cubren con tests de integración supertest, y las propiedades 2, 3 y 4 se re-verifican además vía HTTP en tests de integración con muestras fijas.

### Property 1: Especificación exacta de cursos habilitados (model-based)

*For any* conjunto `A` de códigos válidos (extraído de subconjuntos aleatorios del catálogo más códigos válidos inexistentes), el resultado de `calcularHabilitados(catalogo, new Set(A))` es exactamente igual (mismo conjunto de ids) a `{c ∈ catalogo : c.id ∉ A ∧ prereqs(c) ⊆ A}`, y todo curso devuelto pertenece al catálogo.

**Validates: Requirements 4.3, 4.4, 4.5, 4.6**

Esta propiedad única subsume los criterios 4.3 (prerrequisitos vacíos → habilitado), 4.4 (al menos un prerrequisito no aprobado → excluido), 4.5 (aprobado → excluido aunque cumpla prerrequisitos) y 4.6 (solo cursos del catálogo).

### Property 2: Límite de 60 elementos

*For any* arreglo `aprobados` de longitud > 60 (longitudes generadas entre 61 y 200, elementos válidos o inválidos), `validarAprobados` retorna el string exacto `"El arreglo aprobados no puede superar 60 elementos"`, y el endpoint responde 400 con ese mensaje; *for any* arreglo de longitud ≤ 60 con todos los elementos válidos, la validación retorna `null`.

**Validates: Requirements 5.1, 5.2, 5.3**

El criterio 5.3 (5000 elementos) es una instancia extrema de esta propiedad y queda además como test de integración explícito. El borde de 60 exactos (5.2) se verifica con el cuantificador de longitud ≤ 60.

### Property 3: Rechazo universal de formatos inválidos

*For any* string que no matchea `/^[A-Z0-9]{6}$/` (generador: longitudes ≠ 6, minúsculas, símbolos, espacios, unicode, payloads tipo `"1INF30<script>"`), un arreglo conteniéndola hace que `validarAprobados` retorne un error, y el endpoint responde 400.

**Validates: Requirements 6.1, 6.2**

### Property 4: No-reflexión del input en mensajes de error

*For any* entrada inválida (formato, tipo, estructura) generada —incluyendo payloads con HTML, JS, rutas de archivo y caracteres de control— el cuerpo de la respuesta de error 400 (y del 500 forzado) es JSON con propiedad `error` de tipo string, y el valor de `error` **no contiene** el substring del elemento malicioso, ni stack traces, ni rutas internas del sistema de archivos.

**Validates: Requirements 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.2**

### Property 5: Rechazo universal de tipos no array

*For any* valor JSON generado para `aprobados` que no es un array de strings (strings, números, booleans, null, objetos, arrays con elementos no-string, body ausente o vacío), `validarAprobados` retorna un error y el endpoint responde 400 con `{error: string}`.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**

### Propiedades no testeables (fuera de PBT)

- **9.1** (cobertura ≥ 80%): gate de CI, no una propiedad del código. Se verifica con `jest --coverage --coverageThreshold`.
- **9.2** (CI bloquea integración): comportamiento del pipeline de GitHub Actions; se verifica estructuralmente (workflow con `npm test` en un step que falla el job) y con la ejecución del PR.
- **4.1/4.2** (27 cursos exactos, 1INF29-1INF32): valores concretos del catálogo; ejemplo de integración, no propiedad.
- **8.1** (500 con middleware): requiere forzar un error interno con stub; test mock-based.

## Error Handling

| Escenario | HTTP | Cuerpo | Origen |
|---|---|---|---|
| Sin `aprobados` / body vacío | 400 | `{"error": "el cuerpo debe ser un objeto JSON con la propiedad 'aprobados'"}` | `validarAprobados` (7.1, 7.7) |
| `aprobados` no array (string, null, número, objeto) | 400 | `{"error": "aprobados debe ser un arreglo de strings"}` | `validarAprobados` (7.2–7.5) |
| Elemento no string | 400 | `{"error": "todos los elementos de aprobados deben ser strings"}` | `validarAprobados` (7.6) |
| > 60 elementos | 400 | `{"error": "El arreglo aprobados no puede superar 60 elementos"}` | `validarAprobados` (5.1, 5.3) |
| Elemento con formato inválido | 400 | `{"error": "cada elemento de aprobados debe ser un código válido de 6 caracteres alfanuméricos mayúsculas"}` | `validarAprobados` (6.1, 6.2) |
| Body JSON malformado | 400 | `{"error": "el cuerpo de la petición debe ser JSON válido"}` | captura de `SyntaxError` en `app.js` (borde 6) |
| Error no controlado | 500 | `{"error": "error interno del servidor"}` | `middleware/errores.js` (8.1) |

Principios aplicados a todos los mensajes:

- **Constantes literales**: ningún mensaje se construye interpolando el input (requisito 6.3). La validación retorna el mensaje, no el valor.
- **Sin stack traces ni rutas**: el middleware de errores ya lo garantiza para el 500; para los 400 basta con que los mensajes sean literales.
- **Orden de validación determinista**: presencia → tipo → elementos → tamaño → formato. El tamaño se evalúa antes del formato para que un payload masivo (5000 elementos) falle rápido por el límite sin iterar formatos.
- **Fail-closed**: cualquier condición no contemplada en `validarAprobados` (p. ej. `req.body` con prototype raro) cae en las ramas de presencia/tipo y responde 400, no en el cálculo.

## Gates de Calidad en CI

Se amplía `.github/workflows/ci.yml` con tres gates. Orden de steps: **gitleaks → npm ci → npm audit → npm test (con coverage)**. La detección de secretos no necesita dependencias y debe correr antes de instalar nada; el audit corre justo después de `npm ci` porque necesita el lockfile resuelto; las pruebas con umbral de cobertura son el gate final.

| Gate | Herramienta | Umbral | Bloquea/Avisa | Etapa | Razón |
|---|---|---|---|---|---|
| Cobertura de líneas | `jest --coverage --coverageThreshold='{"global":{"lines":80}}'` (vía `npm test -- --coverage`) | ≥ 80% líneas | **BLOQUEA** (exit code ≠ 0 falla el step) | Tras `npm ci`, step final `Ejecutar pruebas` | El requisito 9.1 exige ≥ 80% de líneas como condición de aprobación, no como métrica informativa. Jest con `coverageThreshold` convierte el incumplimiento en exit code ≠ 0, que ya falla el job sin lógica extra. Estricto porque la cobertura es requisito de aceptación del laboratorio. |
| SCA (dependencias) | `npm audit --audit-level=high` | Sin vulnerabilidades ≥ high (severidad high/critical) | **BLOQUEA** (exit code ≠ 0 falla el step) | Tras `npm ci`, antes de las pruebas | Dependencias con vulnerabilidades high/critical comprometen el servicio directamente (Express, parsers, etc.) y no deben llegar a main. `npm audit --audit-level=high` retorna exit code ≠ 0 si detecta vulnerabilidades de esa severidad, lo que falla el step y detiene el pipeline sin lógica adicional. Si existe una vulnerabilidad sin fix publicado, el equipo debe evaluar un override explícito (`npm audit --audit-level=critical`) o una excepción documentada; el comportamiento por defecto es bloquear. |
| Detección de secretos | `gitleaks/gitleaks-action@v2` (o paso manual `gitleaks detect --redact`) | Cero secretos detectados | **BLOQUEA** | Primera etapa, tras el checkout, antes de `npm ci` | Un secreto commiteado (token, contraseña, `.env`) es el riesgo más severo: no requiere build ni ejecución para explotarse, solo que el repo sea visible. Correrlo primero evita gastar tiempo de build/instalación en un commit que va a ser rechazado y reduce la ventana de exposición del secreto en los logs del pipeline. |

### Cambios concretos al workflow

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # gitleaks necesita historial completo

      - name: Detección de secretos
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Análisis de vulnerabilidades (SCA)
        run: npm audit --audit-level=high

      - name: Ejecutar pruebas con cobertura
        run: npx jest --runInBand --coverage --coverageThreshold='{"global":{"lines":80}}'
```

Notas:
- `npm test` pasa a ejecutarse con `--coverage` y el umbral embebido en el comando (o alternativamente el umbral se fija en `jest.config.js` con `coverageThreshold: { global: { lines: 80 } }` y el step es `npm test -- --coverage`; se prefiere la opción del config por visibilidad permanente).
- El job solo pasa a main si gitleaks, `npm audit` y la cobertura pasan (requisito 9.2); `npm audit` falla el step con exit code ≠ 0 ante cualquier vulnerabilidad high o critical.
- Se mantiene `npm ci` (no `npm install`) por reproducibilidad desde el lockfile.

## Testing Strategy

**Estrategia dual**: pruebas de propiedad (fast-check, ≥ 100 iteraciones, sobre las funciones puras) + pruebas de integración con supertest (sobre el endpoint HTTP, ejemplos concretos y re-verificación de propiedades con muestras fijas).

### Pruebas de propiedad (nuevo: `tests/habilitados.prop.test.js` o dentro de `tests/habilitados.test.js`)

Cada test lleva el tag `// Feature: habilitados, Property {n}: {texto}` y usa `fc.assert(fc.property(...), { numRuns: 100 })`:

- **Property 1**: generador de subconjuntos aleatorios del catálogo (vía `fc.sample` de ids o `fc.uniqueArray` sobre los 87 ids + códigos válidos inexistentes generados con `fc.stringMatching(/^[A-Z0-9]{6}$/)`). Oráculo: modelo de referencia directo con `filter`/`every`/`includes`.
- **Property 2**: `fc.integer(61, 200)` como longitud, elementos generados válidos.
- **Property 3**: generador de strings inválidas (longitud arbitraria ≠ 6 o con caracteres fuera de `[A-Z0-9]`), embebidas en un arreglo válido.
- **Property 4**: payloads maliciosos generados (`<script>`, rutas, unicode) → verificar `!body.error.includes(payload)` y shape `{error: string}`.
- **Property 5**: `fc.jsonValue` restringido a no-arrays, o generador de unión de primitivas/objetos/null.

### Pruebas de integración (`tests/habilitados.test.js`, supertest)

1. **Happy path (4.1, 4.2)**: `["1INF25","1INF27","1INF49"]` → 200, array de exactamente 27 elementos, contiene `1INF29` (Sistemas Operativos), `1INF30` (Programación 3), `1INF31` (Arquitectura de Software), `1INF32` (Algoritmos Avanzados).
2. **Límite (5.1, 5.2, 5.3)**: 61 elementos → 400 con mensaje exacto; 60 elementos válidos → 200; 5000 elementos → 400 mismo mensaje.
3. **Formato (6.1, 6.2)**: `"1INF30<script>"` → 400; el body de error no contiene `<script>`; respuesta JSON con `error` string (6.4).
4. **Estructura (7.1–7.7)**: ausente, string, null, número 42, objeto, elemento no-string, body vacío, body no-JSON → 400.
5. **Bordes (decisiones de diseño)**: duplicados → 200 y mismo resultado que sin duplicados; código inexistente `"1ZZZ99"` → 200; `[]` → 200 (todos los cursos sin prerrequisitos); orden determinista → array ordenado por `cycle` asc y `id` asc en dos llamadas consecutivas con el mismo body.
6. **500 (8.1, 8.2)**: stub de `repositorio.listar` para que lance → 500 con `{"error": "error interno del servidor"}`, sin stack ni rutas (jest.mock de `../src/data/repositorio` o inyección del catálogo).
7. **Exclusión (4.4, 4.5 vía HTTP)**: un curso con prerrequisito no aprobado no aparece; un curso aprobado no aparece aunque cumpla prerrequisitos.

### Cobertura (9.1)

- `jest.config.js`: agregar `coverageThreshold: { global: { lines: 80 } }` para que también el `npm test -- --coverage` local aplique el mismo umbral que CI.
- Las funciones puras y la ruta quedan cubiertas por propiedades + integración; el middleware de errores ya tiene cobertura del spec anterior y la rama del `SyntaxError` se cubre con el test de body no-JSON.

### Comandos (local, no watch)

- `npx jest --runInBand --coverage` (una sola ejecución; nunca en modo watch dentro del pipeline).
- Servidor de desarrollo: `npm start` (manual, en la terminal del usuario; no se ejecuta en este workflow).

## Trazabilidad requisitos → diseño

| Requisito | Cobertura en el diseño |
|---|---|
| 4.1–4.6 | `calcularHabilitados`, Property 1, tests 1 y 7 |
| 5.1–5.3 | Chequeo de tamaño en `validarAprobados`, Property 2, tests 2 |
| 6.1–6.4 | Chequeo de formato, mensajes literales, Properties 3 y 4, tests 3 |
| 7.1–7.7 | Chequeos presencia/tipo/elementos, Property 5, tests 4 |
| 8.1–8.2 | Reuso de `middleware/errores.js`, captura de SyntaxError aparte, test 6 |
| 9.1–9.3 | Gates CI (cobertura bloqueante), workflow actualizado, suite supertest |
