import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function ForbiddenPage() {
  const { t } = await getT();
  return (
    <div className="app-frame">
      <div className="app-body">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <p className="text-[20px] font-bold" style={{ color: "var(--danger)" }}>{t("errors.forbiddenTitle")}</p>
          <p className="muted text-[13px]">{t("errors.forbiddenBody")}</p>
          <Link href="/home" className="btn btn-primary mt-2">{t("errors.home")}</Link>
        </div>
      </div>
    </div>
  );
}
