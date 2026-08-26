import { describe, it, expect, vi } from "vitest";
import { verifyMatches, type VerifyInput } from "@/lib/capture/verify-matches";

/**
 * The verifier is the check that replaced a human reading every row. Its
 * safety property is not accuracy — it is that **failure is never approval**.
 * A model that errors, truncates, or skips a row must leave that row needing
 * judgement, because the alternative is a wrong price written silently.
 */

const pair = (index: number, captured: string, cat: string): VerifyInput => ({
  index,
  capturedName: captured,
  catalogueName: cat,
  catalogueSize: null,
});

/** A stub standing in for the Anthropic client. */
function clientReturning(text: string) {
  return {
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text }] }) },
  } as never;
}

function clientThrowing() {
  return {
    messages: { create: vi.fn().mockRejectedValue(new Error("upstream down")) },
  } as never;
}

describe("verifyMatches", () => {
  it("returns nothing to do for an empty list, without calling the model", async () => {
    const client = clientReturning("[]");
    const out = await verifyMatches([], { client });
    expect(out.size).toBe(0);
  });

  it("passes through the model's verdicts", async () => {
    const client = clientReturning(
      JSON.stringify([
        { index: 0, verdict: "same", reason: "identical product" },
        { index: 1, verdict: "different", reason: "12 grain vs whole wheat" },
        { index: 2, verdict: "unsure", reason: "size not stated on either" },
      ]),
    );
    const out = await verifyMatches(
      [
        pair(0, "Dempster's Whole Wheat 570g", "Dempster's 100% Whole Wheat Bread"),
        pair(1, "Dempster's 12 Grain 600g", "Dempster's 100% Whole Wheat Bread"),
        pair(2, "Some Milk", "Other Milk"),
      ],
      { client },
    );
    expect(out.get(0)?.verdict).toBe("same");
    expect(out.get(1)?.verdict).toBe("different");
    expect(out.get(1)?.reason).toContain("whole wheat");
    expect(out.get(2)?.verdict).toBe("unsure");
  });

  it("marks a row unsure when the model omits it", async () => {
    // A skipped row must not be silently treated as approved.
    const client = clientReturning(
      JSON.stringify([{ index: 0, verdict: "same", reason: "ok" }]),
    );
    const out = await verifyMatches([pair(0, "a", "a"), pair(1, "b", "b")], {
      client,
    });
    expect(out.get(0)?.verdict).toBe("same");
    expect(out.get(1)?.verdict).toBe("unsure");
  });

  it("marks every row unsure when the model fails outright", async () => {
    const out = await verifyMatches([pair(0, "a", "a"), pair(1, "b", "b")], {
      client: clientThrowing(),
    });
    expect(out.get(0)?.verdict).toBe("unsure");
    expect(out.get(1)?.verdict).toBe("unsure");
  });

  it("marks rows unsure when the response is not parseable", async () => {
    const out = await verifyMatches([pair(0, "a", "a")], {
      client: clientReturning("I'm sorry, I can't help with that."),
    });
    expect(out.get(0)?.verdict).toBe("unsure");
  });

  it("ignores rows carrying a verdict it does not recognise", async () => {
    // An invented verdict must not be accepted as approval either.
    const out = await verifyMatches([pair(0, "a", "a")], {
      client: clientReturning(
        JSON.stringify([{ index: 0, verdict: "probably", reason: "hmm" }]),
      ),
    });
    expect(out.get(0)?.verdict).toBe("unsure");
  });

  it("tolerates prose or a code fence around the array", async () => {
    const out = await verifyMatches([pair(0, "a", "a")], {
      client: clientReturning(
        'Here you go:\n```json\n[{"index":0,"verdict":"same","reason":"ok"}]\n```',
      ),
    });
    expect(out.get(0)?.verdict).toBe("same");
  });
});
