import { describe, it, expect } from "vitest";
import { requiredChainFor, sourceAllowsChain } from "@/lib/capture/source-store";

/**
 * The store is chosen at review time, from a dropdown holding one value for
 * whichever batch is open. Reviewing a Walmart capture while it still reads
 * Sobeys would write Walmart's prices onto Sobeys — and look completely
 * ordinary doing it, since both stores sell milk at four-something. The
 * capture's own source is the fact that makes that refusable.
 */

describe("requiredChainFor", () => {
  it("pins the retailers whose site identifies the chain", () => {
    expect(requiredChainFor("walmart")).toBe("walmart");
    expect(requiredChainFor("voila")).toBe("sobeys");
  });

  it("leaves an unrecognized source to the reviewer", () => {
    // A generic page could be any store; guessing would be worse than asking.
    expect(requiredChainFor("generic")).toBeNull();
    expect(requiredChainFor(null)).toBeNull();
    expect(requiredChainFor(undefined)).toBeNull();
    expect(requiredChainFor("")).toBeNull();
  });
});

describe("sourceAllowsChain", () => {
  it("permits the matching chain", () => {
    expect(sourceAllowsChain("walmart", "walmart")).toBe(true);
    expect(sourceAllowsChain("voila", "sobeys")).toBe(true);
    // Chains are compared case-insensitively — store rows are hand-entered.
    expect(sourceAllowsChain("voila", "Sobeys")).toBe(true);
  });

  it("refuses a mismatch", () => {
    expect(sourceAllowsChain("walmart", "sobeys")).toBe(false);
    expect(sourceAllowsChain("voila", "walmart")).toBe(false);
    expect(sourceAllowsChain("walmart", "dominion")).toBe(false);
  });

  it("permits anything for an unconstrained source", () => {
    expect(sourceAllowsChain("generic", "sobeys")).toBe(true);
    expect(sourceAllowsChain(null, "walmart")).toBe(true);
  });
});
