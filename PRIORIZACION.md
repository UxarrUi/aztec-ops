# El criterio de priorización

Este documento explica cómo el sistema decide qué es prioritario, y deja tres
cálculos hechos a mano para que cualquiera pueda auditarlo sin leer el código.

Todo lo que aquí se describe vive en `src/lib/` y está cubierto por los tests de
`tests/`. Los parámetros —pesos, umbrales, tasa de cambio— están en un único
archivo, `src/lib/config.ts`: si alguien no está de acuerdo con la priorización,
ese es el archivo que hay que discutir.

---

## El problema que resuelve

El portafolio tiene 22 proyectos y **18 están en rojo**. Ordenarlos de más a
menos urgente produce una lista de 18 rojos: información cierta e inútil.

Peor: los proyectos que encabezan cualquier ranking por urgencia están
bloqueados esperando al cliente. Trabajarlos más horas no los mueve. Un criterio
que solo mide *importancia* manda al equipo a empujar una pared.

Por eso el sistema responde **dos** preguntas, no una.

---

## Dimensión 1 — ¿Cuánto debe importarme?

```
Score = 40 × Urgencia  +  35 × Riesgo  +  25 × Valor
```

Los pesos suman 100 para que el resultado se lea directamente de 0 a 100.

### Urgencia (peso 40)

Días entre la fecha de corte y la fecha límite del proyecto:

| Situación | Valor |
|---|---|
| Vencido | 1.00 |
| Vence en ≤ 7 días | 0.85 |
| ≤ 14 días | 0.70 |
| ≤ 30 días | 0.50 |
| ≤ 60 días | 0.30 |
| > 60 días | 0.15 |
| **Sin fecha límite** | **0.50** + señal `DATOS_INCOMPLETOS` |

El `0.50` de "sin fecha" es deliberado. Poner `0` haría que los proyectos sin
fecha se hundieran en el ranking y se olvidaran — que es exactamente lo que ya
les pasó. Poner `1` los subiría al tope sin razón. Se quedan en el medio y se
marcan: **el problema real no es su urgencia, es que nadie les puso fecha.**

### Riesgo (peso 35)

```
Riesgo = 0.5 × salud  +  0.3 × (tareas vencidas / tareas abiertas)  +  0.2 × (hay una tarea crítica vencida)
```

donde `salud` vale `1.0` si el proyecto está bloqueado, `0.6` si está en riesgo y
`0` si está sano.

**La salud se recalcula desde las tareas; no se lee del dataset.** En la fuente,
los cuatro proyectos de Diagnóstico (PRJ-13 a PRJ-16) venían marcados "En riesgo"
teniendo tareas bloqueadas. El campo declarado se conserva en `healthSource` para
poder mostrar la discrepancia, pero no participa en la decisión.

### Valor (peso 25)

El valor de negocio, normalizado a USD y convertido a **percentil dentro del
portafolio**.

Dos decisiones aquí:

**Normalizar la moneda.** 20 proyectos vienen en USD y 2 en COP (85 y 120
millones). Compararlos sin convertir haría que los dos proyectos en pesos
dominaran el ranking por puro efecto de la unidad. La tasa está declarada como
supuesto en `config.ts`.

**Usar percentil y no escala lineal.** El portafolio va de 1.000 a 38.000 USD.
Con escala lineal, los proyectos grandes aplastan a todos los demás y el ranking
de atención termina siendo el ranking de facturación. El percentil mide posición
relativa, que es lo que importa para decidir dónde mirar.

Si falta el valor (PRJ-07), se usa la mediana del portafolio y se marca el dato
faltante. No se asume cero: asumir cero es inventar que el proyecto no vale nada.

### Por qué el valor pesa menos que urgencia y riesgo

Porque **un proyecto caro que va bien no necesita atención hoy**. El score mide
dónde debe mirar el equipo esta semana, no cuánto factura cada frente. PRJ-20 es
el tercero más valioso del portafolio y queda en el puesto 19 — correctamente:
está sano, sin tareas vencidas y su fecha está lejos.

