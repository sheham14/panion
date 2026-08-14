"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, MoreHorizontal } from "lucide-react";

export type Recipe = {
  id: string;
  userId: string | null;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  estimatedCost: number | null;
  ingredients: {
    id: string;
    name: string;
    productId?: string | null;
    quantity?: number | null;
    unit?: string | null;
    productUnitQuantity?: number | null;
    productUnitMeasure?: string | null;
    productUnitSize?: string | null;
  }[];
};

function DeleteConfirmSheet({
  recipe,
  onConfirm,
  onCancel,
  deleting,
}: {
  recipe: Recipe;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white dark:bg-[#1e2528] rounded-t-[24px] z-40 pb-8">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="w-10 h-10 rounded-[12px] bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-3">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0] mb-1">
            Delete recipe?
          </p>
          <p className="text-[13px] text-[#aaa] leading-relaxed">
            &quot;{recipe.title}&quot; will be removed. This can&apos;t be undone.
          </p>
        </div>
        <div className="px-5 pt-3 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="w-full py-3 bg-red-500 rounded-[12px] text-[13px] font-medium text-white disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete recipe"}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-[12px] border border-[#e0e0e0] dark:border-[#2e3538] text-[13px] text-[#555] dark:text-[#aaa]"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

/** Where the menu should be pinned, measured when it is opened. */
type MenuPosition = { top: number; right: number };

function RecipeMenu({
  recipe,
  onDelete,
  onClose,
  position,
}: {
  recipe: Recipe;
  onDelete: () => void;
  onClose: () => void;
  position: MenuPosition;
}) {
  // Position is measured in the opening click handler and passed in. Reading
  // `buttonRef.current.getBoundingClientRect()` during render (the previous
  // approach) is unsafe: the ref isn't guaranteed to be populated on the first
  // render, which silently pinned the menu to the top-left corner.
  const { top, right } = position;

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className="fixed z-30 bg-white dark:bg-[#242b2e] border border-[#ebebeb] dark:border-[#2e3538] rounded-[12px] shadow-lg overflow-hidden min-w-[140px]"
        style={{ top, right }}
      >
        <Link
          href={`/recipes/${recipe.id}/edit`}
          onClick={onClose}
          className="flex items-center gap-2.5 px-4 py-3 text-[13px] text-[#111] dark:text-[#e0e0e0] hover:bg-[#f7f7f7] dark:hover:bg-[#2e3538] transition-colors border-b border-[#f5f5f5] dark:border-[#2e3538]"
        >
          <Pencil size={13} className="text-[#aaa]" />
          Edit
        </Link>
        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>
    </>
  );
}

export function RecipeCard({
  recipe,
  currentUserId,
  onAddToList,
  onDeleted,
}: {
  recipe: Recipe;
  currentUserId: string;
  onAddToList: (recipe: Recipe) => void;
  onDeleted: (id: string) => void;
}) {
  // Doubles as the open flag: non-null means the menu is showing.
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = recipe.userId === currentUserId;
  const totalTime = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDeleted(recipe.id);
      }
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="relative mx-4 mb-3 bg-white dark:bg-[#1e2528] border border-[#ebebeb] dark:border-[#2e3538] rounded-[14px] overflow-hidden">
        <div className="flex items-center gap-3 p-3.5">
          <div className="w-12 h-12 rounded-[10px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[22px] flex-shrink-0">
            🍽️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] truncate">
              {recipe.title}
            </p>
            <p className="text-[12px] text-[#aaa] mt-0.5">
              {recipe.servings} servings
              {totalTime > 0 && ` · ${totalTime} min`}
              {` · ${recipe.ingredients.length} ingredients`}
            </p>
          </div>

          {isOwner && (
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => {
                  // Measure here rather than during the menu's render: event
                  // handlers are a safe place to read layout, and this captures
                  // the button's position at the moment it was clicked.
                  if (menuPosition) {
                    setMenuPosition(null);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPosition({
                    top: rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                  });
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#f4f4f4] dark:hover:bg-[#242b2e] transition-colors"
              >
                <MoreHorizontal size={15} className="text-[#aaa]" />
              </button>
              {menuPosition && (
                <RecipeMenu
                  recipe={recipe}
                  onDelete={() => setConfirmDelete(true)}
                  onClose={() => setMenuPosition(null)}
                  position={menuPosition}
                />
              )}
            </div>
          )}
        </div>

        {recipe.estimatedCost && (
          <div className="flex items-center justify-between px-3.5 py-2 bg-[#f0fdf9] dark:bg-[#1a2e2a] border-t border-[#e0faf4] dark:border-[#1e4a3a]">
            <span className="text-[13px] text-[#0a7a62] dark:text-[#6ee7c7]">
              Estimated cost
            </span>
            <span className="text-[13px] font-semibold text-[#0a7a62] dark:text-[#6ee7c7]">
              ${recipe.estimatedCost.toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex border-t border-[#f5f5f5] dark:border-[#2e3538]">
          <button
            onClick={() => onAddToList(recipe)}
            className="flex-1 py-2.5 text-[13px] font-medium text-[#00b89e] text-center"
          >
            Add all to list
          </button>
          <div className="w-px bg-[#f5f5f5] dark:bg-[#2e3538]" />
          <Link
            href={`/recipes/${recipe.id}`}
            className="flex-1 py-2.5 text-[13px] font-medium text-[#00b89e] text-center"
          >
            View
          </Link>
        </div>
      </div>

      {confirmDelete && (
        <DeleteConfirmSheet
          recipe={recipe}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          deleting={deleting}
        />
      )}
    </>
  );
}

export function RecipeFAB() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push("/recipes/new")}
      className="fixed bottom-above-nav right-4 z-10 w-12 h-12 bg-[#00E5C3] rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      aria-label="New recipe"
    >
      <Plus size={22} className="text-[#004d40]" strokeWidth={2.5} />
    </button>
  );
}
