import { describe, expect, it } from "vitest";
import { databaseConnectionUrl } from "@/platform/db/environment";

describe("database environment isolation", () => {
  it("refuses to silently run development against the production fallback", () => {
    expect(() =>
      databaseConnectionUrl({ NODE_ENV: "development", DATABASE_URL: "production" }),
    ).toThrow("Entwicklungsdatenbank");
  });
  it("uses only an explicit development URL in development", () => {
    expect(
      databaseConnectionUrl({
        NODE_ENV: "development",
        DATABASE_URL: "production",
        DEVELOPMENT_DATABASE_URL: "development",
      }),
    ).toBe("development");
  });
  it("keeps the production connection independent of local development settings", () => {
    expect(
      databaseConnectionUrl({
        NODE_ENV: "production",
        DATABASE_URL: "production",
        DEVELOPMENT_DATABASE_URL: "development",
      }),
    ).toBe("production");
  });
});
