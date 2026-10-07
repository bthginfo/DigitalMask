import { z } from "zod";
import { accentPalettes } from "@/shared/contracts";
const effectiveDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((date) => {
    const parsed = new Date(`${date}T12:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date &&
      date >= "2000-01-01" &&
      date <= "2200-12-31"
    );
  }, "Bitte wähle ein gültiges Datum zwischen 2000 und 2200.");
export const workingTimeUpdateSchema = z
  .object({
    effectiveFrom: effectiveDate,
    weeklyMinutes: z.number().int().min(0).max(10080),
    workingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Wähle jeden Soll-Tag nur einmal."),
    openingBalanceSeconds: z.number().int().min(-360000000).max(360000000),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const workingTimeDeleteSchema = z
  .object({
    effectiveFrom: effectiveDate,
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const profileUpdateSchema = z
  .object({
    accentPalette: z.enum(accentPalettes).optional(),
    onboardingCompleted: z.literal(true).optional(),
    memberId: z.string().min(1).max(100).optional(),
    workingTime: workingTimeUpdateSchema.optional(),
    workingTimeDelete: workingTimeDeleteSchema.optional(),
  })
  .refine(
    (data) =>
      (!data.workingTime && !data.workingTimeDelete) ||
      (!data.accentPalette && !data.onboardingCompleted),
    "Speichere Wochenstunden und Darstellungsänderungen getrennt.",
  )
  .refine(
    (data) => !data.workingTime || !data.workingTimeDelete,
    "Speichere oder lösche jeweils nur einen Sollzeit-Eintrag.",
  )
  .strict()
  .refine(
    (data) =>
      data.accentPalette !== undefined ||
      data.onboardingCompleted === true ||
      data.workingTime !== undefined ||
      data.workingTimeDelete !== undefined,
    {
      message: "Bitte wähle eine Profiländerung.",
    },
  )
  .refine(
    (data) =>
      !data.memberId ||
      ((!!data.workingTime || !!data.workingTimeDelete) &&
        !data.accentPalette &&
        !data.onboardingCompleted),
    "Für andere Personen kannst du hier ausschließlich die Wochenstunden bearbeiten.",
  );
