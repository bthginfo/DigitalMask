import { loadScriptEnvironment } from "./environment";
loadScriptEnvironment(process.argv.includes("--development"));
const { migrate } = await import("drizzle-orm/postgres-js/migrator");
const { db, sqlClient } = await import("../src/platform/db/index");
await migrate(db, { migrationsFolder: "drizzle" });
console.log("DigitalMask migrations applied.");
await sqlClient.end();
