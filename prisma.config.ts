import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env["DATABASE_URL"] ?? "file:./prisma/dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url },
  adapter: async () => new PrismaBetterSqlite3({ url }),
});
