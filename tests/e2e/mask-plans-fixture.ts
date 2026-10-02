import {
  recordKinds,
  type DomainRecord,
  type RecordData,
  type Workspace,
} from "../../src/shared/contracts";
import type { MaskPlanData } from "../../src/modules/mask-plans/model";

export const laneIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
export const blockIds = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
];
export function maskPlanFixture(): Workspace {
  const user: Workspace["user"] = {
    id: "jules",
    name: "Jules",
    username: "jules",
    role: "user",
    status: "active",
    preferences: { accentPalette: "green", onboardingVersion: 1 },
  };
  const workspace: Workspace = {
    user,
    organization: { id: "theatre", name: "Stadttheater Ingolstadt" },
    department: { id: "makeup", name: "Maske" },
    members: [
      user,
      { ...user, id: "janine", name: "Janine" },
      { ...user, id: "lena", name: "Lena", role: "admin" },
      { ...user, id: "admin", name: "DM.admin", role: "superadmin" },
    ],
    records: Object.fromEntries(
      recordKinds.map((kind) => [kind, [] as DomainRecord[]]),
    ) as Workspace["records"],
    timer: null,
    projectHours: {},
  };
  const add = (kind: DomainRecord["kind"], id: string, data: RecordData): DomainRecord => {
    const record: DomainRecord = {
      kind,
      id,
      data,
      version: 1,
      organizationId: "theatre",
      departmentId: "makeup",
      createdBy: user.id,
      createdAt: "2026-10-02T09:00:00Z",
      updatedAt: "2026-10-02T09:00:00Z",
    };
    workspace.records[kind].push(record);
    return record;
  };
  add("productions", "bear", {
    title: "Der Bär",
    season: "2026/27",
    status: "active",
    premiere: "2026-10-20",
    color: "#83c6a5",
    memberIds: ["jules", "janine", "lena"],
    contacts: [
      { id: "contact", role: "Maskenbetreuung", type: "makeup", name: "", memberId: "jules" },
      { id: "contact2", role: "Maskenbetreuung", type: "makeup", name: "", memberId: "janine" },
    ],
  });
  for (const [id, name] of [
    ["irina", "Irina K."],
    ["ben", "Ben E."],
    ["michael", "Michael A."],
    ["guest", "Ein Gast aus einer anderen Produktion"],
  ]) {
    add("actors", id, { name, hair: "Maskenangaben aus dem Katalog", notes: "Eigene Hinweise" });
    if (id !== "guest")
      add("casting", `casting-${id}`, {
        productionId: "bear",
        actorId: id,
        characterName: `Rolle ${name}`,
      });
  }
  const plan: MaskPlanData = {
    productionId: "bear",
    title: "AMA / HP1+2 / GP / Premiere",
    notes: "Gemeinsam am ersten Platz. Danach rechtzeitig ins Studio.",
    windowMinutes: 60,
    stepMinutes: 5,
    lanes: [
      {
        id: laneIds[0],
        label: "Platz 1 · gemeinsam",
        memberIds: ["jules", "janine"],
        staffNames: [],
      },
      { id: laneIds[1], label: "Platz 2", memberIds: ["lena"], staffNames: [] },
    ],
    blocks: [
      {
        id: blockIds[0],
        laneId: laneIds[0],
        startMinutes: -60,
        durationMinutes: 25,
        actorIds: ["irina"],
        actorNames: [],
        title: "Haare & Makeup",
        notes: "Perücke und Haarnadeln bereitstellen.",
        color: "",
      },
      {
        id: blockIds[1],
        laneId: laneIds[0],
        startMinutes: -30,
        durationMinutes: 10,
        actorIds: ["ben", "michael"],
        actorNames: [],
        title: "Letzte Kontrolle",
        notes: "",
        color: "#bfaee0",
      },
      {
        id: blockIds[2],
        laneId: laneIds[0],
        startMinutes: -20,
        durationMinutes: 20,
        actorIds: [],
        actorNames: [],
        title: "Ins Studio rüber",
        notes: "Alles für den Wechsel mitnehmen.",
        color: "#f0c791",
      },
      {
        id: blockIds[3],
        laneId: laneIds[1],
        startMinutes: -50,
        durationMinutes: 20,
        actorIds: [],
        actorNames: ["Gastbesetzung"],
        title: "Vorbereitung",
        notes: "Pinsel, Farben und Perücken einrichten.",
        color: "#91c8df",
      },
    ],
  };
  add("maskPlans", "main-plan", plan);
  add("maskPlans", "rehearsal-plan", {
    ...plan,
    title: "Probentag",
    notes: "Ein anderer Ablauf für die Probe.",
    blocks: [],
  });
  return workspace;
}
