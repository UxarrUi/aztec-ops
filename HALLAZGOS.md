# Hallazgos del dataset

Once anomalías encontradas al analizar `Projects`, `Tasks` y `Team`. Cada una
está verificada con un test en `tests/` y tiene una implicación operativa
concreta — no son curiosidades sobre la calidad del dato.

El sistema no las "arregla" silenciosamente: las detecta, las marca y las pone
delante de quien tiene que decidir. Rellenar un hueco sin decirlo es el peor de
los dos errores posibles.

---

## 1. Dependencia circular en PRJ-04

`PRJ-04-T02` depende de `PRJ-04-T03`, y `PRJ-04-T03` depende de `PRJ-04-T02`.

**Ninguna de las dos puede arrancar nunca.** Es el único ciclo del portafolio, y
deja permanentemente paradas dos de las cuatro tareas de un proyecto de 25.000
USD que ya está vencido.

Ninguna hoja de cálculo ve esto: el ciclo solo aparece si conviertes la columna
`dependency` —texto libre— en un grafo y lo recorres.

**Qué hace el sistema:** señal `DEPENDENCIA_CIRCULAR`, el proyecto va a la cola
DECIDIR, y el siguiente paso propuesto es romper el ciclo eligiendo cuál de las
dos tareas arranca primero.

---

## 2. PRJ-21 es un proyecto zombie

`health = Sano`, cero tareas abiertas, y fecha límite 2026-02-10 — vencida hace
cinco meses. Sano en el papel, muerto en la operación.

Es el único proyecto del portafolio del que el sistema no puede derivar un
siguiente paso, porque no hay ninguna tarea de la que derivarlo.

**Qué hace el sistema:** señales `PROYECTO_ZOMBIE` y `SIN_SIGUIENTE_PASO`, y cola
DECIDIR con el motivo escrito: hay que decidir si se cierra o se reactiva.

---

## 3. PRJ-08 y PRJ-22 podrían ser el mismo proyecto

| | PRJ-08 | PRJ-22 |
|---|---|---|
| Cliente | Vector Partners | Vector Partners |
| Nombre | Messaging Qualification Engine | Messaging Qualification Engine (Fase 2) |
| Fecha objetivo | 2026-04-27 | 2026-04-27 |
| Tareas | 4, idénticas | 4, idénticas |
| Valor | 35.000 USD | 38.000 USD |

Puede que sean dos fases legítimas —es habitual en consultoría— o puede que sean
73.000 USD contados dos veces en el pipeline. La fecha objetivo idéntica y las
tareas idénticas son lo que lo hace sospechoso.

**Por qué importa operativamente:** son los dos proyectos más caros del
portafolio y ambos están bloqueados esperando al mismo cliente. Escalarlos por
separado significa llamar dos veces a la misma persona por lo mismo.

**Qué hace el sistema:** señal `DUPLICADO_PROBABLE` en ambos, y los saca de la
cola ESCALAR hacia DECIDIR hasta que alguien confirme si son uno o dos.

---

## 4. Los cuatro Diagnósticos declaran una salud que no tienen

PRJ-13, PRJ-14, PRJ-15 y PRJ-16 vienen marcados `En riesgo` en el dataset. Los
cuatro tienen al menos una tarea con estado `Bloqueada`.

Están bloqueados de hecho, y el campo declarado lo subestima.

**Cuánto cambia:** al recalcular, el portafolio pasa de 13 bloqueados declarados
a 17 reales. En PRJ-13 la diferencia vale 17,5 puntos de score.

**Qué hace el sistema:** la salud se calcula desde las tareas. El campo original
se guarda como `healthSource` y la ficha muestra la discrepancia cuando existe,
en vez de sobrescribirla.

---

## 5. Andrea Molina no existe en la tabla de equipo

Es responsable de PRJ-19 y tiene 4 tareas asignadas. La pestaña `Team` solo lista
cinco personas, y ella no está entre ellas.

**La capacidad del equipo venía mal contada en origen:** los cálculos de carga
hechos sobre esa pestaña ignoran a una persona con trabajo real.

