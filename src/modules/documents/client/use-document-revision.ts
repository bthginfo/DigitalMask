"use client";
import { useEffect, useState } from "react";
import type * as Y from "yjs";

export function useDocumentRevision(doc: Y.Doc) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision((value) => value + 1);
    doc.on("afterTransaction", changed);
    return () => doc.off("afterTransaction", changed);
  }, [doc]);
  return revision;
}
