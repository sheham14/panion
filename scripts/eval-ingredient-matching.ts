import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";

/*
 * Side-by-side of models for recipe ingredient matching.
 *
 *   npx tsx scripts/eval-ingredient-matching.ts [--production] [--out file.json]
 *
 * Runs the real `matchIngredientsToGroups` (same prompt, same group list the
 * live matcher offers) over every active recipe's unlinked ingredients plus a
 * set of known traps, once per model/effort below, and prints where they
 * disagree. Read-only: nothing is written to the database. Every run calls
 * the API and costs money (cents, not dollars, at this size).
 *
 * Kept because complete.ts says to re-run the comparison before switching
 * ingredient matching to a cheaper model.
 */

const TARGET_PRODUCTION = process.argv.includes("--production");
loadEnv({ path: ".env", quiet: true });
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
loadEnv({ path: ".env.local", override: true, quiet: true });
if (TARGET_PRODUCTION) process.env.DATABASE_URL = PRODUCTION_DATABASE_URL;
if (TARGET_PRODUCTION && !/neon\.tech/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("\n❌ --production expects the Neon database. Refusing to run.\n");
  process.exit(1);
}

const CANDIDATES = [
  { model: "claude-opus-5-5", effort: "low" },
  { model: "claude-haiku-5-5", effort: "low" },
  { model: "claude-haiku-5-5", effort: "medium" },
] as const;

/** Ingredients that have caught a model out, or easily could. */
const TRAPS = [
  "Plain yogurt", // Haiku 4.5 picked Greek yogurt (2026-10-06)
  "Butter", // salted butter, never peanut butter
  "Unsalted butter",
  "Milk", // an everyday milk, not chocolate or condensed
  "Skim milk",
  "Cheddar", // block cheddar unless it says shredded
  "1 cup shredded mozzarella",
  "Parmesan cheese",
  "Cream cheese",
  "Peanut butter",
  "Eggs",
  "Bread",
  "Bacon",
  "Water",
  "Salt to taste",
  "Ice",
];

type Run = { slugs: (string | null)[] | null; ms: number; inTok: number; outTok: number };

async function main() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > 0 ? process.argv[outIdx + 1] : null;

  const { prisma } = await import("@/lib/prisma");
  const { matchIngredientsToGroups } = await import("@/lib/recipes/match-ingredients");
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  console.log(`Database: ${new URL(process.env.DATABASE_URL ?? "").host}`);

  // The same list ensureIngredientGroups offers: groups with a priced product.
  const groups = (
    await prisma.product.findMany({
      where: {
        isActive: true,
        subcategory: { not: null },
        storeProducts: { some: { isActive: true, currentPrice: { not: null } } },
      },
      select: { subcategory: true },
      distinct: ["subcategory"],
      orderBy: { subcategory: "asc" },
    })
  ).map((r) => r.subcategory as string);

  const recipes = await prisma.recipe.findMany({
    where: { isActive: true },
    select: {
      title: true,
      ingredients: {
        where: { productId: null },
        select: { name: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { title: "asc" },
  });
  const cases = [
    ...recipes.map((r) => ({ title: r.title, names: r.ingredients.map((i) => i.name) })),
    { title: "Traps", names: TRAPS },
  ].filter((c) => c.names.length > 0);
  console.log(`${groups.length} groups · ${cases.length} cases · ${cases.reduce((n, c) => n + c.names.length, 0)} ingredients\n`);

  const results: Record<string, Run[]> = {};
  for (const cand of CANDIDATES) {
    const key = `${cand.model}@${cand.effort}`;
    results[key] = [];
    for (const c of cases) {
      let inTok = 0;
      let outTok = 0;
      const started = Date.now();
      const slugs = await matchIngredientsToGroups(c.names, groups, async ({ system, prompt, maxTokens = 4096 }) => {
        const res = await client.messages.create({
          model: cand.model,
          max_tokens: maxTokens,
          output_config: { effort: cand.effort },
          system,
          messages: [{ role: "user", content: prompt }],
        });
        inTok += res.usage.input_tokens;
        outTok += res.usage.output_tokens;
        if (res.stop_reason === "refusal") return null;
        return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") || null;
      });
      results[key].push({ slugs, ms: Date.now() - started, inTok, outTok });
      process.stdout.write(".");
    }
    process.stdout.write(` ${key}\n`);
  }

  // Report: per-candidate totals, then every ingredient where any disagree.
  const keys = Object.keys(results);
  console.log();
  for (const key of keys) {
    const runs = results[key];
    const failed = runs.filter((r) => r.slugs === null).length;
    const ms = runs.reduce((n, r) => n + r.ms, 0);
    const inTok = runs.reduce((n, r) => n + r.inTok, 0);
    const outTok = runs.reduce((n, r) => n + r.outTok, 0);
    console.log(`${key.padEnd(26)} ${(ms / runs.length / 1000).toFixed(1)}s/recipe  in ${inTok}  out ${outTok}  failed ${failed}`);
  }

  const base = keys[0];
  let total = 0;
  const agree: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const diffs: string[] = [];
  cases.forEach((c, ci) => {
    c.names.forEach((name, ni) => {
      total += 1;
      const picks = keys.map((k) => results[k][ci].slugs?.[ni] ?? null);
      keys.forEach((k, ki) => {
        if (picks[ki] === picks[0]) agree[k] += 1;
      });
      if (new Set(picks).size > 1) {
        diffs.push(`  ${c.title} · ${name}\n${keys.map((k, ki) => `      ${k.padEnd(26)} ${picks[ki] ?? "—"}`).join("\n")}`);
      }
    });
  });
  console.log(`\nAgreement with ${base} over ${total} ingredients:`);
  for (const k of keys.slice(1)) console.log(`  ${k.padEnd(26)} ${agree[k]}/${total}`);
  console.log(`\nDisagreements (${diffs.length}):\n${diffs.join("\n")}`);

  if (outPath) {
    writeFileSync(outPath, JSON.stringify({ groups: groups.length, cases, results }, null, 2));
    console.log(`\nFull results: ${outPath}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
