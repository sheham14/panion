import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import ProfileSettingsClient from "@/components/profile/ProfileSettingsClient";

export default async function ProfileSettingsPage() {
  const { user, error } = await getAuthenticatedUser();
  if (error) redirect("/sign-in");

  const [userData, stores] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        dietaryRestrictions: true,
        allergies: true,
        emailNotifications: true,
        pushNotifications: true,
        marketingOptIn: true,
        digestFrequency: true,
        preferredStores: {
          select: { storeId: true },
        },
      },
    }),
    prisma.store
      .findMany({
        where: { isActive: true },
        select: {
          id: true,
          chain: true,
          name: true,
          city: true,
          _count: {
            select: { storeProducts: { where: { isActive: true, currentPrice: { not: null } } } },
          },
        },
        orderBy: { chain: "asc" },
      })
      // Colemans, Costco and No Frills are listed but have no prices; say so
      // rather than let a shopper pick a store that will price nothing.
      .then((rows) =>
        rows.map(({ _count, ...s }) => ({ ...s, hasPrices: _count.storeProducts > 0 })),
      ),
  ]);

  if (!userData) redirect("/sign-in");

  return (
    <ProfileSettingsClient
      initialData={{
        name: userData.name ?? "",
        email: userData.email,
        dietaryRestrictions: userData.dietaryRestrictions,
        allergies: userData.allergies,
        emailNotifications: userData.emailNotifications,
        pushNotifications: userData.pushNotifications,
        marketingOptIn: userData.marketingOptIn,
        digestFrequency: userData.digestFrequency,
        preferredStoreIds: userData.preferredStores.map((ps) => ps.storeId),
      }}
      stores={stores}
    />
  );
}
