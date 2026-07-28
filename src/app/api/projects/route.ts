import { NextResponse } from "next/server";
import { resolveAsOfDate } from "@/lib/config";
import { getPortfolio } from "@/lib/repository";
import { serialize } from "../portfolio/route";

export const dynamic = "force-dynamic";

/**
 * Listado de proyectos ya priorizado.
 *
 *   curl 'http://localhost:3000/api/projects?queue=ESCALAR' | jq '.[].code'
 *   curl 'http://localhost:3000/api/projects?owner=Camila%20Torres'
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const asOf = resolveAsOfDate(params.get("asOf"));
  const portfolio = await getPortfolio(asOf);

  const queue = params.get("queue");
  const owner = params.get("owner");
  const health = params.get("health");
  const flag = params.get("flag");

  const rows = portfolio.projects.filter((item) => {
    if (queue && item.queue !== queue) return false;
    if (owner && item.project.ownerAlias !== owner) return false;
    if (health && item.health !== health) return false;
    if (flag && !item.flags.some((f) => f.code === flag)) return false;
    return true;
  });

  return NextResponse.json(rows.map(serialize));
}
