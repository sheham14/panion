import { config as loadEnv } from "dotenv";
import { PrismaClient } from "./generated/client";
import { UserRole, ConsentType } from "./generated/enums";
import { PrismaPg } from "@prisma/adapter-pg";

// Same precedence as prisma.config.ts and Next.js: .env, then .env.local wins.
// Without this the script only worked via `prisma db seed` (which loads env
// through prisma.config.ts) and failed when run directly with tsx.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — check .env / .env.local");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/**
 * Seed — reference data only.
 *
 * This used to create 80 hand-written products with fabricated barcodes and an
 * invented price matrix, and the scrapers then matched real store data *onto*
 * that fiction, discarding ~98% of what they fetched. The catalogue now comes
 * from real store data instead:
 *
 *   npm run catalogue:import     # builds ~250 real products from PC Express
 *   npm run scrape:dominion      # refresh regular prices
 *   npm run scrape:flipp         # overlay weekly flyer sales
 *   npm run snapshot:save        # capture a known-good state before a demo
 *
 * What remains here is only what cannot be scraped: stores, dev users, system
 * recipes and consent logs.
 */

async function main() {
  console.log("🌱 Seeding Panion database...");

  // ─── STORES ───────────────────────────────────────────────
  // St. John's / Mount Pearl area stores.
  //
  // Loblaws and Metro: neither operates in NL. Dollarama: not a grocery store.
  // Costco: removed deliberately — wholesale pack sizes don't compare
  //   like-for-like to a household shelf price, and costco.ca bakes shipping
  //   into grocery prices (8-49% above warehouse), so there is no honest
  //   automated source. See PRICING-PIPELINE.md §6.4.
  const stores = await Promise.all([
    prisma.store.upsert({
      where: { id: "store_walmart" },
      update: {},
      create: {
        id: "store_walmart",
        chain: "walmart",
        name: "Walmart Supercentre - St. John's",
        address: "50 Kelsey Dr",
        city: "St. John's",
        province: "NL",
        postalCode: "A1B 4P1",
        isActive: true,
      },
    }),
    prisma.store.upsert({
      where: { id: "store_dominion" },
      update: {},
      create: {
        id: "store_dominion",
        chain: "dominion",
        name: "Dominion - Stavanger Dr",
        address: "55 Stavanger Dr", // per the PC Express store record (id 0924)
        city: "St. John's",
        province: "NL",
        postalCode: "A1A 5E8",
        isActive: true,
      },
    }),
    prisma.store.upsert({
      where: { id: "store_sobeys" },
      update: {},
      create: {
        id: "store_sobeys",
        chain: "sobeys",
        name: "Sobeys - Mount Pearl",
        address: "760 Topsail Rd",
        city: "Mount Pearl",
        province: "NL",
        postalCode: "A1N 3J5",
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ ${stores.length} chain stores created`);

  // ─── NL INDEPENDENT STORES (flyer-only) ───────────────────
  // Only independents with an actual St. John's metro presence belong here.
  //
  // Flipp returns flyers for a *region*, not a city, so appearing in an
  // A1B 4P1 query is NOT evidence of a St. John's location — Powell's,
  // BidGood's, Clover Farm, Value Grocer and Marie's Mini Mart all surfaced
  // that way and were removed. Verify a real local store before adding one.
  //
  // `chain` holds Flipp's merchant_name lowercased — the join key the Flipp
  // adapter maps on. Address is null because Colemans is multi-location and we
  // serve chain-level pricing (PRICING-PIPELINE.md §12.1).
  const localStores = await Promise.all(
    (
      [
        { id: "store_colemans", chain: "colemans", name: "Colemans" },
        // Loblaw's discount banner. Flyer-only for now like Colemans; it runs
        // on the same PC Express platform as Dominion, so it can move to full
        // catalogue mapping once that adapter exists (PRICING-PIPELINE.md §6.1).
        { id: "store_nofrills", chain: "no frills", name: "No Frills" },
      ] as const
    ).map((s) =>
      prisma.store.upsert({
        where: { id: s.id },
        update: { chain: s.chain, name: s.name },
        create: {
          id: s.id,
          chain: s.chain,
          name: s.name,
          city: "St. John's",
          province: "NL",
          isActive: true,
        },
      }),
    ),
  );
  console.log(`✅ ${localStores.length} NL independent stores created (flyer-only)`);

  // ─── USERS ────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: "admin@sentinel.ca" },
    update: {},
    create: {
      email: "admin@sentinel.ca",
      name: "Sentinel Admin",
      role: UserRole.moderator,
      onboardingCompleted: true,
    },
  });

  const testUser = await prisma.user.upsert({
    where: { email: "test@sentinel.ca" },
    update: {},
    create: {
      email: "test@sentinel.ca",
      name: "Test User",
      role: UserRole.consumer,
      onboardingCompleted: true,
      emailNotifications: true,
    },
  });
  console.log("✅ 2 users created");

  // ─── RECIPES ──────────────────────────────────────────────
  // 4 system recipes (userId: null — copied to each new user on signup).
  // Ingredients are free text. They are deliberately NOT linked to products:
  // the catalogue is imported from real store data (npm run catalogue:import),
  // so there are no fixed ids to reference here. RecipeIngredient.productId
  // is nullable and gets linked by name matching once a catalogue exists.

  // Delete existing system recipes so re-seeding never creates duplicates.
  // Cascade delete on RecipeIngredient handles ingredients automatically.
  await prisma.recipe.deleteMany({ where: { userId: null } });

  const recipes = await Promise.all([

    // 1. SPAGHETTI AGLIO E OLIO
    prisma.recipe.create({
      data: {
        title: "Spaghetti Aglio e Olio",
        description: "Classic Italian pasta with garlic and olive oil. Ready in 20 minutes.",
        prepTime: 5,
        cookTime: 15,
        servings: 2,
        instructions: [
          { text: "Bring a large pot of salted water to a boil. Cook spaghetti until al dente. Reserve ¼ cup of pasta water before draining.", timerMinutes: 10 },
          { text: "Thinly slice the garlic. Heat olive oil in a large skillet over medium-low heat and sauté garlic until golden and fragrant — do not let it burn.", timerMinutes: 5 },
          { text: "Add drained pasta to the skillet with a splash of pasta water. Toss well to coat. Add red pepper flakes if using.", timerMinutes: null },
          { text: "Serve immediately topped with fresh parsley and a drizzle of good olive oil.", timerMinutes: null },
        ],
        ingredients: {
          create: [
            { name: "Spaghetti",         quantity: 200, unit: "g",  sortOrder: 0 },
            { name: "Olive oil",         quantity: 60,  unit: "ml", sortOrder: 1 },
            { name: "Garlic cloves",     quantity: 4,               sortOrder: 2 },
            { name: "Fresh parsley",               quantity: 10, unit: "g",                              sortOrder: 3 },
            { name: "Red pepper flakes",           quantity: 1,  unit: "g",   isOptional: true,          sortOrder: 4 },
            { name: "Salt",                                                    isOptional: false,         sortOrder: 5 },
          ],
        },
      },
    }),

    // 2. MAPLE GLAZED SALMON
    prisma.recipe.create({
      data: {
        title: "Maple Glazed Salmon",
        description: "Canadian classic. Sweet maple glaze on pan-seared Atlantic salmon.",
        prepTime: 10,
        cookTime: 15,
        servings: 2,
        instructions: [
          { text: "Whisk together maple syrup, soy sauce, and minced garlic. Pat salmon fillets dry, place in a shallow dish, and pour marinade over. Let sit.", timerMinutes: 10 },
          { text: "Heat olive oil in a skillet over medium-high heat. Place salmon skin-side down and sear without moving.", timerMinutes: 4 },
          { text: "Flip the salmon, pour the remaining glaze over top, and cook until cooked through and glaze is caramelized.", timerMinutes: 3 },
          { text: "Rest for 2 minutes before serving.", timerMinutes: 2 },
        ],
        ingredients: {
          create: [
            { name: "Atlantic salmon fillet", quantity: 400, unit: "g",  sortOrder: 0 },
            { name: "Maple syrup",            quantity: 30,  unit: "ml", sortOrder: 1 },
            { name: "Soy sauce",              quantity: 15,  unit: "ml", sortOrder: 2 },
            { name: "Garlic clove",           quantity: 2,               sortOrder: 3 },
            { name: "Olive oil",             quantity: 15,  unit: "ml", sortOrder: 4 },
          ],
        },
      },
    }),

    // 3. CAESAR SALAD
    prisma.recipe.create({
      data: {
        title: "Caesar Salad",
        description: "Classic Caesar with homemade dressing. Simple and crowd-pleasing.",
        prepTime: 15,
        cookTime: 0,
        servings: 4,
        instructions: [
          { text: "Whisk together mayonnaise, fresh lemon juice, minced garlic, grated parmesan, and worcestershire sauce until smooth. Season with salt and pepper.", timerMinutes: null },
          { text: "Chop romaine into bite-sized pieces and add to a large bowl. Pour dressing over and toss well to coat every leaf.", timerMinutes: null },
          { text: "Top with croutons and extra shaved parmesan. Serve immediately.", timerMinutes: null },
        ],
        ingredients: {
          create: [
            { name: "Romaine lettuce",   quantity: 1,  sortOrder: 0 },
            { name: "Parmesan",          quantity: 50, unit: "g",  sortOrder: 1 },
            { name: "Lemon",             quantity: 1,  sortOrder: 2 },
            { name: "Garlic clove",      quantity: 2,  sortOrder: 3 },
            { name: "Mayonnaise",     quantity: 60,  unit: "ml", sortOrder: 4 },
            { name: "Croutons",       quantity: 50,  unit: "g",  isOptional: true, sortOrder: 5 },
            { name: "Worcestershire sauce", quantity: 5, unit: "ml", sortOrder: 6 },
          ],
        },
      },
    }),

    // 4. JIGGS DINNER
    // NL's most iconic meal — salt beef and root vegetables, simmered low and slow.
    // Served every Sunday in kitchens across the island.
    prisma.recipe.create({
      data: {
        title: "Jiggs Dinner",
        description: "Newfoundland's beloved Sunday tradition. Salt beef and root vegetables simmered low and slow — pure NL comfort food.",
        prepTime: 10,
        cookTime: 120,
        servings: 6,
        instructions: [
          { text: "The night before: place salt beef in a large bowl, cover with cold water, and soak overnight to draw out the salt. Change the water once. Drain before cooking.", timerMinutes: null },
          { text: "Place the soaked salt beef in a large pot. Cover with fresh cold water and bring to a boil. Reduce to a gentle simmer.", timerMinutes: null },
          { text: "Simmer the salt beef for 90 minutes until it begins to get tender.", timerMinutes: 90 },
          { text: "Add turnip chunks and carrots to the pot. Continue simmering.", timerMinutes: 20 },
          { text: "Add potatoes to the pot and cook until tender.", timerMinutes: 15 },
          { text: "Add cabbage wedges. Cook until all vegetables are tender and the cabbage has wilted into the broth.", timerMinutes: 10 },
          { text: "Remove the salt beef and slice against the grain. Serve on a large platter surrounded by the vegetables. Ladle some broth over everything.", timerMinutes: null },
        ],
        ingredients: {
          create: [
            { name: "Salt beef",  quantity: 800,  unit: "g",  sortOrder: 0 },
            { name: "Potatoes",   quantity: 900,  unit: "g",  sortOrder: 1 },
            { name: "Carrots",    quantity: 400,  unit: "g",  sortOrder: 2 },
            { name: "Cabbage",    quantity: 1,                sortOrder: 3 },
            { name: "Turnip",     quantity: 600,  unit: "g",  sortOrder: 4 },
            { name: "Split peas",     quantity: 200, unit: "g", isOptional: true, notes: "for pease pudding — cook in cheesecloth bag alongside the beef", sortOrder: 5 },
          ],
        },
      },
    }),
  ]);
  console.log(`✅ ${recipes.length} recipes created`);

  // ─── CONSENT LOGS ─────────────────────────────────────────
  await prisma.consentLog.createMany({
    data: [
      { userId: testUser.id, consentType: ConsentType.terms_of_service, consented: true  },
      { userId: testUser.id, consentType: ConsentType.marketing_email,  consented: false },
      { userId: testUser.id, consentType: ConsentType.price_alerts,     consented: true  },
    ],
  });
  console.log("✅ Consent logs created");


  console.log("\n🎉 Seed complete!");
  console.log(`   Stores:   ${stores.length} chains + ${localStores.length} flyer-only`);
  console.log(`   Users:    2 (test@sentinel.ca, admin@sentinel.ca)`);
  console.log(`   Recipes:  ${recipes.length} system recipes`);
  console.log();
  console.log("   No products are seeded — run `npm run catalogue:import` to build");
  console.log("   the catalogue from real store data.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
