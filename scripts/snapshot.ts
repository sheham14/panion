import { config as loadEnv } from "dotenv";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

/*
 * Local by default, matching `prisma.config.ts` (CLAUDE.md rule 2).
 *
 * `--production` is accepted for **save only**, and writes to a separate file.
 * Restoring to production is refused outright: STATUS.md's standing warning is
 * that production holds captured prices no local snapshot has, so pushing a
 * snapshot over it destroys exactly the data that was expensive to collect.
 * Two files rather than one so a production save can never be mistaken for the
 * local snapshot a later restore would read.
 */
const TARGET_PRODUCTION = process.argv.includes("--production");

loadEnv({ path: ".env" });
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
loadEnv({ path: ".env.local", override: true });
if (TARGET_PRODUCTION) process.env.DATABASE_URL = PRODUCTION_DATABASE_URL;

if (TARGET_PRODUCTION && !/neon\.tech/i.test(process.env.DATABASE_URL ?? "")) {
  console.error(
    "\n❌ --production expects the Neon database, but .env does not resolve to one. Refusing to run.\n",
  );
  process.exit(1);
}

/**
 * Save / restore a known-good catalogue snapshot.
 *
 *   npm run snapshot:save      # after a scrape you're happy with
 *   npm run snapshot:restore   # put it back
 *
 * This is the demo safety net, and it is deliberately a snapshot of **real
 * data** rather than a parallel set of hand-written products. Falling back to
 * invented prices mid-demo is worse than showing nothing: you end up quoting
 * numbers you can't stand behind, and the fabricated seed data is exactly what
 * caused the barcode corruption this pipeline had to be hardened against.
 *
 * Restores products, store-products and their current prices — not users,
 * lists, or history, which are per-environment and shouldn't travel.
 */

const SNAPSHOT_NAME = TARGET_PRODUCTION
  ? "catalogue.production.json"
  : "catalogue.json";
const SNAPSHOT_PATH = resolve(process.cwd(), `prisma/snapshots/${SNAPSHOT_NAME}`);

type Snapshot = {
  takenAt: string;
  counts: { products: number; storeProducts: number };
  products: unknown[];
  storeProducts: unknown[];
};

function hostOf(): string {
  return (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "(unknown)";
}

async function save() {
  console.log(`
▸ Snapshot source: ${hostOf()}${TARGET_PRODUCTION ? "  [--production]" : ""}`);
  const { prisma } = await import("@/lib/prisma");

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
  const storeProducts = await prisma.storeProduct.findMany({
    where: { product: { isActive: true } },
    orderBy: { id: "asc" },
  });

  const snapshot: Snapshot = {
    takenAt: new Date().toISOString(),
    counts: { products: products.length, storeProducts: storeProducts.length },
    products,
    storeProducts,
  };

  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(
    SNAPSHOT_PATH,
    // Decimal columns serialize as objects otherwise.
    JSON.stringify(snapshot, (_k, v) => (typeof v === "bigint" ? String(v) : v), 2),
  );

  console.log(`\n✅ Snapshot saved → prisma/snapshots/${SNAPSHOT_NAME}`);
  console.log(`   ${products.length} products, ${storeProducts.length} store products`);
  console.log(`   taken ${snapshot.takenAt}\n`);

  await prisma.$disconnect();
}

async function restore() {
  if (TARGET_PRODUCTION) {
    console.error(
      [
        "",
        "❌ Refusing to restore to production.",
        "   Production holds captured prices that no snapshot has, so a restore",
        "   overwrites the expensive data with a stale copy (STATUS.md, top).",
        "   If this is genuinely what you want, do it deliberately by hand.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
  console.log(`
▸ Restore target: ${hostOf()}`);
  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`\n❌ No snapshot at prisma/snapshots/catalogue.json`);
    console.error(`   Run \`npm run snapshot:save\` after a good scrape first.\n`);
    process.exit(1);
  }

  const { prisma } = await import("@/lib/prisma");
  const snap: Snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));

  console.log(`\n▸ Restoring snapshot from ${snap.takenAt}`);
  console.log(`  ${snap.counts.products} products, ${snap.counts.storeProducts} store products`);

  // Upsert rather than wipe: watchlists and list items reference products, and
  // a restore shouldn't cascade them away.
  let products = 0;
  for (const raw of snap.products) {
    const p = raw as Record<string, unknown> & { id: string };
    const { id, createdAt, updatedAt, ...data } = p;
    void createdAt;
    void updatedAt; // timestamps are regenerated on write
    await prisma.product.upsert({
      where: { id },
      update: data as never,
      create: { id, ...data } as never,
    });
    products += 1;
  }

  let storeProducts = 0;
  for (const raw of snap.storeProducts) {
    const sp = raw as Record<string, unknown> & { id: string };
    const { id, createdAt, updatedAt, ...data } = sp;
    void createdAt;
    void updatedAt;
    await prisma.storeProduct.upsert({
      where: { id },
      update: data as never,
      create: { id, ...data } as never,
    });
    storeProducts += 1;
  }

  console.log(`\n✅ Restored ${products} products, ${storeProducts} store products\n`);
  await prisma.$disconnect();
}

const cmd = process.argv[2];
const run = cmd === "save" ? save : cmd === "restore" ? restore : null;

if (!run) {
  console.error("Usage: tsx scripts/snapshot.ts <save|restore>");
  process.exit(1);
}

run().catch((err) => {
  console.error(`\n❌ Snapshot ${cmd} failed:`, err);
  process.exit(1);
});
