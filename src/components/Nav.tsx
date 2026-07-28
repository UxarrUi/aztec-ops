"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AsOfPicker } from "./AsOfPicker";
import { DEFAULT_AS_OF_DATE } from "@/lib/config";

/**
 * Barra superior, con la misma estructura que la de azteclab.co: fondo claro,
 * borde inferior fino, marca a la izquierda y una píldora verde a la derecha
 * como acción principal.
 */

const LINKS = [
  { href: "/", label: "Torre de control" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/equipo", label: "Equipo" },
];

export function Nav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const asOf = searchParams.get("asOf") ?? DEFAULT_AS_OF_DATE;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link
          href={`/?asOf=${asOf}`}
          className="text-lg font-extrabold tracking-tight text-brand"
        >
          aztec
          <span className="ml-1.5 align-super text-[10px] font-semibold text-muted">
            operación
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={`${link.href}?asOf=${asOf}`}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                isActive(link.href)
                  ? "bg-surface-2 font-semibold text-brand"
                  : "text-muted hover:text-brand"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <AsOfPicker value={asOf} />
          <Link
            href={`/proyectos/nuevo?asOf=${asOf}`}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-soft"
          >
            Nuevo proyecto
          </Link>
        </div>
      </div>
    </header>
  );
}
