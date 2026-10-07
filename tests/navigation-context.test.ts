import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainRecord } from "../src/shared/contracts";
import {
  captureNavigationScroll,
  closeRecordDetail,
  navigateRecord,
  navigateWorkspace,
  recordHref,
  restoreNavigationScroll,
  setNavigationUser,
} from "../src/shared/client-navigation";
import { readViewState, writeViewState } from "../src/shared/view-state";

describe("navigation context", () => {
  const states: { url: URL; state: Record<string, unknown> }[] = [];
  let index = 0;
  const storage = new Map<string, string>();
  const scrollTo = vi.fn();
  const row = (id: string): DomainRecord => ({
    id,
    kind: "actors",
    data: { name: "Mara" },
    version: 1,
    createdAt: "",
    updatedAt: "",
    createdBy: "user",
    organizationId: "org",
    departmentId: "mask",
  });
  beforeEach(() => {
    states.splice(0, states.length, {
      url: new URL(
        "https://example.test/?module=productions&productionId=play&tab=casting&relatedSeason=2024%2F2025",
      ),
      state: { existingNextState: true },
    });
    index = 0;
    storage.clear();
    scrollTo.mockClear();
    const location = {
      get href() {
        return states[index].url.href;
      },
      get pathname() {
        return states[index].url.pathname;
      },
      get search() {
        return states[index].url.search;
      },
      get hash() {
        return states[index].url.hash;
      },
    };
    vi.stubGlobal("location", location);
    vi.stubGlobal("history", {
      get state() {
        return states[index].state;
      },
      replaceState(state: Record<string, unknown>, _: string, url?: string) {
        states[index] = {
          state,
          url: new URL(url || states[index].url.href, "https://example.test"),
        };
      },
      pushState(state: Record<string, unknown>, _: string, url: string) {
        states.splice(index + 1);
        states.push({ state, url: new URL(url, "https://example.test") });
        index++;
      },
      back() {
        index = Math.max(0, index - 1);
      },
    });
    vi.stubGlobal("window", { scrollX: 0, scrollY: 680, scrollTo, dispatchEvent: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("PopStateEvent", class {});
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    setNavigationUser("user");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns to the actual production tab and source detail without losing unrelated query or Next state", () => {
    navigateRecord(row("target"), { from: row("source") });
    expect(states[1].url.searchParams.get("tab")).toBe("casting");
    expect(states[1].url.searchParams.get("relatedSeason")).toBe("2024/2025");
    expect(states[1].url.searchParams.get("record")).toBe("source");
    expect(states[0].state.existingNextState).toBe(true);
    closeRecordDetail();
    expect(location.search).toContain("record=source");
    restoreNavigationScroll();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 680, behavior: "instant" });
    closeRecordDetail();
    expect(location.search).not.toContain("record=");
    expect(location.search).toContain("tab=casting");
  });
  it("restores view filters and scrolling after a module remount without sharing another user's selection", () => {
    writeViewState("user", "actors", "period", { season: "2024/2025" });
    expect(readViewState("user", "actors", "period", {})).toEqual({ season: "2024/2025" });
    expect(readViewState("other", "actors", "period", { season: "2026/2027" })).toEqual({
      season: "2026/2027",
    });
    captureNavigationScroll();
    const source = location.pathname + location.search;
    navigateWorkspace("/?module=actors");
    navigateWorkspace(source);
    restoreNavigationScroll();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 680, behavior: "instant" });
  });
  it("opens workflow changes in their inventory article or focused calendar request", () => {
    const reservation: DomainRecord = {
      ...row("reservation"),
      kind: "reservations",
      data: { materialId: "wig", productionId: "play" },
    };
    const swap: DomainRecord = { ...row("swap"), kind: "shiftSwaps", data: {} };
    const article = new URL(recordHref(reservation), "https://example.test");
    expect(article.searchParams.get("module")).toBe("inventory");
    expect(article.searchParams.get("record")).toBe("wig");
    expect(article.searchParams.has("productionId")).toBe(false);
    const calendar = new URL(recordHref(swap), "https://example.test");
    expect(calendar.searchParams.get("module")).toBe("calendar");
    expect(calendar.searchParams.get("swapId")).toBe("swap");
    expect(calendar.searchParams.has("record")).toBe(false);
  });
});
