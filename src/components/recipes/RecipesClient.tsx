"use client";

import { useState } from "react";
import { ChefHat } from "lucide-react";
import {
  RecipeCard,
  RecipeFAB,
  type Recipe,
} from "@/components/recipes/RecipeCard";
import AddToListSheet from "@/components/search/AddToListSheet";

export default function RecipesClient({
  initialRecipes,
  currentUserId,
}: {
  initialRecipes: Recipe[];
  currentUserId: string;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [addToListRecipe, setAddToListRecipe] = useState<Recipe | null>(null);
  const [search, setSearch] = useState("");

  const filteredRecipes = recipes.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="h-[calc(100dvh-72px)] bg-white dark:bg-[#0f1416] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <p className="text-[20px] font-medium text-[#111] dark:text-[#e0e0e0]">
          Recipes
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-[100px]">
        {recipes.length > 0 && (
          <div className="px-4 pt-1 pb-1">
            <div className="flex items-center gap-2 bg-[#f5f5f5] dark:bg-[#1e2528] rounded-[12px] px-3 h-[38px]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#aaa] flex-shrink-0">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipes…"
                className="flex-1 bg-transparent text-[13px] text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-[#bbb]">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
        <div className="pt-2">
          {recipes.length === 0 ? (
            <div className="flex flex-col items-center py-16 px-8 text-center">
              <div className="w-14 h-14 rounded-[18px] bg-[#f0fdf9] dark:bg-[#1a2e2a] flex items-center justify-center mb-4">
                <ChefHat size={24} className="text-[#00b89e]" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0] mb-2">
                No recipes yet
              </p>
              <p className="text-[13px] text-[#aaa] leading-relaxed mb-6">
                Create your first recipe and add all its ingredients to a list in one tap.
              </p>
              <button
                onClick={() => { window.location.href = "/recipes/new"; }}
                className="px-5 py-2.5 bg-[#00E5C3] rounded-xl text-[13px] font-medium text-[#004d40]"
              >
                Create recipe
              </button>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <p className="text-center text-[13px] text-[#aaa] pt-12">
              No recipes match &ldquo;{search}&rdquo;
            </p>
          ) : (
            filteredRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                currentUserId={currentUserId}
                onAddToList={(r) => setAddToListRecipe(r)}
                onDeleted={(id) =>
                  setRecipes((prev) => prev.filter((r) => r.id !== id))
                }
              />
            ))
          )}
        </div>
      </div>

      <RecipeFAB />

      {addToListRecipe && (
        <AddToListSheet
          mode="recipe"
          ingredients={addToListRecipe.toBuy ?? addToListRecipe.ingredients}
          onClose={() => setAddToListRecipe(null)}
        />
      )}
    </div>
  );
}
