// Mock data served to guest users. All prices match the seed data price matrix.
// Dates are relative to "now" at module load so the demo always looks current.

const TODAY = new Date();
const iso = (d: Date) => d.toISOString();
const daysFromNow = (n: number) =>
  iso(new Date(TODAY.getTime() + n * 86400000));

// ─── STORES ──────────────────────────────────────────────────────────────────

export const GUEST_PREFERRED_STORES = [
  { chain: "walmart",  name: "Walmart Supercentre - St. John's" },
  { chain: "dominion", name: "Dominion - Stavanger Dr" },
  { chain: "sobeys",   name: "Sobeys - Mount Pearl" },
];

const STORE_IDS = {
  walmart:  "store_walmart",
  dominion: "store_dominion",
  sobeys:   "store_sobeys",
};

// ─── WATCHLIST SUMMARY (home page) ───────────────────────────────────────────

export const GUEST_WATCHLIST_SUMMARY = {
  items: [
    {
      watchlistId: "guest-w1",
      productId: "prod_milk_natrel",
      name: "Central Dairies 2% Milk",
      brand: "Central Dairies",
      category: "dairy",
      imageUrl: null,
      unitSize: "2L",
      prices: {
        walmart:  { price: 4.87, scrapedAt: daysFromNow(-1) },
        dominion: { price: 4.78, scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 5.39, scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 4.78,
      bestStore: "dominion",
      notifyOnDrop: true,
      notifyOnRise: false,
    },
    {
      watchlistId: "guest-w2",
      productId: "prod_eggs_burnbrae",
      name: "Newfoundland Eggs Large",
      brand: null,
      category: "dairy",
      imageUrl: null,
      unitSize: "12pk",
      prices: {
        walmart:  { price: 5.50, scrapedAt: daysFromNow(-1) },
        dominion: { price: 5.28, scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 5.79, scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 5.28,
      bestStore: "dominion",
      notifyOnDrop: true,
      notifyOnRise: false,
    },
    {
      watchlistId: "guest-w3",
      productId: "prod_chicken_maple_leaf",
      name: "Maple Leaf Chicken Breast",
      brand: "Maple Leaf",
      category: "meat_seafood",
      imageUrl: null,
      unitSize: "per kg",
      prices: {
        walmart:  { price: 10.97, scrapedAt: daysFromNow(-1) },
        dominion: { price: 12.49, scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 11.79, scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 10.97,
      bestStore: "walmart",
      notifyOnDrop: true,
      notifyOnRise: false,
    },
    {
      watchlistId: "guest-w4",
      productId: "prod_salmon_atlantic",
      name: "Atlantic Salmon Fillet",
      brand: null,
      category: "meat_seafood",
      imageUrl: null,
      unitSize: "per kg",
      prices: {
        walmart:  { price: 22.97, scrapedAt: daysFromNow(-1) },
        dominion: { price: 26.49, scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 24.79, scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 22.97,
      bestStore: "walmart",
      notifyOnDrop: false,
      notifyOnRise: false,
    },
    {
      watchlistId: "guest-w5",
      productId: "prod_olive_oil_bertolli",
      name: "Bertolli Olive Oil",
      brand: "Bertolli",
      category: "pantry_dry_goods",
      imageUrl: null,
      unitSize: "1L",
      prices: {
        walmart:  { price: 9.97,  scrapedAt: daysFromNow(-1) },
        dominion: { price: 11.79, scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 10.99, scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 9.97,
      bestStore: "walmart",
      notifyOnDrop: false,
      notifyOnRise: false,
    },
    {
      watchlistId: "guest-w6",
      productId: "prod_bread_wonder",
      name: "Wonder White Bread",
      brand: "Wonder",
      category: "bakery_bread",
      imageUrl: null,
      unitSize: "675g",
      prices: {
        walmart:  { price: 3.97, scrapedAt: daysFromNow(-1) },
        dominion: { price: 4.69, scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 4.39, scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 3.97,
      bestStore: "walmart",
      notifyOnDrop: false,
      notifyOnRise: false,
    },
    {
      watchlistId: "guest-w7",
      productId: "prod_v001",
      name: "Coca-Cola",
      brand: "Coca-Cola",
      category: "beverages",
      imageUrl: null,
      unitSize: "12 x 355ml cans",
      prices: {
        walmart:  { price: 6.97,  scrapedAt: daysFromNow(-1) },
        dominion: { price: 7.99,  scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 7.49,  scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 6.97,
      bestStore: "walmart",
      notifyOnDrop: false,
      notifyOnRise: false,
    },
    {
      watchlistId: "guest-w8",
      productId: "prod_chips_lays",
      name: "Lay's Classic Chips",
      brand: "Lay's",
      category: "snacks_candy",
      imageUrl: null,
      unitSize: "200g",
      prices: {
        walmart:  { price: 4.47, scrapedAt: daysFromNow(-1) },
        dominion: { price: 5.29, scrapedAt: daysFromNow(-1) },
        sobeys:   { price: 4.99, scrapedAt: daysFromNow(-1) },
      },
      bestPrice: 4.47,
      bestStore: "walmart",
      notifyOnDrop: false,
      notifyOnRise: false,
    },
  ],
  stores: [
    { id: STORE_IDS.walmart,  chain: "walmart",  name: "Walmart Supercentre - St. John's", total: 68.29, color: "#0071ce", bg: "#0071ce18", letter: "W" },
    { id: STORE_IDS.dominion, chain: "dominion", name: "Dominion - Stavanger Dr",          total: 79.72, color: "#e2001a", bg: "#e2001a18", letter: "D" },
    { id: STORE_IDS.sobeys,   chain: "sobeys",   name: "Sobeys - Mount Pearl",             total: 74.72, color: "#d62b2b", bg: "#d62b2b18", letter: "S" },
  ],
  storeTotals: { walmart: 68.29, dominion: 79.72, sobeys: 74.72 },
  bestStore: "walmart",
};

// ─── SHOPPING LIST (lists page) ───────────────────────────────────────────────

function makeStoreProducts(
  prices: [number | null, number | null, number | null, number | null],
  productId: string,
) {
  const chains = ["walmart", "dominion", "sobeys"] as const;
  return chains
    .flatMap((chain, i) =>
      prices[i] === null
        ? []
        : [
            {
              id: `guest-sp-${productId}-${chain}`,
              storeId: STORE_IDS[chain],
              productId,
              currentPrice: prices[i] as number,
              isSale: chain === "walmart" && productId === "prod_eggs_burnbrae",
              isActive: true,
              store: {
                id: STORE_IDS[chain],
                chain,
                name: GUEST_PREFERRED_STORES.find((s) => s.chain === chain)!.name,
              },
            },
          ],
    );
}

const LIST_ITEMS = [
  {
    productId: "prod_milk_natrel",
    name: "Central Dairies 2% Milk",
    brand: "Central Dairies",
    unitSize: "2L",
    unitMeasure: "L",
    unitQuantity: 2,
    prices: [4.87, 4.78, 5.39, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_eggs_burnbrae",
    name: "Newfoundland Eggs Large",
    brand: null,
    unitSize: "12pk",
    unitMeasure: "unit",
    unitQuantity: 12,
    prices: [5.50, 5.28, 5.79, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_bread_wonder",
    name: "Wonder White Bread",
    brand: "Wonder",
    unitSize: "675g",
    unitMeasure: "g",
    unitQuantity: 675,
    prices: [3.97, 4.69, 4.39, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_chicken_maple_leaf",
    name: "Maple Leaf Chicken Breast",
    brand: "Maple Leaf",
    unitSize: "per kg",
    unitMeasure: "g",
    unitQuantity: 1000,
    prices: [10.97, 12.49, 11.79, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_bananas",
    name: "Bananas",
    brand: null,
    unitSize: "per kg",
    unitMeasure: "g",
    unitQuantity: 1000,
    prices: [1.47, 1.79, 1.69, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_apples_gala",
    name: "Gala Apples",
    brand: null,
    unitSize: "3lb bag",
    unitMeasure: "g",
    unitQuantity: 1360,
    prices: [4.97, null, 5.49, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_pasta_barilla",
    name: "Barilla Spaghetti",
    brand: "Barilla",
    unitSize: "500g",
    unitMeasure: "g",
    unitQuantity: 500,
    prices: [2.47, 2.99, 2.79, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_tomato_sauce_hunts",
    name: "Hunt's Tomato Sauce",
    brand: "Hunt's",
    unitSize: "680ml",
    unitMeasure: "ml",
    unitQuantity: 680,
    prices: [2.47, 2.99, null, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_chips_lays",
    name: "Lay's Classic Chips",
    brand: "Lay's",
    unitSize: "200g",
    unitMeasure: "g",
    unitQuantity: 200,
    prices: [4.47, 5.29, 4.99, null] as [number | null, number | null, number | null, number | null],
  },
  {
    productId: "prod_oj_tropicana",
    name: "Tropicana Orange Juice",
    brand: "Tropicana",
    unitSize: "1.54L",
    unitMeasure: "L",
    unitQuantity: 1.54,
    prices: [5.97, 6.99, null, null] as [number | null, number | null, number | null, number | null],
  },
];

/**
 * A typed-in item with no product behind it. Every real list grows a few, and
 * they are the reason the list total has a "not counted" bucket — so the guest
 * preview carries one rather than showing a list where everything prices
 * cleanly. Same reason a couple of the products above are unpriced at a store:
 * Sobeys holds prices for 187 of 701 products, and a preview where all three
 * stores stock everything sets an expectation the real data cannot meet.
 */
const UNLINKED_ITEM = {
  id: "guest-item-unlinked",
  listId: "guest-list-1",
  productId: null,
  name: "Birthday candles",
  quantity: 1,
  unit: null,
  notes: null,
  customPrice: null,
  isChecked: false,
  sortOrder: LIST_ITEMS.length,
  createdAt: daysFromNow(-3),
  updatedAt: daysFromNow(-1),
  product: null,
};

const GUEST_LIST_BASE = {
  id: "guest-list-1",
  name: "Weekly Shop",
  userId: "guest",
  createdAt: daysFromNow(-3),
  updatedAt: daysFromNow(-1),
  items: LIST_ITEMS.map((item, i) => ({
    id: `guest-item-${i + 1}`,
    listId: "guest-list-1",
    productId: item.productId,
    name: item.name,
    quantity: 1,
    unit: null,
    notes: null,
    customPrice: null,
    isChecked: false,
    sortOrder: i,
    createdAt: daysFromNow(-3),
    updatedAt: daysFromNow(-1),
    product: {
      id: item.productId,
      name: item.name,
      brand: item.brand,
      category: null,
      imageUrl: null,
      barcode: null,
      unitSize: item.unitSize,
      unitMeasure: item.unitMeasure,
      unitQuantity: item.unitQuantity,
      isActive: true,
      storeProducts: makeStoreProducts(item.prices, item.productId),
    },
  })),
};

export const GUEST_LIST = {
  ...GUEST_LIST_BASE,
  items: [...GUEST_LIST_BASE.items, UNLINKED_ITEM],
};

export const GUEST_ALL_LISTS = [
  {
    id: "guest-list-1",
    name: "Weekly Shop",
    itemCount: GUEST_LIST.items.length,
  },
];

// ─── PANTRY (pantry page) ─────────────────────────────────────────────────────

export const GUEST_PANTRY_ITEMS = [
  {
    id: "guest-pantry-1",
    name: "Central Dairies 2% Milk",
    brand: "Central Dairies",
    category: "dairy",
    quantity: 1,
    unit: "L",
    imageUrl: null,
    productId: "prod_milk_natrel",
    expiresAt: daysFromNow(2),   // expiring soon ⚠️
    createdAt: daysFromNow(-21),
    updatedAt: daysFromNow(-2),
    addedFrom: "manual",
  },
  {
    id: "guest-pantry-2",
    name: "Newfoundland Eggs Large",
    brand: null,
    category: "dairy",
    quantity: 4,
    unit: null,
    imageUrl: null,
    productId: "prod_eggs_burnbrae",
    expiresAt: daysFromNow(7),
    createdAt: daysFromNow(-21),
    updatedAt: daysFromNow(-5),
    addedFrom: "manual",
  },
  {
    id: "guest-pantry-3",
    name: "Barilla Spaghetti",
    brand: "Barilla",
    category: "pantry_dry_goods",
    quantity: 500,
    unit: "g",
    imageUrl: null,
    productId: "prod_pasta_barilla",
    expiresAt: daysFromNow(180),
    createdAt: daysFromNow(-21),
    updatedAt: daysFromNow(-10),
    addedFrom: "manual",
  },
  {
    id: "guest-pantry-4",
    name: "Hunt's Tomato Sauce",
    brand: "Hunt's",
    category: "pantry_dry_goods",
    quantity: 2,
    unit: null,
    imageUrl: null,
    productId: "prod_tomato_sauce_hunts",
    expiresAt: daysFromNow(365),
    createdAt: daysFromNow(-21),
    updatedAt: daysFromNow(-10),
    addedFrom: "manual",
  },
  {
    id: "guest-pantry-5",
    name: "Uncle Ben's White Rice",
    brand: "Uncle Ben's",
    category: "pantry_dry_goods",
    quantity: 1,
    unit: "kg",
    imageUrl: null,
    productId: "prod_rice_uncle_bens",
    expiresAt: null,
    createdAt: daysFromNow(-21),
    updatedAt: daysFromNow(-7),
    addedFrom: "manual",
  },
  {
    id: "guest-pantry-6",
    name: "Bertolli Olive Oil",
    brand: "Bertolli",
    category: "pantry_dry_goods",
    quantity: 250,
    unit: "ml",
    imageUrl: null,
    productId: "prod_olive_oil_bertolli",
    expiresAt: null,
    createdAt: daysFromNow(-21),
    updatedAt: daysFromNow(-14),
    addedFrom: "manual",
  },
];

// ─── RECIPE DETAIL (recipes/[id] page) ───────────────────────────────────────

function makeGuestIngredient(
  id: string,
  name: string,
  quantity: number | null,
  unit: string | null,
  productId: string | null,
  productUnitQuantity: number | null,
  productUnitMeasure: string | null,
  productUnitSize: string | null,
) {
  return {
    id,
    name,
    quantity,
    unit,
    notes: null,
    isOptional: false,
    productId,
    inPantry: false,
    bestPrice: null,
    bestStore: null,
    productUnitQuantity,
    productUnitMeasure,
    productUnitSize,
  };
}

export const GUEST_RECIPE_DETAILS: Record<string, {
  id: string; title: string; description: string | null; imageUrl: string | null;
  prepTime: number | null; cookTime: number | null; servings: number;
  steps: { text: string; timerMinutes: number | null }[];
  ingredients: ReturnType<typeof makeGuestIngredient>[];
  estimatedTotal: number | null; hasUnlinkedIngredients: boolean;
}> = {
  "guest-recipe-1": {
    id: "guest-recipe-1",
    title: "Spaghetti Aglio e Olio",
    description: "Classic Italian pasta with garlic and olive oil. Ready in 20 minutes.",
    imageUrl: null,
    prepTime: 5,
    cookTime: 15,
    servings: 4,
    steps: [
      { text: "Bring a large pot of well-salted water to a boil. Cook spaghetti until al dente per package directions.", timerMinutes: 10 },
      { text: "While pasta cooks, heat olive oil in a large skillet over medium-low. Add thinly sliced garlic and red pepper flakes. Cook 2 minutes until golden and fragrant — don't let it burn.", timerMinutes: 2 },
      { text: "Reserve 1 cup of pasta cooking water, then drain pasta.", timerMinutes: null },
      { text: "Add pasta to the skillet with garlic oil. Toss, adding pasta water a splash at a time until a light sauce coats every strand.", timerMinutes: 2 },
      { text: "Season with salt, garnish with fresh parsley, and serve immediately.", timerMinutes: null },
    ],
    ingredients: [
      makeGuestIngredient("gr1-1", "Barilla Spaghetti",  400,  "g",      "prod_pasta_barilla",      500,  "g",    "500g"),
      makeGuestIngredient("gr1-2", "Bertolli Olive Oil",  60,  "ml",     "prod_olive_oil_bertolli", 1000, "ml",   "1L"),
      makeGuestIngredient("gr1-3", "Garlic",               4,  "cloves", "prod_p006",                  3, "unit", "3 bulb pack"),
      makeGuestIngredient("gr1-4", "Salt",              null,  null,     null,                      null, null,   null),
      makeGuestIngredient("gr1-5", "Red pepper flakes", null,  null,     null,                      null, null,   null),
      makeGuestIngredient("gr1-6", "Fresh parsley",     null,  null,     null,                      null, null,   null),
    ],
    estimatedTotal: null,
    hasUnlinkedIngredients: true,
  },
  "guest-recipe-2": {
    id: "guest-recipe-2",
    title: "Maple Glazed Salmon",
    description: "Canadian classic. Sweet maple glaze on pan-seared Atlantic salmon.",
    imageUrl: null,
    prepTime: 10,
    cookTime: 12,
    servings: 2,
    steps: [
      { text: "Mix maple syrup, soy sauce, and minced garlic together in a small bowl.", timerMinutes: null },
      { text: "Pat salmon fillets dry with paper towel and season with salt and pepper.", timerMinutes: null },
      { text: "Heat an oven-safe skillet over medium-high heat. Sear salmon skin-side up for 3–4 minutes until golden.", timerMinutes: 4 },
      { text: "Flip salmon and pour the glaze over top. Cook 3–4 more minutes, basting with pan juices, until salmon flakes easily.", timerMinutes: 4 },
      { text: "Remove from heat and rest 1 minute. Serve with remaining glaze drizzled over.", timerMinutes: null },
    ],
    ingredients: [
      makeGuestIngredient("gr2-1", "Atlantic Salmon Fillet", 500, "g",      "prod_salmon_atlantic", 1000, "g",    "per kg"),
      makeGuestIngredient("gr2-2", "PC Maple Syrup",          60, "ml",     "prod_g003",             540, "ml",   "540ml"),
      makeGuestIngredient("gr2-3", "Kikkoman Soy Sauce",      30, "ml",     "prod_g002",             250, "ml",   "250ml"),
      makeGuestIngredient("gr2-4", "Garlic",                   2, "cloves", "prod_p006",               3, "unit", "3 bulb pack"),
      makeGuestIngredient("gr2-5", "Salt & pepper",         null, null,     null,                   null, null,   null),
    ],
    estimatedTotal: null,
    hasUnlinkedIngredients: false,
  },
  "guest-recipe-3": {
    id: "guest-recipe-3",
    title: "Caesar Salad",
    description: "Classic Caesar with homemade dressing. Simple and crowd-pleasing.",
    imageUrl: null,
    prepTime: 15,
    cookTime: 0,
    servings: 4,
    steps: [
      { text: "Whisk together lemon juice, minced garlic, Worcestershire sauce, Dijon mustard, and olive oil until emulsified into a dressing.", timerMinutes: null },
      { text: "Tear or chop romaine into bite-sized pieces and dry thoroughly (wet lettuce makes soggy salad).", timerMinutes: null },
      { text: "Toss romaine with dressing until every leaf is lightly coated.", timerMinutes: null },
      { text: "Plate and finish with shaved parmesan and a crack of black pepper. Serve immediately.", timerMinutes: null },
    ],
    ingredients: [
      makeGuestIngredient("gr3-1", "Romaine Lettuce",           2, null,     "prod_p007",               1, "unit", "each"),
      makeGuestIngredient("gr3-2", "Cracker Barrel Parmesan",  60, "g",      "prod_d007",             200, "g",    "200g"),
      makeGuestIngredient("gr3-3", "Lemons",                    1, null,     "prod_p009",               3, "unit", "3 pack"),
      makeGuestIngredient("gr3-4", "Garlic",                    2, "cloves", "prod_p006",               3, "unit", "3 bulb pack"),
      makeGuestIngredient("gr3-5", "Bertolli Olive Oil",       45, "ml",     "prod_olive_oil_bertolli", 1000, "ml", "1L"),
      makeGuestIngredient("gr3-6", "Worcestershire sauce",   null, null,     null,                   null, null,   null),
      makeGuestIngredient("gr3-7", "Dijon mustard",          null, null,     null,                   null, null,   null),
    ],
    estimatedTotal: null,
    hasUnlinkedIngredients: true,
  },
  "guest-recipe-4": {
    id: "guest-recipe-4",
    title: "Jiggs Dinner",
    description: "Newfoundland's beloved Sunday tradition. Salt beef and root vegetables simmered low and slow — pure NL comfort food.",
    imageUrl: null,
    prepTime: 10,
    cookTime: 180,
    servings: 6,
    steps: [
      { text: "Soak salt beef in cold water overnight (or at least 4 hours) to reduce saltiness. Drain and rinse.", timerMinutes: null },
      { text: "Place salt beef in a large pot and cover with fresh cold water. Bring to a boil, then reduce heat and simmer for 1.5 hours.", timerMinutes: 90 },
      { text: "Add split peas in a tied cloth bag and the diced turnip. Continue simmering for 30 minutes.", timerMinutes: 30 },
      { text: "Add potatoes, carrots, and quartered cabbage. Simmer for another 30–40 minutes until all vegetables are completely tender.", timerMinutes: 35 },
      { text: "Remove the pea bag. Slice salt beef and serve everything in bowls, ladled with the rich cooking broth.", timerMinutes: null },
    ],
    ingredients: [
      makeGuestIngredient("gr4-1", "Heritage Salt Beef",  800, "g",  "prod_m005", 800,  "g",    "800g"),
      makeGuestIngredient("gr4-2", "Potatoes",              1, null, "prod_p002", 2268, "g",    "5lb bag"),
      makeGuestIngredient("gr4-3", "Carrots",               1, null, "prod_p001",  908, "g",    "2lb bag"),
      makeGuestIngredient("gr4-4", "Cabbage",               1, null, "prod_p003",    1, "unit", "per head"),
      makeGuestIngredient("gr4-5", "Turnip",              500, "g",  "prod_p004", 1000, "g",    "per kg"),
      makeGuestIngredient("gr4-6", "Split peas (yellow)", null, null, null,       null, null,   null),
    ],
    estimatedTotal: null,
    hasUnlinkedIngredients: true,
  },
};

// ─── RECIPES (recipes page) ───────────────────────────────────────────────────

export const GUEST_RECIPES = [
  {
    id: "guest-recipe-1",
    userId: null,
    title: "Spaghetti Aglio e Olio",
    description: "Classic Italian pasta with garlic and olive oil. Ready in 20 minutes.",
    imageUrl: null,
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 15,
    estimatedCost: null,
    ingredients: [
      { id: "gr1-1", name: "Barilla Spaghetti",   productId: "prod_pasta_barilla",       quantity: 400,  unit: "g",    productUnitQuantity: 500,  productUnitMeasure: "g",    productUnitSize: "500g" },
      { id: "gr1-2", name: "Bertolli Olive Oil",  productId: "prod_olive_oil_bertolli",  quantity: 60,   unit: "ml",   productUnitQuantity: 1000, productUnitMeasure: "ml",   productUnitSize: "1L" },
      { id: "gr1-3", name: "Garlic",              productId: "prod_p006",                quantity: 4,    unit: "cloves", productUnitQuantity: 3,  productUnitMeasure: "unit", productUnitSize: "3 bulb pack" },
      { id: "gr1-4", name: "Salt",                productId: null,                       quantity: null, unit: null,   productUnitQuantity: null, productUnitMeasure: null,   productUnitSize: null },
      { id: "gr1-5", name: "Red pepper flakes",   productId: null,                       quantity: null, unit: null,   productUnitQuantity: null, productUnitMeasure: null,   productUnitSize: null },
      { id: "gr1-6", name: "Fresh parsley",       productId: null,                       quantity: null, unit: null,   productUnitQuantity: null, productUnitMeasure: null,   productUnitSize: null },
    ],
  },
  {
    id: "guest-recipe-2",
    userId: null,
    title: "Maple Glazed Salmon",
    description: "Canadian classic. Sweet maple glaze on pan-seared Atlantic salmon.",
    imageUrl: null,
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 12,
    estimatedCost: null,
    ingredients: [
      { id: "gr2-1", name: "Atlantic Salmon Fillet", productId: "prod_salmon_atlantic", quantity: 500,  unit: "g",  productUnitQuantity: 1000, productUnitMeasure: "g",  productUnitSize: "per kg" },
      { id: "gr2-2", name: "PC Maple Syrup",         productId: "prod_g003",            quantity: 60,   unit: "ml", productUnitQuantity: 540,  productUnitMeasure: "ml", productUnitSize: "540ml" },
      { id: "gr2-3", name: "Kikkoman Soy Sauce",     productId: "prod_g002",            quantity: 30,   unit: "ml", productUnitQuantity: 250,  productUnitMeasure: "ml", productUnitSize: "250ml" },
      { id: "gr2-4", name: "Garlic",                 productId: "prod_p006",            quantity: 2,    unit: "cloves", productUnitQuantity: 3, productUnitMeasure: "unit", productUnitSize: "3 bulb pack" },
      { id: "gr2-5", name: "Salt & pepper",          productId: null,                   quantity: null, unit: null, productUnitQuantity: null, productUnitMeasure: null, productUnitSize: null },
    ],
  },
  {
    id: "guest-recipe-3",
    userId: null,
    title: "Caesar Salad",
    description: "Classic Caesar with homemade dressing. Simple and crowd-pleasing.",
    imageUrl: null,
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 0,
    estimatedCost: null,
    ingredients: [
      { id: "gr3-1", name: "Romaine Lettuce",        productId: "prod_p007", quantity: 2,    unit: null, productUnitQuantity: 1,   productUnitMeasure: "unit", productUnitSize: "each" },
      { id: "gr3-2", name: "Cracker Barrel Parmesan", productId: "prod_d007", quantity: 60,  unit: "g",  productUnitQuantity: 200, productUnitMeasure: "g",   productUnitSize: "200g" },
      { id: "gr3-3", name: "Lemons",                 productId: "prod_p009", quantity: 1,    unit: null, productUnitQuantity: 3,   productUnitMeasure: "unit", productUnitSize: "3 pack" },
      { id: "gr3-4", name: "Garlic",                 productId: "prod_p006", quantity: 2,    unit: "cloves", productUnitQuantity: 3, productUnitMeasure: "unit", productUnitSize: "3 bulb pack" },
      { id: "gr3-5", name: "Olive oil",              productId: "prod_olive_oil_bertolli", quantity: 45, unit: "ml", productUnitQuantity: 1000, productUnitMeasure: "ml", productUnitSize: "1L" },
      { id: "gr3-6", name: "Worcestershire sauce",   productId: null,        quantity: null, unit: null, productUnitQuantity: null, productUnitMeasure: null, productUnitSize: null },
      { id: "gr3-7", name: "Dijon mustard",          productId: null,        quantity: null, unit: null, productUnitQuantity: null, productUnitMeasure: null, productUnitSize: null },
    ],
  },
  {
    id: "guest-recipe-4",
    userId: null,
    title: "Jiggs Dinner",
    description: "Newfoundland's beloved Sunday tradition. Salt beef and root vegetables simmered low and slow — pure NL comfort food.",
    imageUrl: null,
    servings: 6,
    prepMinutes: 10,
    cookMinutes: 180,
    estimatedCost: null,
    ingredients: [
      { id: "gr4-1", name: "Heritage Salt Beef",  productId: "prod_m005", quantity: 800,  unit: "g",  productUnitQuantity: 800,  productUnitMeasure: "g",    productUnitSize: "800g" },
      { id: "gr4-2", name: "Potatoes",            productId: "prod_p002", quantity: 1,    unit: null, productUnitQuantity: 2268, productUnitMeasure: "g",    productUnitSize: "5lb bag" },
      { id: "gr4-3", name: "Carrots",             productId: "prod_p001", quantity: 1,    unit: null, productUnitQuantity: 908,  productUnitMeasure: "g",    productUnitSize: "2lb bag" },
      { id: "gr4-4", name: "Cabbage",             productId: "prod_p003", quantity: 1,    unit: null, productUnitQuantity: 1,    productUnitMeasure: "unit", productUnitSize: "per head" },
      { id: "gr4-5", name: "Turnip",              productId: "prod_p004", quantity: 500,  unit: "g",  productUnitQuantity: 1000, productUnitMeasure: "g",    productUnitSize: "per kg" },
      { id: "gr4-6", name: "Split peas (yellow)", productId: null,        quantity: null, unit: null, productUnitQuantity: null, productUnitMeasure: null,   productUnitSize: null },
    ],
  },
];
