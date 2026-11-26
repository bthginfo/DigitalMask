import { describe, expect, it } from "vitest";
import {
  formatDuration,
  normalizeDurationInput,
  parseDurationInput,
  previewDurationInput,
} from "../src/shared/duration-input";

const duration = (text: string) => parseDurationInput(text, { required: true });
const pause = (text: string) =>
  parseDurationInput(text, { label: "Pause", bareUnit: "minutes", min: 0, max: 86400 });

describe("typed durations in h:mm", () => {
  it.each([
    ["1:30", 5400],
    [" 1:30 ", 5400],
    ["0:45", 2700],
    [":30", 1800],
    ["10:05", 36300],
    ["1.30", 5400],
    ["1,5", 5400],
    ["1.5", 5400],
    ["0,25", 900],
    ["0.75", 2700],
    ["1,5h", 5400],
    ["2h", 7200],
    ["2 h", 7200],
    ["2 Std", 7200],
    ["2 Stunden", 7200],
    ["90m", 5400],
    ["90 min", 5400],
    ["90 Minuten", 5400],
    ["1h30", 5400],
    ["1h 30m", 5400],
    ["1 Std 30 Min", 5400],
    ["8", 28800],
    ["24", 86400],
    ["90", 5400],
  ])("reads %j as %i seconds", (text, seconds) => expect(duration(text)).toBe(seconds));

  it("reads a bare number in a pause field as minutes", () => {
    expect(pause("30")).toBe(1800);
    expect(pause("0:30")).toBe(1800);
    expect(pause("1h")).toBe(3600);
    expect(pause("")).toBe(0);
    expect(pause("0")).toBe(0);
  });

  it("explains invalid input in German", () => {
    expect(() => duration("")).toThrow("Bitte Dauer eintragen.");
    expect(() => duration("abc")).toThrow("Dauer: bitte als Stunden:Minuten eintragen");
    expect(() => duration("1:75")).toThrow("Stunden:Minuten");
    expect(() => duration("-1")).toThrow("Stunden:Minuten");
    expect(() => duration("0:00")).toThrow("Dauer muss mindestens 0:01 h betragen.");
    expect(() => duration("169:00")).toThrow("Dauer darf höchstens 168:00 h betragen.");
    expect(() => pause("25h")).toThrow("Pause darf höchstens 24:00 h betragen.");
  });

  it("formats seconds as h:mm and normalizes typed text when leaving the field", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5400)).toBe("1:30");
    expect(formatDuration(5429)).toBe("1:30");
    expect(formatDuration(36000)).toBe("10:00");
    expect(normalizeDurationInput("1,5")).toBe("1:30");
    expect(normalizeDurationInput("90m")).toBe("1:30");
    expect(normalizeDurationInput("2h")).toBe("2:00");
    expect(normalizeDurationInput("30", { bareUnit: "minutes" })).toBe("0:30");
    expect(normalizeDurationInput("abc ")).toBe("abc");
    expect(normalizeDurationInput("")).toBe("");
  });

  it("has no preview for incomplete input", () => {
    expect(previewDurationInput("1:")).toBeUndefined();
    expect(previewDurationInput("1:3")).toBe(3780);
    expect(previewDurationInput("", { required: true })).toBeUndefined();
  });
});
