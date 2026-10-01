"use client";
import { BrandMark } from "./brand-mark";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { post } from "@/shared/client-api";
import { Button, ErrorMessage, Modal } from "./ui";
import { ThemeSwitch } from "./theme-switch";
import { PasswordInput } from "./password-input";
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await post(register ? "/api/register" : "/api/login", {
        username: form.get("username"),
        password: form.get("password"),
        ...(register ? { name: form.get("name") } : {}),
      });
      if (register) setDone(true);
      else router.replace("/");
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es erneut."
          : e instanceof Error
            ? e.message
            : "Anmeldung fehlgeschlagen",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <Link href="/" prefetch={false} className="brand">
          <BrandMark />
          <span>
            digitalmask<span className="brand-sub">STADTTHEATER INGOLSTADT</span>
          </span>
        </Link>
        <div>
          <p className="eyebrow">HINTER DER BÜHNE. ALLES IM BLICK.</p>
          <h1>
            Mehr Zeit
            <br /> für die Maske.
          </h1>
          <p>
            Der gemeinsame Ort für Produktionen, Menschen und die vielen kleinen Dinge, die eine
            große Vorstellung möglich machen.
          </p>
          <div className="auth-line" />
          <span className="small">Dein Theater. Dein Team. Dein Arbeitsraum.</span>
        </div>
        <p className="small muted">Ein Arbeitsraum für die Abteilung Maske.</p>
      </aside>
      <section className="auth-main">
        <div className="auth-theme">
          <ThemeSwitch />
        </div>
        <div className="auth-form">
          {done ? (
            <>
              <ShieldCheck size={40} className="accent" />
              <h2>Du bist registriert.</h2>
              <p className="muted">
                Ein Admin gibt deinen Zugang frei. Danach kannst du dich mit deinem Benutzernamen
                anmelden.
              </p>
              <Link className="button primary" href="/login">
                Zur Anmeldung
                <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <p className="eyebrow">WILLKOMMEN IN DER MASKE</p>
              <h2>{register ? "Dein Zugang." : "Schön, dass du da bist."}</h2>
              <p className="muted">
                {register
                  ? "Registriere dich für den gemeinsamen Arbeitsraum."
                  : "Melde dich an und starte in deinen Tag."}
              </p>
              <form onSubmit={submit}>
                {register && (
                  <label>
                    Name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={100}
                      placeholder="Vor- und Nachname"
                    />
                  </label>
                )}
                <label>
                  Benutzername
                  <input
                    name="username"
                    aria-label="Benutzername"
                    aria-describedby="username-help"
                    autoComplete="username"
                    autoCapitalize="none"
                    required
                    minLength={3}
                    maxLength={32}
                    placeholder="Dein Benutzername"
                  />
                  <span className="small muted" id="username-help">
                    {register
                      ? "3–32 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich."
                      : "Dein bei der Registrierung gewählter Benutzername – nicht dein Anzeigename."}
                  </span>
                </label>
                <PasswordInput
                  label="Passwort"
                  name="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={register ? 10 : undefined}
                  placeholder={register ? "Mindestens 10 Zeichen" : "Dein Passwort"}
                />
                <ErrorMessage message={error} />
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Einen Moment …" : register ? "Zugang erstellen" : "Anmelden"}
                  <ArrowRight size={16} />
                </Button>
              </form>
              <p className="auth-switch">
                {register ? "Du hast bereits einen Zugang?" : "Neu im Team?"}{" "}
                <Link href={register ? "/login" : "/register"}>
                  {register ? "Anmelden" : "Jetzt registrieren"}
                </Link>
              </p>
              {!register && (
                <div className="auth-reset">
                  <p className="small muted">
                    Passwort vergessen? Ein Admin kann dir einen Wiederherstellungscode geben.
                  </p>
                  <button type="button" className="text-button" onClick={() => setResetOpen(true)}>
                    Passwort mit Code zurücksetzen
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      {resetOpen && <ResetPasswordForm onClose={() => setResetOpen(false)} />}
    </main>
  );
}
function ResetPasswordForm({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("repeat")) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("/api/reset-password", {
        username: form.get("username"),
        code: form.get("code"),
        password: form.get("password"),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zurücksetzen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={done ? "Dein Passwort wurde geändert." : "Passwort mit Code zurücksetzen"}
      onClose={onClose}
    >
      {done ? (
        <>
          <p className="muted">
            Du kannst dich jetzt mit deinem Benutzernamen und dem neuen Passwort anmelden.
          </p>
          <footer className="dialog-footer">
            <Button variant="primary" onClick={onClose}>
              Zur Anmeldung
            </Button>
          </footer>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="muted">
            Ein Admin erstellt deinen persönlichen Wiederherstellungscode. Verwende ihn hier, um ein
            neues Passwort festzulegen.
          </p>
          <label>
            Benutzername
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Wiederherstellungscode
            <input name="code" autoComplete="off" required />
          </label>
          <PasswordInput
            label="Neues Passwort"
            name="password"
            minLength={10}
            autoComplete="new-password"
            required
          />
          <PasswordInput
            label="Neues Passwort wiederholen"
            name="repeat"
            minLength={10}
            autoComplete="new-password"
            required
          />
          <ErrorMessage message={error} />
          <footer className="dialog-footer">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Wird geändert …" : "Neues Passwort speichern"}
            </Button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
