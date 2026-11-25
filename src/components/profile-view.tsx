import Link from "next/link";
import {
  CalendarDays,
  Crown,
  Mail,
  MessageSquare,
  Pencil,
  Settings,
  UserRound,
  Users,
  UserX,
} from "lucide-react";
import type { MessageKey, Translator } from "@/i18n";
import { formatMonthYear } from "@/lib/time";
import { avatarUrl } from "@/lib/home-data";
import { ScreenHeader, Avatar, NameWithTag } from "./ui";
import { AvatarEnlarge } from "./avatar-enlarge";
import { BlockButton } from "./block-button";

export type ProfileViewData = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  title: string | null;
  bio: string | null;
  avatarUploadId: string | null;
  createdAt: string;
  email?: string;
};

export function ProfileView({
  profile,
  isOwn,
  locale,
  t,
  blocked,
}: {
  profile: ProfileViewData;
  isOwn: boolean;
  locale: "en" | "bn";
  t: Translator;
  blocked?: boolean;
}) {
  const joined = formatMonthYear(profile.createdAt, locale);
  const cells: { icon: React.ReactNode; label: string; value: string; accent?: string }[] = [
    { icon: <UserRound size={16} />, label: t("profile.username"), value: profile.username },
    { icon: <CalendarDays size={16} />, label: t("profile.joined"), value: joined },
    { icon: <Crown size={16} />, label: t("profile.role"), value: profile.title || "—" },
    { icon: <Users size={16} />, label: t("profile.team"), value: t(`role.${profile.role}` as MessageKey) },
  ];

  return (
    <>
      <ScreenHeader
        title={t("profile.title")}
        art="/brand/header-profile.webp"
        right={
          isOwn ? (
            <Link href="/menu" className="icon-btn" aria-label={t("profile.settings")}>
              <Settings size={18} />
            </Link>
          ) : undefined
        }
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 0 }}>
        <div className="relative -mt-8 flex flex-col items-center gap-1.5">
          <div className="relative">
            <AvatarEnlarge name={profile.displayName} src={avatarUrl(profile.avatarUploadId)} mediaId={profile.avatarUploadId} />
            {isOwn ? (
              <Link
                href="/profile/edit"
                aria-label={t("profile.edit")}
                className="absolute -right-1 bottom-0 flex h-8 w-8 items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(140deg,#318BFF,#8B4DFF)", border: "2px solid var(--bg)" }}
              >
                <Pencil size={14} />
              </Link>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-1.5 text-center">
            <h2 className="text-[19px] font-bold leading-tight">{profile.displayName}</h2>
            {profile.role === "OWNER" ? <Crown size={17} style={{ color: "var(--gold)" }} aria-hidden="true" /> : null}
          </div>
          <NameWithTag name="" role={profile.role} title={profile.title} size={12.5} />
          {isOwn && profile.email ? (
            <p className="muted flex items-center gap-1.5 text-[12.5px]">
              <Mail size={13} /> {profile.email}
            </p>
          ) : null}
          {!isOwn ? (
            <div className="mt-1 flex w-full flex-col gap-1.5">
              {blocked ? (
                <p className="tiny flex items-center gap-1.5" style={{ color: "var(--danger)" }}>
                  <UserX size={13} /> {t("profile.blockedNotice")}
                </p>
              ) : (
                <Link href={`/chat/new?user=${profile.id}`} className="btn btn-primary w-full">
                  <MessageSquare size={15} /> {t("profile.message")}
                </Link>
              )}
              <BlockButton userId={profile.id} blocked={blocked ?? false} />
            </div>
          ) : null}
        </div>

        <div className="g-card grid grid-cols-4 gap-1 px-1 py-2.5">
          {cells.map((cell, index) => (
            <div
              key={cell.label}
              className="flex flex-col items-center gap-0.5 px-1 text-center"
              style={{ borderLeft: index === 0 ? "none" : "1px solid var(--border)" }}
            >
              <span style={{ color: "var(--electric)" }}>{cell.icon}</span>
              <span className="muted text-[9.5px] uppercase tracking-[0.08em]">{cell.label}</span>
              <span className="w-full truncate text-[11.5px] font-semibold" title={cell.value}>
                {cell.value}
              </span>
            </div>
          ))}
        </div>

        <div className="g-card p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--electric)]">
                <UserRound size={12} />
              </span>
              {t("profile.about")}
            </h3>
            {isOwn ? (
              <Link href="/profile/edit" className="icon-btn h-8 w-8" aria-label={t("profile.edit")}>
                <Pencil size={13} />
              </Link>
            ) : null}
          </div>
          <p className={`mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed ${profile.bio ? "" : "muted italic"}`}>
            {profile.bio || (isOwn ? t("profile.addBio") : t("profile.noBio"))}
          </p>
        </div>
      </div>
    </>
  );
}
