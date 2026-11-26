/** Header naming the browser tab that caused a write, so its own live echo can be skipped. */
export const clientHeader = "x-dm-client";

let id = "";
/** One random ID per page load (tab); never persisted and never tied to the user. */
export function clientId() {
  if (!id)
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return id;
}

/** Headers for a state-changing request from this tab. */
export function clientHeaders(method = "GET"): Record<string, string> {
  return typeof window !== "undefined" && !/^(?:GET|HEAD)$/i.test(method)
    ? { [clientHeader]: clientId() }
    : {};
}
