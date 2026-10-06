"use client";

import { useState, useEffect } from "react";
import { X, Plus, Check } from "lucide-react";
import { getMeasureType, getUnitType, TO_BASE } from "@/lib/unit-convert";

type List = {
  id: string;
  name: string;
  itemCount: number;
};

type IngredientItem = {
  id: string;
  name: string;
  productId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  productUnitQuantity?: number | null;
  productUnitMeasure?: string | null;
  productUnitSize?: string | null;
};

type SingleModeProps = {
  mode?: "single";
  productId: string;
  productName: string;
  ingredients?: never;
  onClose: () => void;
};

type RecipeModeProps = {
  mode: "recipe";
  ingredients: IngredientItem[];
  productId?: never;
  productName?: never;
  onClose: () => void;
};

type Props = SingleModeProps | RecipeModeProps;

export default function AddToListSheet(props: Props) {
  const { onClose } = props;
  const isRecipeMode = props.mode === "recipe";

  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/lists")
      .then((r) => r.json())
      .then((data: { id: string; name: string; _count?: { items: number } }[]) => {
        // The route returns Prisma's `_count`, not `itemCount`; reading the
        // latter rendered every list as " items" with no number.
        setLists(
          data.map((l) => ({
            id: l.id,
            name: l.name,
            itemCount: l._count?.items ?? 0,
          })),
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function bumpCount(listId: string, by: number) {
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, itemCount: l.itemCount + by } : l)),
    );
  }

  async function handleAddToList(listId: string, knownName?: string) {
    if (addedTo.has(listId) || isPending) return;
    setIsPending(true);
    setError(null);
    // A list created a moment ago isn't in `lists` yet, so its name is passed in.
    const listName =
      knownName ?? lists.find((l) => l.id === listId)?.name ?? "that list";

    try {
      if (isRecipeMode) {
        // Add all selected items in parallel. `fetch` resolves on a 400, so
        // each response is checked: treating "sent" as "added" is how a
        // rejected add used to show a tick.
        const responses = await Promise.all(
          props.ingredients.map((ing) => {
            const body = (() => {
              if (!ing.productId) {
                return {
                  name: ing.name,
                  quantity: ing.quantity,
                  unit: ing.unit,
                };
              }
              const {
                productUnitQuantity,
                productUnitMeasure,
                productUnitSize,
                quantity,
                unit,
              } = ing;
              const isBulk =
                productUnitSize?.toLowerCase().includes("per") ?? false;
              const measureType = getMeasureType(productUnitMeasure);
              const requestedType = unit ? getUnitType(unit) : "count";

              if (
                !isBulk &&
                measureType !== "count" &&
                requestedType !== "count" &&
                measureType === requestedType &&
                productUnitQuantity &&
                quantity
              ) {
                const packageBase =
                  productUnitQuantity * (TO_BASE[productUnitMeasure!] ?? 1);
                const requestedBase = quantity * (TO_BASE[unit!] ?? 1);
                const packs = Math.ceil(requestedBase / packageBase);
                return {
                  productId: ing.productId,
                  name: ing.name,
                  quantity: packs,
                  unit: null,
                };
              }

              return {
                productId: ing.productId,
                name: ing.name,
                quantity: quantity ?? 1,
                unit,
              };
            })();

            return fetch(`/api/lists/${listId}/items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          }),
        );
        const failed = responses.filter((r) => !r.ok).length;
        if (failed > 0) {
          setError(
            `${failed} of ${responses.length} couldn't be added to ${listName}. Try again.`,
          );
          return;
        }
        setAddedTo((prev) => new Set([...prev, listId]));
        // Only 201s are new rows; a 200 merged into an item already there.
        bumpCount(listId, responses.filter((r) => r.status === 201).length);
        // Close after brief confirmation in recipe mode
        setTimeout(onClose, 700);
      } else {
        const res = await fetch(`/api/lists/${listId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: props.productId,
            name: props.productName,
            quantity: 1,
          }),
        });
        if (!res.ok) {
          setError(`Couldn't add this to ${listName}. Try again.`);
          return;
        }
        setAddedTo((prev) => new Set([...prev, listId]));
        // 201 is a new row; 200 means it merged into an existing one.
        if (res.status === 201) bumpCount(listId, 1);
      }
    } catch {
      setError(`Couldn't reach Panion to add to ${listName}. Check your connection.`);
    } finally {
      setIsPending(false);
    }
  }

  async function handleCreateList() {
    if (!newListName.trim() || isPending) return;
    setIsPending(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim() }),
      });
      if (res.ok) {
        const newList = await res.json();
        setLists((prev) => [
          ...prev,
          { id: newList.id, name: newList.name, itemCount: 0 },
        ]);
        setNewListName("");
        setCreating(false);
        handleAddToList(newList.id, newList.name);
      }
    } finally {
      setIsPending(false);
    }
  }

  // "items", not "ingredients": the multi-item mode also serves pantry and
  // home selections, which are products rather than recipe ingredients.
  const headerSubtitle = isRecipeMode
    ? `${props.ingredients.length} item${props.ingredients.length !== 1 ? "s" : ""}`
    : props.productName;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-20" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white dark:bg-[#1e2528] rounded-t-[24px] z-30 pb-8">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f0f0] dark:border-[#2e3538]">
          <div>
            <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0]">
              Add to list
            </p>
            <p className="text-[12px] text-[#aaa] truncate max-w-[240px]">
              {headerSubtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
          >
            <X size={14} className="text-[#888]" />
          </button>
        </div>

        {/* Lists */}
        <div className="px-5 pt-3 max-h-[40vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-2 py-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[52px] rounded-xl bg-[#f4f4f4] dark:bg-[#242b2e] animate-pulse"
                />
              ))}
            </div>
          ) : lists.length === 0 ? (
            <p className="text-[13px] text-[#aaa] text-center py-6">
              No lists yet. Create one below.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {lists.map((list) => {
                const added = addedTo.has(list.id);
                return (
                  <button
                    key={list.id}
                    onClick={() => handleAddToList(list.id)}
                    disabled={isPending}
                    className={[
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all",
                      added
                        ? "border-[#00E5C3] bg-[#f0fdf9] dark:bg-[#1a2e2a]"
                        : "border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#242b2e]",
                    ].join(" ")}
                  >
                    <div className="text-left">
                      <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
                        {list.name}
                      </p>
                      <p className="text-[11px] text-[#aaa]">
                        {list.itemCount}{" "}
                        {list.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <div
                      className={[
                        "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                        added
                          ? "bg-[#00E5C3]"
                          : "border border-[#e0e0e0] dark:border-[#2e3538]",
                      ].join(" ")}
                    >
                      {added && (
                        <Check
                          size={12}
                          className="text-[#004d40]"
                          strokeWidth={2.5}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="px-5 pt-3 text-[12px] text-[#ef4444]">
            {error}
          </p>
        )}

        {/* Create new list */}
        <div className="px-5 pt-3">
          {creating ? (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                placeholder="List name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                className="flex-1 px-3 py-2.5 rounded-xl border border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#242b2e] text-[13px] text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none focus:border-[#00E5C3]"
              />
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim() || isPending}
                className="px-4 py-2.5 bg-[#00E5C3] rounded-xl text-[13px] font-medium text-[#004d40] disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setNewListName("");
                }}
                className="px-3 py-2.5 rounded-xl border border-[#e0e0e0] dark:border-[#2e3538] text-[13px] text-[#888]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[#e0e0e0] dark:border-[#2e3538] text-[13px] text-[#aaa] hover:border-[#00E5C3] hover:text-[#00b89e] transition-colors"
            >
              <Plus size={14} />
              New list
            </button>
          )}
        </div>
      </div>
    </>
  );
}
