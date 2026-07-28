"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { classifyBlockerText } from "./rules";

/**
 * La capa de escritura.
 *
 * Dos reglas que se aplican en todas las mutaciones:
 *
 * 1. Todo cambio deja rastro en `ActivityLog`: qué campo, de qué valor a cuál,
 *    quién y cuándo. "Actualizar proyectos" sin trazabilidad es sobrescribir.
 * 2. El override de prioridad exige una razón escrita. Se puede contradecir al
 *    algoritmo, pero no en silencio.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Quién hace el cambio. Sin autenticación en el prototipo — ver README. */
const DEFAULT_ACTOR = "Operación";

function text(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function date(form: FormData, key: string): Date | null {
  const value = text(form, key);
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const VALID_STATUS = ["Activo", "Pausado", "Cerrado"];
const VALID_PRIORITY = ["Critica", "Alta", "Media", "Baja"];
const VALID_STAGE = ["Descubrimiento", "Ejecucion"];

function label(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

async function logChanges(
  projectId: string,
  actor: string,
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>,
  action = "UPDATE",
  reason?: string,
) {
  const real = changes.filter((c) => label(c.oldValue) !== label(c.newValue));
  if (real.length === 0) return;

  await prisma.activityLog.createMany({
    data: real.map((c) => ({
      projectId,
      actor,
      action,
      field: c.field,
      oldValue: label(c.oldValue),
      newValue: label(c.newValue),
      reason: reason ?? null,
    })),
  });
}

async function resolveMemberId(alias: string | null): Promise<string | null> {
  if (!alias) return null;
  const member = await prisma.teamMember.findUnique({ where: { alias } });
  return member?.id ?? null;
}

/**
 * Actualiza los campos operativos del proyecto: los siete que el enunciado pide
 * poder guardar, menos la prioridad, que tiene su propia acción por exigir razón.
 */
export async function updateProject(
  code: string,
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const current = await prisma.project.findUnique({
    where: { code },
    include: { owner: true, nextStepOwner: true },
  });
  if (!current) return { ok: false, error: `No existe el proyecto ${code}.` };

  const status = text(form, "status") ?? current.status;
  if (!VALID_STATUS.includes(status)) {
    return { ok: false, error: `Estado no válido: ${status}.` };
  }

  const stage = text(form, "stage") ?? current.stage;
  if (!VALID_STAGE.includes(stage)) {
    return { ok: false, error: `Etapa no válida: ${stage}.` };
  }

  const ownerAlias = text(form, "ownerAlias");
  const ownerId = await resolveMemberId(ownerAlias);
  if (ownerAlias && !ownerId) {
    return { ok: false, error: `No existe la persona ${ownerAlias}.` };
  }

  const nextStepOwnerAlias = text(form, "nextStepOwnerAlias");
  const nextStepOwnerId = await resolveMemberId(nextStepOwnerAlias);
  if (nextStepOwnerAlias && !nextStepOwnerId) {
    return { ok: false, error: `No existe la persona ${nextStepOwnerAlias}.` };
  }

  const next = {
    name: text(form, "name") ?? current.name,
    status,
    stage,
    ownerId,
    targetDate: date(form, "targetDate"),
    nextStep: text(form, "nextStep"),
    nextStepOwnerId,
    nextStepDueDate: date(form, "nextStepDueDate"),
  };

  const actor = text(form, "actor") ?? DEFAULT_ACTOR;

  await prisma.project.update({ where: { code }, data: next });
  await logChanges(current.id, actor, [
    { field: "name", oldValue: current.name, newValue: next.name },
    { field: "estado", oldValue: current.status, newValue: next.status },
    { field: "etapa", oldValue: current.stage, newValue: next.stage },
    { field: "responsable", oldValue: current.owner?.alias, newValue: ownerAlias },
    { field: "fecha límite", oldValue: current.targetDate, newValue: next.targetDate },
    { field: "siguiente paso", oldValue: current.nextStep, newValue: next.nextStep },
    {
      field: "responsable del siguiente paso",
      oldValue: current.nextStepOwner?.alias,
      newValue: nextStepOwnerAlias,
    },
    {
      field: "fecha del siguiente paso",
      oldValue: current.nextStepDueDate,
      newValue: next.nextStepDueDate,
    },
  ]);

  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${code}`);
  return { ok: true };
}

/**
 * Fija o quita la prioridad manual.
 *
 * La razón es obligatoria y se guarda junto al valor. Es la única forma de
 * saltarse el score, y queda registrada: dentro de tres meses se puede
 * reconstruir por qué este proyecto adelantó a los demás.
 */
export async function setPriorityOverride(
  code: string,
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const current = await prisma.project.findUnique({ where: { code } });
  if (!current) return { ok: false, error: `No existe el proyecto ${code}.` };

  const actor = text(form, "actor") ?? DEFAULT_ACTOR;
  const priority = text(form, "priorityOverride");

  if (!priority) {
    await prisma.project.update({
      where: { code },
      data: { priorityOverride: null, overrideReason: null },
    });
    await logChanges(
      current.id,
      actor,
      [
        {
          field: "prioridad manual",
          oldValue: current.priorityOverride,
          newValue: null,
        },
      ],
      "OVERRIDE",
      "Se devuelve la prioridad al criterio calculado.",
    );
    revalidatePath("/");
    revalidatePath("/proyectos");
    revalidatePath(`/proyectos/${code}`);
    return { ok: true };
  }

  if (!VALID_PRIORITY.includes(priority)) {
    return { ok: false, error: `Prioridad no válida: ${priority}.` };
  }

  const reason = text(form, "overrideReason");
  if (!reason || reason.length < 15) {
    return {
      ok: false,
      error:
        "Escribe la razón del cambio (mínimo 15 caracteres). El score se puede contradecir, pero no en silencio.",
    };
  }

  await prisma.project.update({
    where: { code },
    data: { priorityOverride: priority, overrideReason: reason },
  });
  await logChanges(
    current.id,
    actor,
    [
      {
        field: "prioridad manual",
        oldValue: current.priorityOverride,
        newValue: priority,
      },
    ],
    "OVERRIDE",
    reason,
  );

  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${code}`);
  return { ok: true };
}

export async function addNote(
  code: string,
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const project = await prisma.project.findUnique({ where: { code } });
  if (!project) return { ok: false, error: `No existe el proyecto ${code}.` };

  const body = text(form, "body");
  if (!body) return { ok: false, error: "La nota está vacía." };

  const author = text(form, "author") ?? DEFAULT_ACTOR;

  await prisma.note.create({ data: { projectId: project.id, author, body } });
  await prisma.activityLog.create({
    data: { projectId: project.id, actor: author, action: "NOTE", newValue: body },
  });

  revalidatePath(`/proyectos/${code}`);
  return { ok: true };
}

/**
 * Registra un bloqueo. La clasificación EXTERNO/INTERNO se propone leyendo el
 * texto, porque es lo que decide si el proyecto va a ESCALAR o a EJECUTAR, pero
 * quien lo registra puede corregirla.
 */
export async function addBlocker(
  code: string,
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const project = await prisma.project.findUnique({ where: { code } });
  if (!project) return { ok: false, error: `No existe el proyecto ${code}.` };

  const description = text(form, "description");
  if (!description) return { ok: false, error: "Describe el bloqueo." };

  const kind = text(form, "kind") ?? classifyBlockerText(description);
  if (kind !== "EXTERNO" && kind !== "INTERNO") {
    return { ok: false, error: `Tipo de bloqueo no válido: ${kind}.` };
  }

  const ownerAlias = text(form, "ownerAlias");
  const ownerId = await resolveMemberId(ownerAlias);
  const actor = text(form, "actor") ?? DEFAULT_ACTOR;

  await prisma.blocker.create({
    data: {
      projectId: project.id,
      kind,
      description,
      ownerId,
      dueBy: date(form, "dueBy"),
    },
  });
  await prisma.activityLog.create({
    data: {
      projectId: project.id,
      actor,
      action: "BLOCKER",
      field: `bloqueo ${kind.toLowerCase()}`,
      newValue: description,
    },
  });

  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${code}`);
  return { ok: true };
}

export async function resolveBlocker(
  code: string,
  blockerId: string,
): Promise<ActionResult> {
  const blocker = await prisma.blocker.findUnique({ where: { id: blockerId } });
  if (!blocker) return { ok: false, error: "No existe ese bloqueo." };

  await prisma.blocker.update({
    where: { id: blockerId },
    data: { resolvedAt: new Date() },
  });
  await prisma.activityLog.create({
    data: {
      projectId: blocker.projectId,
      actor: DEFAULT_ACTOR,
      action: "BLOCKER",
      field: "bloqueo resuelto",
      oldValue: blocker.description,
    },
  });

  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${code}`);
  return { ok: true };
}

/**
 * Crea un proyecto.
 *
 * Nace deliberadamente incompleto si el usuario no llena todo: sin fecha límite
 * y sin siguiente paso cae en la cola DECIDIR, que es exactamente donde debe
 * estar un proyecto del que todavía no se ha decidido nada.
 */
export async function createProject(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const name = text(form, "name");
  if (!name) return { ok: false, error: "El proyecto necesita un nombre." };

  const clientAlias = text(form, "clientAlias");
  if (!clientAlias) return { ok: false, error: "Indica el cliente." };

  let code = text(form, "code");
  if (code && (await prisma.project.findUnique({ where: { code } }))) {
    return { ok: false, error: `Ya existe un proyecto con el código ${code}.` };
  }
  if (!code) {
    const count = await prisma.project.count();
    code = `PRJ-${String(count + 1).padStart(2, "0")}`;
    let suffix = count + 1;
    while (await prisma.project.findUnique({ where: { code } })) {
      suffix++;
      code = `PRJ-${String(suffix).padStart(2, "0")}`;
    }
  }

  const ownerAlias = text(form, "ownerAlias");
  const ownerId = await resolveMemberId(ownerAlias);
  if (ownerAlias && !ownerId) {
    return { ok: false, error: `No existe la persona ${ownerAlias}.` };
  }

  const businessValueRaw = text(form, "businessValue");
  const businessValue = businessValueRaw ? Number(businessValueRaw) : null;
  if (businessValueRaw && !Number.isFinite(businessValue)) {
    return { ok: false, error: "El valor de negocio debe ser un número." };
  }
  const currency = text(form, "currency") ?? "USD";
  const businessValueUsd =
    businessValue === null ? null : currency === "COP" ? businessValue / 4100 : businessValue;

  const actor = text(form, "actor") ?? DEFAULT_ACTOR;

  const created = await prisma.project.create({
    data: {
      code,
      name,
      clientAlias,
      engagementType: text(form, "engagementType") ?? "Proyecto",
      projectTypeApi: text(form, "projectTypeApi") ?? "Automatizacion",
      stage: text(form, "stage") ?? "Descubrimiento",
      status: "Activo",
      // Un proyecto nuevo no tiene salud declarada: la fuente de verdad son sus
      // tareas y sus bloqueos, y todavía no tiene ninguno.
      healthSource: "Sano",
      ownerId,
      startDate: date(form, "startDate"),
      targetDate: date(form, "targetDate"),
      businessValue,
      currency,
      businessValueUsd,
      summary: text(form, "summary"),
      nextStep: text(form, "nextStep"),
    },
  });

  await prisma.activityLog.create({
    data: {
      projectId: created.id,
      actor,
      action: "CREATE",
      newValue: `${code} · ${name}`,
    },
  });

  revalidatePath("/");
  revalidatePath("/proyectos");
  redirect(`/proyectos/${code}`);
}
