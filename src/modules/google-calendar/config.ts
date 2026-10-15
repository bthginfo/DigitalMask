export const googleCalendarScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
] as const;

export const googleCalendarCallbackPath = "/api/integrations/google-calendar/callback";

export function googleCalendarConfigured() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    /^[a-f\d]{64}$/i.test(process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY || ""),
  );
}

export function googleCalendarConfig() {
  if (!googleCalendarConfigured()) throw new Error("GoogleCalendarNotConfigured");
  const base = new URL(process.env.APP_URL || "http://localhost:3000");
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname))
    throw new Error("GoogleCalendarInvalidOrigin");
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
    origin: base.origin,
    redirectUri: new URL(googleCalendarCallbackPath, base.origin).toString(),
  };
}
