"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AsOfPicker } from "./AsOfPicker";
import { DEFAULT_AS_OF_DATE } from "@/lib/config";

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
    <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={`/?asOf=${asOf}`} className="text-sm font-semibold tracking-tight">
          Aztec <span className="text-muted">· operación</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={`${link.href}?asOf=${asOf}`}
              className={`rounded px-2.5 py-1 transition-colors ${
                isActive(link.href)
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
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
            className="rounded bg-sky-500/20 px-2.5 py-1 text-sm text-sky-200 ring-1 ring-inset ring-sky-500/30 transition-colors hover:bg-sky-500/30"
          >
            Nuevo proyecto
          </Link>
        </div>
      </div>
    </header>
  );
}
