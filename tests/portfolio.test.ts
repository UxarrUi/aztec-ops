import { describe, expect, it } from "vitest";
import { resolveAsOfDate } from "@/lib/config";
import { loadDataset } from "@/lib/dataset";
import { analyzePortfolio } from "@/lib/portfolio";
import type { AnalyzedProject, FlagCode } from "@/lib/types";

/**
 * El test que de verdad importa: corre el motor completo sobre el dataset real
 * y fija cada hallazgo que se afirma en ANALISIS.md y en el video.
 *
 * Si alguien cambia un peso o una regla y estos números se mueven, el test lo
 * grita. Es lo que hace que el criterio sea reproducible y no una opinión.
 */

const { projects, team } = loadDataset();
const asOf = resolveAsOfDate("2026-07-13");
const analysis = analyzePortfolio(projects, team, asOf);

const byCode = (code: string): AnalyzedProject =>
  analysis.projects.find((p) => p.project.code === code)!;

const hasFlag = (code: string, flag: FlagCode) =>
  byCode(code).flags.some((f) => f.code === flag);

describe("salud recalculada frente a la declarada", () => {
  it("los 4 Diagnósticos decían 'En riesgo' pero están bloqueados de hecho", () => {
    for (const code of ["PRJ-13", "PRJ-14", "PRJ-15", "PRJ-16"]) {
      expect(byCode(code).project.healthSource).toBe("En riesgo");
      expect(byCode(code).health).toBe("Bloqueado");
      expect(byCode(code).blockedTasks.length).toBeGreaterThan(0);
    }
  });

  it("PRJ-21 se declara Sano pero está en riesgo: fecha vencida y sin tareas", () => {
    expect(byCode("PRJ-21").project.healthSource).toBe("Sano");
    expect(byCode("PRJ-21").health).toBe("En riesgo");
  });

  it("el recuento de salud cambia al recalcular", () => {
    expect(analysis.totals).toMatchObject({ blocked: 17, atRisk: 1, healthy: 4 });
  });
});

describe("anomalías estructurales", () => {
  it("PRJ-04 tiene la única dependencia circular del portafolio", () => {
    const conCiclo = analysis.projects.filter((p) => p.cycles.length > 0);
    expect(conCiclo.map((p) => p.project.code)).toEqual(["PRJ-04"]);
    expect([...conCiclo[0].cycles[0]].sort()).toEqual(["PRJ-04-T02", "PRJ-04-T03"]);
    expect(hasFlag("PRJ-04", "DEPENDENCIA_CIRCULAR")).toBe(true);
  });

  it("PRJ-21 es el único proyecto zombie: activo, sin tareas y vencido", () => {
    const zombies = analysis.projects.filter((p) =>
      p.flags.some((f) => f.code === "PROYECTO_ZOMBIE"),
    );
    expect(zombies.map((p) => p.project.code)).toEqual(["PRJ-21"]);
  });

  it("PRJ-21 es el único sin siguiente paso posible", () => {
    const sinPaso = analysis.projects.filter((p) => p.nextStep === null);
    expect(sinPaso.map((p) => p.project.code)).toEqual(["PRJ-21"]);
    expect(analysis.totals.withoutNextStep).toBe(1);
  });

  it("PRJ-08 y PRJ-22 se marcan como probable duplicado, en ambos sentidos", () => {
    expect(hasFlag("PRJ-08", "DUPLICADO_PROBABLE")).toBe(true);
    expect(hasFlag("PRJ-22", "DUPLICADO_PROBABLE")).toBe(true);

    const duplicados = analysis.projects.filter((p) =>
      p.flags.some((f) => f.code === "DUPLICADO_PROBABLE"),
    );
    expect(duplicados.map((p) => p.project.code).sort()).toEqual(["PRJ-08", "PRJ-22"]);
  });

  it("PRJ-19 marca a su responsable como persona fantasma", () => {
    expect(hasFlag("PRJ-19", "PERSONA_FANTASMA")).toBe(true);
    const fantasmas = analysis.projects.filter((p) =>
      p.flags.some((f) => f.code === "PERSONA_FANTASMA"),
    );
    expect(fantasmas.map((p) => p.project.code)).toEqual(["PRJ-19"]);
  });

  it("PRJ-07 marca el valor de negocio faltante", () => {
    expect(hasFlag("PRJ-07", "DATOS_INCOMPLETOS")).toBe(true);
    expect(byCode("PRJ-07").project.businessValueUsd).toBeNull();
  });
});

