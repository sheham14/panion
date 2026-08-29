/**
 * Clove's replies are rendered by a small hand-rolled markdown pass, and the
 * failure it produced was quiet: a list of four recipe options every one of
 * which was numbered "1.".
 *
 * The cause was that a blank line closed the <ol> and the next item opened a
 * fresh one. Both of the shapes below — blank-separated items, and items with
 * a description line underneath — are how the model actually formats choices,
 * and both used to split the list.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownText } from "@/components/recipes/AIChatClient";

/** Every <ol> in the output, with the item count of each. */
function orderedLists(container: HTMLElement): number[] {
  return [...container.querySelectorAll("ol")].map(
    (ol) => ol.querySelectorAll(":scope > li").length,
  );
}

describe("MarkdownText — ordered lists", () => {
  it("keeps blank-separated items in one list", () => {
    const { container } = render(
      <MarkdownText
        text={"1. Spaghetti Bolognese\n\n2. Chicken Fried Rice\n\n3. Veggie Curry"}
      />,
    );
    // One list of three, not three lists of one.
    expect(orderedLists(container)).toEqual([3]);
  });

  it("keeps a description line with its item", () => {
    const { container } = render(
      <MarkdownText
        text={
          "1. Spaghetti Bolognese\nRich and hearty, uses your pasta.\n2. Fried Rice\nQuick, uses your eggs."
        }
      />,
    );
    expect(orderedLists(container)).toEqual([2]);
    // The description rides inside the item rather than becoming a sibling.
    const first = container.querySelectorAll("ol > li")[0];
    expect(first.textContent).toContain("Spaghetti Bolognese");
    expect(first.textContent).toContain("Rich and hearty");
  });

  it("handles the full shape: blank lines and descriptions together", () => {
    const { container } = render(
      <MarkdownText
        text={
          "Here are some options:\n\n" +
          "1. Spaghetti Bolognese\nRich and hearty.\n\n" +
          "2. Chicken Fried Rice\nQuick weeknight dinner.\n\n" +
          "3. Veggie Curry\nUses up your onions.\n\n" +
          "4. Shakshuka\nEggs, tomatoes, done.\n\n" +
          "Which one?"
        }
      />,
    );
    expect(orderedLists(container)).toEqual([4]);
  });

  it("still ends the list when real prose follows", () => {
    const { container } = render(
      <MarkdownText text={"1. One\n2. Two\n\nThat's the lot."} />,
    );
    expect(orderedLists(container)).toEqual([2]);
    expect(container.textContent).toContain("That's the lot.");
  });

  it("does not merge a bullet list into a numbered one", () => {
    const { container } = render(
      <MarkdownText text={"1. One\n2. Two\n- a bullet\n- another"} />,
    );
    expect(orderedLists(container)).toEqual([2]);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
  });

  it("accepts indented and paren-style markers", () => {
    const { container } = render(
      <MarkdownText text={"  1) One\n  2) Two\n  3) Three"} />,
    );
    expect(orderedLists(container)).toEqual([3]);
  });

  it("leaves a plain paragraph alone", () => {
    const { container } = render(<MarkdownText text={"Just a sentence."} />);
    expect(orderedLists(container)).toEqual([]);
    expect(container.textContent).toBe("Just a sentence.");
  });
});
