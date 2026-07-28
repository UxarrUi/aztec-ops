import Link from "next/link";
import { resolveAsOfDate } from "@/lib/config";
import { getTeam } from "@/lib/repository";
import { CreateProjectForm } from "@/components/forms";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { asOf: asOfParam } = await searchParams;
  const asOfKey = resolveAsOfDate(asOfParam).toISOString().slice(0, 10);
  const team = await getTeam();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav className="text-xs text-muted">
        <Link href={`/proyectos?asOf=${asOfKey}`} className="hover:text-foreground">
          Proyectos
        </Link>
        <span className="mx-1.5">/</span>
        <span>nuevo</span>
      </nav>

      <header>
        <h1 className="text-2xl font-extrabold text-brand">Nuevo proyecto</h1>
        <p className="mt-1 text-sm text-muted">
          Lo único obligatorio es el nombre y el cliente. Si no le pones fecha límite ni
          siguiente paso, el proyecto nace en la cola <strong>Decidir</strong> — que es
          exactamente donde debe estar algo de lo que todavía no se ha decidido nada.
        </p>
      </header>

      <Card>
        <SectionTitle title="Datos del proyecto" />
        <div className="px-4 py-4">
          <CreateProjectForm
            members={team.map((m) => ({
              alias: m.alias,
              inSourceTeamSheet: m.inSourceTeamSheet,
            }))}
          />
        </div>
      </Card>
    </div>
  );
}
