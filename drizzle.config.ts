import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
});
