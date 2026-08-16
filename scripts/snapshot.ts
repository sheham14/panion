import { config as loadEnv } from "dotenv";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

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

const SNAPSHOT_PATH = resolve(process.cwd(), "prisma/snapshots/catalogue.json");

type Snapshot = {
  takenAt: string;
  counts: { products: number; storeProducts: number };
  products: unknown[];
  storeProducts: unknown[];
};

async function save() {
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

  console.log(`\n✅ Snapshot saved → prisma/snapshots/catalogue.json`);
  console.log(`   ${products.length} products, ${storeProducts.length} store products`);
  console.log(`   taken ${snapshot.takenAt}\n`);

  await prisma.$disconnect();
}

async function restore() {
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
