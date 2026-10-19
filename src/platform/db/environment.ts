/** Development must opt into its own database instead of inheriting production .env.local. */
export function databaseConnectionUrl(env: Record<string, string | undefined>): string {
  if (env.NODE_ENV === "development") {
    const development = env.DEVELOPMENT_DATABASE_URL || env.DEV_DATABASE_URL;
    if (!development)
      throw new Error(
        "Für die lokale Entwicklung fehlt DEVELOPMENT_DATABASE_URL. Bitte die separate Entwicklungsdatenbank in .env.development.local konfigurieren.",
      );
    return development;
  }
  return env.DATABASE_URL || "postgresql://localhost/digitalmask";
}
