import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { ProfileView } from "@/components/profile-view";
import { blockState } from "@/lib/profiles";

export default async function MemberProfileByIdPage({ params }: { params: Promise<{ userId: string }> }) {
  const viewer = await requireUser();
  const { userId } = await params;
  const rows = await db
    .select({ id: profiles.id, username: profiles.username, displayName: profiles.displayName, role: profiles.role, title: profiles.title, bio: profiles.bio, avatarUploadId: profiles.avatarUploadId, createdAt: profiles.createdAt, profileVisibility: profiles.profileVisibility })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const profile = rows[0];
  if (!profile) notFound();
  if (profile.id === viewer.id) redirect("/profile");
  const { t, locale } = await getT();
  const state = await blockState(viewer.id, profile.id);
  return (
    <ProfileView
      isOwn={false}
      t={t}
      locale={locale}
      blocked={state.blockedByMe || state.blockedMe}
      profile={{
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        role: profile.role,
        title: profile.title,
        bio: profile.bio,
        avatarUploadId: profile.avatarUploadId,
        createdAt: new Date(profile.createdAt).toISOString(),
      }}
    />
  );
}
