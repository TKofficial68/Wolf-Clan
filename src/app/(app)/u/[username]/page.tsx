import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { findProfileByUsername, blockState } from "@/lib/profiles";
import { getT } from "@/i18n/server";
import { ProfileView } from "@/components/profile-view";
import { EmptyState } from "@/components/ui";
import { UserX } from "lucide-react";

export default async function MemberProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const viewer = await requireUser();
  const { username } = await params;
  const profile = await findProfileByUsername(username);
  const { t } = await getT();
  if (!profile) notFound();
  if (profile.id === viewer.id) redirect("/profile");
  if (profile.profileVisibility === "nobody") {
    return (
      <div className="screen flex flex-col gap-3 pt-6">
        <EmptyState icon={<UserX size={22} />} title={t("profile.viewerHidden")} />
      </div>
    );
  }
  const state = await blockState(viewer.id, profile.id);
  return (
    <ProfileView
      isOwn={false}
      t={t}
      locale={(await getT()).locale}
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
