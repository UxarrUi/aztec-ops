import { NextResponse } from "next/server";
import { resolveAsOfDate } from "@/lib/config";
import { getPortfolio } from "@/lib/repository";
import type { AnalyzedProject } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * El portafolio priorizado, en JSON.
 *
 *   curl 'http://localhost:3000/api/portfolio' | jq '.queues.ESCALAR'
 *   curl 'http://localhost:3000/api/portfolio?asOf=2026-07-27'
 *
 * La API es de solo lectura a propósito. La escritura pasa por server actions,
 * que es donde viven las validaciones y el registro en el historial; exponer un
 * segundo camino de escritura obligaría a duplicar esas reglas y tarde o
 * temprano las dos copias dejarían de coincidir.
 */
export async function GET(request: Request) {
  const asOfParam = new URL(request.url).searchParams.get("asOf");
  const asOf = resolveAsOfDate(asOfParam);
  const portfolio = await getPortfolio(asOf);

  return NextResponse.json({
    asOf: asOf.toISOString().slice(0, 10),
    totals: portfolio.totals,
    overloadThreshold: portfolio.overloadThreshold,
    team: portfolio.team,
    queues: {
      EJECUTAR: portfolio.queues.EJECUTAR.map(serialize),
      ESCALAR: portfolio.queues.ESCALAR.map(serialize),
      DECIDIR: portfolio.queues.DECIDIR.map(serialize),
    },
  });
}

export function serialize(item: AnalyzedProject) {
  return {
    code: item.project.code,
    name: item.project.name,
    client: item.project.clientAlias,
    owner: item.project.ownerAlias,
    status: item.project.status,
    queue: item.queue,
    queueReason: item.queueReason,
    health: item.health,
    healthSource: item.project.healthSource,
    score: item.score,
    priority: item.effectivePriority,
    priorityIsOverridden: item.priorityIsOverridden,
    breakdown: {
      urgency: item.breakdown.urgency,
      risk: item.breakdown.risk,
      value: item.breakdown.value,
    },
    targetDate: item.project.targetDate?.toISOString().slice(0, 10) ?? null,
    businessValueUsd: item.project.businessValueUsd,
    nextStep: item.nextStep && {
      text: item.nextStep.text,
      source: item.nextStep.source,
      taskCode: item.nextStep.taskCode,
      owner: item.nextStep.ownerAlias,
    },
    flags: item.flags,
    counts: {
      open: item.openTasks.length,
      overdue: item.overdueTasks.length,
      blocked: item.blockedTasks.length,
      startable: item.startableTasks.length,
    },
    cycles: item.cycles,
  };
}
