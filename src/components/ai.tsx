"use client";

import { useState } from "react";

/**
 * La parte visible del componente de IA.
 *
 * Dos detalles deliberados: el borrador nunca se guarda solo — se muestra para
 * que una persona lo copie al campo y lo confirme — y la interfaz siempre dice
 * si el texto lo escribió el modelo o la plantilla determinista. Ocultar esa
 * diferencia sería vender como IA algo que puede no serlo.
 */

type AiResponse = { text: string; source: "modelo" | "plantilla"; note?: string };

function SourceTag({ source, note }: { source: AiResponse["source"]; note?: string }) {
  const isModel = source === "modelo";
  return (
    <span
      title={note ? `Se usó la plantilla: ${note}` : undefined}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        isModel
          ? "bg-violet-50 text-violet-800 ring-violet-200"
          : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {isModel ? "redactado por el modelo" : "plantilla determinista"}
    </span>
  );
}

const button =
  "rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-surface-2 disabled:opacity-50";

export function NextStepDraft({ code, asOf }: { code: string; asOf: string }) {
  const [result, setResult] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/next-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, asOf }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Error inesperado");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-xs text-muted">
        Propone una redacción del siguiente paso a partir de las tareas, los bloqueos y las
        señales del proyecto. No se guarda: cópialo al campo si te sirve.
      </p>
      <button type="button" onClick={draft} disabled={loading} className={button}>
        {loading ? "Redactando…" : "Proponer redacción"}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}

      {result && (
        <div className="space-y-1.5 rounded border border-line bg-surface-2 px-3 py-2">
          <p className="text-sm">{result.text}</p>
          <div className="flex items-center gap-2">
            <SourceTag source={result.source} note={result.note} />
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(result.text)}
              className="text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline"
            >
              copiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExecutiveSummary({ asOf }: { asOf: string }) {
  const [result, setResult] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai/resumen?asOf=${asOf}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Error inesperado");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-xs text-muted">
        Redacta el resumen del comité a partir de las colas ya calculadas. El modelo escribe;
        las prioridades las decidió el motor determinista.
      </p>
      <button type="button" onClick={generate} disabled={loading} className={button}>
        {loading ? "Redactando…" : "Generar resumen del comité"}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}

      {result && (
        <div className="space-y-2 rounded border border-line bg-surface-2 px-3 py-2">
          {result.text.split("\n").filter(Boolean).map((line, i) => (
            <p key={i} className="text-sm leading-relaxed">
              {line}
            </p>
          ))}
          <SourceTag source={result.source} note={result.note} />
        </div>
      )}
    </div>
  );
}
