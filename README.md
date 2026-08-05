# Sistema de gestión de proyectos — Reto Aztec

Sistema de seguimiento operativo para un portafolio de consultoría: prioriza 22
proyectos y 82 tareas con un criterio explicable, detecta lo que está roto, y
dice qué hacer con cada frente.

> **La tesis:** priorizar no es ordenar una lista. Es separar lo que se ejecuta,
> de lo que se escala, de lo que hay que decidir.
>
> Con 18 de 22 proyectos en rojo, un ranking único no ayuda: el lunes sigues
> viendo 18 rojos. Lo que cambia la conversación es que **de los 10 proyectos más
> urgentes, solo uno se puede trabajar hoy** — seis dependen de un tercero y tres
> necesitan una decisión. Eso no se ve ordenando por urgencia.

**El razonamiento completo está en [`ANALISIS.md`](./ANALISIS.md)** — el problema,
los hallazgos del dataset con su evidencia, y por qué el criterio es el que es.

---

## Cómo levantarlo

Requiere Node 20 o superior y una base de datos PostgreSQL.

```bash
cp .env.example .env   # y pon ahí tu DATABASE_URL
npm install
npm run setup          # migra la base y carga el dataset
npm run dev            # http://localhost:3000
```

`DATABASE_URL` es la única variable obligatoria: la cadena de conexión de tu
PostgreSQL. Sirve cualquiera — uno local, o uno gestionado como Neon o Supabase,
que dan una base gratis en un par de minutos. La clave de IA es **opcional**: sin
ella la aplicación funciona completa (ver *La IA redacta, no decide*).

**Otros comandos:**

```bash
npm test              # 80 tests del criterio, sobre el dataset real
npm run ranking       # imprime el portafolio priorizado en la terminal
npm run ranking 2026-07-27   # recalculado a otra fecha de corte
npm run db:reset      # borra la base y recarga el dataset original
```

`npm run ranking` y `npm test` leen el CSV directamente: corren sin base de datos
y sin conexión.

---

## Qué se ve

| Vista | Qué responde |
|---|---|
| **Torre de control** (`/`) | ¿Dónde está el portafolio hoy? Las tres colas, las anomalías y la carga del equipo |
| **Proyectos** (`/proyectos`) | La tabla completa, filtrable por cola, salud, responsable, cliente y señal |
| **Ficha** (`/proyectos/[code]`) | Todos los campos editables, **por qué el proyecto está en ese puesto**, sus tareas, bloqueos, notas e historial |
| **Equipo** (`/equipo`) | Carga real por persona y dónde está el cuello de botella |
| **Nuevo** (`/proyectos/nuevo`) | Crear un proyecto |

También hay una API de lectura:

```bash
curl 'localhost:3000/api/portfolio' | jq '.queues.ESCALAR[].code'
curl 'localhost:3000/api/projects?queue=DECIDIR&owner=Camila%20Torres'
curl 'localhost:3000/api/portfolio?asOf=2026-07-27' | jq '.totals'
```

Es de solo lectura a propósito: la escritura pasa por *server actions*, que es
donde viven las validaciones y el registro en el historial. Un segundo camino de
escritura obligaría a duplicar esas reglas, y tarde o temprano las dos copias
dejarían de coincidir.

---

## El criterio de priorización, en corto

Dos dimensiones. La explicación completa está en
[`PRIORIZACION.md`](./PRIORIZACION.md).

**1. Cuánto debe importarme** — un score de 0 a 100:

```
Score = 40 × Urgencia + 35 × Riesgo + 25 × Valor
```

**2. Qué tipo de acción requiere** — la cola:

- **Decidir** — hace falta una decisión humana antes de que esto avance
- **Escalar** — bloqueado por un tercero; no se resuelve con más horas de trabajo
- **Ejecutar** — hay una tarea arrancable y el bloqueo, si existe, es nuestro

La ficha de cada proyecto muestra el desglose: cuánto aportó cada factor y por
qué. Un número sin justificación no sirve para discutir prioridades con un equipo.

---

## Cómo está construido

Next.js + TypeScript + Prisma + PostgreSQL + Tailwind.

```
src/lib/          ← EL NÚCLEO: código puro, sin React ni Next
  config.ts       fecha de corte, tasa COP→USD, pesos, umbrales
  graph.ts        dependencias, tarea arrancable, detección de ciclos
  rules.ts        las 9 reglas de detección
  scoring.ts      el score y su desglose explicable
  queues.ts       enrutamiento Ejecutar / Escalar / Decidir
  dataset.ts      normalización del CSV original
  ai.ts           redacción asistida, con fallback determinista
src/app/          las 5 vistas y la API
tests/            80 tests sobre el dataset real
scripts/ranking.ts   el mismo criterio, en la terminal
```

