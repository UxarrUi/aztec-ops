import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * El CLI de Prisma trabaja contra `datasource.url`. El adaptador de SQLite
 * (`@prisma/adapter-better-sqlite3`) lo construye en tiempo de ejecución quien
 * abre el cliente: `src/lib/db.ts` para la aplicación y `prisma/seed.ts` para
 * la carga inicial.
 */
const url = process.env["DATABASE_URL"] ?? "file:./prisma/dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url },
});
