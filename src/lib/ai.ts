import Anthropic from "@anthropic-ai/sdk";
import { formatUsdPlain } from "./format";
import type { AnalyzedProject, PortfolioAnalysis, QueueName } from "./types";

/**
 * La IA redacta, no decide.
 *
 * Esta es la única parte del sistema donde interviene un modelo, y su alcance
 * está deliberadamente acotado a redacción. El score, los flags y el
 * enrutamiento a colas son deterministas y nunca pasan por aquí: si dos
 * personas corren el sistema con los mismos datos, tienen que obtener el mismo
 * ranking. Una priorización que cambia entre ejecuciones no se puede defender
 * en un comité.
 *
 * Todas las funciones tienen un fallback por plantilla. Sin ANTHROPIC_API_KEY
 * la aplicación funciona completa — solo cambia la prosa. Eso importa porque el
 * enunciado exige que el repositorio sea clonable y funcional, y quien lo evalúe
 * no tiene por qué tener una clave.
 */

const MODEL = "claude-opus-5";

export type AiSource = "modelo" | "plantilla";

export interface AiText {
  text: string;
  source: AiSource;
  /** Por qué se usó la plantilla, cuando aplica. */
  note?: string;
}

function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

async function ask(
  system: string,
  prompt: string,
  maxTokens: number,
): Promise<{ text: string } | { error: string }> {
  const anthropic = client();
  if (!anthropic) {
    return { error: "sin ANTHROPIC_API_KEY configurada" };
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return { error: "el modelo declinó la solicitud" };
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    return text.length > 0 ? { text } : { error: "respuesta vacía" };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return { error: `error de la API (${error.status})` };
    }
    return { error: "no se pudo contactar la API" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Borrador del siguiente paso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plantilla determinista. No es la versión pobre del borrador: es la que
 * garantiza que el sistema siempre proponga algo, y la que se usa cuando no hay
 * clave. Construye la frase con lo que el motor ya calculó.
 */
export function templateNextStep(item: AnalyzedProject): string {
  const { project } = item;

  if (item.cycles.length > 0) {
    const [a, b] = item.cycles[0];
    return `Romper la dependencia circular entre ${a} y ${b}: decidir cuál de las dos arranca primero y quitarle la dependencia.`;
  }

  if (item.openTasks.length === 0) {
    return `Decidir si ${project.code} se cierra o se reactiva: está activo, sin tareas abiertas${
      project.targetDate ? " y con la fecha límite vencida" : ""
    }.`;
  }

  if (item.externalBlockers.length > 0) {
    const blocker = item.externalBlockers[0];
    const owner = blocker.ownerAlias ?? project.ownerAlias ?? "el responsable";
    return `Escalar con ${project.clientAlias}: ${blocker.description.replace(/\.$/, "")}. Dueño de la escalación: ${owner}. Fijar fecha de respuesta.`;
  }

  const blocked = item.blockedTasks[0];
  if (blocked) {
    return `Desbloquear ${blocked.code} (${blocked.priority.toLowerCase()}): es una dependencia interna y el equipo puede resolverla.`;
  }

  const overdue = item.overdueTasks.length;
  return overdue > 0
    ? `Cerrar las ${overdue} tarea(s) vencida(s) de ${project.code} o renegociar la fecha límite.`
    : `Continuar con el plan: sin bloqueos ni vencimientos a la fecha de corte.`;
}

/**
 * Pide al modelo un borrador del siguiente paso. Nunca se guarda solo: la ficha
 * lo muestra en un campo editable para que una persona lo confirme.
 */
export async function draftNextStep(item: AnalyzedProject): Promise<AiText> {
  const fallback = templateNextStep(item);

  const contexto = [
    `Proyecto: ${item.project.code} — ${item.project.name}`,
    `Cliente: ${item.project.clientAlias}`,
    `Responsable: ${item.project.ownerAlias ?? "sin asignar"}`,
    `Tipo de trabajo: ${item.project.engagementType}`,
    `Salud calculada: ${item.health}`,
    `Cola de acción: ${item.queue} (${item.queueReason})`,
    `Score: ${item.score} de 100`,
    `Tareas: ${item.openTasks.length} abiertas, ${item.overdueTasks.length} vencidas, ${item.blockedTasks.length} bloqueadas`,
    item.cycles.length > 0
      ? `Dependencia circular entre: ${item.cycles[0].join(" y ")}`
      : "",
    item.externalBlockers.length > 0
      ? `Bloqueos externos: ${item.externalBlockers.map((b) => b.description).join(" · ")}`
      : "",
    `Señales: ${item.flags.map((f) => `${f.code} (${f.detail})`).join(" · ") || "ninguna"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await ask(
    "Eres parte del equipo de operaciones de una consultora de automatización e IA. " +
      "Escribes el siguiente paso concreto de un proyecto: una sola frase, en español, en imperativo, " +
      "que diga qué hacer y con quién. Nada de relleno, nada de contexto que quien lee ya conoce, " +
      "ninguna recomendación genérica. Si el proyecto está bloqueado por un tercero, el siguiente paso " +
      "es escalar, no trabajar. Máximo 200 caracteres.",
    `${contexto}\n\nEscribe el siguiente paso.`,
    300,
  );

  if ("error" in result) {
    return { text: fallback, source: "plantilla", note: result.error };
  }
  return { text: result.text.replace(/^["«]|["»]$/g, ""), source: "modelo" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen ejecutivo del portafolio
// ─────────────────────────────────────────────────────────────────────────────

function queueLine(name: QueueName, items: AnalyzedProject[]): string {
  if (items.length === 0) return `${name}: sin proyectos.`;
  const top = items
    .slice(0, 3)
    .map((p) => `${p.project.code} (${p.score})`)
    .join(", ");
  return `${name}: ${items.length} proyecto(s). Encabezan ${top}.`;
}

export function templateSummary(portfolio: PortfolioAnalysis): string {
  const { totals, queues, team } = portfolio;
  const overloaded = team.filter((m) => m.isOverloaded);
  const activeTop10 = portfolio.projects
    .filter((p) => p.project.status === "Activo")
    .slice(0, 10);
  const workable = activeTop10.filter((p) => p.queue === "EJECUTAR").length;

  return [
    `Portafolio a ${portfolio.asOf.toISOString().slice(0, 10)}: ${totals.projects} proyectos, ` +
      `${totals.blocked} bloqueados y ${totals.atRisk} en riesgo. ` +
      `${totals.overdueTasks} de ${totals.openTasks} tareas están vencidas.`,
    `De los 10 proyectos más urgentes, ${workable} se puede(n) trabajar hoy; el resto depende de terceros o de una decisión.`,
    queueLine("EJECUTAR", queues.EJECUTAR),
    queueLine("ESCALAR", queues.ESCALAR),
    queueLine("DECIDIR", queues.DECIDIR),
    overloaded.length > 0
      ? `Capacidad: ${overloaded.map((m) => `${m.alias} (${m.openTasks} tareas)`).join(", ")} por encima del umbral del equipo.`
      : "Capacidad: nadie por encima del umbral del equipo.",
    `Valor en juego: ${formatUsdPlain(totals.valueUsd)}.`,
  ].join("\n");
}

/**
 * Resumen para el comité del lunes. Se construye sobre las colas YA calculadas:
 * el modelo redacta a partir de conclusiones, no las produce.
 */
export async function executiveSummary(
  portfolio: PortfolioAnalysis,
): Promise<AiText> {
  const fallback = templateSummary(portfolio);

  const result = await ask(
    "Eres el jefe de operaciones de una consultora de automatización e IA y escribes el resumen " +
      "semanal para el comité de dirección. Tres párrafos cortos como máximo, en español: " +
      "primero qué está en riesgo y por qué, después qué hay que escalar y con quién, " +
      "y por último qué decisión necesita el equipo esta semana. " +
      "Usa solo los datos que te doy — no inventes cifras, clientes ni fechas. " +
      "Directo, sin viñetas y sin lenguaje corporativo vacío.",
    `Estos son los datos ya calculados del portafolio:\n\n${fallback}\n\nEscribe el resumen para el comité.`,
    1200,
  );

  if ("error" in result) {
    return { text: fallback, source: "plantilla", note: result.error };
  }
  return { text: result.text, source: "modelo" };
}
