import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { db } from "@/platform/db";
import * as schema from "@/platform/db/schema";
import { usernamePattern } from "@/shared/auth-feedback";
/** Sessions last a week and are extended (cookie included) at most once a day. */
export const sessionExpiresIn = 60 * 60 * 24 * 7;
export const sessionUpdateAge = 60 * 60 * 24;
export const auth = betterAuth({
  appName: "DigitalMask",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
      usernameValidator: (value) => usernamePattern.test(value),
    }),
  ],
  // Only effective for a mounted auth handler. DigitalMask calls auth.api.* from its own
  // routes, which throttle per IP and per username (src/platform/auth/throttle.ts).
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/username": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  session: {
    expiresIn: sessionExpiresIn,
    updateAge: sessionUpdateAge,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
});
