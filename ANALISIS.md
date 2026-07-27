# Análisis y criterio — Reto Desarrollador de Soluciones con IA · Aztec

> Este documento explica **por qué el sistema es como es**. El enunciado dice que
> interesa menos que esté todo hecho, y más entender por qué se tomaron las
> decisiones que se tomaron. Esta es esa respuesta, por escrito.
>
> Todos los números que aparecen aquí salieron de correr scripts sobre el dataset,
> no de leerlo por encima. Los tests en `tests/` verifican cada caso citado.

---

## 1. El encargo

Aztec entregó un dataset con **22 proyectos, 82 tareas y 5 personas** (pestañas
`Projects`, `Tasks`, `Team`) y pidió un sistema que permita, como mínimo:

1. Crear y actualizar proyectos
2. Guardar responsable, estado, prioridad, fecha límite, siguiente paso, bloqueos y notas
3. Detectar proyectos en riesgo, bloqueados o sin siguiente paso claro
4. Ofrecer una vista útil para seguimiento operativo
5. Mostrar un criterio claro de priorización

---

## 2. El problema real que esconde el dataset

Al analizar los datos aparece una sola cosa, y es grave:

| Salud declarada | Proyectos |
|---|---|
| Bloqueado | 13 |
| En riesgo | 4 |
| Sano | 5 |

**19 de 22 proyectos están en rojo.** Y de los 5 "sanos", uno (PRJ-21) lleva
cinco meses sin una sola tarea abierta.

Esto tiene una consecuencia directa sobre el diseño: **un tablero que solo ordene
proyectos de más a menos urgente no sirve para nada.** Si abres la aplicación un
lunes y ves 19 proyectos en rojo ordenados por urgencia, sigues sin saber qué
hacer. Has cambiado una hoja de cálculo por otra.

### La tesis del sistema

> **Priorizar no es ordenar una lista. Es separar lo que se ejecuta, de lo que se
> escala, de lo que hay que decidir.**

Un proyecto bloqueado esperando credenciales del cliente **no se trabaja: se
escala**. Meterle horas de ingeniería es desperdiciarlas — es un problema
comercial, no técnico. Un proyecto con una dependencia circular no se escala:
primero hay que **decidir** qué se rompe.

Por eso el sistema tiene **dos dimensiones**, no una:

| Dimensión | Qué responde | Cómo funciona |
|---|---|---|
| **Score 0–100** | ¿Cuánto debe importarme? | Fórmula determinista de 3 factores |
| **Cola de acción** | ¿Qué tipo de acción requiere? | EJECUTAR / ESCALAR / DECIDIR |

Sin la segunda dimensión tienes una hoja de cálculo bonita. Con ella, un sistema
operativo.

---

## 3. Lo que encontramos en los datos

Cada hallazgo de abajo justifica una decisión de diseño concreta.

### 3.1 Los datos declarados no son confiables

| # | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| 1 | **Los 4 Diagnósticos dicen "En riesgo" pero tienen tareas Bloqueadas** | PRJ-13, 14, 15, 16 | La salud se **recalcula desde las tareas**. El campo declarado se guarda como `healthSource` solo para auditar |
| 2 | **`is_overdue` no es confiable** | Corresponde a un corte del ~13-jul-2026, y aun a esa fecha 4 tareas están mal marcadas (PRJ-13/14/15/16-T01) | Se recalcula contra la fecha de corte. El original queda en `isOverdueSource` |
| 3 | **Andrea Molina no aparece en la pestaña `Team`** | Es dueña de PRJ-19 y tiene 4 tareas asignadas, pero `Team` solo lista 5 personas | La capacidad del equipo venía mal contada en origen. Se marca con `inSourceTeamSheet = false` y se reporta |
| 4 | **Monedas mezcladas** | 20 proyectos en USD, 2 en COP (85.000.000 y 120.000.000) | Sin normalizar, cualquier ranking por valor está mal. Tasa explícita y configurable en `src/lib/config.ts` |
| 5 | **Fechas en dos formatos** | PRJ-17 usa `02/03/2026`; el resto ISO `2026-03-02` | El parser del seed acepta ambos |

### 3.2 Cosas rotas que ninguna hoja de cálculo detecta

| # | Hallazgo | Evidencia | Por qué importa |
|---|---|---|---|
| 6 | **Dependencia circular en PRJ-04** | `T02` depende de `T03`, y `T03` depende de `T02` | Esas dos tareas **no pueden arrancar nunca**. El proyecto no tiene siguiente paso posible |
| 7 | **PRJ-21 es un proyecto zombie** | `health = Sano`, 0 tareas abiertas, fecha límite 2026-02-10 vencida hace 5 meses | Sano en el papel, muerto en la operación |
| 8 | **PRJ-08 y PRJ-22 son el mismo proyecto** | Mismo cliente (Vector Partners), mismo nombre, mismo `target_date`, tareas idénticas | 73.000 USD posiblemente contados dos veces en el pipeline |
| 9 | **Faltan datos clave** | PRJ-07 sin valor de negocio; 5 proyectos sin fecha límite; 9 sin fecha de inicio | **No se inventan.** Se marcan con flag y el proyecto va a la cola DECIDIR |

