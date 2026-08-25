/**
 * Search terms for harvesting a catalogue from PC Express.
 *
 * There is no category-browse endpoint — I checked, they all 404 — and search
 * is bounded per term (`totalResults` was 62 for "milk"). So breadth comes from
 * the number of terms, not from pagination.
 *
 * Grouped by the ProductCategory enum so the harvest is balanced across the
 * catalogue rather than skewed toward whatever happened to be searched.
 */

export const CATALOGUE_TERMS: Record<string, string[]> = {
  dairy: [
    "milk", "skim milk", "chocolate milk", "cream", "whipping cream",
    "butter", "margarine", "cheddar cheese", "mozzarella", "parmesan",
    "cream cheese", "cottage cheese", "sour cream", "greek yogurt", "yogurt",
    "eggs", "egg whites",
  ],
  meat_seafood: [
    "chicken breast", "chicken thighs", "whole chicken", "ground beef",
    "steak", "stewing beef", "pork chops", "pork tenderloin", "bacon",
    "sausages", "ham", "deli turkey", "salmon", "cod", "shrimp", "tuna",
    "ground turkey",
  ],
  produce: [
    "apples", "bananas", "oranges", "grapes", "strawberries", "blueberries",
    "lemons", "avocado", "potatoes", "sweet potato", "onions", "garlic",
    "carrots", "celery", "broccoli", "cauliflower", "lettuce", "spinach",
    "tomatoes", "cucumber", "peppers", "mushrooms", "corn", "green beans",
  ],
  bakery_bread: [
    "bread", "whole wheat bread", "bagels", "english muffins", "tortillas",
    "hamburger buns", "hot dog buns", "croissant", "muffins", "cake",
    // Grain and style variants. A live Voilà bread capture resolved 0 of 12:
    // the catalogue held one Dempster's loaf (Whole Wheat) while the shelf
    // carried 12 Grain, Ancient Grains, Honey & Oatmeal and Multigrain. Bread
    // is brand- and variant-fragmented, so "bread" alone under-harvests it.
    "multigrain bread", "whole grain bread", "12 grain bread", "rye bread",
    "sourdough bread", "white bread", "sliced bread", "flatbread", "naan",
    "pita bread", "dinner rolls", "baguette",
  ],
  frozen: [
    "frozen pizza", "ice cream", "frozen vegetables", "frozen fries",
    "frozen berries", "frozen fish", "frozen waffles", "frozen dinner",
  ],
  pantry_dry_goods: [
    "pasta", "spaghetti", "rice", "quinoa", "flour", "sugar", "brown sugar",
    "cereal", "oatmeal", "granola bars", "peanut butter", "jam", "honey",
    "olive oil", "vegetable oil", "vinegar", "soy sauce", "ketchup",
    "mustard", "mayonnaise", "tomato sauce", "canned tomatoes", "canned beans",
    "canned soup", "chicken broth", "tuna can", "salt", "pepper", "spices",
  ],
  snacks_candy: [
    "chips", "tortilla chips", "popcorn", "crackers", "cookies", "chocolate",
    "candy", "nuts", "trail mix", "granola",
  ],
  beverages: [
    "orange juice", "apple juice", "coffee", "ground coffee", "tea",
    "soft drinks", "cola", "sparkling water", "bottled water", "energy drink",
    "sports drink", "iced tea",
  ],
  household: [
    "paper towels", "toilet paper", "facial tissue", "laundry detergent",
    "dish soap", "dishwasher pods", "all purpose cleaner", "garbage bags",
    "aluminum foil", "plastic wrap", "sponges",
  ],
  personal_care: [
    "shampoo", "conditioner", "body wash", "bar soap", "toothpaste",
    "toothbrush", "deodorant", "hand soap", "razors", "lotion",
  ],
  baby: ["diapers", "baby wipes", "baby formula", "baby food"],
  pet: ["dog food", "cat food", "cat litter", "dog treats"],
  health_wellness: ["vitamins", "pain relief", "cold medicine", "bandages"],
};

/** Flattened, deduplicated term list. */
export const ALL_CATALOGUE_TERMS = [
  ...new Set(Object.values(CATALOGUE_TERMS).flat()),
];

/** The category a term was harvested under — the free category signal. */
export const TERM_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATALOGUE_TERMS).flatMap(([category, terms]) =>
    terms.map((t) => [t, category]),
  ),
);
