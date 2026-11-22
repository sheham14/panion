import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import Email from "next-auth/providers/email";
import sgMail from "@sendgrid/mail";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/client-ip";
import { accountIsLive, magicLinkThrottled } from "@/lib/auth-guards";
import { authConfig } from "./auth.config";

async function sendVerificationRequest({
  identifier: to,
  url,
}: {
  identifier: string;
  url: string;
}) {
  if (!process.env.SENDGRID_API_KEY) throw new Error("SENDGRID_API_KEY is not set");
  if (!process.env.EMAIL_FROM) throw new Error("EMAIL_FROM is not set");
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  try {
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
  } catch (err: unknown) {
    const body = (err as { response?: { body?: unknown } })?.response?.body;
    console.error("[sendVerificationRequest] SendGrid error:", body ?? err);
    throw err;
  }
}

/**
 * How often a live session re-reads its user row, so a deleted account's
 * session ends within this long (see `accountIsLive`).
 */
const ACCOUNT_RECHECK_MS = 5 * 60 * 1000;

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
    async signIn({ user, email }) {
      // Only the "send me a link" step is throttled. Clicking the link and
      // Google sign-in pass straight through.
      if (!email?.verificationRequest) return true;
      if (await magicLinkThrottled(user.email ?? "", clientIp(await headers()))) {
        // A string is a redirect; the sign-in page reads `error` from it.
        return "/signin?error=RateLimited";
      }
      return true;
    },
    async jwt({ token, trigger, session: sessionData }) {
      if (trigger === "signIn" || trigger === "signUp") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: { onboardingCompleted: true },
        });
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
        token.accountCheckedAt = Date.now();
      }
      if (trigger === "update") {
        const s = sessionData as { onboardingCompleted?: boolean } | undefined;
        if (s?.onboardingCompleted !== undefined) {
          token.onboardingCompleted = s.onboardingCompleted;
        }
      }

      // A deleted or anonymised account keeps no session. Returning null makes
      // `auth()` report no session; where a response can set cookies (route
      // handlers, /api/auth/session) the cookie is cleared too. Pages can't
      // clear it, so they send such a request through /api/session/end.
      const checkedAt = Number(token.accountCheckedAt ?? 0);
      if (token.sub && Date.now() - checkedAt > ACCOUNT_RECHECK_MS) {
        // A failed read keeps the session and retries next time. Throwing
        // here would make Auth.js clear the cookie, signing everyone out on a
        // database blip.
        const live = await accountIsLive(token.sub).catch((err) => {
          console.error("[auth] account check failed; keeping the session:", err);
          return true;
        });
        if (!live) return null;
        token.accountCheckedAt = Date.now();
      }
      return token;
    },
  },
  events: {
    async createUser({ user }) {
      // Tell the owner someone joined. The id only, so no one's name or email
      // leaves the database for an inbox (privacy policy, audit Low).
      if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM && process.env.ADMIN_EMAIL) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        sgMail.send({
          to: process.env.ADMIN_EMAIL,
          from: { email: process.env.EMAIL_FROM, name: "Panion" },
          subject: "New Panion signup",
          text: `A new account was created on Panion.\n\nUser id: ${user.id}\nTime: ${new Date().toUTCString()}`,
        }).catch((err) => console.error("[createUser] Failed to send admin notification:", err));
      }

      // Built-in recipes are not copied to the new account. The recipes pages
      // already show every built-in recipe (userId null) to everyone, so a
      // copy put each one on screen twice; 16 such copies were removed from
      // production on 2026-10-11.
    },
  },
});