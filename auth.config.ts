import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.onboardingCompleted = Boolean(
        (token as { onboardingCompleted?: boolean }).onboardingCompleted,
      );
      return session;
    },
  },
} satisfies NextAuthConfig;