**La regla de arquitectura:** todo el criterio vive en `src/lib/`, es código puro
y testeado, y no importa nada de React ni de Next. La interfaz es una vista sobre
el dominio, no el dominio. `scripts/ranking.ts` lo demuestra: imprime el
portafolio priorizado consumiendo el mismo `lib/` que la web, sin tocar la
interfaz ni la base de datos.

**El score y los flags no se guardan** en la base de datos: se calculan al leer.
Así nunca quedan obsoletos, y cambiar un peso re-prioriza el portafolio entero
sin migración.

### El sistema visual

La paleta y la tipografía salen del CSS del sitio de Aztec, no de una
aproximación a ojo: fondo `#f9f9f7`, verde de marca `#0d3326`, acento `#6edd62`,
crema `#fbf2ec`, Plus Jakarta Sans, píldoras y tarjetas redondeadas. Todo vive en
`src/app/globals.css`.

Una decisión propia sobre esa base: **el verde de acento de Aztec es casi el
mismo verde que esta herramienta usa para "sano"**. Para que el color siga
significando una sola cosa, el acento brillante queda reservado al *estado* y lo
interactivo usa el verde oscuro de marca. En una herramienta de operación el
color es información, no decoración.

### La IA redacta, no decide

El único componente con un modelo detrás está acotado a redacción:

- **Borrador del siguiente paso** para proyectos que no lo tienen
- **Resumen del comité** a partir de las colas ya calculadas

**El score, los flags y el enrutamiento nunca pasan por el modelo.** Es una
decisión explícita: la priorización tiene que ser reproducible: si dos personas
corren el sistema con los mismos datos, tienen que obtener el mismo ranking. Una
priorización que cambia entre ejecuciones no se puede defender en un comité.

Ambas funciones tienen fallback por plantilla determinista. **Sin
`ANTHROPIC_API_KEY` la aplicación funciona completa** — solo cambia la prosa, y
la interfaz siempre dice si el texto lo escribió el modelo o la plantilla. Para
activar el modelo, copia `.env.example` a `.env` y añade la clave.

---

## Qué dejé fuera a sabiendas

El enunciado pide decir esto explícitamente. Cada decisión tiene su razón:

| Fuera | Por qué |
|---|---|
| **Autenticación y usuarios** | El reto pide un prototipo de gestión de proyectos, no un control de acceso. Las acciones se registran con un actor genérico (`Operación`); el modelo de datos ya guarda quién hizo cada cambio, así que añadir sesiones es cambiar de dónde sale ese nombre, no rediseñar nada |
| **Crear, borrar y reasignar tareas** | Sobre las tareas sólo se puede cambiar el **estado** y **romper una dependencia** — las dos operaciones que el propio sistema exige para poder actuar sobre lo que detecta. Crear una tarea, borrarla o cambiarle responsable, prioridad o fecha no aporta nada al criterio, que es lo que se está evaluando |
| **Editar un bloqueo ya registrado** | Se puede crear y resolver, pero no reescribir su descripción, cambiar su tipo o reasignar el dueño de la escalación. Para eso se resuelve y se registra de nuevo |
| **API de escritura** | Duplicaría las validaciones y el registro en historial que ya viven en las server actions. Dos caminos de escritura terminan divergiendo |
| **Notificaciones y alertas** | El sistema detecta lo que está en riesgo; enviarlo por Slack o correo es plomería sobre una decisión ya tomada, y no demuestra criterio |
| **Gráficas** | La carga del equipo se muestra con barras simples. Una librería de gráficas habría sumado peso sin responder ninguna pregunta que la tabla no responda |
| **Historial de cambios de las tareas** | El `ActivityLog` cubre proyectos, que es lo que el enunciado pide poder actualizar |

**Y una limitación honesta del criterio:** el peso de los tres factores (40/35/25)
es una postura defendible, no una verdad. Está en un solo archivo
(`src/lib/config.ts`) precisamente para que se pueda discutir y cambiar — y los
tests fijan el resultado actual, así que cualquier cambio muestra de inmediato
qué proyectos se mueven.

---

## Documentos

| Archivo | Contenido |
|---|---|
| [`ANALISIS.md`](./ANALISIS.md) | El razonamiento completo: el problema, la tesis, los hallazgos y el ranking calculado |
| [`PRIORIZACION.md`](./PRIORIZACION.md) | El criterio en detalle, con el cálculo de tres proyectos hecho a mano |
| [`HALLAZGOS.md`](./HALLAZGOS.md) | Las anomalías del dataset, con evidencia e implicación operativa |
| `data/*.csv` | Copia del dataset original — viaja con el repositorio, no hay que descargarlo |
