import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

import * as schema from "./schema";

declare global {
  var __drawToSearchDb__: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

export function getDb() {
  if (!env.DATABASE_URL) {
    return null;
  }

  if (!globalThis.__drawToSearchDb__) {
    const connection = postgres(env.DATABASE_URL, {
      max: 1,
      prepare: false,
    });

    globalThis.__drawToSearchDb__ = drizzle(connection, { schema });
  }

  return globalThis.__drawToSearchDb__;
}
