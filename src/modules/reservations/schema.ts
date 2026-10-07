import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
const reservationObject = z.object({
  materialId: z.string().trim().min(1, "Bitte wähle einen Artikel.").max(100),
  quantity: z.number().finite().min(0.001, "Die Menge muss mindestens 0,001 sein.").max(1000000),
  start: instant,
  end: instant,
  productionId: z.string().max(100).default(""),
  actorId: z.string().max(100).default(""),
  purpose: z.string().trim().max(200).default(""),
  notes: z.string().max(20000).default(""),
  userId: z.string().max(100).default(""),
  status: z.enum(["reserved", "cancelled"]).default("reserved"),
});
export const reservationSchema = reservationObject.refine(
  (data) => Date.parse(data.end) > Date.parse(data.start),
  {
    path: ["end"],
    message: "Das Ende muss nach dem Beginn liegen.",
  },
);
export type ReservationData = z.infer<typeof reservationSchema>;
export const availabilitySchema = reservationObject
  .pick({
    materialId: true,
    quantity: true,
    start: true,
    end: true,
  })
  .extend({ excludeId: z.string().max(100).optional() })
  .refine((data) => Date.parse(data.end) > Date.parse(data.start), {
    path: ["end"],
    message: "Das Ende muss nach dem Beginn liegen.",
  });