### 3.3 El problema de fondo: capacidad

| # | Hallazgo | Evidencia |
|---|---|---|
| 10 | **21 frentes abiertos entre 6 personas** | Los 21 proyectos con backlog tienen **exactamente una** tarea sin dependencias, y esa tarea está siempre "En progreso" |
| 11 | **Camila Torres concentra 7 proyectos, 28 tareas abiertas y 20 de prioridad alta o crítica** | Santiago Vera tiene 2 proyectos y 4 tareas. En el ranking calculado, **6 de los 11 proyectos más urgentes son de Camila** |

Priorizar sin mirar capacidad es teoría. Por eso hay una vista de equipo.

### 3.4 Lo que el enunciado pide y el dataset NO tiene

> El reto exige guardar **"siguiente paso"** y **"notas"**.
> Ninguna de las dos columnas existe en el dataset.

Esto no es un problema: es la oportunidad de diseño más grande del reto. El
siguiente paso **no se pide a mano** — se deriva del grafo de dependencias de las
tareas y queda editable. Ver sección 4.3.

---

## 4. Cómo funciona el sistema

### 4.1 El Score — ¿cuánto debe importarme?

```
Score = 40 × Urgencia  +  35 × Riesgo  +  25 × Valor
```

| Factor | Peso | Cálculo | Por qué así |
|---|---|---|---|
| **Urgencia** | 40 | Días hasta la fecha límite: vencido `1.00` · ≤7d `0.85` · ≤14d `0.70` · ≤30d `0.50` · ≤60d `0.30` · >60d `0.15`. **Sin fecha → `0.50` + flag** | El tiempo es el único recurso que no se recupera. La ausencia de fecha no se premia ni se castiga: se marca como deuda de datos |
| **Riesgo** | 35 | `0.5 ×` salud recalculada (Bloqueado 1.0 / En riesgo 0.6 / Sano 0) `+ 0.3 ×` proporción de tareas vencidas `+ 0.2 ×` tiene una tarea Crítica vencida | Se calcula desde las tareas, no desde el campo declarado (hallazgo #1) |
| **Valor** | 25 | Valor de negocio → USD, normalizado **por percentil del portafolio**, no linealmente | Con escala lineal, 120M COP aplastaría a un proyecto de 1.000 USD y el ranking sería el ranking de facturación. El percentil evita que un outlier domine |

**Por qué el valor pesa menos que urgencia y riesgo:** un proyecto caro que va
bien no necesita atención hoy. El score mide *dónde debe mirar el equipo*, no
cuánto factura el proyecto.

**Ejemplo auditable a mano — PRJ-22, el #1 del ranking:**

```
Urgencia  1.00   fecha límite 2026-04-27, vencida          40 × 1.00 = 40.0
Riesgo    0.85   bloqueado (0.5) + 50% tareas vencidas
                 (0.15) + tiene crítica vencida (0.2)      35 × 0.85 = 29.8
Valor     1.00   38.000 USD, el más alto del portafolio    25 × 1.00 = 25.0
                                                          ─────────────────
                                                    SCORE          =  94.8
```

### 4.2 Las Colas — ¿qué tipo de acción requiere?

Cada proyecto cae en **una sola** cola:

| Cola | Condición | Significado operativo |
|---|---|---|
| **EJECUTAR** | Tiene tarea arrancable y su bloqueo, si lo hay, es **interno** | El equipo trabaja esto hoy. Ordenado por score |
| **ESCALAR** | Bloqueado por dependencia **externa**: cliente, credenciales, API, permisos | No se trabaja, se escala. Necesita dueño de escalación y fecha de respuesta |
| **DECIDIR** | Sin siguiente paso, sin fecha límite, con ciclo, zombie o duplicado | Requiere una decisión humana antes de poder priorizarse |

**El detalle que hace creíble esta división: sale del dataset, no de una opinión.**
Las tareas bloqueadas traen escrita su causa en el campo `detail`:

| Texto en el dataset | Clasificación | Cola |
|---|---|---|
| `Waiting on client response, credentials, external API or business definition` | EXTERNO | ESCALAR |
| `Blocked by permissions, repository access or owner confirmation` | EXTERNO | ESCALAR |
| `A recurrent technical or operational dependency is hurting stability...` | INTERNO | EJECUTAR |

Por eso PRJ-03, PRJ-05 y PRJ-06 quedan en EJECUTAR pese a estar bloqueados:
**su bloqueo es nuestro y lo podemos romper.**

### 4.3 El grafo de tareas — de dónde sale el "siguiente paso"

En el dataset, la columna `dependency` es **texto libre con el título de otra
tarea del mismo proyecto**. Las 82 resuelven correctamente contra el título de
una tarea hermana.

Al normalizarla a una relación real (`Task.dependsOnTaskId`), el sistema calcula
solo:

1. **Qué tarea es arrancable** — no está bloqueada y su dependencia está cerrada
2. **El siguiente paso del proyecto** — la tarea arrancable de mayor prioridad y
   fecha más próxima. Se propone automáticamente y **queda editable**
3. **Si hay un ciclo** → el proyecto no tiene siguiente paso posible → DECIDIR
4. **Si no hay ninguna arrancable** → flag `SIN_SIGUIENTE_PASO`

Así se cubre *"detectar proyectos sin siguiente paso claro"* **calculándolo**, en
vez de pidiéndole al usuario que lo escriba.

### 4.4 Las reglas de detección

Nueve reglas, en `src/lib/rules.ts`, versionadas y con tests:

```
BLOQUEADO             health = Bloqueado  ∨  ≥1 tarea Bloqueada
EN_RIESGO             fecha límite vencida ∨ ≥1 tarea vencida ∨ owner sobrecargado
SIN_SIGUIENTE_PASO    ninguna tarea arrancable  ∨  0 tareas abiertas
DEPENDENCIA_CIRCULAR  ciclo en el grafo de dependencias          → PRJ-04
PROYECTO_ZOMBIE       0 tareas + activo + fecha vencida          → PRJ-21
DUPLICADO_PROBABLE    mismo cliente + nombre normalizado         → PRJ-08 / PRJ-22
DATOS_INCOMPLETOS     falta fecha límite, valor o fecha inicio   → 6 proyectos
SOBRECARGA_OWNER      tareas abiertas del owner > P80 del equipo → Camila Torres
PERSONA_FANTASMA      owner ausente de la tabla de equipo        → Andrea Molina
```

### 4.5 Dos decisiones que hay que explicar

**a) La fecha de corte es configurable.**
El dataset es un snapshot del ~13-jul-2026. Con la fecha real de hoy, 13 de 22
proyectos salen vencidos y el tablero pierde toda señal. El sistema calcula todo
contra una **fecha de corte configurable** (`AS_OF_DATE`), con default en la
fecha del snapshot y un selector en la interfaz. Mover esa fecha recalcula el
portafolio entero.

