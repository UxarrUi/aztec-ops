/**
 * Imprime el portafolio priorizado en la terminal.
 *
 *   npm run ranking            → usa la fecha de corte por defecto
 *   npm run ranking 2026-07-27 → recalcula todo a otra fecha
 *
 * Existe por dos razones. La primera es práctica: poder auditar el criterio sin
 * levantar la interfaz. La segunda es que demuestra la regla de arquitectura del
 * proyecto — este archivo consume el mismo `src/lib` que la aplicación web, sin
 * tocar React, Next ni la base de datos. El criterio no vive en la interfaz.
 */
import { resolveAsOfDate } from "../src/lib/config";
import { loadDataset } from "../src/lib/dataset";
import { analyzePortfolio } from "../src/lib/portfolio";
import type { QueueName } from "../src/lib/types";

const pad = (value: string, width: number) => value.padEnd(width).slice(0, width);
const money = (value: number | null) =>
  value === null ? "s/d" : Math.round(value).toLocaleString("en-US");

function main() {
  const asOf = resolveAsOfDate(process.argv[2]);
  const { projects, team } = loadDataset();
  const analysis = analyzePortfolio(projects, team, asOf);

  console.log(`\nPortafolio priorizado — fecha de corte ${asOf.toISOString().slice(0, 10)}\n`);
  console.log(
    " #  CODE     COLA      SCORE   URG   RSK   VAL   RESPONSABLE       VENC BLQ       USD   SEÑALES",
  );
  console.log("─".repeat(118));

  analysis.projects.forEach((item, index) => {
    const { urgency, risk, value, total } = item.breakdown;
    const signals = item.flags
      .filter((f) => !["BLOQUEADO", "EN_RIESGO", "SOBRECARGA_OWNER"].includes(f.code))
      .map((f) => f.code)
      .join(",");

    console.log(
      `${String(index + 1).padStart(2)}  ${pad(item.project.code, 9)}${pad(item.queue, 10)}` +
        `${String(total).padStart(5)}  ${urgency.value.toFixed(2)}  ${risk.value.toFixed(2)}  ` +
        `${value.value.toFixed(2)}  ${pad(item.project.ownerAlias ?? "—", 18)}` +
        `${String(item.overdueTasks.length).padStart(3)}${String(item.blockedTasks.length).padStart(4)}  ` +
        `${money(item.project.businessValueUsd).padStart(8)}  ${signals}`,
    );
  });

  const queueSizes = (Object.keys(analysis.queues) as QueueName[])
    .map((q) => `${q} ${analysis.queues[q].length}`)
    .join("  ·  ");

  console.log(`\nCOLAS:   ${queueSizes}`);
  console.log(
    `SALUD:   Bloqueado ${analysis.totals.blocked}  ·  En riesgo ${analysis.totals.atRisk}  ·  Sano ${analysis.totals.healthy}`,
  );
  console.log(
    `TAREAS:  ${analysis.totals.openTasks} abiertas  ·  ${analysis.totals.overdueTasks} vencidas  ·  ${analysis.totals.blockedTasks} bloqueadas`,
  );
  console.log(`\nCARGA POR PERSONA (umbral de sobrecarga: ${analysis.overloadThreshold} tareas)`);
  for (const member of analysis.team) {
    const marks = [
      member.isOverloaded ? "SOBRECARGADO" : "",
      member.inSourceTeamSheet ? "" : "no está en la tabla de equipo",
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(
      `  ${pad(member.alias, 18)}${String(member.openTasks).padStart(3)} tareas  ` +
        `${String(member.projects).padStart(2)} proyectos  ${marks}`,
    );
  }

  const activeTop = analysis.projects
    .filter((p) => p.project.status === "Activo")
    .slice(0, 10);
  const topByQueue = activeTop.reduce<Record<string, number>>(
    (acc, p) => ({ ...acc, [p.queue]: (acc[p.queue] ?? 0) + 1 }),
    {},
  );
  console.log(
    `\nTOP-10 más urgentes por cola: ` +
      Object.entries(topByQueue)
        .map(([q, n]) => `${q} ${n}`)
        .join("  ·  "),
  );
  console.log();
}

main();
