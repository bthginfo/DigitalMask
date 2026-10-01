import { z } from "zod";

export const usernamePattern = /^[a-zA-Z0-9_.-]{3,32}$/;
const usernameField = z
  .string()
  .trim()
  .regex(
    usernamePattern,
    "Der Benutzername braucht 3 bis 32 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich. Verwende deinen Benutzernamen, nicht deinen vollständigen Namen.",
  );
export const loginInput = z.object({
  username: usernameField,
  password: z
    .string()
    .min(1, "Bitte gib dein Passwort ein.")
    .max(128, "Das Passwort darf höchstens 128 Zeichen haben."),
});
export const registrationInput = z.object({
  username: usernameField,
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib deinen Namen ein.")
    .max(100, "Der Name darf höchstens 100 Zeichen haben."),
  password: z
    .string()
    .min(10, "Dein Passwort braucht mindestens 10 Zeichen.")
    .max(128, "Das Passwort darf höchstens 128 Zeichen haben."),
});

/** Translate provider codes without exposing account existence on sign-in. */
export function authFeedback(code: unknown, status: number, registering = false) {
  if (status === 429)
    return "Zu viele Anmeldeversuche. Bitte warte eine Minute und versuche es dann erneut.";
  if (code === "USERNAME_IS_ALREADY_TAKEN" || (registering && code === "USER_ALREADY_EXISTS"))
    return "Dieser Benutzername ist bereits vergeben. Wähle einen anderen oder melde dich mit deinem bestehenden Zugang an.";
  if (["INVALID_USERNAME", "USERNAME_TOO_SHORT", "USERNAME_TOO_LONG"].includes(String(code)))
    return "Der Benutzername braucht 3 bis 32 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.";
  if (["PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"].includes(String(code)))
    return "Dein Passwort braucht 10 bis 128 Zeichen.";
  if (code === "INVALID_USERNAME_OR_PASSWORD" || (!registering && status === 401))
    return "Benutzername oder Passwort stimmt nicht. Verwende den Benutzernamen, den du bei der Registrierung gewählt hast, nicht deinen Anzeigenamen. Prüfe auch Tippfehler und die Groß- und Kleinschreibung im Passwort.";
  if (code === "EMAIL_NOT_VERIFIED")
    return "Dein Zugang ist noch nicht bestätigt. Bitte wende dich an einen Admin.";
  return registering
    ? "Dein Zugang konnte gerade nicht erstellt werden. Bitte versuche es erneut."
    : "Die Anmeldung ist gerade nicht möglich. Bitte versuche es erneut.";
}
