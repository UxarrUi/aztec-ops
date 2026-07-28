import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadDataset, parseDate, toUsd } from "@/lib/dataset";
import { parseCsvToObjects } from "@/lib/csv";
import { COP_PER_USD } from "@/lib/config";

/**
 * Tests de normalización de la fuente. Cada uno corresponde a un problema real
 * del dataset: si la normalización se rompe, el ranking cambia sin que nadie se
 * entere.
 */

describe("parseCsvToObjects", () => {
  it("respeta comas dentro de campos entrecomillados", () => {
    const rows = parseCsvToObjects('a,b\n"uno, dos",tres');
    expect(rows).toEqual([{ a: "uno, dos", b: "tres" }]);
  });

  it("respeta comillas escapadas", () => {
    const rows = parseCsvToObjects('a\n"dijo ""hola"""');
    expect(rows[0].a).toBe('dijo "hola"');
  });
});

describe("parseDate", () => {
  it("acepta el formato ISO del dataset", () => {
    expect(parseDate("2026-03-02")?.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("acepta el dd/mm/yyyy que solo usa PRJ-17", () => {
    expect(parseDate("02/03/2026")?.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("trata como ausente lo que no reconoce, en vez de inventar una fecha", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("   ")).toBeNull();
    expect(parseDate("marzo de 2026")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe("toUsd", () => {
  it("deja los USD intactos", () => {
    expect(toUsd("28000", "USD")).toBe(28_000);
  });

  it("convierte los dos proyectos en COP del dataset", () => {
    expect(toUsd("85000000", "COP")).toBeCloseTo(85_000_000 / COP_PER_USD, 6);
    expect(toUsd("120000000", "COP")).toBeCloseTo(120_000_000 / COP_PER_USD, 6);
  });

  it("devuelve null cuando no hay valor, sin asumir cero", () => {
    expect(toUsd("", "USD")).toBeNull();
  });
});

describe("loadDataset sobre el dataset real", () => {
  const { projects, team } = loadDataset();

  it("carga los 22 proyectos y las 82 tareas", () => {
    expect(projects).toHaveLength(22);
    expect(projects.reduce((n, p) => n + p.tasks.length, 0)).toBe(82);
  });

  it("resuelve todas las dependencias de texto a códigos de tarea reales", () => {
    const allCodes = new Set(projects.flatMap((p) => p.tasks.map((t) => t.code)));
    const withDependency = projects.flatMap((p) =>
      p.tasks.filter((t) => t.dependsOnCode !== null),
    );

    expect(withDependency.length).toBeGreaterThan(0);
    for (const task of withDependency) {
      expect(allCodes.has(task.dependsOnCode!)).toBe(true);
    }
  });

  it("no deja dependencias sin resolver: toda `dependency` no vacía se convirtió", () => {
    const rawTasks = parseCsvToObjects(readFileSync("data/tasks.csv", "utf8"));
    const rawWithDependency = rawTasks.filter((r) => r.dependency.trim().length > 0);
    const resolved = projects.flatMap((p) => p.tasks.filter((t) => t.dependsOnCode));

    expect(resolved).toHaveLength(rawWithDependency.length);
  });

  it("normaliza PRJ-17, el único con fecha en dd/mm/yyyy", () => {
    const p = projects.find((x) => x.code === "PRJ-17")!;
    expect(p.startDate?.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("convierte a USD los dos proyectos en COP", () => {
    const cop = ["PRJ-18", "PRJ-20"].map((c) => projects.find((p) => p.code === c)!);
    expect(cop[0].businessValueUsd).toBeCloseTo(85_000_000 / COP_PER_USD, 4);
    expect(cop[1].businessValueUsd).toBeCloseTo(120_000_000 / COP_PER_USD, 4);
  });

  it("deja PRJ-07 sin valor en vez de rellenarlo con cero", () => {
    expect(projects.find((p) => p.code === "PRJ-07")!.businessValueUsd).toBeNull();
  });

  it("detecta a Andrea Molina como persona ausente de la pestaña Team", () => {
    const andrea = team.find((m) => m.alias === "Andrea Molina");
    expect(andrea).toBeDefined();
    expect(andrea!.inSourceTeamSheet).toBe(false);

    const declared = team.filter((m) => m.inSourceTeamSheet);
    expect(declared).toHaveLength(5);
    expect(team).toHaveLength(6);
  });

  it("clasifica los bloqueos de las tareas en externos e internos", () => {
    const externos = projects.flatMap((p) =>
      p.blockers.filter((b) => b.kind === "EXTERNO"),
    );
    const internos = projects.flatMap((p) =>
      p.blockers.filter((b) => b.kind === "INTERNO"),
    );

    // Los 17 bloqueos del dataset se reparten entre los dos tipos: si todos
    // cayeran del mismo lado, la distinción no estaría haciendo nada.
    expect(externos.length + internos.length).toBe(17);
    expect(externos.length).toBeGreaterThan(0);
    expect(internos.length).toBeGreaterThan(0);
  });
});
