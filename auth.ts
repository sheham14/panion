import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma) as Adapter,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, trigger, session: sessionData }) {
      if (trigger === "signIn" || trigger === "signUp") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: { onboardingCompleted: true },
        });
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
      }
      if (trigger === "update") {
        const s = sessionData as { onboardingCompleted?: boolean } | undefined;
        if (s?.onboardingCompleted !== undefined) {
          token.onboardingCompleted = s.onboardingCompleted;
        }
      }
      return token;
    },
  },
  events: {
    async createUser({ user }) {
      try {
        const systemRecipes = await prisma.recipe.findMany({
          where: { userId: null, isActive: true },
          include: { ingredients: { orderBy: { sortOrder: "asc" } } },
        });

        await Promise.all(
          systemRecipes.map((recipe) =>
            prisma.recipe.create({
              data: {
                userId: user.id,
                title: recipe.title,
                description: recipe.description,
                imageUrl: recipe.imageUrl,
                prepTime: recipe.prepTime,
                cookTime: recipe.cookTime,
                servings: recipe.servings,
                instructions: recipe.instructions ?? undefined,
                ingredients: {
                  create: recipe.ingredients.map((ing) => ({
                    name: ing.name,
                    quantity: ing.quantity,
                    unit: ing.unit,
                    notes: ing.notes,
                    isOptional: ing.isOptional,
                    sortOrder: ing.sortOrder,
                  })),
                },
              },
            }),
          ),
        );
      } catch (err) {
        console.error("Failed to copy system recipes:", err);
      }
    },
  },
});