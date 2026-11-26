import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "../src/proxy";

const request = (url: string, cookie?: string) =>
  new NextRequest(url, cookie ? { headers: { cookie } } : undefined);

describe("workspace entry proxy", () => {
  it("sends cookie-less visitors to the login and keeps deep links", () => {
    const plain = proxy(request("https://maske.example/"));
    expect(plain.status).toBe(307);
    expect(plain.headers.get("location")).toBe("https://maske.example/login");
    const deep = proxy(request("https://maske.example/?module=chat&conversationId=c1&_rsc=x"));
    const next = new URL(deep.headers.get("location")!).searchParams.get("next");
    expect(next).toBe("/?module=chat&conversationId=c1");
  });
  it("lets any Better Auth session cookie through without checking it", () => {
    for (const cookie of [
      "better-auth.session_token=abc",
      "__Secure-better-auth.session_token=abc",
    ]) {
      const response = proxy(request("https://maske.example/?module=calendar", cookie));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
  it("only runs for the workspace page", () => {
    expect(config.matcher).toBe("/");
    expect(proxy(request("https://maske.example/login")).headers.get("location")).toBeNull();
  });
});
