import { describe, expect, it } from "vitest";
import {
  cleanTaskTitle,
  deriveNextStep,
  findCycles,
  getStartableTasks,
  isStartable,
  indexTasks,
  sortByUrgency,
} from "@/lib/graph";
import { d, healthyProject, project, projectWithCycle, task, zombieProject } from "./fixtures";

describe("findCycles", () => {
  it("detecta el ciclo real de PRJ-04 (T02 ↔ T03)", () => {
    const cycles = findCycles(projectWithCycle().tasks);

    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(["PRJ-04-T02", "PRJ-04-T03"]);
  });

  it("no reporta ciclos en una cadena lineal", () => {
    expect(findCycles(healthyProject().tasks)).toEqual([]);
  });

  it("no reporta ciclos cuando no hay dependencias", () => {
    expect(findCycles([task({ code: "A" }), task({ code: "B" })])).toEqual([]);
  });

  it("detecta un ciclo de tres tareas", () => {
    const cycles = findCycles([
      task({ code: "A", dependsOnCode: "B" }),
      task({ code: "B", dependsOnCode: "C" }),
      task({ code: "C", dependsOnCode: "A" }),
    ]);

    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(["A", "B", "C"]);
  });

  it("ignora dependencias que apuntan a tareas inexistentes", () => {
    expect(findCycles([task({ code: "A", dependsOnCode: "NO-EXISTE" })])).toEqual([]);
  });

  it("no duplica el mismo ciclo alcanzado desde distintos puntos de entrada", () => {
    const cycles = findCycles([
      task({ code: "ENTRADA-1", dependsOnCode: "A" }),
      task({ code: "ENTRADA-2", dependsOnCode: "B" }),
      task({ code: "A", dependsOnCode: "B" }),
      task({ code: "B", dependsOnCode: "A" }),
    ]);

    expect(cycles).toHaveLength(1);
  });
});

describe("isStartable", () => {
  it("una tarea sin dependencias y abierta es arrancable", () => {
    const tasks = [task({ code: "A", status: "Por hacer" })];
    expect(isStartable(tasks[0], indexTasks(tasks))).toBe(true);
  });

  it("una tarea Bloqueada nunca es arrancable", () => {
    const tasks = [task({ code: "A", status: "Bloqueada" })];
    expect(isStartable(tasks[0], indexTasks(tasks))).toBe(false);
  });

  it("una tarea cuya dependencia sigue abierta no es arrancable", () => {
    const tasks = [
      task({ code: "A", status: "En progreso" }),
      task({ code: "B", dependsOnCode: "A" }),
    ];
    expect(isStartable(tasks[1], indexTasks(tasks))).toBe(false);
  });

  it("una tarea cuya dependencia ya está Hecha sí es arrancable", () => {
    const tasks = [
      task({ code: "A", status: "Hecha" }),
      task({ code: "B", dependsOnCode: "A" }),
    ];
    expect(isStartable(tasks[1], indexTasks(tasks))).toBe(true);
  });

  it("una tarea ya cerrada no cuenta como arrancable", () => {
    const tasks = [task({ code: "A", status: "Hecha" })];
    expect(isStartable(tasks[0], indexTasks(tasks))).toBe(false);
  });

  it("las dos tareas del ciclo de PRJ-04 no son arrancables", () => {
    const tasks = projectWithCycle().tasks;
    const index = indexTasks(tasks);
    const byCode = (code: string) => tasks.find((t) => t.code === code)!;

    expect(isStartable(byCode("PRJ-04-T02"), index)).toBe(false);
    expect(isStartable(byCode("PRJ-04-T03"), index)).toBe(false);
  });

  it("en PRJ-04 solo T01 queda arrancable pese al ciclo", () => {
    expect(getStartableTasks(projectWithCycle().tasks).map((t) => t.code)).toEqual([
      "PRJ-04-T01",
    ]);
  });
});

describe("sortByUrgency", () => {
  it("ordena por prioridad y luego por fecha", () => {
    const ordered = sortByUrgency([
      task({ code: "C", priority: "Media", dueDate: d("2026-01-01") }),
      task({ code: "A", priority: "Critica", dueDate: d("2026-12-01") }),
      task({ code: "B", priority: "Alta", dueDate: d("2026-05-01") }),
    ]);

    expect(ordered.map((t) => t.code)).toEqual(["A", "B", "C"]);
  });

  it("manda al final las tareas sin fecha dentro de la misma prioridad", () => {
    const ordered = sortByUrgency([
      task({ code: "SIN-FECHA", priority: "Alta", dueDate: null }),
      task({ code: "CON-FECHA", priority: "Alta", dueDate: d("2026-08-01") }),
    ]);

    expect(ordered.map((t) => t.code)).toEqual(["CON-FECHA", "SIN-FECHA"]);
  });
});

describe("cleanTaskTitle", () => {
  it("quita el sufijo con el nombre del proyecto", () => {
    expect(
      cleanTaskTitle("Plan next delivery iteration - Quotation Engine", "Quotation Engine"),
    ).toBe("Plan next delivery iteration");
  });

  it("deja el título intacto si no trae el sufijo", () => {
    expect(cleanTaskTitle("Kick off", "Quotation Engine")).toBe("Kick off");
  });
});

describe("deriveNextStep", () => {
  it("deriva el siguiente paso de la tarea arrancable más urgente", () => {
    const next = deriveNextStep(healthyProject());

    expect(next).not.toBeNull();
    expect(next!.source).toBe("derivado");
    expect(next!.taskCode).toBe("PRJ-19-T01");
    expect(next!.text).toBe("Iteracion en curso con entregables definidos");
  });

  it("el siguiente paso escrito a mano tiene prioridad sobre el derivado", () => {
    const next = deriveNextStep(
      project({
        ...healthyProject(),
        code: "PRJ-19",
        nextStep: "Llamar al cliente para cerrar el alcance",
        nextStepOwnerAlias: "Laura Gomez",
      }),
    );

    expect(next!.source).toBe("manual");
    expect(next!.text).toBe("Llamar al cliente para cerrar el alcance");
    expect(next!.ownerAlias).toBe("Laura Gomez");
  });

  it("devuelve null cuando el proyecto no tiene tareas (caso PRJ-21)", () => {
    expect(deriveNextStep(zombieProject())).toBeNull();
  });

  it("devuelve null cuando toda tarea abierta está bloqueada o encadenada", () => {
    const stuck = project({
      code: "PRJ-STUCK",
      tasks: [
        task({ code: "T1", status: "Bloqueada" }),
        task({ code: "T2", status: "Por hacer", dependsOnCode: "T1" }),
      ],
    });

    expect(deriveNextStep(stuck)).toBeNull();
  });
});
