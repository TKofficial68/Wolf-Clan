import { getT } from "@/i18n/server";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Wolf Clan — Offline" };

export default async function OfflinePage() {
  const { t } = await getT();
  return (
    <div className="app-frame">
      <div className="app-body">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] text-[var(--warning)]">
            <WifiOff size={26} />
          </span>
          <h1 className="text-[20px] font-bold">{t("offline.title")}</h1>
          <p className="muted max-w-[300px] text-[13px]">{t("offline.body")}</p>
          <a href="/home" className="btn btn-primary mt-1">
            {t("common.retry")}
          </a>
        </div>
      </div>
    </div>
  );
}
