import type { DomainRecord, RecordData, RecordKind } from "../../src/shared/contracts";
import type { MaskPlanData } from "../../src/modules/mask-plans/model";
import { laneIds, maskPlanFixture } from "./mask-plans-fixture";

export function numericMaskFixture(extended = false) {
  const workspace = maskPlanFixture();
  workspace.user = {
    ...workspace.members.find((member) => member.id === "lena")!,
    preferences: { onboardingVersion: 1, accentPalette: "green" },
  };
  const add = (kind: RecordKind, id: string, data: RecordData) =>
    workspace.records[kind].push({
      ...workspace.records.productions[0],
      kind,
      id,
      data,
    } as DomainRecord);
  workspace.records.productions[0].data.durationMinutes = 0;
  add("materials", "brushes", {
    name: "Pinsel",
    category: "tools",
    location: "Schrank A",
    quantity: 6,
    minQuantity: 0,
  });
  add("categories", "tools", {
    scope: "materials",
    key: "tools",
    name: "Werkzeuge",
    color: "#83c6a5",
    order: 0,
  });
  add("categories", "production-time", {
    scope: "time",
    key: "production",
    name: "Produktionsarbeit",
    color: "#83c6a5",
    order: 0,
  });
  add("templates", "makeup-template", {
    title: "Maskenvorlage",
    version: 2,
    fields: [],
    sections: [],
  });
  if (extended) {
    const plan = workspace.records.maskPlans[0].data as MaskPlanData;
    plan.windowMinutes = 120;
    plan.lanes.push(
      { id: laneIds[2], label: "Platz 3", memberIds: [], staffNames: ["Katharina"] },
      {
        id: "44444444-4444-4444-8444-444444444444",
        label: "Platz 4",
        memberIds: [],
        staffNames: ["Alex"],
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        label: "Platz 5",
        memberIds: [],
        staffNames: ["Kim"],
      },
    );
  }
  return workspace;
}
