import { PrismaClient } from "./generated/client";
import { UserRole, ProductCategory, ConsentType } from "./generated/enums";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires the driver adapter to initialize
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // ─── STORES ───────────────────────────────────────────────
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
      where: { id: "store_loblaws" },
      update: {},
      create: {
        id: "store_loblaws",
        chain: "loblaws",
        name: "Loblaws - St. John's",
        address: "430 Topsail Rd",
        city: "St. John's",
        province: "NL",
        postalCode: "A1E 2B5",
        isActive: true,
      },
    }),
    prisma.store.upsert({
      where: { id: "store_metro" },
      update: {},
      create: {
        id: "store_metro",
        chain: "metro",
        name: "Metro - St. John's",
        address: "253 Freshwater Rd",
        city: "St. John's",
        province: "NL",
        postalCode: "A1B 1B3",
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
    prisma.store.upsert({
      where: { id: "store_dollarama" },
      update: {},
      create: {
        id: "store_dollarama",
        chain: "dollarama",
        name: "Dollarama - St. John's",
        address: "371 Kenmount Rd",
        city: "St. John's",
        province: "NL",
        postalCode: "A1B 3P9",
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ ${stores.length} stores created`);

  // ─── USERS ────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
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
  const productData = [
    // DAIRY
    {
      id: "prod_milk_natrel",
      name: "Natrel Milk 2%",
      brand: "Natrel",
      category: ProductCategory.dairy,
      unitSize: "4L",
      unitMeasure: "L",
      unitQuantity: 4,
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
      id: "prod_yogurt_liberté",
      name: "Liberté Greek Yogurt Plain",
      brand: "Liberté",
      category: ProductCategory.dairy,
      unitSize: "750g",
      unitMeasure: "g",
      unitQuantity: 750,
    },
    // EGGS
    {
      id: "prod_eggs_burnbrae",
      name: "Burnbrae Eggs Large",
      brand: "Burnbrae",
      category: ProductCategory.dairy,
      unitSize: "12 pack",
      unitMeasure: "unit",
      unitQuantity: 12,
      barcode: "055742300018",
    },
    // MEAT & SEAFOOD
    {
      id: "prod_chicken_maple_leaf",
      name: "Maple Leaf Chicken Breast",
      brand: "Maple Leaf",
      category: ProductCategory.meat_seafood,
      unitSize: "1kg",
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
    // PRODUCE
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
    // BAKERY
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
    // PANTRY
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
    // FROZEN
    {
      id: "prod_peas_frozen_green_giant",
      name: "Green Giant Frozen Peas",
      brand: "Green Giant",
      category: ProductCategory.frozen,
      unitSize: "750g",
      unitMeasure: "g",
      unitQuantity: 750,
    },
    // BEVERAGES
    {
      id: "prod_oj_tropicana",
      name: "Tropicana Orange Juice",
      brand: "Tropicana",
      category: ProductCategory.beverages,
      unitSize: "1.54L",
      unitMeasure: "L",
      unitQuantity: 1.54,
    },
    // SNACKS
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
  ];

  const products = await Promise.all(
    productData.map((p) =>
      prisma.product.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          unitSize: p.unitSize,
          unitMeasure: p.unitMeasure,
          unitQuantity: p.unitQuantity,
          isActive: true,
          ...(p.barcode ? { barcode: p.barcode } : {}),
        },
      }),
    ),
  );
  console.log(`✅ ${products.length} products created`);

  // ─── STORE PRODUCTS + PRICE HISTORY ───────────────────────
  // Prices per store per product [walmart, loblaws, metro, sobeys, dollarama]
  // null = not carried at this store
  const priceMatrix: Record<string, (number | null)[]> = {
    prod_milk_natrel: [5.47, 5.99, 5.79, 5.89, null],
    prod_butter_lactantia: [5.97, 6.49, 6.29, 6.19, null],
    prod_cheddar_cracker_barrel: [6.97, 7.49, 7.29, 7.19, null],
    prod_yogurt_liberté: [5.47, 5.99, 5.79, 5.89, null],
    prod_eggs_burnbrae: [3.97, 4.49, 4.29, 4.19, null],
    prod_chicken_maple_leaf: [10.97, 11.99, 11.49, 11.29, null],
    prod_beef_ground_lean: [9.97, 10.99, 10.49, 10.29, null],
    prod_salmon_atlantic: [12.97, 13.99, 13.49, 13.29, null],
    prod_bananas: [1.47, 1.69, 1.59, 1.55, null],
    prod_apples_gala: [4.97, 5.49, 5.29, 5.19, null],
    prod_strawberries: [2.97, 3.49, 3.29, 3.19, null],
    prod_broccoli: [2.47, 2.99, 2.79, 2.69, null],
    prod_bread_wonder: [3.47, 3.99, 3.79, 3.69, null],
    prod_bread_dempsters: [3.97, 4.49, 4.29, 4.19, null],
    prod_pasta_barilla: [2.47, 2.99, 2.79, 2.69, null],
    prod_olive_oil_bertolli: [7.97, 8.99, 8.49, 8.29, null],
    prod_rice_uncle_bens: [6.47, 6.99, 6.79, 6.69, null],
    prod_tomato_sauce_hunts: [1.97, 2.49, 2.29, 2.19, 2.5],
    prod_peas_frozen_green_giant: [2.97, 3.49, 3.29, 3.19, null],
    prod_oj_tropicana: [4.97, 5.49, 5.29, 5.19, null],
    prod_chips_lays: [3.97, 4.49, 4.29, 4.19, 4.0],
  };

  const storeIds = [
    "store_walmart",
    "store_loblaws",
    "store_metro",
    "store_sobeys",
    "store_dollarama",
  ];

  let storeProductCount = 0;
  let priceHistoryCount = 0;

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

      // 12 weeks of price history with slight realistic variation
      const now = new Date();
      for (let week = 11; week >= 0; week--) {
        const date = new Date(now);
        date.setDate(date.getDate() - week * 7);

        // Small random variance ±10% to simulate real price movement
        const variance = 1 + (Math.random() * 0.2 - 0.1);
        const historicalPrice = Math.round(basePrice * variance * 100) / 100;

        // Simulate an occasional sale (roughly 1 in 6 weeks)
        const isSale = Math.random() < 0.16;
        const salePrice = isSale
          ? Math.round(historicalPrice * 0.85 * 100) / 100
          : historicalPrice;

        await prisma.priceHistory.create({
          data: {
            storeProductId: spId,
            price: salePrice,
            isSale,
            source: "manual",
            scrapedAt: date,
          },
        });
        priceHistoryCount++;
      }
    }
  }

  console.log(`✅ ${storeProductCount} store products created`);
  console.log(`✅ ${priceHistoryCount} price history records created`);

  // ─── WATCHLIST ────────────────────────────────────────────
  await prisma.watchlist.createMany({
    skipDuplicates: true,
    data: [
      { userId: testUser.id, productId: "prod_milk_natrel", targetPrice: 5.0 },
      {
        userId: testUser.id,
        productId: "prod_eggs_burnbrae",
        targetPrice: 3.5,
      },
      { userId: testUser.id, productId: "prod_chicken_maple_leaf" },
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
          {
            productId: "prod_milk_natrel",
            name: "Natrel Milk 2% 4L",
            quantity: 1,
            sortOrder: 0,
          },
          {
            productId: "prod_eggs_burnbrae",
            name: "Burnbrae Eggs 12pk",
            quantity: 1,
            sortOrder: 1,
          },
          {
            productId: "prod_bread_wonder",
            name: "Wonder White Bread",
            quantity: 1,
            sortOrder: 2,
          },
          {
            productId: "prod_bananas",
            name: "Bananas",
            quantity: 500,
            unit: "g",
            sortOrder: 3,
          },
          {
            name: "Dish soap",
            quantity: 1,
            notes: "get the green one",
            sortOrder: 4,
          },
        ],
      },
    },
  });
  console.log(`✅ Shopping list created (${list.name})`);

  // ─── PANTRY ───────────────────────────────────────────────
  await prisma.pantryItem.createMany({
    data: [
      {
        userId: testUser.id,
        productId: "prod_pasta_barilla",
        name: "Barilla Spaghetti",
        quantity: 500,
        unit: "g",
      },
      {
        userId: testUser.id,
        productId: "prod_olive_oil_bertolli",
        name: "Bertolli Olive Oil",
        quantity: 500,
        unit: "ml",
      },
      { userId: testUser.id, name: "Black pepper", quantity: 1, unit: "g" },
      { userId: testUser.id, name: "Salt", quantity: 1, unit: "g" },
    ],
  });
  console.log("✅ Pantry items created");

  // ─── RECIPES ──────────────────────────────────────────────
  const recipes = await Promise.all([
    prisma.recipe.create({
      data: {
        title: "Spaghetti Aglio e Olio",
        description:
          "Classic Italian pasta with garlic and olive oil. Ready in 20 minutes.",
        prepTime: 5,
        cookTime: 15,
        servings: 2,
        instructions: [
          {
            text: "Bring a large pot of salted water to a boil. Cook spaghetti according to package instructions until al dente. Reserve ¼ cup of pasta water before draining.",
            timerMinutes: 10,
          },
          {
            text: "While pasta cooks, thinly slice the garlic. Heat olive oil in a large skillet over medium-low heat and sauté garlic until golden and fragrant — don't let it burn.",
            timerMinutes: 5,
          },
          {
            text: "Add drained pasta to the skillet with a splash of pasta water. Toss well to coat. Add red pepper flakes if using.",
            timerMinutes: null,
          },
          {
            text: "Serve immediately topped with fresh parsley and a drizzle of good olive oil.",
            timerMinutes: null,
          },
        ],
        ingredients: {
          create: [
            {
              productId: "prod_pasta_barilla",
              name: "Spaghetti",
              quantity: 200,
              unit: "g",
              sortOrder: 0,
            },
            {
              productId: "prod_olive_oil_bertolli",
              name: "Olive oil",
              quantity: 60,
              unit: "ml",
              sortOrder: 1,
            },
            { name: "Garlic cloves", quantity: 4, sortOrder: 2 },
            { name: "Fresh parsley", quantity: 10, unit: "g", sortOrder: 3 },
            {
              name: "Red pepper flakes",
              quantity: 1,
              unit: "g",
              isOptional: true,
              sortOrder: 4,
            },
          ],
        },
      },
    }),
    prisma.recipe.create({
      data: {
        title: "Maple Glazed Salmon",
        description:
          "Canadian classic. Sweet maple glaze on pan-seared Atlantic salmon.",
        prepTime: 10,
        cookTime: 15,
        servings: 2,
        instructions: [
          {
            text: "Whisk together maple syrup, soy sauce, and minced garlic in a small bowl. Pat salmon fillets dry and place in a shallow dish. Pour marinade over and let sit.",
            timerMinutes: 10,
          },
          {
            text: "Heat olive oil in a skillet over medium-high heat. Place salmon skin-side down and sear without moving.",
            timerMinutes: 4,
          },
          {
            text: "Flip the salmon, pour the remaining glaze over top, and cook until salmon is cooked through and glaze is caramelized.",
            timerMinutes: 3,
          },
          {
            text: "Rest for 2 minutes before serving with your choice of sides.",
            timerMinutes: 2,
          },
        ],
        ingredients: {
          create: [
            {
              productId: "prod_salmon_atlantic",
              name: "Atlantic salmon fillet",
              quantity: 400,
              unit: "g",
              sortOrder: 0,
            },
            { name: "Maple syrup", quantity: 30, unit: "ml", sortOrder: 1 },
            { name: "Soy sauce", quantity: 15, unit: "ml", sortOrder: 2 },
            { name: "Garlic clove", quantity: 2, sortOrder: 3 },
            {
              productId: "prod_olive_oil_bertolli",
              name: "Olive oil",
              quantity: 15,
              unit: "ml",
              sortOrder: 4,
            },
          ],
        },
      },
    }),
    prisma.recipe.create({
      data: {
        title: "Caesar Salad",
        description:
          "Classic Caesar with homemade dressing. Simple and crowd-pleasing.",
        prepTime: 15,
        cookTime: 0,
        servings: 4,
        instructions: [
          {
            text: "Whisk together mayonnaise, fresh lemon juice, minced garlic, grated parmesan, and worcestershire sauce until smooth. Season with salt and pepper.",
            timerMinutes: null,
          },
          {
            text: "Chop romaine into bite-sized pieces and add to a large bowl. Pour dressing over and toss well to coat every leaf.",
            timerMinutes: null,
          },
          {
            text: "Top with croutons and extra shaved parmesan. Serve immediately.",
            timerMinutes: null,
          },
        ],
        ingredients: {
          create: [
            { name: "Romaine lettuce", quantity: 1, sortOrder: 0 },
            { name: "Parmesan", quantity: 50, unit: "g", sortOrder: 1 },
            { name: "Mayonnaise", quantity: 60, unit: "ml", sortOrder: 2 },
            { name: "Lemon", quantity: 1, sortOrder: 3 },
            { name: "Garlic clove", quantity: 2, sortOrder: 4 },
            {
              name: "Croutons",
              quantity: 50,
              unit: "g",
              isOptional: true,
              sortOrder: 5,
            },
          ],
        },
      },
    }),
  ]);
  console.log(`✅ ${recipes.length} recipes created`);

  // ─── FLYERS ───────────────────────────────────────────────
  const now = new Date();
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
        storeId: "store_loblaws",
        title: "Loblaws Weekly Flyer",
        imageUrl: "/images/flyers/loblaws-sample.jpg",
        validFrom: flyerStart,
        validUntil: flyerEnd,
      },
    ],
  });
  console.log("✅ Flyers created");

  // ─── CONSENT LOGS ─────────────────────────────────────────
  await prisma.consentLog.createMany({
    data: [
      {
        userId: testUser.id,
        consentType: ConsentType.terms_of_service,
        consented: true,
      },
      {
        userId: testUser.id,
        consentType: ConsentType.marketing_email,
        consented: false,
      },
      {
        userId: testUser.id,
        consentType: ConsentType.price_alerts,
        consented: true,
      },
    ],
  });
  console.log("✅ Consent logs created");

  // Add to your seed file after existing data is created

  // const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
  const daysAgo = (d: number) =>
    new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  await prisma.alert.createMany({
    data: [
      // Unread — today
      {
        userId: "cmnrsfngr00002cc7qrgkj9wo",
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Milk — Natrel 2% 4L",
          emoji: "🥛",
          oldPrice: 5.99,
          newPrice: 5.47,
          storeName: "Walmart",
          storeColor: "#0071ce",
          productId: "prod_milk_natrel",
        },
        sentAt: hoursAgo(1),
        createdAt: hoursAgo(1),
      },
      {
        userId: "cmnrsfngr00002cc7qrgkj9wo",
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Chicken — Maple Leaf 1kg",
          emoji: "🍗",
          oldPrice: 11.99,
          newPrice: 10.97,
          storeName: "Loblaws",
          storeColor: "#d62b2b",
          productId: "prod_chicken_maple_leaf",
        },
        sentAt: hoursAgo(3),
        createdAt: hoursAgo(3),
      },
      {
        userId: "cmnrsfngr00002cc7qrgkj9wo",
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Salmon — Atlantic 400g",
          emoji: "🐟",
          oldPrice: 13.99,
          newPrice: 12.97,
          storeName: "Walmart",
          storeColor: "#0071ce",
          productId: "prod_salmon_atlantic",
        },
        sentAt: hoursAgo(5),
        createdAt: hoursAgo(5),
      },
      // Read — earlier
      {
        userId: "cmnrsfngr00002cc7qrgkj9wo",
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Eggs — Burnbrae 12 pack",
          emoji: "🥚",
          oldPrice: 4.49,
          newPrice: 3.97,
          storeName: "Walmart",
          storeColor: "#0071ce",
          productId: "prod_eggs_burnbrae",
        },
        sentAt: daysAgo(2),
        readAt: daysAgo(1),
        createdAt: daysAgo(2),
      },
      {
        userId: "cmnrsfngr00002cc7qrgkj9wo",
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "White Bread — Wonder 675g",
          emoji: "🍞",
          oldPrice: 3.99,
          newPrice: 3.47,
          storeName: "Metro",
          storeColor: "#e30000",
          productId: "prod_bread_wonder",
        },
        sentAt: daysAgo(4),
        readAt: daysAgo(3),
        createdAt: daysAgo(4),
      },
      {
        userId: "cmnrsfngr00002cc7qrgkj9wo",
        type: "price_drop",
        channel: "push",
        payload: {
          productName: "Cheddar — Cracker Barrel 400g",
          emoji: "🧀",
          oldPrice: 7.49,
          newPrice: 6.97,
          storeName: "Sobeys",
          storeColor: "#d62b2b",
          productId: "prod_cheddar_cracker_barrel",
        },
        sentAt: daysAgo(7),
        readAt: daysAgo(6),
        createdAt: daysAgo(7),
      },
    ],
  });
  console.log("✅ 6 mock alerts seeded");

  console.log("\n🎉 Seed complete!");
  console.log(`   Test user: test@sentinel.ca`);
  console.log(`   Admin user: admin@sentinel.ca`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
