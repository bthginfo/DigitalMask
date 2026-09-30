"use client";
import { useState } from "react";
import { Check, Copy, KeyRound, Link as LinkIcon, ShieldCheck } from "lucide-react";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, ErrorMessage, Modal, PageHeader, Section } from "../ui";
import { ThemeSwitch } from "../theme-switch";
import { PasswordInput } from "../password-input";
export function SettingsModule() {
  const { workspace, action, busy } = useWorkspace();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [reset, setReset] = useState<{ name: string; code: string } | null>(null);
  const admin = workspace.user.role !== "user";
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    setNotice("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    }
  };
  const password = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("newPassword") !== data.get("repeat")) {
      setError("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    await run(async () => {
      await action("password-change", undefined, {
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
      });
      form.reset();
      setNotice("Dein Passwort wurde geändert.");
    });
  };
  const subscription = async () => {
    const result = (await run(() => action("calendar-token"))) as { url?: string } | undefined;
    if (result?.url) setUrl(new URL(result.url, location.origin).toString());
  };
  return (
    <>
      <PageHeader
        eyebrow="DEIN ARBEITSRAUM"
        title="Einstellungen"
        description="Darstellung, Kalenderanbindung und sichere Zugänge."
      />
      <ErrorMessage message={error} />
      {notice && (
        <p className="success-message" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <div className="settings-grid">
        <Section title="Darstellung">
          <div className="panel-content">
            <p className="muted">
              Wähle einen hellen oder dunklen Arbeitsraum. „System“ folgt automatisch deinem Gerät.
            </p>
            <ThemeSwitch full />
          </div>
        </Section>
        <Section title="Dein Profil">
          <div className="panel-content profile">
            <span className="avatar large-avatar">
              {workspace.user.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <h3>{workspace.user.name}</h3>
              <p className="muted">@{workspace.user.username}</p>
              <Badge tone="green">
                {workspace.user.role === "superadmin"
                  ? "Superadmin"
                  : workspace.user.role === "admin"
                    ? "Admin"
                    : "Teammitglied"}
              </Badge>
            </div>
          </div>
        </Section>
        <Section title="Passwort ändern">
          <form className="panel-content" onSubmit={password}>
            <PasswordInput
              label="Aktuelles Passwort"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
            <PasswordInput
              label="Neues Passwort"
              name="newPassword"
              autoComplete="new-password"
              minLength={10}
              required
              placeholder="Mindestens 10 Zeichen"
            />
            <PasswordInput
              label="Neues Passwort wiederholen"
              name="repeat"
              autoComplete="new-password"
              minLength={10}
              required
            />
            <Button variant="primary" type="submit" disabled={busy}>
              <KeyRound size={16} />
              Passwort speichern
            </Button>
          </form>
        </Section>
        <Section title="Outlook & andere Kalender">
          <div className="panel-content">
            <p className="muted">
              Abonniere deinen persönlichen Dienstplan in Outlook, Apple Kalender oder einer anderen
              Kalender-App. Der Link erlaubt Zugriff auf deine Termine.
            </p>
            <Button onClick={() => void subscription()} disabled={busy}>
              <LinkIcon size={16} />
              Kalenderlink erstellen / anzeigen
            </Button>
            {url && (
              <div className="subscription">
                <input readOnly aria-label="Kalenderabonnement URL" value={url} />
                <Button
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(url);
                      setNotice("Kalenderlink kopiert.");
                    })
                  }
                >
                  <Copy size={15} />
                  Kopieren
                </Button>
                <a className="button secondary" href={url}>
                  ICS öffnen
                </a>
              </div>
            )}
            <p className="small muted">
              In Outlook: Kalender hinzufügen → Aus dem Internet abonnieren. Bestehende Abonnements
              werden nach Widerruf ungültig.
            </p>
            <Button
              variant="danger-ghost"
              onClick={() => {
                if (
                  confirm(
                    "Kalenderlink widerrufen? Bestehende Abonnements verlieren ihren Zugriff.",
                  )
                )
                  void run(async () => {
                    await action("calendar-token", undefined, { revoke: true });
                    setUrl("");
                    setNotice("Kalenderlink widerrufen.");
                  });
              }}
            >
              Link widerrufen
            </Button>
          </div>
        </Section>
      </div>
      {admin && (
        <section className="panel margin-top">
          <header className="panel-heading">
            <div>
              <h2>Team & Berechtigungen</h2>
              <p className="small muted">
                Registrierungen freigeben, Zugänge verwalten und Passwörter zurücksetzen.
              </p>
            </div>
            <ShieldCheck size={20} className="accent" />
          </header>
          <div className="table-scroll">
            <table className="team-admin-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Zugang</th>
                  <th>Rolle</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {workspace.members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name}</strong>
                      <span className="small muted">@{member.username}</span>
                    </td>
                    <td data-label="Zugang">
                      <Badge
                        tone={
                          member.status === "active"
                            ? "green"
                            : member.status === "pending"
                              ? "coral"
                              : "neutral"
                        }
                      >
                        {member.status === "active"
                          ? "Aktiv"
                          : member.status === "pending"
                            ? "Freigabe ausstehend"
                            : "Deaktiviert"}
                      </Badge>
                    </td>
                    <td data-label="Rolle">
                      {workspace.user.role === "superadmin" && member.id !== workspace.user.id ? (
                        <select
                          aria-label={`Rolle von ${member.name}`}
                          disabled={busy}
                          value={member.role}
                          onChange={(event) =>
                            void run(() =>
                              action("member-update", member.id, { role: event.target.value }),
                            )
                          }
                        >
                          <option value="user">Teammitglied</option>
                          <option value="admin">Admin</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      ) : member.role === "superadmin" ? (
                        "Superadmin"
                      ) : member.role === "admin" ? (
                        "Admin"
                      ) : (
                        "Teammitglied"
                      )}
                    </td>
                    <td data-label="Aktionen">
                      <div className="inline-actions">
                        {member.id !== workspace.user.id && (
                          <>
                            {member.status !== "active" ? (
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    action("member-update", member.id, { status: "active" }),
                                  )
                                }
                              >
                                Freigeben
                              </Button>
                            ) : (
                              <Button
                                disabled={busy}
                                onClick={() => {
                                  if (confirm(`Zugang für ${member.name} deaktivieren?`))
                                    void run(() =>
                                      action("member-update", member.id, { status: "disabled" }),
                                    );
                                }}
                              >
                                Deaktivieren
                              </Button>
                            )}
                            <Button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const result = (await action("password-reset", member.id)) as {
                                    code: string;
                                  };
                                  setReset({ name: member.name, code: result.code });
                                })
                              }
                            >
                              Passwort zurücksetzen
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {reset && (
        <Modal title={`Passwort zurücksetzen · ${reset.name}`} onClose={() => setReset(null)}>
          <p className="muted">
            Gib diesen Wiederherstellungscode persönlich an {reset.name} weiter. Der Code ist
            vertraulich und wird hier nur einmal angezeigt.
          </p>
          <label>
            Wiederherstellungscode
            <input readOnly value={reset.code} />
          </label>
          <footer className="dialog-footer">
            <Button onClick={() => void navigator.clipboard.writeText(reset.code)}>
              <Copy size={15} />
              Kopieren
            </Button>
            <Button variant="primary" onClick={() => setReset(null)}>
              Schließen
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
