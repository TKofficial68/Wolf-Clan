import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { ProfileView } from "@/components/profile-view";
import { ProfileExtras } from "@/components/profile-extras";

export default async function OwnProfilePage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  return (
    <><ProfileView
      isOwn
      t={t}
      locale={locale}
      profile={{
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        title: user.title,
        bio: user.bio,
        avatarUploadId: user.avatarUploadId,
        createdAt: user.createdAt.toISOString(),
        email: user.email,
      }}
    />
    <div className="px-3 pb-[calc(104px+env(safe-area-inset-bottom))]"><ProfileExtras /></div>
    </>
  );
}
