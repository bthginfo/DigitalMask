import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { migrate } = await import("drizzle-orm/postgres-js/migrator");
const { db, sqlClient } = await import("../src/platform/db/index");
await migrate(db, { migrationsFolder: "drizzle" });
console.log("DigitalMask migrations applied.");
await sqlClient.end();
