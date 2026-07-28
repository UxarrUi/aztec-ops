import Link from "next/link";
import { resolveAsOfDate } from "@/lib/config";
import { getPortfolio } from "@/lib/repository";
import type { AnalyzedProject, QueueName } from "@/lib/types";
import {
  Card,
  FlagChip,
  HealthBadge,
  PriorityBadge,
  ProjectLink,
  QUEUE_STYLES,
  ScoreBadge,
  formatDate,
  formatUsd,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type Filters = {
  asOf?: string;
  cola?: string;
  owner?: string;
  cliente?: string;
  salud?: string;
  senal?: string;
};

/**
 * La tabla completa del portafolio.
 *
 * Es la vista para cuando ya sabes qué buscas: filtrar por cola, responsable,
 * cliente, salud o señal. Todos los filtros van en la URL, así que un tablero
 * filtrado se puede pegar en un chat y el otro ve exactamente lo mismo.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const filters = await searchParams;
  const asOf = resolveAsOfDate(filters.asOf);
  const asOfKey = asOf.toISOString().slice(0, 10);
  const portfolio = await getPortfolio(asOf);

  const owners = [
    ...new Set(portfolio.projects.map((p) => p.project.ownerAlias).filter(Boolean)),
  ].sort() as string[];
  const clients = [
    ...new Set(portfolio.projects.map((p) => p.project.clientAlias)),
  ].sort();
  const signals = [...new Set(portfolio.projects.flatMap((p) => p.flags.map((f) => f.code)))]
    .sort();

  const rows = portfolio.projects.filter((item) => {
    if (filters.cola && item.queue !== filters.cola) return false;
    if (filters.owner && item.project.ownerAlias !== filters.owner) return false;
    if (filters.cliente && item.project.clientAlias !== filters.cliente) return false;
    if (filters.salud && item.health !== filters.salud) return false;
    if (filters.senal && !item.flags.some((f) => f.code === filters.senal)) return false;
    return true;
  });

  const buildHref = (patch: Partial<Filters>) => {
    const params = new URLSearchParams();
    const merged = { ...filters, ...patch, asOf: asOfKey };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/proyectos?${params.toString()}`;
  };

  const hasFilters = Boolean(
    filters.cola || filters.owner || filters.cliente || filters.salud || filters.senal,
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Proyectos</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} de {portfolio.projects.length} proyectos · ordenados por score a
            la fecha <span className="tabular">{asOfKey}</span>
          </p>
        </div>
        {hasFilters && (
          <Link
            href={`/proyectos?asOf=${asOfKey}`}
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Quitar filtros
          </Link>
        )}
      </header>

      <Card className="flex flex-wrap gap-x-6 gap-y-3 px-4 py-3">
        <FilterGroup label="Cola">
          {(["EJECUTAR", "ESCALAR", "DECIDIR"] as QueueName[]).map((queue) => (
            <FilterPill
              key={queue}
              href={buildHref({ cola: filters.cola === queue ? undefined : queue })}
              active={filters.cola === queue}
            >
              {QUEUE_STYLES[queue].label}
            </FilterPill>
          ))}
        </FilterGroup>

        <FilterGroup label="Salud">
          {["Bloqueado", "En riesgo", "Sano"].map((health) => (
            <FilterPill
              key={health}
              href={buildHref({ salud: filters.salud === health ? undefined : health })}
              active={filters.salud === health}
            >
              {health}
            </FilterPill>
          ))}
        </FilterGroup>

        <FilterSelect
          label="Responsable"
          value={filters.owner ?? ""}
          options={owners}
          hrefFor={(v) => buildHref({ owner: v || undefined })}
        />
        <FilterSelect
          label="Cliente"
          value={filters.cliente ?? ""}
          options={clients}
          hrefFor={(v) => buildHref({ cliente: v || undefined })}
        />
        <FilterSelect
          label="Señal"
          value={filters.senal ?? ""}
          options={signals}
          hrefFor={(v) => buildHref({ senal: v || undefined })}
        />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Proyecto</th>
              <th className="px-3 py-2 font-medium">Cola</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Prioridad</th>
              <th className="px-3 py-2 font-medium">Salud</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 font-medium">Fecha límite</th>
              <th className="px-3 py-2 font-medium">Siguiente paso</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Señales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((item) => (
              <Row key={item.project.code} item={item} asOf={asOfKey} portfolio={portfolio} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Ningún proyecto cumple esos filtros.
          </p>
        )}
      </Card>
    </div>
  );
}

function Row({
  item,
  asOf,
  portfolio,
}: {
  item: AnalyzedProject;
  asOf: string;
  portfolio: Awaited<ReturnType<typeof getPortfolio>>;
}) {
  const rank = portfolio.projects.indexOf(item) + 1;

  return (
    <tr className="align-top transition-colors hover:bg-surface-2/50">
      <td className="tabular px-3 py-2.5 text-xs text-muted">{rank}</td>
      <td className="px-3 py-2.5">
        <ProjectLink code={item.project.code} name={item.project.name} asOf={asOf} />
        <div className="mt-0.5 text-xs text-muted">
          {item.project.clientAlias} · {item.project.engagementType}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-xs ${QUEUE_STYLES[item.queue].accent}`}>
          {QUEUE_STYLES[item.queue].label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <ScoreBadge score={item.score} />
      </td>
      <td className="px-3 py-2.5">
        <PriorityBadge
          priority={item.effectivePriority}
          overridden={item.priorityIsOverridden}
        />
      </td>
      <td className="px-3 py-2.5">
        <HealthBadge health={item.health} />
      </td>
      <td className="px-3 py-2.5 text-xs">{item.project.ownerAlias ?? "—"}</td>
      <td className="tabular px-3 py-2.5 text-xs">{formatDate(item.project.targetDate)}</td>
      <td className="max-w-[260px] px-3 py-2.5 text-xs">
        {item.nextStep ? (
          <>
            {item.nextStep.text}
            {item.nextStep.source === "derivado" && (
              <span className="ml-1 text-muted">(derivado)</span>
            )}
          </>
        ) : (
          <span className="text-violet-300">sin definir</span>
        )}
      </td>
      <td className="tabular px-3 py-2.5 text-right text-xs">
        {formatUsd(item.project.businessValueUsd)}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex max-w-[220px] flex-wrap gap-1">
          {item.flags.map((flag) => (
            <FlagChip key={flag.code} flag={flag} />
          ))}
        </div>
      </td>
    </tr>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded px-2 py-0.5 text-xs ring-1 ring-inset transition-colors ${
        active
          ? "bg-sky-500/20 text-sky-200 ring-sky-500/40"
          : "text-muted ring-line hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Un `select` que no necesita JavaScript: cada opción es un enlace. Se resuelve
 * con un `<details>` para no arrastrar estado de cliente a una vista que es
 * enteramente de servidor.
 */
function FilterSelect({
  label,
  value,
  options,
  hrefFor,
}: {
  label: string;
  value: string;
  options: string[];
  hrefFor: (value: string) => string;
}) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted">
        {label}
        <span
          className={`rounded px-2 py-0.5 ring-1 ring-inset ${
            value ? "bg-sky-500/20 text-sky-200 ring-sky-500/40" : "ring-line"
          }`}
        >
          {value || "todos"}
        </span>
      </summary>
      <div className="absolute z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded border border-line bg-surface p-1 shadow-xl">
        <Link
          href={hrefFor("")}
          className="block rounded px-2 py-1 text-xs text-muted hover:bg-surface-2"
        >
          Todos
        </Link>
        {options.map((option) => (
          <Link
            key={option}
            href={hrefFor(option)}
            className={`block rounded px-2 py-1 text-xs hover:bg-surface-2 ${
              option === value ? "text-sky-200" : ""
            }`}
          >
            {option}
          </Link>
        ))}
      </div>
    </details>
  );
}
