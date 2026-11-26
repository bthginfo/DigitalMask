import { textValue, type RecordData } from "@/shared/contracts";

const workspaceOrigin = "https://digitalmask.invalid";

export function safeNotificationLink(link: unknown) {
  if (typeof link !== "string" || !link.startsWith("/?")) return "/";
  try {
    const url = new URL(link, workspaceOrigin);
    return url.origin === workspaceOrigin && url.pathname === "/" ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

const modules = new Map([
  ["TaskAssignedV1", "tasks"],
  ["ChatMessageCreatedV1", "chat"],
  ["ServiceChangedV1", "calendar"],
  ["LeaveRequestDecidedV1", "calendar"],
  ["ShiftSwapChangedV1", "calendar"],
  ["LookPublishedV1", "documentation"],
]);

/** Build the same destination for stored in-app notices and device notifications. */
export function notificationHref(
  data: RecordData,
  type = textValue(data.type),
): string | undefined {
  const link = safeNotificationLink(data.link);
  if (data.link && link === "/") return undefined;
  const query = new URLSearchParams(link.slice(2));
  const destination = query.get("module") || modules.get(type);
  if (!destination) return query.size ? link : undefined;

  query.set("module", destination);
  const recordId = textValue(data.recordId);
  const productionId = textValue(data.productionId) || query.get("productionId");
  if (destination === "chat") {
    const conversationId = textValue(data.conversationId) || query.get("conversationId");
    if (conversationId) {
      query.set("conversationId", conversationId);
      query.delete("productionId");
    } else if (productionId) query.set("productionId", productionId);
    if (recordId) query.set("messageId", recordId);
    query.delete("record");
  } else if (type === "AdminDecisionRequestedV1") {
    // The stored link already names the request (leaveId, swapId) or the settings page.
  } else if (type === "ShiftSwapChangedV1" || query.has("swapId")) {
    if (recordId) query.set("swapId", recordId);
  } else if (type === "LeaveRequestDecidedV1") {
    if (recordId) query.set("leaveId", recordId);
    else if (!query.has("leaveId")) query.set("section", "leave");
  } else {
    if (productionId && (destination === "tasks" || destination === "documentation")) {
      query.set("module", "productions");
      query.set("productionId", productionId);
      query.set("tab", destination === "tasks" ? "tasks" : "looks");
    }
    if (recordId) query.set("record", recordId);
  }
  return `/?${query}`;
}
