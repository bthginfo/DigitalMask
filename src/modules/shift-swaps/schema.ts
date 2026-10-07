import { z } from "zod";

export const shiftSwapStatuses = [
  "awaiting_partner",
  "awaiting_admin",
  "approved",
  "declined",
  "rejected",
  "withdrawn",
] as const;
export const shiftSwapActions = ["accept", "decline", "withdraw", "approve", "reject"] as const;
const id = z.string().trim().min(1).max(100);
const instant = z.iso.datetime({ offset: true });
const optionalId = z.string().max(100).default("");
const optionalInstant = z.union([instant, z.literal("")]).default("");

export const createShiftSwapSchema = z
  .object({
    serviceId: id,
    serviceStart: instant,
    serviceVersion: z.number().int().positive(),
    partnerId: id,
    counterServiceId: optionalId,
    counterServiceStart: optionalInstant,
    counterServiceVersion: z.number().int().min(0).default(0),
    note: z.string().trim().max(2000).default(""),
    confirmed: z.literal(true, {
      error: "Bitte bestätige, dass du diesen Dienst abgeben möchtest.",
    }),
  })
  .superRefine((data, context) => {
    if (data.counterServiceId && (!data.counterServiceStart || !data.counterServiceVersion))
      context.addIssue({
        code: "custom",
        path: ["counterServiceStart"],
        message: "Bitte wähle den vollständigen Gegendienst.",
      });
    if (data.counterServiceId === data.serviceId)
      context.addIssue({
        code: "custom",
        path: ["counterServiceId"],
        message: "Bitte wähle einen anderen Gegendienst.",
      });
  });
export const shiftSwapActionSchema = z.object({
  action: z.enum(shiftSwapActions),
  version: z.number().int().positive(),
});

/** Server-controlled fields; the generic records API rejects all shift-swap writes. */
export const shiftSwapSchema = z.object({
  requesterId: id,
  partnerId: id,
  serviceId: id,
  serviceStart: instant,
  serviceEnd: instant,
  serviceVersion: z.number().int().positive(),
  serviceTitle: z.string().max(500),
  counterServiceId: optionalId,
  counterServiceStart: optionalInstant,
  counterServiceEnd: optionalInstant,
  counterServiceVersion: z.number().int().min(0).default(0),
  counterServiceTitle: z.string().max(500).default(""),
  note: z.string().max(2000).default(""),
  status: z.enum(shiftSwapStatuses).default("awaiting_partner"),
  requestedAt: instant,
  partnerDecidedAt: optionalInstant,
  adminDecidedAt: optionalInstant,
  decidedBy: optionalId,
  resultEventIds: z.array(id).max(10).default([]),
});
export type ShiftSwapData = z.infer<typeof shiftSwapSchema>;
export type ShiftSwapAction = (typeof shiftSwapActions)[number];
export type ShiftSwapStatus = (typeof shiftSwapStatuses)[number];
