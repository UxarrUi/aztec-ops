import { NextResponse } from "next/server";
import { resolveAsOfDate } from "@/lib/config";
import { getPortfolio } from "@/lib/repository";
import { executiveSummary } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * Resumen ejecutivo del portafolio para el comité.
 *
 *   curl localhost:3000/api/ai/resumen
 *
 * Se redacta sobre las colas ya calculadas: el modelo no decide prioridades,
 * solo escribe lo que el motor determinista concluyó.
 */
export async function GET(request: Request) {
  const asOfParam = new URL(request.url).searchParams.get("asOf");
  const portfolio = await getPortfolio(resolveAsOfDate(asOfParam));
  const summary = await executiveSummary(portfolio);

  return NextResponse.json({
    asOf: portfolio.asOf.toISOString().slice(0, 10),
    ...summary,
  });
}
