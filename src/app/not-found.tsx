import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="app-frame">
      <div className="app-body">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <p className="text-[20px] font-bold">{t("errors.notFoundTitle")}</p>
          <p className="muted text-[13px]">{t("errors.notFoundBody")}</p>
          <Link href="/home" className="btn btn-primary mt-2">{t("errors.home")}</Link>
        </div>
      </div>
    </div>
  );
}
