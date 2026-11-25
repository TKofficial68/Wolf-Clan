import { requireUser } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import { avatarUrl } from "@/lib/home-data";
import { SettingsScreen } from "./settings-screen";

export async function SettingsPageBody({ focus }: { focus?: string }) {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  return (
    <SettingsScreen
      focus={focus}
      user={{ email: user.email, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user.avatarUploadId), role: user.role }}
      settings={{
        pushEnabled: settings.pushEnabled,
        notifyMessages: settings.notifyMessages,
        notifyGroups: settings.notifyGroups,
        notifyMentions: settings.notifyMentions,
        notifyReplies: settings.notifyReplies,
        notifyReactions: settings.notifyReactions,
        notifyTasks: settings.notifyTasks,
        notifyDeadlines: settings.notifyDeadlines,
        notifyMeetings: settings.notifyMeetings,
        notifyAnnouncements: settings.notifyAnnouncements,
        notifyReviews: settings.notifyReviews,
        sound: settings.sound,
        vibration: settings.vibration,
        messagePreview: settings.messagePreview,
        quietHoursEnabled: settings.quietHoursEnabled,
        quietStart: settings.quietStart,
        quietEnd: settings.quietEnd,
        theme: settings.theme,
        language: settings.language,
        animationLevel: settings.animationLevel,
        reduceMotion: settings.reduceMotion,
      }}
      privacy={{
        onlineVisibility: user.onlineVisibility,
        lastSeenVisibility: user.lastSeenVisibility,
        profileVisibility: user.profileVisibility,
      }}
    />
  );
}
