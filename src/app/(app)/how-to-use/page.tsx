import Link from "next/link";
import { ArrowLeft, CalendarClock, Clapperboard, House, ListChecks, MessagesSquare, Settings, UserRound, Users } from "lucide-react";
import { getT } from "@/i18n/server";
import { ScreenHeader } from "@/components/ui";
import { WolfMark } from "@/components/wolf-art";
import type { MessageKey } from "@/i18n";

const features: { key: string; icon: React.ReactNode; steps: [MessageKey, MessageKey, MessageKey] }[] = [
  { key: "home", icon: <House size={17} />, steps: ["howto.home.s1", "howto.home.s2", "howto.home.s3"] },
  { key: "group", icon: <Users size={17} />, steps: ["howto.group.s1", "howto.group.s2", "howto.group.s3"] },
  { key: "chat", icon: <MessagesSquare size={17} />, steps: ["howto.chat.s1", "howto.chat.s2", "howto.chat.s3"] },
  { key: "review", icon: <Clapperboard size={17} />, steps: ["howto.review.s1", "howto.review.s2", "howto.review.s3"] },
  { key: "task", icon: <ListChecks size={17} />, steps: ["howto.task.s1", "howto.task.s2", "howto.task.s3"] },
  { key: "meeting", icon: <CalendarClock size={17} />, steps: ["howto.meeting.s1", "howto.meeting.s2", "howto.meeting.s3"] },
  { key: "profile", icon: <UserRound size={17} />, steps: ["howto.profile.s1", "howto.profile.s2", "howto.profile.s3"] },
  { key: "settings", icon: <Settings size={17} />, steps: ["howto.settings.s1", "howto.settings.s2", "howto.settings.s3"] },
];

export default async function HowToUsePage() {
  const { t } = await getT();
  return (
    <>
      <ScreenHeader
        title={t("howto.title")}
        art="/brand/header-reviews.webp"
        back={
          <Link href="/menu" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
            <ArrowLeft size={16} />
          </Link>
        }
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
        <p className="muted px-0.5 text-[12px]">{t("howto.subtitle")}</p>
        {features.map((feature) => (
          <section key={feature.key} className="g-card p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--electric)]">
                {feature.icon}
              </span>
              <h2 className="text-[15px] font-semibold">{t(`howto.${feature.key}.title` as MessageKey)}</h2>
              <WolfMark size={18} className="ml-auto opacity-60" />
            </div>
            <p className="muted mt-1.5 text-[12.5px] leading-relaxed">{t(`howto.${feature.key}.body` as MessageKey)}</p>
            <ol className="mt-2 flex flex-col gap-1.5">
              {feature.steps.map((step, index) => (
                <li key={step} className="flex items-start gap-2 text-[12.5px]">
                  <span
                    className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: "linear-gradient(140deg,#318BFF,#8B4DFF)" }}
                  >
                    {index + 1}
                  </span>
                  <span>{t(step)}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
