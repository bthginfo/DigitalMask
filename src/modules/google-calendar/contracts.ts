export type GoogleCalendarSelection = {
  mode: "mine" | "people" | "team";
  memberIds: string[];
  productionId?: string;
  category?: string;
};

export type GoogleCalendarDestination = { id: string; name: string; primary: boolean };

export type GoogleCalendarStatus = {
  configured: boolean;
  connection: {
    email: string;
    calendarId: string | null;
    calendarName: string | null;
    selection: GoogleCalendarSelection;
    status: "connected" | "active" | "reconnect";
    lastSyncedAt: string | null;
    error: string | null;
  } | null;
};

export const googleCalendarMessages: Record<string, string> = {
  connected: "Google ist verbunden. Wähle jetzt den Zielkalender und die Personen aus.",
  cancelled:
    "Die Google-Verbindung wurde abgebrochen. Deine bisherigen Einstellungen bleiben erhalten.",
  permissions:
    "Bitte erlaube beide Kalenderberechtigungen bei Google, damit die Verbindung funktioniert.",
  account:
    "Es ist bereits ein anderes Google-Konto verbunden. Trenne es zuerst, um das Konto zu wechseln.",
  expired: "Die Anmeldung ist abgelaufen. Starte die Google-Verbindung bitte erneut.",
  failed: "Google konnte gerade nicht verbunden werden. Bitte versuche es erneut.",
};
