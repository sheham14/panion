-- AlterTable
ALTER TABLE "recipe_ingredients" ADD COLUMN     "group_slug" TEXT;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "ingredients_matched_at" TIMESTAMP(3);
