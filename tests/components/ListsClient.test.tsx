/**
 * List items used to be editable and removable only by a touch swipe, so a
 * mouse or keyboard had no way to change one. These pin the non-swipe path:
 * the row opens the edit sheet, and the sheet removes the item — and puts it
 * back when the server refuses, rather than letting it reappear on reload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListsClient from "@/components/lists/ListsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const list = {
  id: "list_1",
  name: "Weekly",
  items: [
    {
      id: "item_1",
      name: "Oat milk",
      quantity: 1,
      unit: "each",
      notes: null,
      isChecked: false,
      sortOrder: 0,
      customPrice: null,
      product: null,
    },
  ],
};

function renderList() {
  return render(
    <ListsClient
      initialList={list}
      allLists={[{ id: "list_1", name: "Weekly", itemCount: 1 }]}
      preferredStores={[]}
    />,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ListsClient without swiping", () => {
  it("opens the edit sheet from the item itself", async () => {
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Oat milk" }));
    expect(
      screen.getByRole("dialog", { name: "Edit Oat milk" }),
    ).toBeInTheDocument();
  });

  it("removes the item from the sheet", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Oat milk" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from list" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Oat milk" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/list_1/items",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ itemId: "item_1" }),
      }),
    );
  });

  it("puts the item back and says so when the server refuses", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Oat milk" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from list" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't remove/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oat milk" })).toBeInTheDocument();
  });

  it("keeps the sheet open when a save fails", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Oat milk" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't save/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the sheet with Escape", async () => {
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Oat milk" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
