import Link from "next/link";
import { ArrowLeft, Clock, Mail, Smartphone } from "lucide-react";
import { getT } from "@/i18n/server";
import { ScreenHeader } from "@/components/ui";
import { WolfMark } from "@/components/wolf-art";
import { APP } from "@/lib/roles";

export default async function AboutPage() {
  const { t } = await getT();
  const rows: { label: string; value: string; href?: string }[] = [
    { label: t("about.app"), value: "Wolf Clan" },
    { label: t("about.version"), value: APP.version },
    { label: t("about.developer"), value: "Mr TK" },
    { label: t("about.team"), value: "TK OFFICIAL" },
    { label: t("about.contact"), value: "tkofficial68@gmail.com", href: "mailto:tkofficial68@gmail.com" },
  ];
  return (
    <>
      <ScreenHeader
        title={t("about.title")}
        art="/brand/header.webp"
        back={
          <Link href="/menu" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
            <ArrowLeft size={16} />
          </Link>
        }
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
        <div className="g-card relative flex flex-col items-center gap-2 p-5 text-center">
          <WolfMark size={54} />
          <p className="brush-title text-[28px]">Wolf Clan</p>
          <p className="muted max-w-[310px] text-[12.5px] leading-relaxed">{t("about.intro")}</p>
        </div>
        <div className="g-card p-3.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-b-0">
              <span className="muted text-[12px]">{row.label}</span>
              {row.href ? (
                <a href={row.href} className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--electric)]">
                  <Mail size={13} /> {row.value}
                </a>
              ) : (
                <span className="text-[13px] font-medium">{row.value}</span>
              )}
            </div>
          ))}
        </div>
        <div className="g-card-flat flex items-start gap-2 p-3">
          <Clock size={15} className="mt-0.5 flex-none text-[var(--electric)]" />
          <p className="muted text-[12px]">{t("about.timezone")}</p>
        </div>
        <div className="g-card-flat flex items-start gap-2 p-3">
          <Smartphone size={15} className="mt-0.5 flex-none text-[var(--electric)]" />
          <p className="muted text-[12px]">{t("settings.installHint")}</p>
        </div>
      </div>
    </>
  );
}
