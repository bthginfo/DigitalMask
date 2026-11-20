import type { RecordKind } from "./contracts";

export const MAX_FILE_BYTES = 4_000_000;

export function uploadImageEdge(recordKind?: RecordKind) {
  return recordKind === "messages" ? 2560 : 1800;
}
