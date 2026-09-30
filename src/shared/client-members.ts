import type { Member } from "./contracts";
export const isStaff = (member: Member) => member.role !== "superadmin";
export const isActiveStaff = (member: Member) => isStaff(member) && member.status === "active";
