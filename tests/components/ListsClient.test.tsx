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

  it("links a typed-in item to a product found in the sheet", async () => {
    const linked = {
      id: "prod_1",
      name: "Natrel 2% Milk 2L",
      brand: "Natrel",
      unitSize: "2L",
      unitMeasure: "ml",
      unitQuantity: 2000,
      storeProducts: [
        {
          id: "sp_1",
          currentPrice: 5.29,
          isActive: true,
          isSale: false,
          store: { id: "s1", chain: "Walmart", name: "Walmart Kenmount" },
        },
      ],
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/products")) {
        return new Response(
          JSON.stringify([
            { id: "prod_1", name: linked.name, brand: "Natrel", unitSize: "2L", bestPrice: 5.29, bestStore: "walmart" },
          ]),
          { status: 200 },
        );
      }
      if (init?.method === "PATCH") {
        return new Response(
          JSON.stringify({ ...list.items[0], customPrice: null, product: linked }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Oat milk" }));
    await userEvent.type(screen.getByRole("searchbox", { name: /search products/i }), "milk");
    await userEvent.click(await screen.findByRole("button", { name: /Natrel 2% Milk 2L/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patchCall![1].body)).toMatchObject({
      itemId: "item_1",
      productId: "prod_1",
      customPrice: null,
    });
    // Priced from the linked product's stores, without a reload.
    expect(screen.getByText("$5.29")).toBeInTheDocument();
  });

  it("closes the sheet with Escape", async () => {
    renderList();
    await userEvent.click(screen.getByRole("button", { name: "Oat milk" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