---

## Dimensión 2 — ¿Qué tipo de acción requiere?

Cada proyecto activo cae en **una sola** cola. El orden de evaluación importa.

### 1. DECIDIR — hace falta una decisión humana antes de que esto avance

Se evalúa primero. Un proyecto entra aquí si:

- tiene una **dependencia circular** entre tareas,
- está **activo, sin tareas y con la fecha vencida** (proyecto zombie),
- **no tiene ninguna tarea arrancable** de la que derivar el siguiente paso,
- es un **duplicado probable** de otro proyecto,
- o **no tiene fecha límite**.

### 2. ESCALAR — bloqueado por un tercero

Tiene al menos un bloqueo **externo** sin resolver: cliente, credenciales, API,
permisos. No se resuelve con más horas de trabajo; se resuelve levantando el
teléfono. Necesita un dueño de escalación y una fecha de respuesta.

### 3. EJECUTAR — el equipo trabaja esto hoy

Tiene una tarea arrancable y ningún bloqueo externo pendiente.

### La distinción externo/interno sale del dato, no de una opinión

Las tareas bloqueadas del dataset traen escrita su causa:

| Texto en el campo `detail` | Clasificación |
|---|---|
| `Waiting on client response, credentials, external API or business definition` | **Externo** |
| `Blocked by permissions, repository access or owner confirmation` | **Externo** |
| `A recurrent technical or operational dependency is hurting stability...` | **Interno** |

De los 17 bloqueos, 13 son externos y 4 internos. Por eso PRJ-03, PRJ-05 y PRJ-06
quedan en EJECUTAR pese a estar bloqueados: su bloqueo es nuestro.

### Por qué DECIDIR gana sobre ESCALAR

Los dos proyectos más caros del portafolio (PRJ-08 y PRJ-22, 73.000 USD juntos)
están vencidos y bloqueados por el mismo cliente. El instinto dice "escalar ya".

Pero son el mismo cliente, el mismo nombre de proyecto, la misma fecha objetivo y
las mismas cuatro tareas. Puede que sean dos fases legítimas, o puede que sea un
proyecto contado dos veces. **Hasta que alguien lo confirme, escalarlos por
separado significa llamar dos veces al mismo cliente por lo mismo** — y eso
cuesta la relación.

El mismo razonamiento aplica a PRJ-04: está bloqueado por el cliente, pero tiene
una dependencia circular interna. Escalar antes de saber qué se le va a pedir es
quemar la llamada.

---

## Prioridad manual

El enunciado pide poder guardar una prioridad. El score es calculado; la
prioridad manual existe como **override explícito que exige una razón escrita**
de al menos 15 caracteres, y queda registrada en el historial con quién la puso
y cuándo.

Se puede contradecir al algoritmo. No se puede hacer en silencio. Dentro de tres
meses se podrá reconstruir por qué un proyecto adelantó a los demás.

El seed trae un ejemplo: PRJ-17 tiene el score más bajo del portafolio (19,5) y
prioridad manual **Alta**, con la razón registrada —el cliente renueva contrato en
agosto y ese entregable es el que evalúan—. Es el caso que demuestra que el
sistema admite el juicio humano sin perder la trazabilidad.

---

## Tres cálculos, a mano

Fecha de corte: **2026-07-13**. Reproducibles con `npm run ranking`.

### PRJ-22 · Messaging Qualification Engine (Fase 2) — puesto 1

```
Urgencia   fecha límite 2026-04-27, vencida hace 77 días        1.00 × 40 = 40.0
Riesgo     bloqueado (0.5 × 1.0 = 0.50)
           + 2 de 4 tareas vencidas (0.3 × 0.50 = 0.15)
           + tiene una tarea crítica vencida (0.2 × 1 = 0.20)
           = 0.85                                               0.85 × 35 = 29.8
Valor      38.000 USD — el más alto del portafolio, percentil 100  1.00 × 25 = 25.0
                                                                 ─────────────────
                                                          SCORE          =  94.8

Cola: DECIDIR — posible duplicado de PRJ-08.
```

