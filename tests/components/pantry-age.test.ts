/**
 * Pantry tiles show how long ago an item was added.
 *
 * They read `createdAt` now. They used to read `updatedAt`, which meant
 * editing a quantity reset the age — a jar you had owned for three months
 * read as "today". Nothing about that failed loudly; it just quietly said the
 * wrong thing, which is the reason it survived until someone at a demo asked
 * whether the app tracked item age at all.
 */
import { describe, it, expect } from "vitest";
import { relativeDate } from "@/components/pantry/PantryClient";

/** An ISO timestamp `days` in the past. */
const ago = (days: number, hours = 0): string =>
  new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();

describe("relativeDate", () => {
  it("calls the last 24 hours today", () => {
    expect(relativeDate(ago(0))).toBe("today");
    expect(relativeDate(ago(0, 5))).toBe("today");
  });

  it("names yesterday", () => {
    expect(relativeDate(ago(1))).toBe("yesterday");
  });

  it("counts days up to a week", () => {
    expect(relativeDate(ago(3))).toBe("3 days ago");
    expect(relativeDate(ago(6))).toBe("6 days ago");
  });

  it("switches to weeks at seven days", () => {
    expect(relativeDate(ago(7))).toBe("1 week ago");
    // 7–13 days all read as one week, which agrees with the floor division
    // that takes over at 14 — the explicit branch is redundant, not wrong.
    expect(relativeDate(ago(13))).toBe("1 week ago");
    expect(relativeDate(ago(14))).toBe("2 weeks ago");
    expect(relativeDate(ago(21))).toBe("3 weeks ago");
  });

  it("switches to months at thirty days", () => {
    expect(relativeDate(ago(30))).toBe("1 months ago");
    expect(relativeDate(ago(75))).toBe("2 months ago");
  });

  it("never returns a future phrasing for a just-created item", () => {
    // Optimistic updates write `new Date().toISOString()` client-side, which
    // can land a few milliseconds ahead of the comparison.
    const justNow = new Date(Date.now() + 500).toISOString();
    expect(relativeDate(justNow)).toBe("today");
  });
});
