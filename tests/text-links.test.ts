import { describe, expect, it } from "vitest";
import { textLinks } from "@/shared/text-links";

describe("plain text web links", () => {
  it("preserves text, newlines and punctuation while linking multiple web addresses", () => {
    const text =
      "Hier: https://example.org/probe?a=1&b=2.\nAuch (www.example.org) und https://example.org/wiki/Probe_(Theater).";
    const parts = textLinks(text);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.href).map((part) => part.href)).toEqual([
      "https://example.org/probe?a=1&b=2",
      "https://www.example.org/",
      "https://example.org/wiki/Probe_(Theater)",
    ]);
  });
  it("does not activate scripts, malformed addresses, HTML or embedded credentials", () => {
    const text =
      "javascript:alert(1) <script>x</script> https://user:secret@example.org www. https://";
    expect(textLinks(text)).toEqual([{ text }]);
  });
});
