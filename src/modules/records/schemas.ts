import { z } from "zod";
import type { RecordKind } from "@/shared/contracts";
const short = z.string().trim().max(200);
const title = short.min(1, "Ein Titel ist erforderlich.");
const note = z.string().max(20000).default("");
const id = z.string().max(100).default("");
const ids = z.array(z.string().max(100)).max(100).default([]);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTime = z
  .string()
  .refine((x) => Number.isFinite(new Date(x).getTime()), "Ungültiger Zeitpunkt.");
const checklist = z
  .array(z.object({ text: z.string().min(1).max(500), done: z.boolean().default(false) }))
  .max(100)
  .default([]);
export const schemas: Record<RecordKind, z.ZodType> = {
  productions: z.object({
    title,
    description: note,
    season: short.default(""),
    status: z.enum(["preparation", "active", "archived"]).default("preparation"),
    premiere: z.string().max(40).default(""),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#357b68"),
    memberIds: ids,
    sourceId: id,
  }),
  actors: z.object({
    name: title,
    contact: z.string().max(1000).default(""),
    hair: note,
    wigSize: short.default(""),
    notes: note,
    imageIds: ids,
  }),
  characters: z.object({ name: title, productionId: id, description: note, imageIds: ids }),
  casting: z.object({
    productionId: id,
    characterId: id,
    actorId: id,
    alternate: z.boolean().default(false),
  }),
  sprints: z.object({
    title,
    productionId: id,
    goal: note,
    start: day,
    end: day,
    status: z.enum(["planned", "active", "completed"]).default("planned"),
  }),
  tasks: z.object({
    title,
    description: note,
    productionId: id,
    sprintId: id,
    parentId: id,
    assigneeIds: ids,
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    status: z.enum(["backlog", "todo", "doing", "review", "done"]).default("todo"),
    due: z.string().max(40).default(""),
    checklist,
  }),
  events: z.object({
    title,
    start: dateTime,
    end: dateTime,
    category: z
      .enum(["service", "rehearsal", "performance", "preparation", "absence"])
      .default("service"),
    productionId: id,
    participantIds: ids,
    location: short.default(""),
    recurrence: z.enum(["none", "daily", "weekly"]).default("none"),
    until: z.string().max(10).default(""),
    exceptions: ids,
    leaveId: id,
  }),
  leave: z.object({
    start: day,
    end: day,
    reason: note,
    status: z.enum(["pending", "approved", "rejected", "withdrawn"]).default("pending"),
    userId: id,
    eventId: id,
  }),
  time: z.object({
    title,
    productionId: id,
    taskId: id,
    category: z.enum(["production", "office", "cleaning", "other"]).default("production"),
    start: z.string().max(50).default(""),
    end: z.string().max(50).default(""),
    durationSeconds: z
      .number()
      .int()
      .positive()
      .max(86400 * 7),
    pauseSeconds: z.number().int().min(0).max(86400).default(0),
    userId: id,
    date: day,
    idempotencyKey: z.string().max(100).default(""),
  }),
  looks: z.object({
    title,
    productionId: id,
    characterId: id,
    actorId: id,
    scene: short.default(""),
    preparation: note,
    materials: note,
    steps: note,
    changeover: note,
    durationMinutes: z.number().min(0).max(10000).default(0),
    imageIds: ids,
    status: z.enum(["draft", "published"]).default("draft"),
    templateId: id,
    templateVersion: z.number().int().min(1).default(1),
    templateFields: z.record(z.string().max(100), z.string().max(20000)).default({}),
  }),
  templates: z.object({
    title,
    fields: z.array(z.string().min(1).max(100)).max(100).default([]),
    version: z.number().int().positive().default(1),
  }),
  messages: z.object({
    text: z.string().trim().min(1).max(10000),
    productionId: id,
    attachmentIds: ids,
    userId: id,
  }),
  materials: z.object({
    name: title,
    category: z.enum(["wig", "makeup", "tool", "other"]).default("other"),
    location: short.default(""),
    quantity: z.number().min(0).max(1000000).default(0),
    minQuantity: z.number().min(0).max(1000000).default(0),
    characterId: id,
    notes: note,
  }),
  handovers: z.object({
    title,
    productionId: id,
    date: day,
    notes: note,
    checklist,
    status: z.enum(["open", "complete"]).default("open"),
  }),
  notifications: z.object({
    title,
    body: note,
    userId: id,
    read: z.boolean().default(false),
    link: z.string().max(500).default(""),
  }),
  timesheets: z.object({
    userId: id,
    week: day,
    status: z.enum(["submitted", "approved", "changes_requested"]).default("submitted"),
    note,
  }),
  files: z.object({
    name: title,
    mime: short,
    size: z.number().int().positive(),
    recordKind: short,
    recordId: id,
    path: z.string().max(1000),
    image: z.boolean().default(false),
  }),
};
export function validateRecord(kind: RecordKind, data: unknown) {
  return schemas[kind].parse(data) as Record<string, unknown>;
}
