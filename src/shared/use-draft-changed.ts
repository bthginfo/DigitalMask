"use client";
import { useState } from "react";

/**
 * Remembers an editor's first draft and returns a check that compares the current draft with
 * it. The comparison runs only when called (for example when a dialog is about to close).
 */
export function useDraftChanged(draft: unknown): () => boolean {
  const [initial] = useState(() => JSON.stringify(draft));
  return () => JSON.stringify(draft) !== initial;
}
