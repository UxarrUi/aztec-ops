import { NextResponse } from "next/server";
import { resolveAsOfDate } from "@/lib/config";
import { getPortfolio } from "@/lib/repository";
import { draftNextStep } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * Borrador del siguiente paso para un proyecto.
 *
 *   curl -X POST localhost:3000/api/ai/next-step -d '{"code":"PRJ-21"}'
 *
 * Devuelve `source` para que la interfaz pueda decir de dónde salió el texto.
 * Nunca guarda nada: quien decide es la persona que confirma el campo.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    asOf?: string;
  };

  if (!body.code) {
    return NextResponse.json({ error: "Falta el código del proyecto." }, { status: 400 });
  }

  const portfolio = await getPortfolio(resolveAsOfDate(body.asOf));
  const item = portfolio.projects.find((p) => p.project.code === body.code);
  if (!item) {
    return NextResponse.json(
      { error: `No existe el proyecto ${body.code}.` },
      { status: 404 },
    );
  }

  const draft = await draftNextStep(item);
  return NextResponse.json(draft);
}
