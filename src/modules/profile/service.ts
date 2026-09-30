import { revalidateTag } from "next/cache";
import { db } from "@/platform/db";
import { profilePreferences } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { onboardingVersion, type RecordData } from "@/shared/contracts";
import { profileUpdateSchema } from "./schema";

export async function updateProfile(context: Context, input: RecordData) {
  const data = profileUpdateSchema.parse(input);
  const changes = {
    ...(data.accentPalette ? { accentPalette: data.accentPalette } : {}),
    ...(data.onboardingCompleted ? { onboardingVersion, onboardingCompletedAt: new Date() } : {}),
    updatedAt: new Date(),
  };
  const [profile] = await db
    .insert(profilePreferences)
    .values({ userId: context.user.id, ...changes })
    .onConflictDoUpdate({ target: profilePreferences.userId, set: changes })
    .returning({
      accentPalette: profilePreferences.accentPalette,
      onboardingVersion: profilePreferences.onboardingVersion,
    });
  // Personal preferences do not invalidate the shared department data.
  revalidateTag(`member:${context.user.id}`, { expire: 0 });
  return profile;
}