**b) La prioridad manual es un override auditado.**
El reto pide "guardar prioridad". El score es calculado; la prioridad manual
existe como override explícito que **exige una razón escrita** y queda en el log
de actividad. No se puede saltar el algoritmo sin decir por qué.

---

## 5. El modelo, ya calculado sobre los 22 proyectos reales

Esto no es una proyección: es la salida del motor con fecha de corte 2026-07-13.

```
 #  CODE    COLA      SCORE   URG   RSK   VAL   OWNER            VENC BLQ       USD   FLAGS
──────────────────────────────────────────────────────────────────────────────────────────────
 1  PRJ-22  ESCALAR    94.8  1.00  0.85  1.00  Camila Torres       2   1    38,000
 2  PRJ-08  ESCALAR    93.5  1.00  0.85  0.95  Camila Torres       2   1    35,000
 3  PRJ-04  DECIDIR    88.5  1.00  0.85  0.75  Camila Torres       2   1    25,000   CICLO
 4  PRJ-09  ESCALAR    87.2  1.00  0.85  0.70  Camila Torres       2   1    22,000
 5  PRJ-06  EJECUTAR   85.2  1.00  0.65  0.90  Laura Gomez         2   1    30,000
 6  PRJ-10  ESCALAR    83.5  1.00  0.85  0.55  Camila Torres       2   1    18,000
 7  PRJ-07  ESCALAR    82.2  1.00  0.85  0.50  Camila Torres       2   1       s/d   DATOS
 8  PRJ-13  ESCALAR    81.1  1.00  0.93  0.35  Santiago Vera       3   1    12,000
 9  PRJ-11  ESCALAR    81.0  1.00  0.85  0.45  Laura Gomez         2   1    15,000
10  PRJ-12  ESCALAR    76.0  1.00  0.85  0.25  Mateo Ruiz          2   1     9,000
11  PRJ-03  EJECUTAR   72.8  1.00  0.65  0.40  Camila Torres       2   1    14,000
12  PRJ-01  DECIDIR    69.8  0.50  0.85  0.80  Daniel Rojas        2   1    28,000   DATOS
13  PRJ-05  EJECUTAR   66.5  1.00  0.65  0.15  Laura Gomez         2   1     3,000
14  PRJ-21  DECIDIR    63.0  1.00  0.30  0.50  Santiago Vera       0   0    16,000   SIN_PASO, ZOMBIE
15  PRJ-14  DECIDIR    54.9  0.50  0.93  0.10  Mateo Ruiz          3   1     2,000   DATOS
16  PRJ-15  DECIDIR    52.4  0.50  0.93  0.00  Laura Gomez         3   1     1,000   DATOS
17  PRJ-16  DECIDIR    52.4  0.50  0.93  0.00  Mateo Ruiz          3   1     1,000   DATOS
18  PRJ-02  DECIDIR    47.8  0.50  0.65  0.20  Daniel Rojas        2   1     8,000   DATOS
19  PRJ-20  EJECUTAR   27.2  0.15  0.00  0.85  Laura Gomez         0   0    29,268
20  PRJ-18  EJECUTAR   22.2  0.15  0.00  0.65  Mateo Ruiz          0   0    20,732
21  PRJ-19  EJECUTAR   21.0  0.15  0.00  0.60  Andrea Molina       0   0    19,000
22  PRJ-17  EJECUTAR   19.5  0.30  0.00  0.30  Daniel Rojas        0   0    11,000

COLAS:  ESCALAR 8  ·  DECIDIR 7  ·  EJECUTAR 7
CARGA:  Camila 28 · Laura 19 · Mateo 16 · Daniel 11 · Santiago 4 · Andrea 4   (P80 = 19)
```

