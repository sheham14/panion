"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical, Clock, Users, Image } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type IngredientRow = {
  id: string; // temp client id or DB id
  name: string;
  quantity: string;
  unit: string;
  notes: string;
  isOptional: boolean;
};

type StepRow = {
  id: string;
  text: string;
  timerMinutes: string;
};

export type RecipeFormData = {
  id?: string; // present in edit mode
  title: string;
  description: string;
  imageUrl: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
};

type Props = {
  initial: RecipeFormData;
  mode: "create" | "edit";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function emptyIngredient(): IngredientRow {
  return {
    id: uid(),
    name: "",
    quantity: "",
    unit: "",
    notes: "",
    isOptional: false,
  };
}

function emptyStep(): StepRow {
  return { id: uid(), text: "", timerMinutes: "" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.6px] text-[#aaa] mb-2">
      {children}
    </p>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] text-[#aaa] mb-1">{label}</p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#242b2e] text-[13px] text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none focus:border-[#00E5C3] transition-colors";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RecipeForm({ initial, mode }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [prepTime, setPrepTime] = useState(initial.prepTime);
  const [cookTime, setCookTime] = useState(initial.cookTime);
  const [servings, setServings] = useState(initial.servings);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial.ingredients.length > 0 ? initial.ingredients : [emptyIngredient()],
  );
  const [steps, setSteps] = useState<StepRow[]>(
    initial.steps.length > 0 ? initial.steps : [emptyStep()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Ingredient handlers ──────────────────────────────────────────────────
  function updateIngredient(
    id: string,
    field: keyof IngredientRow,
    value: string | boolean,
  ) {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing)),
    );
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  }

  // ── Step handlers ────────────────────────────────────────────────────────
  function updateStep(id: string, field: keyof StepRow, value: string) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (ingredients.some((ing) => !ing.name.trim())) {
      setError("All ingredients must have a name");
      return;
    }
    if (steps.some((s) => !s.text.trim())) {
      setError("All steps must have instructions");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
      prepTime: prepTime ? parseInt(prepTime) : null,
      cookTime: cookTime ? parseInt(cookTime) : null,
      servings: servings ? parseInt(servings) : null,
      instructions: steps.map((s) => ({
        text: s.text.trim(),
        timerMinutes: s.timerMinutes ? parseInt(s.timerMinutes) : null,
      })),
      ingredients: ingredients.map((ing, index) => ({
        name: ing.name.trim(),
        quantity: ing.quantity ? parseFloat(ing.quantity) : null,
        unit: ing.unit.trim() || null,
        notes: ing.notes.trim() || null,
        isOptional: ing.isOptional,
        sortOrder: index,
      })),
    };

    try {
      const url =
        mode === "edit" ? `/api/recipes/${initial.id}` : "/api/recipes";
      const method = mode === "edit" ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
        return;
      }

      const saved = await res.json();
      router.push(`/recipes/${saved.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#f7f7f7] dark:bg-[#161b1e] min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-safe z-10 bg-white dark:bg-[#1e2528] border-b border-[#f0f0f0] dark:border-[#2e3538] px-4 h-[52px] flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-[13px] text-[#aaa]"
        >
          Cancel
        </button>
        <p className="text-[14px] font-medium text-[#111] dark:text-[#e0e0e0]">
          {mode === "edit" ? "Edit recipe" : "New recipe"}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[13px] font-medium text-[#00b89e] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="px-4 pt-4 flex flex-col gap-5">
        {/* Basic info */}
        <div className="bg-white dark:bg-[#1e2528] rounded-[14px] border border-[#ebebeb] dark:border-[#2e3538] p-4 flex flex-col gap-3">
          <SectionLabel>Basic info</SectionLabel>

          <Field label="Title">
            <input
              type="text"
              placeholder="e.g. Spaghetti Carbonara"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Description">
            <textarea
              placeholder="Short description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </Field>

          <Field label="Image URL">
            <div className="relative">
              <Image
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"
              />
              <input
                type="url"
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={`${inputCls} pl-8`}
              />
            </div>
          </Field>
        </div>

        {/* Times + servings */}
        <div className="bg-white dark:bg-[#1e2528] rounded-[14px] border border-[#ebebeb] dark:border-[#2e3538] p-4">
          <SectionLabel>Time & servings</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Prep (min)">
              <div className="relative">
                <Clock
                  size={12}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="10"
                  value={prepTime}
                  onChange={(e) => setPrepTime(e.target.value)}
                  className={`${inputCls} pl-7`}
                />
              </div>
            </Field>
            <Field label="Cook (min)">
              <div className="relative">
                <Clock
                  size={12}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="20"
                  value={cookTime}
                  onChange={(e) => setCookTime(e.target.value)}
                  className={`${inputCls} pl-7`}
                />
              </div>
            </Field>
            <Field label="Servings">
              <div className="relative">
                <Users
                  size={12}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="4"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  className={`${inputCls} pl-7`}
                />
              </div>
            </Field>
          </div>
        </div>

        {/* Ingredients */}
        <div className="bg-white dark:bg-[#1e2528] rounded-[14px] border border-[#ebebeb] dark:border-[#2e3538] p-4">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Ingredients</SectionLabel>
            <span className="text-[11px] text-[#aaa]">
              {ingredients.length} items
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {ingredients.map((ing, i) => (
              <div
                key={ing.id}
                className="flex flex-col gap-2 pb-3 border-b border-[#f5f5f5] dark:border-[#2a3044] last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <GripVertical
                    size={14}
                    className="text-[#ddd] dark:text-[#3a4044] flex-shrink-0"
                  />
                  <input
                    type="text"
                    placeholder="Ingredient name"
                    value={ing.name}
                    onChange={(e) =>
                      updateIngredient(ing.id, "name", e.target.value)
                    }
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    onClick={() => removeIngredient(ing.id)}
                    disabled={ingredients.length === 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#ddd] dark:text-[#3a4044] hover:text-red-400 disabled:opacity-30 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex gap-2 pl-5">
                  <input
                    type="number"
                    min="0"
                    placeholder="Qty"
                    value={ing.quantity}
                    onChange={(e) =>
                      updateIngredient(ing.id, "quantity", e.target.value)
                    }
                    className={`${inputCls} w-20`}
                  />
                  <input
                    type="text"
                    placeholder="Unit"
                    value={ing.unit}
                    onChange={(e) =>
                      updateIngredient(ing.id, "unit", e.target.value)
                    }
                    className={`${inputCls} w-20`}
                  />
                  <input
                    type="text"
                    placeholder="Notes (diced, room temp…)"
                    value={ing.notes}
                    onChange={(e) =>
                      updateIngredient(ing.id, "notes", e.target.value)
                    }
                    className={`${inputCls} flex-1`}
                  />
                </div>
                <div className="flex items-center gap-2 pl-5">
                  <button
                    onClick={() =>
                      updateIngredient(ing.id, "isOptional", !ing.isOptional)
                    }
                    className={[
                      "text-[11px] px-2.5 py-1 rounded-lg border transition-colors",
                      ing.isOptional
                        ? "border-[#00E5C3] bg-[#f0fdf9] dark:bg-[#1a2e2a] text-[#00b89e]"
                        : "border-[#e0e0e0] dark:border-[#2e3538] text-[#bbb]",
                    ].join(" ")}
                  >
                    Optional
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addIngredient}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[#e0e0e0] dark:border-[#2e3538] text-[12px] text-[#aaa] hover:border-[#00E5C3] hover:text-[#00b89e] transition-colors"
          >
            <Plus size={13} />
            Add ingredient
          </button>
        </div>

        {/* Steps */}
        <div className="bg-white dark:bg-[#1e2528] rounded-[14px] border border-[#ebebeb] dark:border-[#2e3538] p-4">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Steps</SectionLabel>
            <span className="text-[11px] text-[#aaa]">
              {steps.length} steps
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <div
                key={step.id}
                className="flex flex-col gap-2 pb-3 border-b border-[#f5f5f5] dark:border-[#2a3044] last:border-0 last:pb-0"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[#f0fdf9] dark:bg-[#1a2e2a] border border-[#b2f0e4] dark:border-[#1e4a3a] flex items-center justify-center mt-2.5">
                    <span className="text-[9px] font-medium text-[#00b89e]">
                      {i + 1}
                    </span>
                  </div>
                  <textarea
                    placeholder="Describe this step…"
                    value={step.text}
                    onChange={(e) =>
                      updateStep(step.id, "text", e.target.value)
                    }
                    rows={3}
                    className={`${inputCls} flex-1 resize-none`}
                  />
                  <button
                    onClick={() => removeStep(step.id)}
                    disabled={steps.length === 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#ddd] dark:text-[#3a4044] hover:text-red-400 disabled:opacity-30 transition-colors flex-shrink-0 mt-1.5"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <Clock size={12} className="text-[#bbb] flex-shrink-0" />
                  <input
                    type="number"
                    min="0"
                    placeholder="Timer (minutes, optional)"
                    value={step.timerMinutes}
                    onChange={(e) =>
                      updateStep(step.id, "timerMinutes", e.target.value)
                    }
                    className={`${inputCls} flex-1`}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addStep}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[#e0e0e0] dark:border-[#2e3538] text-[12px] text-[#aaa] hover:border-[#00E5C3] hover:text-[#00b89e] transition-colors"
          >
            <Plus size={13} />
            Add step
          </button>
        </div>
      </div>
    </div>
  );
}
