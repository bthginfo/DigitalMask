import * as Y from "yjs";
import { HttpError } from "@/platform/http";
import { MAX_DOCUMENT_BYTES } from "./contracts";

export function decodeState(value: string, limit = MAX_DOCUMENT_BYTES) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((limit * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new HttpError(413, "Die Dokumentänderung ist zu groß oder ungültig.");
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  if (!bytes.length || bytes.length > limit)
    throw new HttpError(413, "Die Dokumentänderung ist zu groß.");
  try {
    const decoded = Y.decodeUpdate(bytes);
    if (
      decoded.structs.length > 200_000 ||
      decoded.structs.some((struct) => struct.length > 2_000_000)
    )
      throw new Error();
  } catch {
    throw new HttpError(400, "Diese Dokumentänderung konnte nicht gelesen werden.");
  }
  return bytes;
}
export function mergedDocument(states: string[]) {
  const document = new Y.Doc();
  try {
    for (const state of states) Y.applyUpdate(document, decodeState(state));
    if (Y.encodeStateAsUpdate(document).length > MAX_DOCUMENT_BYTES)
      throw new HttpError(
        413,
        "Das gemeinsame Dokument ist zu groß. Bitte teile es in kleinere Dokumente auf.",
      );
    return document;
  } catch (error) {
    document.destroy();
    throw error;
  }
}
export const encodeDocument = (document: Y.Doc) =>
  Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64");
