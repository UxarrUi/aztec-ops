import { describe, expect, it } from "vitest";
import { classifyBlockerText } from "@/lib/rules";

/**
 * La clasificación EXTERNO/INTERNO decide a qué cola va un proyecto, así que
 * merece sus propios casos — incluidos los negativos.
 *
 * Los positivos son fáciles de acertar ensanchando la lista de palabras; lo
 * difícil es no romper los negativos. Un clasificador que marque todo como
 * externo mandaría el portafolio entero a ESCALAR y el sistema dejaría de
 * servir. Estos tests son el freno.
 */

describe("classifyBlockerText — externos", () => {
  const externos = [
    // Los tres textos que trae el dataset.
    "Waiting on client response, credentials, external API or business definition.",
    "Blocked by permissions, repository access or owner confirmation.",
    "There are external dependencies or pending accesses.",
    // Redacción libre en español: el caso que falló al probar la aplicación.
    "Esperando que el área legal del cliente firme el NDA para ver los datos.",
    "Pendiente de aprobación del cliente",
    "Falta que el proveedor entregue las credenciales de acceso",
    "Sin autorización para conectarnos a su base de datos",
  ];

  for (const texto of externos) {
    it(`«${texto.slice(0, 45)}…» es externo`, () => {
      expect(classifyBlockerText(texto)).toBe("EXTERNO");
    });
  }

  it("ignora los acentos: aprobación y aprobacion se tratan igual", () => {
    expect(classifyBlockerText("Pendiente de aprobación del cliente")).toBe("EXTERNO");
    expect(classifyBlockerText("Pendiente de aprobacion del cliente")).toBe("EXTERNO");
  });
});

describe("classifyBlockerText — internos", () => {
  const internos = [
    // El texto interno del dataset.
    "A recurrent technical or operational dependency is hurting stability or improvements.",
    // Trabajo técnico nuestro: no debe irse a ESCALAR por mencionar un sistema.
    "Hay que refactorizar el módulo de cotización, genera errores manuales",
    "El pipeline de datos falla de forma intermitente y no sabemos por qué",
    "Falta cobertura de tests en el extractor antes de poder tocarlo",
    "Pendiente de refactorizar el conector antes de la siguiente iteración",
  ];

  for (const texto of internos) {
    it(`«${texto.slice(0, 45)}…» es interno`, () => {
      expect(classifyBlockerText(texto)).toBe("INTERNO");
    });
  }
});
