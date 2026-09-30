import { describe, expect, it } from "vitest";
import { profileUpdateSchema } from "../src/modules/profile/schema";
import { validateRecord } from "../src/modules/records/schemas";

describe("personal preferences and feedback input", () => {
  it("accepts independent preference updates without requiring another field", () => {
    expect(profileUpdateSchema.parse({ accentPalette: "lavender" })).toEqual({
      accentPalette: "lavender",
    });
    expect(profileUpdateSchema.parse({ onboardingCompleted: true })).toEqual({
      onboardingCompleted: true,
    });
  });
  it("rejects other-account targeting, invalid colors and onboarding rollback", () => {
    for (const input of [
      {},
      { userId: "other", accentPalette: "rose" },
      { accentPalette: "red" },
      { onboardingCompleted: false },
    ])
      expect(profileUpdateSchema.safeParse(input).success).toBe(false);
  });
  it("requires a feedback type and title and validates moderation status", () => {
    expect(validateRecord("feedback", { type: "bug", title: " Kalender " })).toMatchObject({
      title: "Kalender",
      status: "new",
      description: "",
    });
    expect(() => validateRecord("feedback", { type: "bug", title: "" })).toThrow();
    expect(() =>
      validateRecord("feedback", { type: "bug", title: "Fehler", status: "approved" }),
    ).toThrow();
  });
});
