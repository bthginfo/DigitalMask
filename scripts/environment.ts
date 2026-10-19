import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function loadScriptEnvironment(development = false) {
  if (!development) {
    nextEnv.loadEnvConfig(process.cwd());
    return;
  }
  const values = parseEnv(readFileSync(".env.development.local", "utf8"));
  const url = values.DEVELOPMENT_DATABASE_URL || values.DEV_DATABASE_URL;
  if (!url) throw new Error("DEVELOPMENT_DATABASE_URL fehlt in .env.development.local.");
  Object.assign(process.env, values, { DATABASE_URL: url, DEVELOPMENT_DATABASE_URL: url });
}
