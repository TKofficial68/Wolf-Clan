import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { OwnerScreen } from "@/components/owner-screen";

const SECTIONS = ["dashboard","members","admins","permissions","groups","invites","branding","reviews","reports","bans","security","audit","storage","notifications","system"];

export default async function OwnerPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const user = await requireUser();
  const { t } = await getT();
  if (user.role !== "OWNER") {
    return (
      <div className="screen flex flex-col items-center gap-2 pt-10 text-center">
        <p className="text-[18px] font-bold" style={{ color: "var(--danger)" }}>{t("errors.forbiddenTitle")}</p>
        <p className="muted text-[12.5px]">{t("errors.forbiddenBody")}</p>
      </div>
    );
  }
  const { section } = await params;
  const current = section?.[0] ?? "dashboard";
  if (!SECTIONS.includes(current)) notFound();
  return <OwnerScreen section={current} />;
}