### Lo que este resultado demuestra

1. **La separación funciona.** Los proyectos sanos (PRJ-17 a PRJ-20) quedan entre
   19 y 27 puntos, muy por debajo de los bloqueados (76–95). El score separa
   señal de ruido sin que nadie lo empuje a mano.

2. **8 de los 10 proyectos más urgentes van a ESCALAR, no a EJECUTAR.** Es decir:
   **el equipo no puede resolver su propia lista de prioridades con más horas de
   trabajo.** Necesita que alguien levante el teléfono. Es el hallazgo operativo
   más fuerte del ejercicio, y solo aparece cuando separas las colas.

3. **6 de los 11 proyectos más urgentes son de Camila Torres.** El cuello de
   botella no es una opinión sobre el reparto de carga: es el ranking mismo.

4. **La cola EJECUTAR queda con 7 proyectos entre 6 personas.** Eso sí es un lunes
   ejecutable. Comparado con "19 proyectos en rojo", es la diferencia entre un
   tablero y un sistema.

5. **PRJ-04 aparece #3 y va a DECIDIR, no a ESCALAR.** Con 25.000 USD y todo
   vencido, el instinto diría "escalar ya". Pero tiene una dependencia circular:
   dos de sus tareas no pueden arrancar nunca. Escalarlo con el cliente antes de
   romper el ciclo sería quemar la llamada.

6. **Andrea Molina aparece en el ranking pero no en la tabla de equipo.** Es dueña
   de PRJ-19 con 4 tareas, y la hoja `Team` solo lista 5 personas.

---

## 6. Arquitectura

**Stack:** Next.js + TypeScript + Prisma + SQLite + Tailwind. Un solo comando
levanta todo (ver `README.md`).

```
src/lib/          ← EL NÚCLEO. Código puro, sin React ni Next.
  config.ts       fecha de corte, tasa COP→USD, pesos, umbrales
  graph.ts        dependencias, tarea arrancable, detección de ciclos
  rules.ts        las 9 reglas de detección
  scoring.ts      el score y su desglose explicable
  queues.ts       enrutamiento EJECUTAR / ESCALAR / DECIDIR
  ai.ts           redacción asistida, con fallback determinista
src/app/          las vistas y la API
tests/            vitest sobre lib/
```

**La regla de arquitectura:** todo el criterio vive en `src/lib/`, es código puro
y testeado, y no importa nada de React ni de Next. La interfaz es una vista sobre
el dominio, no el dominio. Si mañana esto tiene que ser un bot de Slack, se reusa
`src/lib/` completo.

**Los flags y el score no se guardan en la base de datos**: se calculan al leer.
Así nunca quedan obsoletos, y cambiar un peso re-prioriza el portafolio entero
sin migración.

### El componente de IA: la IA redacta, no decide

Dos funciones, ambas con **fallback determinista** — la aplicación funciona
completa sin clave de API:

- **Borrador del siguiente paso** para proyectos marcados `SIN_SIGUIENTE_PASO`,
  usando sus tareas y bloqueos. Siempre editable, nunca se guarda solo.
- **Resumen ejecutivo del portafolio**, generado desde las colas ya calculadas.

**El score, los flags y las colas nunca pasan por el LLM.** Es una decisión
explícita: la priorización tiene que ser reproducible y auditable. Si dos personas
corren el sistema con los mismos datos, tienen que obtener el mismo ranking.
