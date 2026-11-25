import { getSessionUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { ShieldAlert } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

export default async function BlockedPage() {
  const user = await getSessionUser();
  const { t } = await getT();
  return (
    <div className="app-frame">
      <div className="app-body">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(239,68,68,0.5)] bg-[rgba(239,68,68,0.1)]" style={{ color: "var(--danger)" }}>
            <ShieldAlert size={28} />
          </span>
          <h1 className="text-[20px] font-bold">{t("auth.bannedTitle")}</h1>
          <p className="muted text-[13px]">{user?.banReason || t("auth.bannedFallback")}</p>
          {user ? <LogoutButton label={t("auth.logout")} className="btn btn-ghost mt-2" /> : null}
        </div>
      </div>
    </div>
  );
}
