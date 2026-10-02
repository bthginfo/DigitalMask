import { maskPlanFixture } from "./mask-plans-fixture";

export function productionMakeupChoiceFixture() {
  const workspace = maskPlanFixture();
  workspace.members.push(
    { ...workspace.user, id: "mara", name: "Mara" },
    { ...workspace.user, id: "inactive", name: "Ruth", status: "disabled" },
  );
  workspace.records.productions[0].data.memberIds = [
    "jules",
    "janine",
    "lena",
    "inactive",
    "admin",
  ];
  workspace.records.productions[0].data.contacts = [
    { id: "lead", role: "Perückenbetreuung", type: "makeup", name: "", memberId: "jules" },
    { id: "direction", role: "Regie", type: "external", name: "Alina Hoffmann", memberId: "" },
    {
      id: "free-lead",
      role: "Gastbetreuung",
      type: "makeup",
      name: "Chris Becker",
      memberId: "",
    },
    {
      id: "other-member-role",
      role: "Werkstattassistenz",
      type: "external",
      name: "",
      memberId: "jules",
    },
    {
      id: "historical-lead",
      role: "Frühere Maskenbetreuung",
      type: "makeup",
      name: "",
      memberId: "inactive",
    },
  ];
  return workspace;
}
