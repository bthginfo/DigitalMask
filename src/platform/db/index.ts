import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { databaseConnectionUrl } from "./environment";
const globalDb = globalThis as unknown as { digitalMaskSql?: ReturnType<typeof postgres> };
export const sqlClient =
  globalDb.digitalMaskSql ??
  postgres(databaseConnectionUrl(process.env), {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalDb.digitalMaskSql = sqlClient;
export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
