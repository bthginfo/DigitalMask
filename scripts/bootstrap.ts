import nextEnv from "@next/env";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const { db, sqlClient } = await import("../src/platform/db/index");
const { organizations, departments, memberships, records } =
  await import("../src/platform/db/schema");
const { defaultCalendarCategories } = await import("../src/shared/calendar-categories");
const { defaultDomainCategories } = await import("../src/shared/domain-categories");
const { eq } = await import("drizzle-orm");
const { auth } = await import("../src/platform/auth/index");
await db
  .insert(organizations)
  .values({ id: "stadttheater-ingolstadt", name: "Stadttheater Ingolstadt" })
  .onConflictDoNothing();
const createdDepartment = await db
  .insert(departments)
  .values({ id: "maske", organizationId: "stadttheater-ingolstadt", name: "Maske" })
  .onConflictDoNothing()
  .returning();
const [existing] = await db
  .select({ id: memberships.id })
  .from(memberships)
  .where(eq(memberships.role, "superadmin"))
  .limit(1);
if (existing) {
  console.log("Superadmin exists. No account or password changed.");
} else {
  const username = process.env.BOOTSTRAP_USERNAME || "superadmin";
  const password = process.env.BOOTSTRAP_PASSWORD || randomBytes(24).toString("base64url");
  const result = await auth.api.signUpEmail({
    body: {
      name: process.env.BOOTSTRAP_NAME || "Administration",
      username,
      email: `${crypto.randomUUID()}@users.digitalmask.invalid`,
      password,
    },
  });
  await db.insert(memberships).values({
    id: crypto.randomUUID(),
    userId: result.user.id,
    organizationId: "stadttheater-ingolstadt",
    departmentId: "maske",
    role: "superadmin",
    status: "active",
  });
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/ADMIN-ZUGANG.txt",
    `DigitalMask Superadmin\n\nAdresse: ${process.env.APP_URL || "http://localhost:3000"}\nBenutzername: ${username}\nPasswort: ${password}\n\nBitte nach der ersten Anmeldung in den Einstellungen ändern.\nDiese Datei ist von Git ausgeschlossen.\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log("Superadmin created. Credentials saved in ignored .local/ADMIN-ZUGANG.txt.");
}
if (createdDepartment.length) {
  const [admin] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.role, "superadmin"))
    .limit(1);
  if (admin)
    await db
      .insert(records)
      .values(
        defaultCalendarCategories.map((category) => ({
          id: `category:maske:${category.key}`,
          kind: "calendarCategories" as const,
          organizationId: "stadttheater-ingolstadt",
          departmentId: "maske",
          createdBy: admin.userId,
          data: { ...category },
        })),
      )
      .onConflictDoNothing();
  if (admin)
    await db
      .insert(records)
      .values(
        defaultDomainCategories.map((category) => ({
          id: `domain-category:maske:${category.scope}:${category.key}`,
          kind: "categories" as const,
          organizationId: "stadttheater-ingolstadt",
          departmentId: "maske",
          createdBy: admin.userId,
          data: { ...category },
        })),
      )
      .onConflictDoNothing();
}
await sqlClient.end();
