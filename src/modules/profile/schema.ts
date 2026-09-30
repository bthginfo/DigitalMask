import { z } from "zod";
import { accentPalettes } from "@/shared/contracts";
export const profileUpdateSchema = z
  .object({
    accentPalette: z.enum(accentPalettes).optional(),
    onboardingCompleted: z.literal(true).optional(),
  })
  .strict()
  .refine((data) => data.accentPalette !== undefined || data.onboardingCompleted === true, {
    message: "Bitte wähle eine Profiländerung.",
  });
