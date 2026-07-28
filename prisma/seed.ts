/**
 * Carga el dataset del reto en la base de datos.
 *
 * La normalización de verdad (fechas mixtas, COP→USD, dependencias de texto a
 * relaciones reales, clasificación de bloqueos) vive en `src/lib/dataset.ts`,
 * no aquí. Este archivo solo persiste el resultado — así los tests pueden
 * ejercitar exactamente la misma transformación sin tocar la base de datos.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { loadDataset, loadSourceMetadata } from "../src/lib/dataset";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const { projects, team } = loadDataset();
  const meta = loadSourceMetadata();

  // Orden inverso a las dependencias para respetar las claves foráneas.
  await prisma.activityLog.deleteMany();
  await prisma.note.deleteMany();
  await prisma.blocker.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMember.deleteMany();

  const memberIds = new Map<string, string>();
  for (const member of team) {
    const created = await prisma.teamMember.create({
      data: {
        alias: member.alias,
        role: member.role,
        inSourceTeamSheet: member.inSourceTeamSheet,
      },
    });
    memberIds.set(member.alias, created.id);
  }

  const projectIds = new Map<string, string>();
  for (const project of projects) {
    const sourceMeta = meta.projects.get(project.code);
    const created = await prisma.project.create({
      data: {
        code: project.code,
        name: project.name,
        clientAlias: project.clientAlias,
        engagementType: project.engagementType,
        projectTypeApi: project.projectTypeApi,
        stage: project.stage,
        status: project.status,
        healthSource: project.healthSource,
        ownerId: project.ownerAlias ? memberIds.get(project.ownerAlias) : null,
        startDate: project.startDate,
        targetDate: project.targetDate,
        businessValue: sourceMeta?.businessValue ?? null,
        currency: sourceMeta?.currency ?? null,
        businessValueUsd: project.businessValueUsd,
        summary: sourceMeta?.summary ?? null,
        recentCompleted: sourceMeta?.recentCompleted ?? null,
        openTasksSource: sourceMeta?.openTasksSource ?? null,
        overdueTasksSource: sourceMeta?.overdueTasksSource ?? null,
        blockersSource: sourceMeta?.blockersSource ?? null,
      },
    });
    projectIds.set(project.code, created.id);
  }

  // Dos pasadas: primero todas las tareas, después las dependencias. De otro
  // modo una tarea podría necesitar apuntar a otra que aún no existe — y en
  // PRJ-04 se apuntan mutuamente, así que ningún orden lo resolvería en una.
  const taskIds = new Map<string, string>();
  for (const project of projects) {
    for (const task of project.tasks) {
      const sourceMeta = meta.tasks.get(task.code);
      const created = await prisma.task.create({
        data: {
          code: task.code,
          projectId: projectIds.get(project.code)!,
          title: task.title,
          detail: task.detail,
          assigneeId: task.assigneeAlias ? memberIds.get(task.assigneeAlias) : null,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          isOverdueSource: sourceMeta?.isOverdueSource ?? null,
          lastProgress: sourceMeta?.lastProgress ?? null,
        },
      });
      taskIds.set(task.code, created.id);
    }
  }

  let dependencies = 0;
  for (const project of projects) {
    for (const task of project.tasks) {
      if (!task.dependsOnCode) continue;
      await prisma.task.update({
        where: { id: taskIds.get(task.code)! },
        data: { dependsOnTaskId: taskIds.get(task.dependsOnCode)! },
      });
      dependencies++;
    }
  }

  let blockers = 0;
  for (const project of projects) {
    for (const blocker of project.blockers) {
      await prisma.blocker.create({
        data: {
          projectId: projectIds.get(project.code)!,
          kind: blocker.kind,
          description: blocker.description,
          ownerId: blocker.ownerAlias ? memberIds.get(blocker.ownerAlias) : null,
          dueBy: blocker.dueBy,
          sourceTaskCode: blocker.sourceTaskCode,
        },
      });
      blockers++;
    }
  }

  await seedDemoContent(projectIds);

  const externos = projects.reduce(
    (n, p) => n + p.blockers.filter((b) => b.kind === "EXTERNO").length,
    0,
  );

  console.log(`
Dataset cargado
  ${team.length} personas  (${team.filter((m) => !m.inSourceTeamSheet).length} sin registro en la pestaña Team)
  ${projects.length} proyectos
  ${projects.reduce((n, p) => n + p.tasks.length, 0)} tareas
  ${dependencies} dependencias resueltas de texto a relación
  ${blockers} bloqueos  (${externos} externos · ${blockers - externos} internos)
`);
}

/**
 * Contenido de ejemplo, claramente separado del dataset.
 *
 * El enunciado pide "ejemplos de proyectos con distintos estados y prioridades".
 * Los estados y las prioridades ya vienen del dataset; lo que no viene es
 * evidencia de las dos capacidades que el reto exige y la fuente no tiene:
 * notas y prioridad manual. Se siembran aquí, y solo aquí, para que se puedan
 * ver funcionando desde el primer arranque.
 *
 * Se eligieron a propósito proyectos que NO alteran ningún hallazgo: no se toca
 * PRJ-04 (ciclo), ni PRJ-21 (zombie), ni PRJ-08/22 (duplicado).
 */
async function seedDemoContent(projectIds: Map<string, string>) {
  const notes: Array<[string, string, string]> = [
    [
      "PRJ-13",
      "Santiago Vera",
      "El acceso a los datos lleva dos semanas pedido. Si no llega esta semana, el diagnóstico no cierra en la fecha comprometida.",
    ],
    [
      "PRJ-18",
      "Mateo Ruiz",
      "Modelo base validado con el equipo de operaciones. La integración con el POS es el siguiente riesgo real.",
    ],
  ];

  for (const [code, author, body] of notes) {
    const projectId = projectIds.get(code);
    if (!projectId) continue;
    await prisma.note.create({ data: { projectId, author, body } });
    await prisma.activityLog.create({
      data: { projectId, actor: author, action: "NOTE", newValue: body },
    });
  }

  // Ejemplo de override: PRJ-17 tiene el score más bajo del portafolio porque
  // está sano y su fecha está lejos. Aun así el equipo decide subirlo, y el
  // sistema obliga a dejar escrito por qué. Es el caso que demuestra que el
  // algoritmo se puede contradecir, pero no en silencio.
  const prj17 = projectIds.get("PRJ-17");
  if (prj17) {
    const reason =
      "El cliente renueva contrato en agosto y la conciliación semanal es el entregable que evalúan. Vale más que su score.";
    await prisma.project.update({
      where: { id: prj17 },
      data: { priorityOverride: "Alta", overrideReason: reason },
    });
    await prisma.activityLog.create({
      data: {
        projectId: prj17,
        actor: "Daniel Rojas",
        action: "OVERRIDE",
        field: "priorityOverride",
        oldValue: null,
        newValue: "Alta",
        reason,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
