"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";
import {
  addBlocker,
  addNote,
  createProject,
  resolveBlocker,
  setPriorityOverride,
  updateProject,
} from "@/lib/actions";

/**
 * Los formularios de escritura.
 *
 * Server actions con `useActionState`: sin estado de cliente que sincronizar y
 * sin capa de fetch a mano. El error que devuelve la acción se muestra tal cual,
 * porque las validaciones del dominio (como exigir razón para el override) son
 * mensajes que la persona necesita leer.
 */

const input =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-accent-ring";
const labelClass = "block text-xs font-medium text-muted mb-1.5";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-soft disabled:opacity-50"
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok) {
    return <p className="text-xs font-medium text-accent-ink">Guardado.</p>;
  }
  return <p className="text-xs text-red-700">{state.error}</p>;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export type MemberOption = { alias: string; inSourceTeamSheet: boolean };

function MemberSelect({
  name,
  members,
  defaultValue,
}: {
  name: string;
  members: MemberOption[];
  defaultValue: string | null;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={input}>
      <option value="">— sin asignar —</option>
      {members.map((m) => (
        <option key={m.alias} value={m.alias}>
          {m.alias}
          {m.inSourceTeamSheet ? "" : " (fuera del equipo registrado)"}
        </option>
      ))}
    </select>
  );
}