describe("el siguiente paso derivado del grafo de tareas", () => {
  it("los 21 proyectos con backlog derivan siempre un siguiente paso", () => {
    const conBacklog = analysis.projects.filter((p) => p.project.tasks.length > 0);
    expect(conBacklog).toHaveLength(21);
    for (const p of conBacklog) {
      expect(p.nextStep).not.toBeNull();
      expect(p.nextStep!.source).toBe("derivado");
    }
  });

  it("cada proyecto con backlog tiene exactamente una tarea arrancable", () => {
    // El backlog del dataset es una cadena: una sola raíz sin dependencias por
    // proyecto. De ahí que haya 21 frentes abiertos en paralelo.
    for (const p of analysis.projects.filter((x) => x.project.tasks.length > 0)) {
      expect(p.startableTasks).toHaveLength(1);
    }
  });

  it("en PRJ-04 el siguiente paso esquiva las dos tareas del ciclo", () => {
    expect(byCode("PRJ-04").nextStep!.taskCode).toBe("PRJ-04-T01");
  });
});

describe("colas de acción", () => {
  it("reparte el portafolio activo en las tres colas", () => {
    expect(analysis.queues.EJECUTAR).toHaveLength(7);
    expect(analysis.queues.ESCALAR).toHaveLength(6);
    expect(analysis.queues.DECIDIR).toHaveLength(9);
  });

  it("de los 10 proyectos más urgentes, solo uno se puede trabajar hoy", () => {
    const top10 = analysis.projects
      .filter((p) => p.project.status === "Activo")
      .slice(0, 10);

    expect(top10.filter((p) => p.queue === "EJECUTAR")).toHaveLength(1);
    expect(top10.filter((p) => p.queue === "ESCALAR")).toHaveLength(6);
    expect(top10.filter((p) => p.queue === "DECIDIR")).toHaveLength(3);
  });

  it("el duplicado sin confirmar va a DECIDIR, no a ESCALAR", () => {
    // Llamar dos veces al mismo cliente por el mismo trabajo quema la relación:
    // primero se decide si son uno o dos, después se escala.
    expect(byCode("PRJ-08").queue).toBe("DECIDIR");
    expect(byCode("PRJ-22").queue).toBe("DECIDIR");
  });

  it("PRJ-04 va a DECIDIR pese a estar bloqueado por un tercero", () => {
    // Tiene un bloqueo externo, pero antes hay que romper el ciclo interno.
    expect(byCode("PRJ-04").externalBlockers.length).toBeGreaterThan(0);
    expect(byCode("PRJ-04").queue).toBe("DECIDIR");
  });

  it("los proyectos con bloqueo solo interno se quedan en EJECUTAR", () => {
    for (const code of ["PRJ-03", "PRJ-05", "PRJ-06"]) {
      expect(byCode(code).blockedTasks.length).toBeGreaterThan(0);
      expect(byCode(code).externalBlockers).toHaveLength(0);
      expect(byCode(code).queue).toBe("EJECUTAR");
    }
  });

  it("los proyectos sanos quedan en EJECUTAR y al fondo del ranking", () => {
    for (const code of ["PRJ-17", "PRJ-18", "PRJ-19", "PRJ-20"]) {
      expect(byCode(code).health).toBe("Sano");
      expect(byCode(code).queue).toBe("EJECUTAR");
      expect(byCode(code).score).toBeLessThan(35);
    }
  });
});

describe("score", () => {
  it("PRJ-22 encabeza el ranking con el desglose que documenta ANALISIS.md", () => {
    const p = byCode("PRJ-22");
    expect(p.breakdown.urgency.value).toBe(1);
    expect(p.breakdown.risk.value).toBeCloseTo(0.85, 5);
    expect(p.breakdown.value.value).toBe(1);
    expect(p.score).toBe(94.8);
  });

  it("separa proyectos sanos de bloqueados sin que nadie los empuje", () => {
    const sanos = analysis.projects.filter((p) => p.health === "Sano");
    const bloqueados = analysis.projects.filter((p) => p.health === "Bloqueado");

    const maxSano = Math.max(...sanos.map((p) => p.score));
    const minBloqueado = Math.min(...bloqueados.map((p) => p.score));

    expect(maxSano).toBeLessThan(minBloqueado);
  });

  it("no premia ni castiga la falta de fecha límite", () => {
    for (const code of ["PRJ-01", "PRJ-02", "PRJ-14", "PRJ-15", "PRJ-16"]) {
      expect(byCode(code).project.targetDate).toBeNull();
      expect(byCode(code).breakdown.urgency.value).toBe(0.5);
    }
  });
});

