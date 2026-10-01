import { describe, expect, it } from "vitest";
import { authFeedback, loginInput, registrationInput } from "../src/shared/auth-feedback";

describe("German authentication feedback", () => {
  it("accepts the same username syntax for login and registration and preserves passwords", () => {
    const credentials = { username: "  Lena-test_1.2  ", password: " leading space password " };
    expect(loginInput.parse(credentials)).toEqual({ ...credentials, username: "Lena-test_1.2" });
    expect(registrationInput.parse({ ...credentials, name: " Lena " }).name).toBe("Lena");
    expect(loginInput.safeParse({ ...credentials, username: "Lena Test" }).success).toBe(false);
  });
  it("explains incorrect login without identifying which credential exists", () => {
    expect(authFeedback("INVALID_USERNAME_OR_PASSWORD", 401)).toContain(
      "nicht deinen Anzeigenamen",
    );
    expect(authFeedback("unknown", 401)).toBe(authFeedback("INVALID_USERNAME_OR_PASSWORD", 401));
  });
  it("distinguishes duplicate registration, validation and throttling", () => {
    expect(authFeedback("USERNAME_IS_ALREADY_TAKEN", 400, true)).toContain("bereits vergeben");
    expect(authFeedback("INVALID_USERNAME", 422)).toContain("3 bis 32");
    expect(authFeedback(undefined, 429)).toContain("eine Minute");
    const input = registrationInput.safeParse({
      name: "Lena",
      username: "lena",
      password: "short",
    });
    expect(input.success).toBe(false);
    if (!input.success) expect(input.error.issues[0].message).toContain("mindestens 10");
  });
});
