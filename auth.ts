import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import Email from "next-auth/providers/email";
import sgMail from "@sendgrid/mail";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

async function sendVerificationRequest({
  identifier: to,
  url,
}: {
  identifier: string;
  url: string;
}) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  await sgMail.send({
    to,
    from: { email: process.env.EMAIL_FROM!, name: "Panion" },
    subject: "Your Panion sign-in link",
    text: `Sign in to Panion\n\n${url}\n\nThis link expires in 24 hours and can only be used once. If you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#fff;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;background:#00E5C3;border-radius:18px;margin-bottom:20px;">
            <span style="font-size:26px;">🛒</span>
          </div>
          <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px;">Sign in to Panion</h1>
          <p style="font-size:14px;color:#888;margin:0;">Click the button below to sign in. No password needed.</p>
        </div>
        <a href="${url}" style="display:block;background:#00E5C3;color:#004d40;text-decoration:none;text-align:center;padding:15px 24px;border-radius:12px;font-size:15px;font-weight:700;margin-bottom:28px;">Sign in to Panion</a>
        <p style="font-size:13px;color:#aaa;text-align:center;margin:0 0 6px;">Or copy this link into your browser:</p>
        <p style="font-size:11px;color:#bbb;text-align:center;word-break:break-all;margin:0 0 28px;">${url}</p>
        <p style="font-size:12px;color:#ccc;text-align:center;margin:0;">This link expires in 24 hours and can only be used once.<br>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Email({
      server: process.env.EMAIL_SERVER ?? "smtp://localhost",
      from: process.env.EMAIL_FROM!,
      sendVerificationRequest,
    }),
  ],
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