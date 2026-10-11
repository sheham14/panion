import { describe, it, expect } from "vitest";
import { displaySize } from "@/lib/display-size";

describe("displaySize", () => {
  it("rounds a size worked back from a unit price to what the label says", () => {
    expect(displaySize("~1994 ml")).toBe("~2 L");
    expect(displaySize("~1012 ml")).toBe("~1 L");
    expect(displaySize("~1360 g")).toBe("~1.4 kg");
    expect(displaySize("~453 g")).toBe("~455 g");
  });

  it("leaves a stated size alone", () => {
    expect(displaySize("2 l")).toBe("2 l");
    expect(displaySize("12 ea")).toBe("12 ea");
    expect(displaySize(null)).toBeNull();
  });
});