### PRJ-13 · Commercial Automation Discovery — puesto 8

```
Urgencia   fecha límite 2026-05-22, vencida hace 52 días        1.00 × 40 = 40.0
Riesgo     bloqueado (0.5 × 1.0 = 0.50)
           + 3 de 4 tareas vencidas (0.3 × 0.75 = 0.225)
           + tiene una tarea crítica vencida (0.2 × 1 = 0.20)
           = 0.925                                             0.925 × 35 = 32.4
Valor      12.000 USD — percentil 35 del portafolio             0.35 × 25 =  8.8
                                                                 ─────────────────
                                                          SCORE          =  81.1

Cola: ESCALAR — bloqueado esperando accesos a las fuentes de datos.
Nota: el dataset lo declara "En riesgo"; el sistema lo recalcula como Bloqueado
porque tiene una tarea Bloqueada. Esa diferencia vale 17,5 puntos de score.
```

### PRJ-17 · Billing Reconciliation Bot — puesto 22

```
Urgencia   fecha límite 2026-08-28, faltan 46 días              0.30 × 40 = 12.0
Riesgo     sano, sin tareas vencidas, sin críticas vencidas     0.00 × 35 =  0.0
Valor      11.000 USD — percentil 30 del portafolio             0.30 × 25 =  7.5
                                                                 ─────────────────
                                                          SCORE          =  19.5

Cola: EJECUTAR — tiene tarea arrancable y ningún bloqueo.
Prioridad efectiva: Alta, por override manual con razón registrada.
```

Los tres casos muestran las tres cosas que el criterio tiene que hacer bien:
separar lo urgente de lo importante, no creerle al dato declarado, y dejar sitio
al juicio humano sin volverse arbitrario.

---

## Las nueve reglas de detección

```
BLOQUEADO             health = Bloqueado  ∨  ≥1 tarea Bloqueada
EN_RIESGO             fecha límite vencida ∨ ≥1 tarea vencida ∨ responsable sobrecargado
SIN_SIGUIENTE_PASO    ninguna tarea arrancable  ∨  0 tareas abiertas
DEPENDENCIA_CIRCULAR  ciclo en el grafo de dependencias          → PRJ-04
PROYECTO_ZOMBIE       0 tareas + activo + fecha vencida          → PRJ-21
DUPLICADO_PROBABLE    mismo cliente + nombre normalizado         → PRJ-08 / PRJ-22
DATOS_INCOMPLETOS     falta fecha límite, valor o fecha inicio   → 13 proyectos
SOBRECARGA_OWNER      tareas abiertas del owner > P80 del equipo → Camila Torres
PERSONA_FANTASMA      owner ausente de la tabla de equipo        → Andrea Molina
```

El umbral de sobrecarga es el **percentil 80 del propio equipo**, no un número
fijo: con estas seis personas cae en 19 tareas abiertas. Un umbral absoluto
envejecería mal en cuanto el equipo crezca.

---

## Cómo se verifica que el criterio es reproducible

`npm test` corre 65 tests. Los que importan no prueban funciones aisladas:
**corren el motor completo sobre el dataset real y fijan cada afirmación de este
documento** — el ciclo de PRJ-04, el zombie PRJ-21, el duplicado PRJ-08/22, la
salud recalculada de los cuatro diagnósticos, el reparto de las tres colas, la
sobrecarga de Camila Torres y el desglose exacto del score de PRJ-22.

Si alguien cambia un peso o una regla y estos números se mueven, el test lo
grita. Eso es lo que convierte el criterio en algo discutible en vez de opinable.
