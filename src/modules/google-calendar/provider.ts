import { googleCalendarConfig, googleCalendarScopes } from "./config";
import type { GoogleCalendarDestination } from "./contracts";
import type { GoogleEventBody } from "./presentation";
import { googleRetryAfter } from "./retry";

export type GoogleTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export type GoogleRemoteEvent = {
  id: string;
  etag?: string;
  status?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export class GoogleCalendarError extends Error {
  constructor(
    public code:
      | "reconnect"
      | "permission"
      | "quota"
      | "unavailable"
      | "not-found"
      | "conflict"
      | "changed"
      | "ownership",
    public status = 0,
    public retryAfterMs = 0,
    public reason = "",
  ) {
    super(`GoogleCalendar:${code}`);
    this.name = `GoogleCalendar:${code}`;
  }
}

export function googleCalendarErrorMessage(error: unknown) {
  if (!(error instanceof GoogleCalendarError))
    return "Google ist gerade nicht erreichbar. Der Abgleich wird erneut versucht.";
  if (error.code === "reconnect")
    return "Die Google-Freigabe ist abgelaufen oder wurde widerrufen. Bitte verbinde Google erneut.";
  if (error.code === "permission")
    return "Google erlaubt den Zugriff auf den Zielkalender nicht. Bitte prüfe die Verbindung und wähle einen eigenen Kalender.";
  if (error.code === "ownership")
    return "Ein zugeordneter Google-Termin gehört nicht mehr zu DigitalMask. Er wurde zur Sicherheit nicht verändert.";
  if (error.code === "quota")
    return "Google begrenzt gerade die Anfragen. Dein Google-Konto bleibt verbunden. Deine Termine sind gespeichert; DigitalMask setzt den Abgleich nach einer Pause fort.";
  return "Google konnte den Abgleich gerade nicht abschließen. Deine DigitalMask-Termine sind gespeichert.";
}

async function tokenRequest(body: URLSearchParams) {
  const config = googleCalendarConfig();
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GoogleCalendarError("unavailable");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new GoogleCalendarError(
      data.error === "invalid_grant"
        ? "reconnect"
        : response.status === 429
          ? "quota"
          : "unavailable",
      response.status,
      googleRetryAfter(response.headers.get("Retry-After")),
    );
  if (
    typeof data.access_token !== "string" ||
    typeof data.expires_in !== "number" ||
    data.expires_in <= 0
  )
    throw new GoogleCalendarError("unavailable");
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}

export async function exchangeGoogleCode(code: string, verifier: string) {
  const data = await tokenRequest(
    new URLSearchParams({
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: googleCalendarConfig().redirectUri,
    }),
  );
  const granted = new Set((data.scope || "").split(" "));
  if (
    googleCalendarScopes
      .filter((scope) => scope.startsWith("https:"))
      .some((scope) => !granted.has(scope))
  )
    throw new GoogleCalendarError("permission");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshGoogleTokens(tokens: GoogleTokens): Promise<GoogleTokens> {
  if (!tokens.refreshToken) throw new GoogleCalendarError("reconnect");
  const data = await tokenRequest(
    new URLSearchParams({ refresh_token: tokens.refreshToken, grant_type: "refresh_token" }),
  );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getGoogleIdentity(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (!response.ok || !data.sub || !data.email || !data.email_verified)
    throw new GoogleCalendarError("reconnect");
  return { subject: data.sub, email: data.email };
}

export async function revokeGoogleTokens(tokens: GoogleTokens) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    body: new URLSearchParams({ token: tokens.refreshToken || tokens.accessToken }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  // An already-revoked token needs no further action.
  if (!response.ok && response.status !== 400)
    throw new GoogleCalendarError("unavailable", response.status);
}

export class GoogleCalendarClient {
  private nextRequestAt = 0;
  private slots = Promise.resolve();
  constructor(
    private accessToken: string,
    private intervalMs = 650,
  ) {}

  private async waitForSlot() {
    const slot = this.slots.then(async () => {
      const delay = this.nextRequestAt - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.nextRequestAt = Date.now() + this.intervalMs;
    });
    this.slots = slot.catch(() => {});
    await slot;
  }

  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    etag?: string,
  ): Promise<T> {
    await this.waitForSlot();
    let response: Response;
    try {
      response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(etag ? { "If-Match": etag } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new GoogleCalendarError("unavailable");
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: { errors?: { reason?: string }[] };
      };
      const reasons = [
        "rateLimitExceeded",
        "userRateLimitExceeded",
        "quotaExceeded",
        "calendarUsageLimitsExceeded",
      ];
      const limited = data.error?.errors?.find((item) =>
        reasons.includes(item.reason || ""),
      )?.reason;
      throw new GoogleCalendarError(
        response.status === 401
          ? "reconnect"
          : response.status === 429 || limited
            ? "quota"
            : response.status === 403
              ? "permission"
              : [404, 410].includes(response.status)
                ? "not-found"
                : response.status === 409
                  ? "conflict"
                  : response.status === 412
                    ? "changed"
                    : "unavailable",
        response.status,
        googleRetryAfter(response.headers.get("Retry-After")),
        limited || "",
      );
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  async calendars(): Promise<GoogleCalendarDestination[]> {
    const result: GoogleCalendarDestination[] = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({
        minAccessRole: "owner",
        maxResults: "250",
        ...(pageToken ? { pageToken } : {}),
      });
      const page = await this.request<{
        items?: {
          id: string;
          summary: string;
          summaryOverride?: string;
          primary?: boolean;
          accessRole: string;
          deleted?: boolean;
        }[];
        nextPageToken?: string;
      }>(`users/me/calendarList?${query}`);
      for (const item of page.items || [])
        if (item.accessRole === "owner" && !item.deleted)
          result.push({
            id: item.id,
            name: item.summaryOverride || item.summary,
            primary: item.primary === true,
          });
      pageToken = page.nextPageToken || "";
      if (result.length > 1000) throw new GoogleCalendarError("unavailable");
    } while (pageToken);
    return result.sort(
      (a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "de"),
    );
  }

  async destination(id: string): Promise<GoogleCalendarDestination> {
    const item = await this.request<{
      id: string;
      summary: string;
      summaryOverride?: string;
      primary?: boolean;
      accessRole: string;
      deleted?: boolean;
    }>(`users/me/calendarList/${encodeURIComponent(id)}`);
    if (item.accessRole !== "owner" || item.deleted) throw new GoogleCalendarError("permission");
    return {
      id: item.id,
      name: item.summaryOverride || item.summary,
      primary: item.primary === true,
    };
  }

  event(calendarId: string, eventId: string) {
    return this.request<GoogleRemoteEvent>(
      `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  }
  insert(calendarId: string, id: string, body: GoogleEventBody) {
    return this.request<GoogleRemoteEvent>(
      `calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      "POST",
      { ...body, id },
    );
  }
  update(calendarId: string, id: string, body: GoogleEventBody, etag: string) {
    return this.request<GoogleRemoteEvent>(
      `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=none`,
      "PUT",
      body,
      etag,
    );
  }
  remove(calendarId: string, id: string, etag: string) {
    return this.request<void>(
      `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=none`,
      "DELETE",
      undefined,
      etag,
    );
  }
}
