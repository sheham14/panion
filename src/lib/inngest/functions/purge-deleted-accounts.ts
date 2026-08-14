import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

/** Grace period we promise the user in the deletion-request response. */
export const DELETION_GRACE_DAYS = 30;

/** Users processed per cron tick. Keeps the step well inside its timeout. */
const BATCH_SIZE = 50;

/**
 * Irreversibly strips personal data from one user.
 *
 * We anonymize rather than `prisma.user.delete()` for two reasons:
 *
 *  1. `PriceReport`, `PriceHistory.submittedBy`, `Post`, `Comment`,
 *     `ContentFlag` and `Recipe` all reference `users` *without* `onDelete:
 *     Cascade`, so a hard delete throws a foreign-key error the moment a user
 *     has contributed anything.
 *  2. Crowdsourced price data is what other users' comparisons are built on.
 *     Deleting it would corrupt price history for everyone else; severing it
 *     from the person satisfies the privacy obligation without that damage.
 *
 * Everything genuinely personal is hard-deleted; the contribution rows survive
 * with no identifiable owner.
 */
export async function anonymizeUser(userId: string): Promise<void> {
  await prisma.$transaction([
    // Kill credentials first so the account can't be signed back into.
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.pushSubscription.deleteMany({ where: { userId } }),

    // Personal content — no value to anyone else.
    prisma.aiChatSession.deleteMany({ where: { userId } }),
    prisma.pantryItem.deleteMany({ where: { userId } }),
    prisma.list.deleteMany({ where: { userId } }),
    prisma.recipe.deleteMany({ where: { userId } }),
    prisma.watchlist.deleteMany({ where: { userId } }),
    prisma.alert.deleteMany({ where: { userId } }),
    prisma.userPreferredStore.deleteMany({ where: { userId } }),
    prisma.featureUsage.deleteMany({ where: { userId } }),

    // Sever the remaining rows from the person.
    prisma.user.update({
      where: { id: userId },
      data: {
        // `email` is non-null + unique, so it gets a unique tombstone rather
        // than null. `.invalid` is reserved by RFC 2606 and can never resolve.
        email: `deleted-${userId}@panion.invalid`,
        name: null,
        image: null,
        dateOfBirth: null,
        gender: null,
        nationality: null,
        city: null,
        province: null,
        dietaryRestrictions: [],
        allergies: [],
        healthGoal: null,
        activityLevel: null,
        dailyCalorieGoal: null,
        heightCm: null,
        weightKg: null,
        stripeCustomerId: null,
        emailVerified: null,
        emailNotifications: false,
        pushNotifications: false,
        marketingOptIn: false,
        anonymizedAt: new Date(),
        deletedAt: new Date(),
      },
    }),
  ]);
}

/**
 * Daily sweep that honours account-deletion requests.
 *
 * `/api/user/delete` sets `deletionRequestedAt` and tells the user their data
 * will be gone within 30 days. Before this function existed nothing ever read
 * that column, so the promise was never kept (audit C2).
 */
export const purgeDeletedAccounts = inngest.createFunction(
  {
    id: "purge-deleted-accounts",
    name: "Purge accounts past their deletion grace period",
    triggers: [{ cron: "0 3 * * *" }], // 03:00 UTC daily
  },
  async ({ step }) => {
    const cutoff = new Date(Date.now() - DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);

    const due = await step.run("find-due-accounts", () =>
      prisma.user.findMany({
        where: {
          deletionRequestedAt: { not: null, lt: cutoff },
          anonymizedAt: null,
        },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    );

    if (due.length === 0) return { anonymized: 0, failed: 0 };

    let anonymized = 0;
    const failed: string[] = [];

    for (const { id } of due) {
      try {
        // One step per user: a failure isolates to that account and retries
        // without redoing the ones that already succeeded.
        await step.run(`anonymize-${id}`, () => anonymizeUser(id));
        anonymized += 1;
      } catch (err) {
        console.error(`[purge-deleted-accounts] failed for user ${id}:`, err);
        failed.push(id);
      }
    }

    return { anonymized, failed: failed.length, remaining: due.length === BATCH_SIZE };
  },
);
