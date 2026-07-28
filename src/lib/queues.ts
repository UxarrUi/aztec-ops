import { deriveNextStep, findCycles } from "./graph";
import { openExternalBlockers, openTasks } from "./rules";
import type { RuleContext } from "./rules";
import type { ProjectLike, QueueName } from "./types";

/**
 * El enrutamiento a colas — la segunda dimensión del criterio, y la que de
 * verdad hace útil al sistema.
 *
 * Con 18 de 22 proyectos en rojo, ordenar una sola lista por urgencia no ayuda:
 * el lunes sigues viendo 18 rojos. Lo que cambia la conversación es separar por
 * TIPO DE ACCIÓN, porque cada tipo lo resuelve una persona distinta con una
 * herramienta distinta:
 *
 *   DECIDIR   → alguien tiene que tomar una decisión antes de que esto avance.
 *               No es trabajo de ingeniería ni una llamada al cliente todavía.
 *   ESCALAR   → está bloqueado por un tercero. No se resuelve con más horas de
 *               trabajo, se resuelve levantando el teléfono.
 *   EJECUTAR  → hay una tarea arrancable y el bloqueo, si existe, es nuestro.
 *               Esto sí es el trabajo del equipo hoy.
 *
 * El orden de evaluación importa: DECIDIR gana sobre ESCALAR. Un proyecto con
 * dependencia circular o con un duplicado sin confirmar no debe escalarse
 * todavía — llamar al cliente antes de haber decidido internamente qué se le va
 * a pedir es quemar la llamada.
 */

export interface QueueDecision {
  queue: QueueName;
  reason: string;
}

export function routeToQueue(
  project: ProjectLike,
  ctx: RuleContext,
): QueueDecision {
  // ── 1. ¿Hace falta una decisión humana antes que cualquier otra cosa? ──
  const cycles = findCycles(project.tasks);
  if (cycles.length > 0) {
    return {
      queue: "DECIDIR",
      reason: `dependencia circular (${cycles[0].join(" ↔ ")}): hay que decidir qué dependencia se rompe`,
    };
  }

  const open = openTasks(project);
  const targetPassed =
    project.targetDate !== null && project.targetDate.getTime() < ctx.asOf.getTime();

  if (project.status === "Activo" && open.length === 0 && targetPassed) {
    return {
      queue: "DECIDIR",
      reason: "proyecto activo sin tareas y con la fecha vencida: hay que decidir si se cierra o se reactiva",
    };
  }

  if (deriveNextStep(project) === null) {
    return {
      queue: "DECIDIR",
      reason: "no hay ninguna tarea arrancable: hay que decidir cuál es el siguiente paso",
    };
  }

  const duplicates = ctx.duplicates.get(project.code);
  if (duplicates && duplicates.length > 0) {
    return {
      queue: "DECIDIR",
      reason: `posible duplicado de ${duplicates.join(", ")}: hay que confirmar si es el mismo trabajo antes de escalarlo`,
    };
  }

  if (!project.targetDate) {
    return {
      queue: "DECIDIR",
      reason: "sin fecha límite: hay que decidir el compromiso antes de poder priorizarlo contra el resto",
    };
  }

  // ── 2. ¿Depende de un tercero? ──
  const external = openExternalBlockers(project);
  if (external.length > 0) {
    return {
      queue: "ESCALAR",
      reason: `bloqueado por un tercero (${external.length} bloqueo externo sin resolver): no avanza con horas de trabajo`,
    };
  }

  // ── 3. Se puede trabajar. ──
  return {
    queue: "EJECUTAR",
    reason: "tiene una tarea arrancable y ningún bloqueo externo pendiente",
  };
}