**Qué hace el sistema:** la construye desde los proyectos y las tareas, no desde
`Team`, y la marca con `inSourceTeamSheet = false`. Aparece en la vista de equipo
con la etiqueta "fuera del equipo registrado" y su carga real.

---

## 6. El flag `is_overdue` no es confiable

Corresponde a un corte del ~13-jul-2026 (coincide con `due_date < 2026-07-13` en
78 de 82 tareas). Pero incluso a esa fecha, **cuatro tareas están mal marcadas**:
`PRJ-13-T01`, `PRJ-14-T01`, `PRJ-15-T01` y `PRJ-16-T01` vencen el 11 de julio y
están marcadas como no vencidas.

**Qué hace el sistema:** recalcula el vencimiento contra la fecha de corte. El
flag original se conserva en `isOverdueSource` para poder auditar la diferencia.

---

## 7. Monedas mezcladas

20 proyectos en USD, 2 en COP: PRJ-18 con 85.000.000 y PRJ-20 con 120.000.000.

Sin normalizar, cualquier ranking por valor está mal —los dos proyectos en pesos
dominan por puro efecto de la unidad—.

**Qué hace el sistema:** convierte a USD con una tasa declarada como supuesto en
`src/lib/config.ts`. Convertidos quedan en ~20.700 y ~29.300 USD: altos, pero no
dominantes.

---

## 8. PRJ-07 no tiene valor de negocio

Un proyecto activo, bloqueado y vencido, sin cifra de valor.

**Qué hace el sistema:** usa la mediana del portafolio para el cálculo y marca
`DATOS_INCOMPLETOS`. No asume cero — asumir cero sería inventar que el proyecto no
vale nada, y lo hundiría en el ranking justo cuando está en problemas.

---

## 9. Fechas en dos formatos

PRJ-17 trae `start_date` como `02/03/2026`; el resto del dataset usa ISO
(`2026-03-02`). Un parser que solo acepte ISO lo lee como fecha ausente.

**Qué hace el sistema:** acepta ambos formatos. Lo que no reconoce lo trata como
ausente en lugar de inventar una fecha.

---

## 10. El backlog es una cadena: 21 frentes abiertos en paralelo

Los 21 proyectos con tareas tienen **exactamente una** tarea sin dependencias, y
esa tarea está siempre en estado "En progreso". Las demás cuelgan de ella.

Eso significa 21 frentes abiertos simultáneos entre 6 personas: 3,5 por persona.
El sistema no puede arreglar eso, pero sí hacerlo visible.

**Qué hace el sistema:** deriva el siguiente paso de cada proyecto justamente de
esa tarea raíz, y muestra el conteo de frentes abiertos en la vista de equipo.

---

## 11. Camila Torres concentra el portafolio crítico

| Persona | Proyectos | Tareas abiertas | Alta o crítica | Bloqueadas |
|---|---|---|---|---|
| **Camila Torres** | **7** | **28** | **20** | **7** |
| Laura Gomez | 5 | 19 | 11 | 4 |
| Mateo Ruiz | 4 | 16 | 10 | 3 |
| Daniel Rojas | 3 | 11 | 6 | 2 |
| Santiago Vera | 2 | 4 | 3 | 1 |
| Andrea Molina | 1 | 4 | 0 | 0 |

Y lo que lo hace grave: **6 de los 10 proyectos más urgentes son suyos.**

El cuello de botella no es una opinión sobre el reparto de carga. Es el ranking
mismo: aunque el equipo resolviera todo lo demás, la mitad del trabajo urgente
sigue dependiendo de una sola persona.

**Qué hace el sistema:** umbral de sobrecarga en el percentil 80 del propio
equipo (19 tareas con esta plantilla), señal `SOBRECARGA_OWNER` en sus proyectos,
y un aviso explícito en la vista de equipo cuando el top-10 se concentra.

---

## Lo que estos hallazgos tienen en común

Ninguno se ve leyendo el dataset por encima, y ninguno se arregla con un campo
más en una hoja de cálculo. Todos requieren **calcular algo sobre el dato en vez
de creerle**: recorrer un grafo, recontar desde el detalle, comparar contra el
resto del portafolio, o cruzar dos pestañas.

Esa es, en el fondo, la diferencia entre un tablero y un sistema.
