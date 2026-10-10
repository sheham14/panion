/**
 * A pantry item that was already linked opened showing an empty product
 * search, so it looked unlinked; and re-linking kept the old tile photo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PantryEditSheet from "@/components/pantry/PantryEditSheet";

const linkedItem = {
  id: "pantry_1",
  name: "Natrel 2% Milk",
  brand: "Natrel",
  category: "dairy",
  quantity: 1,
  unit: null,
  productId: "prod_1",
  imageUrl: "has-photo",
  expiresAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  addedFrom: "manual",
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("PantryEditSheet", () => {
  it("opens a linked item showing its link", () => {
    render(<PantryEditSheet item={linkedItem} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Linked product")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlink" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search products…")).toBeNull();
  });

  it("takes the tile photo from the server after unlinking", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, imageUrl: null }), { status: 200 }),
    );
    const onSaved = vi.fn();
    render(<PantryEditSheet item={linkedItem} onClose={() => {}} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toMatchObject({ productId: null, imageUrl: null });
  });
});