/** Los siete campos que el enunciado exige poder guardar, menos la prioridad. */
export function ProjectForm({
  code,
  members,
  defaults,
}: {
  code: string;
  members: MemberOption[];
  defaults: {
    name: string;
    status: string;
    stage: string;
    ownerAlias: string | null;
    targetDate: string | null;
    nextStep: string | null;
    nextStepOwnerAlias: string | null;
    nextStepDueDate: string | null;
    derivedNextStep: string | null;
  };
}) {
  const [state, action] = useActionState(updateProject.bind(null, code), null);

  return (
    <form action={action} className="space-y-3 px-4 py-3">
      <Field label="Nombre">
        <input name="name" defaultValue={defaults.name} className={input} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Estado">
          <select name="status" defaultValue={defaults.status} className={input}>
            {["Activo", "Pausado", "Cerrado"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Etapa">
          <select name="stage" defaultValue={defaults.stage} className={input}>
            {["Descubrimiento", "Ejecucion"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsable">
          <MemberSelect
            name="ownerAlias"
            members={members}
            defaultValue={defaults.ownerAlias}
          />
        </Field>
        <Field
          label="Fecha límite"
          hint={defaults.targetDate ? undefined : "Sin fecha, el proyecto cae en DECIDIR"}
        >
          <input
            type="date"
            name="targetDate"
            defaultValue={defaults.targetDate ?? ""}
            className={input}
          />
        </Field>
      </div>

      <Field
        label="Siguiente paso"
        hint={
          defaults.nextStep
            ? "Escrito a mano: manda sobre el derivado."
            : defaults.derivedNextStep
              ? `Ahora se muestra el derivado del grafo de tareas: «${defaults.derivedNextStep}». Escribe aquí para fijar otro.`
              : "No hay ninguna tarea arrancable de la que derivarlo. Escríbelo a mano."
        }
      >
        <input
          name="nextStep"
          defaultValue={defaults.nextStep ?? ""}
          placeholder={defaults.derivedNextStep ?? "Define el siguiente paso"}
          className={input}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Responsable del siguiente paso">
          <MemberSelect
            name="nextStepOwnerAlias"
            members={members}
            defaultValue={defaults.nextStepOwnerAlias}
          />
        </Field>
        <Field label="Fecha del siguiente paso">
          <input
            type="date"
            name="nextStepDueDate"
            defaultValue={defaults.nextStepDueDate ?? ""}
            className={input}
          />
        </Field>
      </div>

      <input type="hidden" name="actor" value="Operación" />
      <div className="flex items-center gap-3">
        <Submit>Guardar cambios</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * Override de prioridad.
 *
 * La razón es obligatoria y el propio formulario lo dice: se puede contradecir
 * al score, pero no en silencio.
 */
export function OverrideForm({
  code,
  currentPriority,
  currentReason,
  computedPriority,
  score,
}: {
  code: string;
  currentPriority: string | null;
  currentReason: string | null;
  computedPriority: string;
  score: number;
}) {
  const [state, action] = useActionState(setPriorityOverride.bind(null, code), null);
  const [priority, setPriority] = useState(currentPriority ?? "");

  return (
    <form action={action} className="space-y-3 px-4 py-3">
      <p className="text-xs text-muted">
        El criterio calculado dice{" "}
        <strong className="text-foreground">{computedPriority}</strong> (score{" "}
        <span className="tabular">{score.toFixed(1)}</span>). Puedes fijar otra prioridad,
        pero queda registrada con su razón.
      </p>

      <Field label="Prioridad manual">
        <select
          name="priorityOverride"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className={input}
        >
          <option value="">— usar el criterio calculado —</option>
          {["Critica", "Alta", "Media", "Baja"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      {priority && (
        <Field label="Razón (obligatoria)">
          <textarea
            name="overrideReason"
            rows={3}
            defaultValue={currentReason ?? ""}
            placeholder="¿Por qué este proyecto va antes que lo que dice el criterio?"
            className={input}
          />
        </Field>
      )}

      <input type="hidden" name="actor" value="Operación" />
      <div className="flex items-center gap-3">
        <Submit>{priority ? "Fijar prioridad" : "Volver al criterio"}</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function NoteForm({ code }: { code: string }) {
  const [state, action] = useActionState(addNote.bind(null, code), null);

  return (
    <form action={action} className="space-y-2 px-4 py-3">
      <textarea
        name="body"
        rows={2}
        placeholder="Añade una nota al proyecto…"
        className={input}
      />
      <input
        name="author"
        placeholder="Tu nombre"
        defaultValue="Operación"
        className={input}
      />
      <div className="flex items-center gap-3">
        <Submit>Añadir nota</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * Cierra un bloqueo.
 *
 * Importa más de lo que parece: resolver el último bloqueo externo de un
 * proyecto lo saca de la cola ESCALAR y lo devuelve a EJECUTAR. Es la operación
 * que cierra el ciclo de vida completo — se registra un bloqueo, se escala, se
 * resuelve, y el portafolio se reordena solo.
 */
export function ResolveBlockerButton({
  code,
  blockerId,
}: {
  code: string;
  blockerId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve() {
    startTransition(async () => {
      const result = await resolveBlocker(code, blockerId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={resolve}
        disabled={pending}
        className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-brand transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "resolviendo…" : "resolver"}
      </button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function BlockerForm({
  code,
  members,
}: {
  code: string;
  members: MemberOption[];
}) {
  const [state, action] = useActionState(addBlocker.bind(null, code), null);

  return (
    <form action={action} className="space-y-3 px-4 py-3">
      <Field
        label="Descripción del bloqueo"
        hint="Si no eliges tipo, el sistema lo clasifica leyendo el texto."
      >
        <textarea
          name="description"
          rows={2}
          placeholder="Esperando credenciales del API del cliente…"
          className={input}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo">
          <select name="kind" defaultValue="" className={input}>
            <option value="">— detectar del texto —</option>
            <option value="EXTERNO">Externo (se escala)</option>
            <option value="INTERNO">Interno (se trabaja)</option>
          </select>
        </Field>
        <Field label="Dueño de la escalación">
          <MemberSelect name="ownerAlias" members={members} defaultValue={null} />
        </Field>
        <Field label="Fecha de respuesta">
          <input type="date" name="dueBy" className={input} />
        </Field>
      </div>

      <input type="hidden" name="actor" value="Operación" />
      <div className="flex items-center gap-3">
        <Submit>Registrar bloqueo</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function CreateProjectForm({ members }: { members: MemberOption[] }) {
  const [state, action] = useActionState(createProject, null);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del proyecto">
          <input name="name" placeholder="Motor de cotización" className={input} required />
        </Field>
        <Field label="Cliente">
          <input name="clientAlias" placeholder="Atlas Foods" className={input} required />
        </Field>
        <Field label="Código" hint="Si lo dejas vacío se genera automáticamente.">
          <input name="code" placeholder="PRJ-23" className={input} />
        </Field>
        <Field label="Responsable">
          <MemberSelect name="ownerAlias" members={members} defaultValue={null} />
        </Field>
        <Field label="Tipo de trabajo">
          <select name="engagementType" defaultValue="Proyecto" className={input}>
            {["Proyecto", "Mantenimiento o recurrente", "Diagnostico"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Naturaleza">
          <select name="projectTypeApi" defaultValue="Automatizacion" className={input}>
            {["Automatizacion", "Consultoria"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Etapa">
          <select name="stage" defaultValue="Descubrimiento" className={input}>
            {["Descubrimiento", "Ejecucion"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de inicio">
          <input type="date" name="startDate" className={input} />
        </Field>
        <Field
          label="Fecha límite"
          hint="Si la dejas vacía, el proyecto nace en la cola DECIDIR."
        >
          <input type="date" name="targetDate" className={input} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Valor de negocio">
            <input name="businessValue" placeholder="25000" className={input} />
          </Field>
          <Field label="Moneda">
            <select name="currency" defaultValue="USD" className={input}>
              <option value="USD">USD</option>
              <option value="COP">COP</option>
            </select>
          </Field>
        </div>
      </div>

      <Field label="Siguiente paso" hint="Opcional: si no hay tareas, no se puede derivar.">
        <input name="nextStep" placeholder="Agendar el kick off" className={input} />
      </Field>

      <Field label="Resumen">
        <textarea name="summary" rows={2} className={input} />
      </Field>

      <input type="hidden" name="actor" value="Operación" />
      <div className="flex items-center gap-3">
        <Submit>Crear proyecto</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}
