import { config as loadEnv } from "dotenv";
import { PrismaClient } from "./generated/client";
import { UserRole, ProductCategory, ConsentType } from "./generated/enums";
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

async function main() {
  console.log("🌱 Seeding Panion database...");

  // ─── STORES ───────────────────────────────────────────────
  // St. John's / Mount Pearl area stores.
  //
  // Loblaws and Metro: neither operates in NL. Dollarama: not a grocery store.
  //   compare like-for-like against a household shelf price, and costco.ca
  //   bakes shipping into grocery prices (8-49% higher than warehouse), so
  //   there is no honest automated source for it. See PRICING-PIPELINE.md §6.4.
  //
  // The three national chains carry full catalogue + price mapping. The six NL
  // independents below are flyer-only for now: Flipp publishes their weekly
  // specials, which is real data worth showing, but they are not catalogue-
  // mapped yet. See PRICING-PIPELINE.md §6.7 (partner stores).
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
        address: "110 Stavanger Dr",
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
  // Verified present in Flipp's St. John's (A1B 4P1) results, so their weekly
  // flyers are a real, reliable source. `chain` matches Flipp's merchant_name
  // lowercased — that string is the join key the Flipp adapter maps on.
  //
  // Addresses are intentionally null: these are multi-location independents and
  // we serve chain-level pricing (PRICING-PIPELINE.md §12.1). Fill in a
  // representative address per store when/if we go per-location.
  const localStores = await Promise.all(
    (
      [
        { id: "store_powells", chain: "powell's supermarket", name: "Powell's Supermarket" },
        { id: "store_colemans", chain: "colemans", name: "Colemans" },
        { id: "store_value_grocer", chain: "value grocer", name: "Value Grocer" },
        { id: "store_bidgoods", chain: "bidgood's", name: "BidGood's" },
        { id: "store_clover_farm", chain: "clover farm", name: "Clover Farm" },
        { id: "store_maries_mini_mart", chain: "marie's mini mart", name: "Marie's Mini Mart" },
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

  // ─── PRODUCTS ─────────────────────────────────────────────
  // 80 products across all categories.
  // Anchor products (referenced in recipes, watchlist, alerts, pantry) keep
  // descriptive IDs. Remaining products use short category-prefix IDs.
  //   d### = dairy    m### = meat/seafood  p### = produce
  //   b### = bakery   g### = pantry/dry    f### = frozen
  //   s### = snacks   v### = beverages     h### = household
  //   pc## = personal care
  //
  // NL prices run ~10–15% above national average — baked into the price matrix.

  const productData = [
    // ── DAIRY & EGGS (12) ────────────────────────────────────
    {
      id: "prod_milk_natrel",
      name: "Central Dairies 2% Milk",
      brand: "Central Dairies",
      category: ProductCategory.dairy,
      unitSize: "2L",
      unitMeasure: "L",
      unitQuantity: 2,
      barcode: "068700100012",
    },
    {
      id: "prod_butter_lactantia",
      name: "Lactantia Butter Salted",
      brand: "Lactantia",
      category: ProductCategory.dairy,
      unitSize: "454g",
      unitMeasure: "g",
      unitQuantity: 454,
      barcode: "057742610014",
    },
    {
      id: "prod_cheddar_cracker_barrel",
      name: "Cracker Barrel Cheddar",
      brand: "Cracker Barrel",
      category: ProductCategory.dairy,
      unitSize: "400g",
      unitMeasure: "g",
      unitQuantity: 400,
    },
    {
      id: "prod_yogurt_liberte",
      name: "Liberté Greek Yogurt Plain",
      brand: "Liberté",
      category: ProductCategory.dairy,
      unitSize: "750g",
      unitMeasure: "g",
      unitQuantity: 750,
    },
    {
      id: "prod_eggs_burnbrae",
      name: "Newfoundland Eggs Large",
      brand: null,
      category: ProductCategory.dairy,
      unitSize: "12pk",
      unitMeasure: "unit",
      unitQuantity: 12,
      barcode: "055742300018",
    },
    {
      id: "prod_d001",
      name: "Natrel Skim Milk",
      brand: "Natrel",
      category: ProductCategory.dairy,
      unitSize: "2L",
      unitMeasure: "L",
      unitQuantity: 2,
    },
    {
      id: "prod_d002",
      name: "Nordica Sour Cream",
      brand: "Nordica",
      category: ProductCategory.dairy,
      unitSize: "500ml",
      unitMeasure: "ml",
      unitQuantity: 500,
    },
    {
      id: "prod_d003",
      name: "Philadelphia Cream Cheese",
      brand: "Philadelphia",
      category: ProductCategory.dairy,
      unitSize: "250g",
      unitMeasure: "g",
      unitQuantity: 250,
    },
    {
      id: "prod_d004",
      name: "Kraft Shredded Mozzarella",
      brand: "Kraft",
      category: ProductCategory.dairy,
      unitSize: "320g",
      unitMeasure: "g",
      unitQuantity: 320,
    },
    {
      id: "prod_d005",
      name: "Nordica Cottage Cheese",
      brand: "Nordica",
      category: ProductCategory.dairy,
      unitSize: "500g",
      unitMeasure: "g",
      unitQuantity: 500,
    },
    {
      id: "prod_d006",
      name: "Beatrice Whipping Cream 35%",
      brand: "Beatrice",
      category: ProductCategory.dairy,
      unitSize: "473ml",
      unitMeasure: "ml",
      unitQuantity: 473,
    },
    {
      // Parmesan — linked in Caesar Salad recipe
      id: "prod_d007",
      name: "Cracker Barrel Parmesan",
      brand: "Cracker Barrel",
      category: ProductCategory.dairy,
      unitSize: "200g",
      unitMeasure: "g",
      unitQuantity: 200,
    },

    // ── MEAT & SEAFOOD (10) ──────────────────────────────────
    {
      id: "prod_chicken_maple_leaf",
      name: "Maple Leaf Chicken Breast",
      brand: "Maple Leaf",
      category: ProductCategory.meat_seafood,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      id: "prod_beef_ground_lean",
      name: "Lean Ground Beef",
      brand: null,
      category: ProductCategory.meat_seafood,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      id: "prod_salmon_atlantic",
      name: "Atlantic Salmon Fillet",
      brand: null,
      category: ProductCategory.meat_seafood,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      id: "prod_m001",
      name: "Pork Chops",
      brand: null,
      category: ProductCategory.meat_seafood,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      id: "prod_m002",
      name: "Maple Leaf Bacon",
      brand: "Maple Leaf",
      category: ProductCategory.meat_seafood,
      unitSize: "375g",
      unitMeasure: "g",
      unitQuantity: 375,
    },
    {
      id: "prod_m003",
      name: "Chicken Thighs",
      brand: null,
      category: ProductCategory.meat_seafood,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      // NL staple — key for demonstrating hyperlocal relevance
      id: "prod_m004",
      name: "Cod Fillet",
      brand: null,
      category: ProductCategory.meat_seafood,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      // Jiggs Dinner anchor ingredient
      id: "prod_m005",
      name: "Salt Beef",
      brand: "Heritage",
      category: ProductCategory.meat_seafood,
      unitSize: "800g",
      unitMeasure: "g",
      unitQuantity: 800,
    },
    {
      id: "prod_m006",
      name: "Ground Pork",
      brand: null,
      category: ProductCategory.meat_seafood,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      id: "prod_m007",
      name: "Maple Leaf Deli Ham",
      brand: "Maple Leaf",
      category: ProductCategory.meat_seafood,
      unitSize: "175g",
      unitMeasure: "g",
      unitQuantity: 175,
    },

    // ── PRODUCE (14) ─────────────────────────────────────────
    {
      id: "prod_bananas",
      name: "Bananas",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      id: "prod_apples_gala",
      name: "Gala Apples",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "3lb bag",
      unitMeasure: "g",
      unitQuantity: 1360,
    },
    {
      id: "prod_strawberries",
      name: "Strawberries",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "1lb",
      unitMeasure: "g",
      unitQuantity: 454,
    },
    {
      id: "prod_broccoli",
      name: "Broccoli",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      // Jiggs Dinner
      id: "prod_p001",
      name: "Carrots",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "2lb bag",
      unitMeasure: "g",
      unitQuantity: 908,
    },
    {
      // Jiggs Dinner
      id: "prod_p002",
      name: "Potatoes",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "5lb bag",
      unitMeasure: "g",
      unitQuantity: 2268,
    },
    {
      // Jiggs Dinner
      id: "prod_p003",
      name: "Cabbage",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "per head",
      unitMeasure: "unit",
      unitQuantity: 1,
    },
    {
      // Jiggs Dinner — turnip (rutabaga) is NL for turnip
      id: "prod_p004",
      name: "Turnip",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      id: "prod_p005",
      name: "Yellow Onions",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "3lb bag",
      unitMeasure: "g",
      unitQuantity: 1360,
    },
    {
      // Used in Aglio e Olio, Maple Glazed Salmon, Caesar Salad
      id: "prod_p006",
      name: "Garlic",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "3 bulb pack",
      unitMeasure: "unit",
      unitQuantity: 3,
    },
    {
      // Caesar Salad anchor ingredient
      id: "prod_p007",
      name: "Romaine Lettuce",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "each",
      unitMeasure: "unit",
      unitQuantity: 1,
    },
    {
      id: "prod_p008",
      name: "Tomatoes",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "per kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },
    {
      // Caesar Salad
      id: "prod_p009",
      name: "Lemons",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "3 pack",
      unitMeasure: "unit",
      unitQuantity: 3,
    },
    {
      id: "prod_p010",
      name: "Baby Spinach",
      brand: null,
      category: ProductCategory.produce,
      unitSize: "142g",
      unitMeasure: "g",
      unitQuantity: 142,
    },

    // ── BAKERY & BREAD (6) ───────────────────────────────────
    {
      id: "prod_bread_wonder",
      name: "Wonder White Bread",
      brand: "Wonder",
      category: ProductCategory.bakery_bread,
      unitSize: "675g",
      unitMeasure: "g",
      unitQuantity: 675,
      barcode: "064420001234",
    },
    {
      id: "prod_bread_dempsters",
      name: "Dempster's Whole Wheat Bread",
      brand: "Dempster's",
      category: ProductCategory.bakery_bread,
      unitSize: "675g",
      unitMeasure: "g",
      unitQuantity: 675,
    },
    {
      id: "prod_b001",
      name: "Thomas' English Muffins",
      brand: "Thomas'",
      category: ProductCategory.bakery_bread,
      unitSize: "6 pack",
      unitMeasure: "unit",
      unitQuantity: 6,
    },
    {
      id: "prod_b002",
      name: "Dempster's Bagels",
      brand: "Dempster's",
      category: ProductCategory.bakery_bread,
      unitSize: "6 pack",
      unitMeasure: "unit",
      unitQuantity: 6,
    },
    {
      id: "prod_b003",
      name: "Country Harvest Hamburger Buns",
      brand: "Country Harvest",
      category: ProductCategory.bakery_bread,
      unitSize: "8 pack",
      unitMeasure: "unit",
      unitQuantity: 8,
    },
    {
      id: "prod_b004",
      name: "Mission Flour Tortillas",
      brand: "Mission",
      category: ProductCategory.bakery_bread,
      unitSize: "10 pack",
      unitMeasure: "unit",
      unitQuantity: 10,
    },

    // ── PANTRY & DRY GOODS (12) ──────────────────────────────
    {
      id: "prod_pasta_barilla",
      name: "Barilla Spaghetti",
      brand: "Barilla",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "500g",
      unitMeasure: "g",
      unitQuantity: 500,
      barcode: "076808001234",
    },
    {
      id: "prod_olive_oil_bertolli",
      name: "Bertolli Olive Oil",
      brand: "Bertolli",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "1L",
      unitMeasure: "L",
      unitQuantity: 1,
    },
    {
      id: "prod_rice_uncle_bens",
      name: "Uncle Ben's White Rice",
      brand: "Uncle Ben's",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "2kg",
      unitMeasure: "g",
      unitQuantity: 2000,
    },
    {
      id: "prod_tomato_sauce_hunts",
      name: "Hunt's Tomato Sauce",
      brand: "Hunt's",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "680ml",
      unitMeasure: "ml",
      unitQuantity: 680,
    },
    {
      id: "prod_g001",
      name: "Campbell's Chicken Broth",
      brand: "Campbell's",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "900ml",
      unitMeasure: "ml",
      unitQuantity: 900,
    },
    {
      // Maple Glazed Salmon
      id: "prod_g002",
      name: "Kikkoman Soy Sauce",
      brand: "Kikkoman",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "250ml",
      unitMeasure: "ml",
      unitQuantity: 250,
    },
    {
      // Maple Glazed Salmon — very on-brand for a Canadian app
      id: "prod_g003",
      name: "PC Maple Syrup",
      brand: "President's Choice",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "540ml",
      unitMeasure: "ml",
      unitQuantity: 540,
    },
    {
      id: "prod_g004",
      name: "PC Canned Chickpeas",
      brand: "President's Choice",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "540ml",
      unitMeasure: "ml",
      unitQuantity: 540,
    },
    {
      id: "prod_g005",
      name: "Hunt's Diced Tomatoes",
      brand: "Hunt's",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "796ml",
      unitMeasure: "ml",
      unitQuantity: 796,
    },
    {
      id: "prod_g006",
      name: "Robin Hood All-Purpose Flour",
      brand: "Robin Hood",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "2.5kg",
      unitMeasure: "g",
      unitQuantity: 2500,
    },
    {
      id: "prod_g007",
      name: "Redpath Granulated Sugar",
      brand: "Redpath",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "2kg",
      unitMeasure: "g",
      unitQuantity: 2000,
    },
    {
      id: "prod_g008",
      name: "Kraft Peanut Butter",
      brand: "Kraft",
      category: ProductCategory.pantry_dry_goods,
      unitSize: "1kg",
      unitMeasure: "g",
      unitQuantity: 1000,
    },

    // ── FROZEN (6) ───────────────────────────────────────────
    {
      id: "prod_peas_frozen_green_giant",
      name: "Green Giant Frozen Peas",
      brand: "Green Giant",
      category: ProductCategory.frozen,
      unitSize: "750g",
      unitMeasure: "g",
      unitQuantity: 750,
    },
    {
      id: "prod_f001",
      name: "McCain Straight Cut Fries",
      brand: "McCain",
      category: ProductCategory.frozen,
      unitSize: "1.5kg",
      unitMeasure: "g",
      unitQuantity: 1500,
    },
    {
      id: "prod_f002",
      name: "PC Frozen Mixed Vegetables",
      brand: "President's Choice",
      category: ProductCategory.frozen,
      unitSize: "750g",
      unitMeasure: "g",
      unitQuantity: 750,
    },
    {
      id: "prod_f003",
      name: "Swanson Crispy Chicken Strips",
      brand: "Swanson",
      category: ProductCategory.frozen,
      unitSize: "700g",
      unitMeasure: "g",
      unitQuantity: 700,
    },
    {
      id: "prod_f004",
      name: "Highliner Fish Sticks",
      brand: "Highliner",
      category: ProductCategory.frozen,
      unitSize: "700g",
      unitMeasure: "g",
      unitQuantity: 700,
    },
    {
      id: "prod_f005",
      name: "Cool Whip Whipped Topping",
      brand: "Cool Whip",
      category: ProductCategory.frozen,
      unitSize: "1L",
      unitMeasure: "L",
      unitQuantity: 1,
    },

    // ── SNACKS & CANDY (6) ───────────────────────────────────
    {
      id: "prod_chips_lays",
      name: "Lay's Classic Chips",
      brand: "Lay's",
      category: ProductCategory.snacks_candy,
      unitSize: "200g",
      unitMeasure: "g",
      unitQuantity: 200,
      barcode: "060410084317",
    },
    {
      id: "prod_s001",
      name: "Oreo Cookies",
      brand: "Oreo",
      category: ProductCategory.snacks_candy,
      unitSize: "303g",
      unitMeasure: "g",
      unitQuantity: 303,
    },
    {
      id: "prod_s002",
      name: "Ritz Crackers",
      brand: "Ritz",
      category: ProductCategory.snacks_candy,
      unitSize: "200g",
      unitMeasure: "g",
      unitQuantity: 200,
    },
    {
      id: "prod_s003",
      name: "Quaker Chewy Granola Bars",
      brand: "Quaker",
      category: ProductCategory.snacks_candy,
      unitSize: "6 pack",
      unitMeasure: "unit",
      unitQuantity: 6,
    },
    {
      id: "prod_s004",
      name: "PC Blue Menu Trail Mix",
      brand: "President's Choice",
      category: ProductCategory.snacks_candy,
      unitSize: "400g",
      unitMeasure: "g",
      unitQuantity: 400,
    },
    {
      id: "prod_s005",
      name: "Nestlé Chocolate Chips",
      brand: "Nestlé",
      category: ProductCategory.snacks_candy,
      unitSize: "300g",
      unitMeasure: "g",
      unitQuantity: 300,
    },

    // ── BEVERAGES (6) ────────────────────────────────────────
    {
      id: "prod_oj_tropicana",
      name: "Tropicana Orange Juice",
      brand: "Tropicana",
      category: ProductCategory.beverages,
      unitSize: "1.54L",
      unitMeasure: "L",
      unitQuantity: 1.54,
    },
    {
      id: "prod_v001",
      name: "Coca-Cola",
      brand: "Coca-Cola",
      category: ProductCategory.beverages,
      unitSize: "12 x 355ml cans",
      unitMeasure: "ml",
      unitQuantity: 4260,
    },
    {
      id: "prod_v002",
      name: "Pepsi",
      brand: "Pepsi",
      category: ProductCategory.beverages,
      unitSize: "12 x 355ml cans",
      unitMeasure: "ml",
      unitQuantity: 4260,
    },
    {
      id: "prod_v003",
      name: "PC Sparkling Water",
      brand: "President's Choice",
      category: ProductCategory.beverages,
      unitSize: "12 x 355ml cans",
      unitMeasure: "ml",
      unitQuantity: 4260,
    },
    {
      id: "prod_v004",
      name: "Tetley Tea Bags",
      brand: "Tetley",
      category: ProductCategory.beverages,
      unitSize: "72 pack",
      unitMeasure: "unit",
      unitQuantity: 72,
    },
    {
      id: "prod_v005",
      name: "Maxwell House Coffee",
      brand: "Maxwell House",
      category: ProductCategory.beverages,
      unitSize: "925g",
      unitMeasure: "g",
      unitQuantity: 925,
    },

    // ── HOUSEHOLD (4) ────────────────────────────────────────
    {
      id: "prod_h001",
      name: "Tide PODS Laundry Detergent",
      brand: "Tide",
      category: ProductCategory.household,
      unitSize: "35 count",
      unitMeasure: "unit",
      unitQuantity: 35,
    },
    {
      id: "prod_h002",
      name: "Bounty Paper Towels",
      brand: "Bounty",
      category: ProductCategory.household,
      unitSize: "6 rolls",
      unitMeasure: "unit",
      unitQuantity: 6,
    },
    {
      id: "prod_h003",
      name: "Charmin Ultra Soft Toilet Paper",
      brand: "Charmin",
      category: ProductCategory.household,
      unitSize: "12 rolls",
      unitMeasure: "unit",
      unitQuantity: 12,
    },
    {
      id: "prod_h004",
      name: "Dawn Dish Soap",
      brand: "Dawn",
      category: ProductCategory.household,
      unitSize: "591ml",
      unitMeasure: "ml",
      unitQuantity: 591,
    },

    // ── PERSONAL CARE (4) ────────────────────────────────────
    {
      id: "prod_pc001",
      name: "Dove Body Wash",
      brand: "Dove",
      category: ProductCategory.personal_care,
      unitSize: "650ml",
      unitMeasure: "ml",
      unitQuantity: 650,
    },
    {
      id: "prod_pc002",
      name: "Colgate Total Toothpaste",
      brand: "Colgate",
      category: ProductCategory.personal_care,
      unitSize: "130ml",
      unitMeasure: "ml",
      unitQuantity: 130,
    },
    {
      id: "prod_pc003",
      name: "Head & Shoulders Shampoo",
      brand: "Head & Shoulders",
      category: ProductCategory.personal_care,
      unitSize: "400ml",
      unitMeasure: "ml",
      unitQuantity: 400,
    },
    {
      id: "prod_pc004",
      name: "Gillette Disposable Razors",
      brand: "Gillette",
      category: ProductCategory.personal_care,
      unitSize: "5 pack",
      unitMeasure: "unit",
      unitQuantity: 5,
    },
  ];

  const products = await Promise.all(
    productData.map((p) =>
      prisma.product.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          brand: p.brand ?? null,
          unitSize: p.unitSize,
          unitMeasure: p.unitMeasure,
          unitQuantity: p.unitQuantity,
        },
        create: {
          id: p.id,
          name: p.name,
          brand: p.brand ?? null,
          category: p.category,
          unitSize: p.unitSize,
          unitMeasure: p.unitMeasure,
          unitQuantity: p.unitQuantity,
          isActive: true,
          ...(p.barcode ? { barcode: p.barcode } : {}),
        },
      })
    )
  );
  console.log(`✅ ${products.length} products created`);

  // ─── STORE PRODUCTS + PRICE HISTORY ───────────────────────
  // Columns: [walmart, dominion, sobeys]
  // null = not carried / not meaningful to compare at that store.
  //
  // Pricing notes:
  //   - Walmart: cheapest baseline, NL-adjusted
  //   - Dominion: Loblaws-owned, typically 5–10% above Walmart
  //   - Sobeys: typically 3–7% above Walmart, close to Dominion

  const priceMatrix: Record<string, (number | null)[]> = {
    // ── DAIRY & EGGS
    prod_milk_natrel:             [4.87, 4.78, 5.39], // Walmart, Dominion, Sobeys — Dominion cheapest
    prod_butter_lactantia:        [5.97, 6.79, 6.49],
    prod_cheddar_cracker_barrel:  [6.97, 7.99, 7.49],
    prod_yogurt_liberte:          [5.47, 6.29, 5.99],
    prod_eggs_burnbrae:           [5.50, 5.28, 5.79], // Dominion cheapest
    prod_d001:                    [3.47, 3.99, 3.79],
    prod_d002:                    [3.47, 3.99, 3.79],
    prod_d003:                    [4.97, 5.79, 5.49],
    prod_d004:                    [5.97, 6.99, 6.49],
    prod_d005:                    [4.47, 5.29, 4.99],
    prod_d006:                    [3.97, 4.69, 4.39],
    prod_d007:                    [7.47, 8.79, 8.29],

    // ── MEAT & SEAFOOD (prices per kg where unitSize = "per kg")
    prod_chicken_maple_leaf:      [10.97, 12.49, 11.79],
    prod_beef_ground_lean:        [9.97, 11.49, 10.79],
    prod_salmon_atlantic:         [22.97, 26.49, 24.79],
    prod_m001:                    [8.97, 10.29, 9.49],
    prod_m002:                    [6.47, 7.49, 6.99],
    prod_m003:                    [7.47, 8.79, 7.99],
    prod_m004:                    [17.97, 20.99, 18.99],
    prod_m005:                    [9.97, 11.49, 10.79],
    prod_m006:                    [7.97, 9.29, 8.79],
    prod_m007:                    [3.97, 4.69, 4.29],

    // ── PRODUCE
    prod_bananas:                 [1.47, 1.79, 1.69],
    prod_apples_gala:             [4.97, 5.79, 5.49],
    prod_strawberries:            [3.97, 4.69, 4.39],
    prod_broccoli:                [2.97, 3.49, 3.29],
    prod_p001:                    [2.47, 2.99, 2.79],
    prod_p002:                    [4.97, 5.79, 5.49],
    prod_p003:                    [2.97, 3.49, 3.29],
    prod_p004:                    [1.97, 2.49, 2.29],
    prod_p005:                    [2.97, 3.49, 3.29],
    prod_p006:                    [2.97, 3.49, 3.29],
    prod_p007:                    [2.97, 3.69, 3.49],
    prod_p008:                    [4.97, 5.79, 5.49],
    prod_p009:                    [2.47, 2.99, 2.79],
    prod_p010:                    [3.97, 4.69, 4.39],

    // ── BAKERY & BREAD
    prod_bread_wonder:            [3.97, 4.69, 4.39],
    prod_bread_dempsters:         [4.47, 5.29, 4.99],
    prod_b001:                    [4.47, 5.29, 4.99],
    prod_b002:                    [4.97, 5.79, 5.49],
    prod_b003:                    [3.97, 4.69, 4.39],
    prod_b004:                    [3.47, 3.99, 3.79],

    // ── PANTRY & DRY GOODS
    prod_pasta_barilla:           [2.47, 2.99, 2.79],
    prod_olive_oil_bertolli:      [9.97, 11.79, 10.99],
    prod_rice_uncle_bens:         [6.97, 7.99, 7.49],
    prod_tomato_sauce_hunts:      [2.47, 2.99, 2.79],
    prod_g001:                    [2.97, 3.49, 3.29],
    prod_g002:                    [3.97, 4.69, 4.39],
    prod_g003:                    [9.97, 11.79, 10.99],
    prod_g004:                    [1.47, 1.79, 1.69],
    prod_g005:                    [2.47, 2.99, 2.79],
    prod_g006:                    [4.97, 5.79, 5.49],
    prod_g007:                    [4.47, 5.29, 4.99],
    prod_g008:                    [6.97, 7.99, 7.49],

    // ── FROZEN
    prod_peas_frozen_green_giant: [3.47, 3.99, 3.79],
    prod_f001:                    [4.97, 5.79, 5.49],
    prod_f002:                    [3.47, 3.99, 3.79],
    prod_f003:                    [8.97, 10.49, 9.79],
    prod_f004:                    [7.97, 9.49, 8.79],
    prod_f005:                    [3.97, 4.69, 4.39],

    // ── SNACKS & CANDY
    prod_chips_lays:              [4.47, 5.29, 4.99],
    prod_s001:                    [4.97, 5.79, 5.49],
    prod_s002:                    [3.97, 4.69, 4.39],
    prod_s003:                    [3.97, 4.69, 4.39],
    prod_s004:                    [5.97, 6.99, 6.49],
    prod_s005:                    [4.97, 5.79, 5.49],

    // ── BEVERAGES
    prod_oj_tropicana:            [5.97, 6.99, 6.49],
    prod_v001:                    [6.97, 7.99, 7.49],
    prod_v002:                    [6.97, 7.99, 7.49],
    prod_v003:                    [4.97, 5.79, 5.49],
    prod_v004:                    [5.97, 6.99, 6.49],
    prod_v005:                    [9.97, 11.79, 10.99],

    // ── HOUSEHOLD
    prod_h001:                    [13.97, 15.99, 14.99],
    prod_h002:                    [9.97, 11.79, 10.99],
    prod_h003:                    [11.97, 13.99, 12.99],
    prod_h004:                    [3.97, 4.69, 4.39],

    // ── PERSONAL CARE
    prod_pc001:                   [5.97, 6.99, 6.49],
    prod_pc002:                   [2.97, 3.49, 3.29],
    prod_pc003:                   [6.97, 7.99, 7.49],
    prod_pc004:                   [8.97, 10.49, 9.79],
  };

  const storeIds = ["store_walmart", "store_dominion", "store_sobeys"];

  // Build all StoreProduct records first
  let storeProductCount = 0;
  for (const [productId, prices] of Object.entries(priceMatrix)) {
    for (let storeIdx = 0; storeIdx < storeIds.length; storeIdx++) {
      const basePrice = prices[storeIdx];
      if (basePrice === null) continue;

      const storeId = storeIds[storeIdx];
      const spId = `sp_${productId}_${storeId}`;

      await prisma.storeProduct.upsert({
        where: { id: spId },
        update: { currentPrice: basePrice },
        create: {
          id: spId,
          storeId,
          productId,
          currentPrice: basePrice,
          isActive: true,
        },
      });
      storeProductCount++;
    }
  }
  console.log(`✅ ${storeProductCount} store products created`);

  // Build 12 weeks of price history — batched with createMany for speed.
  // Sequential StoreProduct loop + createMany per product = ~6x faster than
  // individual create() calls inside a nested loop.
  const now = new Date();
  let priceHistoryCount = 0;

  for (const [productId, prices] of Object.entries(priceMatrix)) {
    for (let storeIdx = 0; storeIdx < storeIds.length; storeIdx++) {
      const basePrice = prices[storeIdx];
      if (basePrice === null) continue;

      const storeId = storeIds[storeIdx];
      const spId = `sp_${productId}_${storeId}`;

      const historyRows = [];
      for (let week = 11; week >= 0; week--) {
        const date = new Date(now);
        date.setDate(date.getDate() - week * 7);

        // ±10% realistic variance week-to-week
        const variance = 1 + (Math.random() * 0.2 - 0.1);
        const historicalPrice = Math.round(basePrice * variance * 100) / 100;

        // ~1 in 6 weeks is a sale week
        const isSale = Math.random() < 0.16;
        const finalPrice = isSale
          ? Math.round(historicalPrice * 0.85 * 100) / 100
          : historicalPrice;

        historyRows.push({
          storeProductId: spId,
          price: finalPrice,
          isSale,
          source: "manual",
          scrapedAt: date,
        });
      }

      await prisma.priceHistory.createMany({ data: historyRows });
      priceHistoryCount += historyRows.length;
    }
  }
  console.log(`✅ ${priceHistoryCount} price history records created`);

  // ─── WATCHLIST ────────────────────────────────────────────
  await prisma.watchlist.createMany({
    skipDuplicates: true,
    data: [
      { userId: testUser.id, productId: "prod_milk_natrel",        targetPrice: 4.50 },
      { userId: testUser.id, productId: "prod_eggs_burnbrae",      targetPrice: 5.00 },
      { userId: testUser.id, productId: "prod_chicken_maple_leaf"                    },
      { userId: testUser.id, productId: "prod_salmon_atlantic"                        },
      { userId: testUser.id, productId: "prod_butter_lactantia",   targetPrice: 5.50 },
    ],
  });
  console.log("✅ Watchlist entries created");

  // ─── SHOPPING LIST ────────────────────────────────────────
  const list = await prisma.list.create({
    data: {
      userId: testUser.id,
      name: "Weekly Groceries",
      isDefault: true,
      items: {
        create: [
          { productId: "prod_milk_natrel",       name: "Central Dairies 2% Milk 2L", quantity: 1,   sortOrder: 0 },
          { productId: "prod_eggs_burnbrae",     name: "Newfoundland Eggs 12pk",     quantity: 1,   sortOrder: 1 },
          { productId: "prod_bread_wonder",      name: "Wonder White Bread",    quantity: 1,   sortOrder: 2 },
          { productId: "prod_bananas",           name: "Bananas",               quantity: 500, unit: "g", sortOrder: 3 },
          { productId: "prod_chicken_maple_leaf",name: "Chicken Breast",        quantity: 1,   sortOrder: 4 },
          { name: "Dish soap",                   quantity: 1, notes: "get the green one", sortOrder: 5 },
        ],
      },
    },
  });
  console.log(`✅ Shopping list created (${list.name})`);

  // ─── PANTRY ───────────────────────────────────────────────
  await prisma.pantryItem.createMany({
    data: [
      { userId: testUser.id, productId: "prod_pasta_barilla",     name: "Barilla Spaghetti",  quantity: 500, unit: "g"  },
      { userId: testUser.id, productId: "prod_olive_oil_bertolli",name: "Bertolli Olive Oil",  quantity: 500, unit: "ml" },
      { userId: testUser.id, productId: "prod_d007",              name: "Parmesan",            quantity: 100, unit: "g"  },
      { userId: testUser.id, productId: "prod_g002",              name: "Soy Sauce",           quantity: 200, unit: "ml" },
      { userId: testUser.id, productId: "prod_g003",              name: "Maple Syrup",         quantity: 300, unit: "ml" },
      { userId: testUser.id, name: "Black pepper",  quantity: 50,  unit: "g" },
      { userId: testUser.id, name: "Salt",          quantity: 200, unit: "g" },
    ],
  });
  console.log("✅ Pantry items created");

  // ─── RECIPES ──────────────────────────────────────────────
  // 4 system recipes (userId: null — copied to each new user on signup).
  // All key ingredients are linked to seed products via productId.
  // Minor pantry staples (salt, pepper, parsley) remain as plain-text items
  // since they're pantry basics without a canonical packaged product match.

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
            { productId: "prod_pasta_barilla",     name: "Spaghetti",         quantity: 200, unit: "g",  sortOrder: 0 },
            { productId: "prod_olive_oil_bertolli", name: "Olive oil",         quantity: 60,  unit: "ml", sortOrder: 1 },
            { productId: "prod_p006",              name: "Garlic cloves",     quantity: 4,               sortOrder: 2 },
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
            { productId: "prod_salmon_atlantic",   name: "Atlantic salmon fillet", quantity: 400, unit: "g",  sortOrder: 0 },
            { productId: "prod_g003",              name: "Maple syrup",            quantity: 30,  unit: "ml", sortOrder: 1 },
            { productId: "prod_g002",              name: "Soy sauce",              quantity: 15,  unit: "ml", sortOrder: 2 },
            { productId: "prod_p006",              name: "Garlic clove",           quantity: 2,               sortOrder: 3 },
            { productId: "prod_olive_oil_bertolli", name: "Olive oil",             quantity: 15,  unit: "ml", sortOrder: 4 },
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
            { productId: "prod_p007", name: "Romaine lettuce",   quantity: 1,  sortOrder: 0 },
            { productId: "prod_d007", name: "Parmesan",          quantity: 50, unit: "g",  sortOrder: 1 },
            { productId: "prod_p009", name: "Lemon",             quantity: 1,  sortOrder: 2 },
            { productId: "prod_p006", name: "Garlic clove",      quantity: 2,  sortOrder: 3 },
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
            { productId: "prod_m005", name: "Salt beef",  quantity: 800,  unit: "g",  sortOrder: 0 },
            { productId: "prod_p002", name: "Potatoes",   quantity: 900,  unit: "g",  sortOrder: 1 },
            { productId: "prod_p001", name: "Carrots",    quantity: 400,  unit: "g",  sortOrder: 2 },
            { productId: "prod_p003", name: "Cabbage",    quantity: 1,                sortOrder: 3 },
            { productId: "prod_p004", name: "Turnip",     quantity: 600,  unit: "g",  sortOrder: 4 },
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

  // ─── FLYERS ───────────────────────────────────────────────
  const flyerStart = new Date(now);
  flyerStart.setDate(flyerStart.getDate() - flyerStart.getDay() + 4); // Thursday
  const flyerEnd = new Date(flyerStart);
  flyerEnd.setDate(flyerEnd.getDate() + 6); // Wednesday

  await prisma.flyer.createMany({
    data: [
      {
        storeId: "store_walmart",
        title: "Walmart Weekly Flyer",
        imageUrl: "/images/flyers/walmart-sample.jpg",
        validFrom: flyerStart,
        validUntil: flyerEnd,
      },
      {
        storeId: "store_dominion",
        title: "Dominion Weekly Flyer",
        imageUrl: "/images/flyers/dominion-sample.jpg",
        validFrom: flyerStart,
        validUntil: flyerEnd,
      },
    ],
  });
  console.log("✅ Flyers created");

  // ─── ALERTS ───────────────────────────────────────────────
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
  const daysAgo  = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  await prisma.alert.createMany({
    data: [
      // Unread — today
      {
        userId: testUser.id,
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Central Dairies 2% Milk 2L",
          emoji: "🥛",
          oldPrice: 5.39,
          newPrice: 4.87,
          storeName: "Walmart",
          storeColor: "#0071ce",
          productId: "prod_milk_natrel",
        },
        sentAt: hoursAgo(1),
        createdAt: hoursAgo(1),
      },
      {
        userId: testUser.id,
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Chicken Breast — Maple Leaf",
          emoji: "🍗",
          oldPrice: 12.49,
          newPrice: 10.97,
          storeName: "Dominion",
          storeColor: "#e31837",
          productId: "prod_chicken_maple_leaf",
        },
        sentAt: hoursAgo(3),
        createdAt: hoursAgo(3),
      },
      {
        userId: testUser.id,
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Atlantic Salmon Fillet",
          emoji: "🐟",
          oldPrice: 26.49,
          newPrice: 22.97,
          storeName: "Walmart",
          storeColor: "#0071ce",
          productId: "prod_salmon_atlantic",
        },
        sentAt: hoursAgo(5),
        createdAt: hoursAgo(5),
      },
      // Read — earlier
      {
        userId: testUser.id,
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Newfoundland Eggs Large 12pk",
          emoji: "🥚",
          oldPrice: 5.79,
          newPrice: 5.28,
          storeName: "Dominion",
          storeColor: "#e31837",
          productId: "prod_eggs_burnbrae",
        },
        sentAt: daysAgo(2),
        readAt: daysAgo(1),
        createdAt: daysAgo(2),
      },
      {
        userId: testUser.id,
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Wonder White Bread 675g",
          emoji: "🍞",
          oldPrice: 4.69,
          newPrice: 3.97,
          storeName: "Sobeys",
          storeColor: "#e31837",
          productId: "prod_bread_wonder",
        },
        sentAt: daysAgo(4),
        readAt: daysAgo(3),
        createdAt: daysAgo(4),
      },
      {
        userId: testUser.id,
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Cracker Barrel Cheddar 400g",
          emoji: "🧀",
          oldPrice: 7.99,
          newPrice: 6.97,
          storeName: "Dominion",
          storeColor: "#e31837",
          productId: "prod_cheddar_cracker_barrel",
        },
        sentAt: daysAgo(7),
        readAt: daysAgo(6),
        createdAt: daysAgo(7),
      },
    ],
  });
  console.log("✅ 6 alerts seeded");

  console.log("\n🎉 Seed complete!");
  console.log(`   Stores:        ${stores.length} chains + ${localStores.length} NL independents`);
  console.log(`   Products:      ${products.length}`);
  console.log(`   Store products:${storeProductCount}`);
  console.log(`   Price history: ${priceHistoryCount} rows`);
  console.log(`   Recipes:       ${recipes.length} (Aglio e Olio, Maple Glazed Salmon, Caesar Salad, Jiggs Dinner)`);
  console.log(`   Test user:     test@sentinel.ca`);
  console.log(`   Admin user:    admin@sentinel.ca`);
  console.log();
  console.log("   TODO: Add isWatchlistDefault field to Product schema,");
  console.log("         then add GET /api/products/watchlist-defaults endpoint.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
