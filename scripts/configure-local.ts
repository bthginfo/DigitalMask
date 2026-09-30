import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
let text = await readFile(".env.local", "utf8");
for (const key of ["BETTER_AUTH_SECRET", "CRON_SECRET"]) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const existing = text.match(pattern)?.[0];
  if (!existing || existing === `${key}=`) {
    const entry = `${key}=${randomBytes(48).toString("base64url")}`;
    text = existing ? text.replace(pattern, entry) : `${text}\n${entry}\n`;
  }
}
await writeFile(".env.local", text, { encoding: "utf8", mode: 0o600 });
console.log("Local server secrets configured without logging values.");
