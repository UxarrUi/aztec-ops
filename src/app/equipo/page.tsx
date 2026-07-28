import { resolveAsOfDate } from "@/lib/config";
import { getPortfolio } from "@/lib/repository";
import {
  Card,
  Chip,
  ProjectLink,
  QUEUE_STYLES,
  ScoreBadge,
  SectionTitle,
  Stat,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Capacidad del equipo.
 *
 * Existe porque priorizar sin mirar quién tiene manos libres es teoría. Un
 * ranking impecable donde los seis primeros son de la misma persona no es un
 * plan de trabajo: es una lista de espera.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { asOf: asOfParam } = await searchParams;
  const asOf = resolveAsOfDate(asOfParam);
  const asOfKey = asOf.toISOString().slice(0, 10);
  const portfolio = await getPortfolio(asOf);

  const maxLoad = Math.max(1, ...portfolio.team.map((m) => m.openTasks));
  const activeTop10 = portfolio.projects
    .filter((p) => p.project.status === "Activo")
    .slice(0, 10);

  const concentration = new Map<string, number>();
  for (const item of activeTop10) {
    const owner = item.project.ownerAlias ?? "sin responsable";
    concentration.set(owner, (concentration.get(owner) ?? 0) + 1);
  }
  const [topOwner, topCount] = [...concentration.entries()].sort((a, b) => b[1] - a[1])[0] ?? [
    null,
    0,
  ];

  const ghosts = portfolio.team.filter((m) => !m.inSourceTeamSheet);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-brand">Equipo</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Carga real por persona a la fecha <span className="tabular">{asOfKey}</span>. El
          umbral de sobrecarga es el percentil 80 del propio equipo:{" "}
          <span className="tabular">{portfolio.overloadThreshold}</span> tareas abiertas.
        </p>
      </header>

      {topOwner && topCount >= 3 && (
        <Card className="border-transparent bg-cream px-6 py-5">
          <p className="text-base text-brand">
            <strong className="font-extrabold">
              {topCount} de los 10 proyectos más urgentes
            </strong>{" "}
            son de <strong className="font-extrabold">{topOwner}</strong>. El cuello de
            botella no es una opinión sobre el reparto de carga: es el ranking mismo.
          </p>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Personas" value={portfolio.team.length} />
        <Stat
          label="Sobrecargadas"
          value={portfolio.team.filter((m) => m.isOverloaded).length}
          tone="text-amber-700"
        />
        <Stat
          label="Fuera del equipo registrado"
          value={ghosts.length}
          tone={ghosts.length > 0 ? "text-violet-700" : ""}
          hint={ghosts.length > 0 ? ghosts.map((g) => g.alias).join(", ") : undefined}
        />
        <Stat
          label="Frentes abiertos"
          value={portfolio.projects.filter((p) => p.startableTasks.length > 0).length}
          hint="proyectos con trabajo en curso"
        />
      </section>

      <div className="space-y-4">
        {portfolio.team.map((member) => {
          const owned = portfolio.projects.filter(
            (p) => p.project.ownerAlias === member.alias,
          );

          return (
            <Card key={member.alias}>
              <SectionTitle
                title={member.alias}
                hint={member.role}
                right={
                  <div className="flex items-center gap-1.5">
                    {member.isOverloaded && (
                      <Chip className="bg-amber-50 text-amber-800 ring-amber-200">
                        sobrecargado
                      </Chip>
                    )}
                    {!member.inSourceTeamSheet && (
                      <Chip
                        className="bg-violet-50 text-violet-800 ring-violet-200"
                        title="Tiene trabajo asignado pero no aparecía en la pestaña Team del dataset"
                      >
                        fuera del equipo registrado
                      </Chip>
                    )}
                  </div>
                }
              />

              <div className="grid gap-4 px-4 py-3 lg:grid-cols-[280px_1fr]">
                <div className="space-y-2">
                  <div className="h-2 overflow-hidden rounded bg-surface-2">
                    <div
                      className={`h-full rounded ${
                        member.isOverloaded ? "bg-amber-500" : "bg-brand"
                      }`}
                      style={{ width: `${(member.openTasks / maxLoad) * 100}%` }}
                    />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <Metric label="Proyectos" value={member.projects} />
                    <Metric label="Tareas abiertas" value={member.openTasks} />
                    <Metric
                      label="Alta o crítica"
                      value={member.highOrCriticalTasks}
                      tone={member.highOrCriticalTasks > 15 ? "text-amber-700" : ""}
                    />
                    <Metric
                      label="Bloqueadas"
                      value={member.blockedTasks}
                      tone={member.blockedTasks > 0 ? "text-red-700" : ""}
                    />
                    <Metric
                      label="Vencidas"
                      value={member.overdueTasks}
                      tone={member.overdueTasks > 0 ? "text-amber-700" : ""}
                    />
                  </dl>
                </div>

                <div>
                  {owned.length === 0 ? (
                    <p className="text-xs text-muted">No es responsable de ningún proyecto.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {owned.map((item) => (
                        <li
                          key={item.project.code}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <ProjectLink
                            code={item.project.code}
                            name={item.project.name}
                            asOf={asOfKey}
                          />
                          <span className="flex shrink-0 items-center gap-2">
                            <span className={QUEUE_STYLES[item.queue].accent}>
                              {QUEUE_STYLES[item.queue].label}
                            </span>
                            <ScoreBadge score={item.score} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular font-medium ${tone}`}>{value}</dd>
    </div>
  );
}
