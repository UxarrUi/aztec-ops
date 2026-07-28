"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Selector de fecha de corte.
 *
 * No es un adorno. El dataset es un snapshot del ~13-jul-2026 y todo el criterio
 * se calcula "a una fecha": mover esto recalcula urgencia, vencimientos, salud y
 * el orden entero del portafolio. Va en la URL para que un tablero se pueda
 * compartir tal y como lo vio quien lo mandó.
 */
export function AsOfPicker({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("asOf", next);
    else params.delete("asOf");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">Fecha de corte</span>
      <input
        type="date"
        value={value}
        onChange={(e) => update(e.target.value)}
        className="tabular rounded-full border border-line bg-surface px-3 py-1.5 text-foreground focus:border-brand focus:outline-none"
      />
      {pending && <span className="text-[11px]">recalculando…</span>}
    </label>
  );
}
