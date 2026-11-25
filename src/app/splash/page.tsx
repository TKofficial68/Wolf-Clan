import Link from "next/link";
import { WolfMark } from "@/components/wolf-art";
import { getT } from "@/i18n/server";

export default async function SplashPage() {
  const { t } = await getT();
  return (
    <div className="app-frame">
      <div className="app-body">
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <WolfMark size={84} />
          <p className="brush-title text-[34px]">{t("common.appName")}</p>
          <p className="muted text-[11px]">{t("splash.loading")}</p>
          <Link href="/" className="btn btn-ghost mt-3">{t("common.continue")}</Link>
        </div>
      </div>
    </div>
  );
}
