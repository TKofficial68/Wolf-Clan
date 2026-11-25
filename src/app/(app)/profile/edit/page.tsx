import { requireUser } from "@/lib/auth";
import { ProfileEditor } from "@/components/profile-editor";
import { avatarUrl } from "@/lib/home-data";

export default async function ProfileEditPage() {
  const user = await requireUser();
  return (
    <ProfileEditor
      initial={{
        displayName: user.displayName,
        username: user.username,
        title: user.title ?? "",
        bio: user.bio ?? "",
        avatarUrl: avatarUrl(user.avatarUploadId),
      }}
    />
  );
}