describe("capacidad del equipo", () => {
  it("Camila Torres es la única por encima del umbral de sobrecarga", () => {
    const sobrecargados = analysis.team.filter((m) => m.isOverloaded);
    expect(sobrecargados.map((m) => m.alias)).toEqual(["Camila Torres"]);
    expect(analysis.overloadThreshold).toBe(19);
  });

  it("reproduce la carga declarada en la pestaña Team", () => {
    const load = (alias: string) => analysis.team.find((m) => m.alias === alias)!;
    expect(load("Camila Torres")).toMatchObject({ openTasks: 28, projects: 7 });
    expect(load("Laura Gomez")).toMatchObject({ openTasks: 19, projects: 5 });
    expect(load("Mateo Ruiz")).toMatchObject({ openTasks: 16, projects: 4 });
    expect(load("Daniel Rojas")).toMatchObject({ openTasks: 11, projects: 3 });
    expect(load("Santiago Vera")).toMatchObject({ openTasks: 4, projects: 2 });
  });

  it("Andrea Molina aparece con carga real pese a no estar en la tabla de equipo", () => {
    const andrea = analysis.team.find((m) => m.alias === "Andrea Molina")!;
    expect(andrea.inSourceTeamSheet).toBe(false);
    expect(andrea.openTasks).toBe(4);
    expect(andrea.projects).toBe(1);
  });

  it("la mitad del top-10 más urgente recae en una sola persona", () => {
    const top10 = analysis.projects
      .filter((p) => p.project.status === "Activo")
      .slice(0, 10);
    const deCamila = top10.filter((p) => p.project.ownerAlias === "Camila Torres");
    expect(deCamila.length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * Estas dos operaciones existen en la interfaz (cambiar el estado de una tarea y
 * romper una dependencia). Los tests las ejercitan sobre el dominio puro: si el
 * grafo dejara de recalcularse, la aplicación seguiría "funcionando" pero
 * mostraría un siguiente paso mentiroso, que es el peor fallo posible aquí.
 */
describe("cerrar una tarea hace avanzar el siguiente paso", () => {
  it("al cerrar PRJ-04-T01, el siguiente paso pasa a la tarea que dependía de ella", () => {
    const mutados = projects.map((p) =>
      p.code !== "PRJ-04"
        ? p
        : {
            ...p,
            tasks: p.tasks.map((t) =>
              t.code === "PRJ-04-T01" ? { ...t, status: "Hecha" as const } : t,
            ),
          },
    );

    const despues = analyzePortfolio(mutados, team, asOf);
    const prj04 = despues.projects.find((p) => p.project.code === "PRJ-04")!;

    // Antes el siguiente paso era T01; ahora T01 está cerrada y desbloquea a T04.
    expect(byCode("PRJ-04").nextStep!.taskCode).toBe("PRJ-04-T01");
    expect(prj04.nextStep!.taskCode).toBe("PRJ-04-T04");
  });
});

describe("romper el ciclo saca a PRJ-04 de la cola DECIDIR", () => {
  it("al quitar la dependencia de T03, desaparece el ciclo y el proyecto pasa a ESCALAR", () => {
    const mutados = projects.map((p) =>
      p.code !== "PRJ-04"
        ? p
        : {
            ...p,
            tasks: p.tasks.map((t) =>
              t.code === "PRJ-04-T03" ? { ...t, dependsOnCode: null } : t,
            ),
          },
    );

    const despues = analyzePortfolio(mutados, team, asOf);
    const prj04 = despues.projects.find((p) => p.project.code === "PRJ-04")!;

    expect(byCode("PRJ-04").cycles).toHaveLength(1);
    expect(byCode("PRJ-04").queue).toBe("DECIDIR");

    expect(prj04.cycles).toHaveLength(0);
    expect(prj04.flags.some((f) => f.code === "DEPENDENCIA_CIRCULAR")).toBe(false);
    // Resuelto el problema interno, lo que queda es el bloqueo del cliente.
    expect(prj04.queue).toBe("ESCALAR");
  });
});

describe("la fecha de corte cambia el resultado", () => {
  // Es la razón de que la fecha sea configurable. Al alejarse del snapshot, el
  // backlog entero cae en mora y el factor de riesgo se satura: todo el mundo
  // queda igual de mal y el ranking deja de discriminar. La fecha de corte no
  // es cosmética, es lo que mantiene vivo el criterio.
  const hoy = analyzePortfolio(projects, team, resolveAsOfDate("2026-07-27"));

  it("dos semanas después, casi todo el backlog está vencido", () => {
    expect(analysis.totals.overdueTasks).toBe(38);
    expect(hoy.totals.overdueTasks).toBe(68);
  });

  it("el factor de riesgo se satura y deja de distinguir entre proyectos", () => {
    const saturados = (a: typeof analysis) =>
      a.projects.filter((p) => p.breakdown.risk.value >= 1).length;
    const valoresDistintos = (a: typeof analysis) =>
      new Set(a.projects.map((p) => p.breakdown.risk.value.toFixed(3))).size;

    // A la fecha del snapshot ningún proyecto llega al riesgo máximo.
    expect(saturados(analysis)).toBe(0);
    // Dos semanas después, 13 lo tocan: el factor ya no los diferencia.
    expect(saturados(hoy)).toBe(13);
    expect(valoresDistintos(hoy)).toBeLessThan(valoresDistintos(analysis));
  });

  it("los proyectos ya vencidos al snapshot siguen vencidos: la urgencia no retrocede", () => {
    const vencidos = (a: typeof analysis) =>
      a.projects.filter((p) => p.breakdown.urgency.value === 1).length;

    expect(vencidos(hoy)).toBeGreaterThanOrEqual(vencidos(analysis));
  });
});
