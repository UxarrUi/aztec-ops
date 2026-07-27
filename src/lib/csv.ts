/**
 * Lector de CSV mínimo pero correcto: respeta comillas, comas dentro de campos,
 * comillas escapadas (`""`) y saltos de línea dentro de un campo.
 *
 * Se implementa a mano en vez de traer una dependencia porque son 40 líneas y
 * el formato de entrada es conocido y fijo.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Convierte un CSV con encabezados en una lista de objetos. */
export function parseCsvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, (row[i] ?? "").trim()])),
  );
}
