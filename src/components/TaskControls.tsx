"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { breakTaskDependency, updateTaskStatus } from "@/lib/actions";

/**
 * Los controles de una tarea.
 *
 * Sólo dos cosas, y las dos existen porque cierran una brecha entre lo que el
 * sistema detecta y lo que deja arreglar: cambiar el estado (para que el grafo
 * avance y el siguiente paso se recalcule) y romper una dependencia (para poder
 * resolver el ciclo que el propio sistema señala en PRJ-04).
 */

const STATUSES = ["Por hacer", "En progreso", "En revision", "Bloqueada", "Hecha"];

export function TaskStatusSelect({
  taskCode,
  status,
}: {
  taskCode: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      await updateTaskStatus(taskCode, next);
      router.refresh();
    });
  }

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      aria-label={`Estado de ${taskCode}`}
      className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-foreground focus:border-brand focus:outline-none disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function BreakDependencyButton({
  taskCode,
  dependsOnCode,
}: {
  taskCode: string;
  dependsOnCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function breakIt() {
    startTransition(async () => {
      await breakTaskDependency(taskCode);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={breakIt}
      disabled={pending}
      title={`Quita la dependencia de ${taskCode} sobre ${dependsOnCode}`}
      className="text-[11px] text-muted underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-50"
    >
      {pending ? "rompiendo…" : "romper dependencia"}
    </button>
  );
}
