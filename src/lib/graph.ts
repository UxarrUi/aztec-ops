import { CLOSED_TASK_STATUSES, TASK_PRIORITY_RANK } from "./config";
import type { NextStepSuggestion, ProjectLike, TaskLike } from "./types";

/**
 * El grafo de dependencias entre tareas.
 *
 * En el dataset, `dependency` era texto libre con el título de otra tarea del
 * mismo proyecto. El seed lo normaliza a `dependsOnCode`. Tener la relación real
 * es lo que permite las tres cosas que siguen: saber qué tarea se puede arrancar,
 * derivar el siguiente paso del proyecto, y detectar ciclos.
 */

export function indexTasks(tasks: TaskLike[]): Map<string, TaskLike> {
  return new Map(tasks.map((t) => [t.code, t]));
}

export function isTaskClosed(task: TaskLike): boolean {
  return (CLOSED_TASK_STATUSES as readonly string[]).includes(task.status);
}

export function isTaskOpen(task: TaskLike): boolean {
  return !isTaskClosed(task);
}

export function isTaskOverdue(task: TaskLike, asOf: Date): boolean {
  if (!task.dueDate || isTaskClosed(task)) return false;
  return task.dueDate.getTime() < asOf.getTime();
}

/**
 * Una tarea es arrancable si alguien puede sentarse a hacerla hoy: está abierta,
 * no está bloqueada, y aquello de lo que depende ya está cerrado.
 *
 * Una dependencia que apunta a una tarea inexistente no bloquea nada: se trata
 * como si no existiera (y se reporta aparte como dato inconsistente).
 */
export function isStartable(task: TaskLike, index: Map<string, TaskLike>): boolean {
  if (isTaskClosed(task)) return false;
  if (task.status === "Bloqueada") return false;
  if (!task.dependsOnCode) return true;

  const dependency = index.get(task.dependsOnCode);
  if (!dependency) return true;
  return isTaskClosed(dependency);
}

export function getStartableTasks(tasks: TaskLike[]): TaskLike[] {
  const index = indexTasks(tasks);
  return tasks.filter((t) => isStartable(t, index));
}

/**
 * Detecta ciclos en el grafo de dependencias.
 *
 * En el dataset hay exactamente uno: en PRJ-04, T02 depende de T03 y T03 depende
 * de T02. Ninguna de las dos puede arrancar nunca. Es el tipo de cosa que una
 * hoja de cálculo no ve y que deja un proyecto parado sin que nadie sepa por qué.
 *
 * Recorrido en profundidad con marcas de estado: 0 sin visitar, 1 en la pila
 * actual, 2 terminado. Encontrar un nodo en estado 1 significa ciclo.
 */
export function findCycles(tasks: TaskLike[]): string[][] {
  const index = indexTasks(tasks);
  const state = new Map<string, 0 | 1 | 2>();
  const cycles: string[][] = [];
  const seen = new Set<string>();

  for (const task of tasks) state.set(task.code, 0);

  for (const task of tasks) {
    if (state.get(task.code) !== 0) continue;

    const stack: string[] = [];
    let current: string | null = task.code;

    while (current) {
      const status = state.get(current);

      if (status === 1) {
        // Cerramos un ciclo: la porción de la pila desde `current` en adelante.
        const cycle = stack.slice(stack.indexOf(current));
        const fingerprint = [...cycle].sort().join("|");
        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          cycles.push(cycle);
        }
        break;
      }
      if (status === 2) break;

      state.set(current, 1);
      stack.push(current);
      const next: string | null = index.get(current)?.dependsOnCode ?? null;
      current = next && index.has(next) ? next : null;
    }

    for (const code of stack) state.set(code, 2);
  }

  return cycles;
}

/** Los códigos de tarea que participan en algún ciclo. */
export function tasksInCycles(cycles: string[][]): Set<string> {
  return new Set(cycles.flat());
}

/**
 * Quita el sufijo " - Nombre del proyecto" que traen los títulos del dataset.
 * `"Plan next delivery iteration - Quotation Engine"` → `"Plan next delivery iteration"`.
 */
export function cleanTaskTitle(title: string, projectName: string): string {
  const suffix = ` - ${projectName}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title.trim();
}

function priorityRank(priority: string): number {
  return TASK_PRIORITY_RANK[priority as keyof typeof TASK_PRIORITY_RANK] ?? 99;
}

/**
 * Ordena tareas por lo que de verdad importa para elegir la siguiente: primero
 * prioridad, después fecha más próxima (las sin fecha van al final), y el código
 * como desempate para que el resultado sea estable entre ejecuciones.
 */
export function sortByUrgency(tasks: TaskLike[]): TaskLike[] {
  return [...tasks].sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;

    const aDue = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;

    return a.code.localeCompare(b.code);
  });
}

/**
 * El siguiente paso del proyecto.
 *
 * El enunciado exige guardar "siguiente paso" y el dataset no trae esa columna.
 * En vez de dejar un campo de texto vacío esperando que alguien lo llene, el
 * sistema lo deriva: la tarea arrancable más urgente es, por definición, lo
 * siguiente que se puede hacer. Si el usuario escribe uno a mano, ese manda.
 *
 * Devuelve null cuando no hay nada arrancable — que es justo la señal que el
 * enunciado pide detectar: "proyectos sin siguiente paso claro".
 */
export function deriveNextStep(project: ProjectLike): NextStepSuggestion | null {
  if (project.nextStep && project.nextStep.trim().length > 0) {
    return {
      text: project.nextStep.trim(),
      source: "manual",
      taskCode: null,
      ownerAlias: project.nextStepOwnerAlias ?? project.ownerAlias,
      dueDate: project.nextStepDueDate,
    };
  }

  const startable = sortByUrgency(getStartableTasks(project.tasks));
  const candidate = startable[0];
  if (!candidate) return null;

  return {
    text: cleanTaskTitle(candidate.title, project.name),
    source: "derivado",
    taskCode: candidate.code,
    ownerAlias: candidate.assigneeAlias ?? project.ownerAlias,
    dueDate: candidate.dueDate,
  };
}
