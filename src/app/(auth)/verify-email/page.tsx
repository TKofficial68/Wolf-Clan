import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getT } from "@/i18n/server";

export default async function VerifyEmailPage() {
  const { t } = await getT();
  return (
    <div className="app-frame">
      <div className="app-body">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(79,195,255,0.5)] bg-[rgba(79,195,255,0.1)] text-[var(--electric)]">
            <MailCheck size={28} />
          </span>
          <h1 className="text-[20px] font-bold">{t("auth.verifyEmailTitle")}</h1>
          <p className="muted max-w-[300px] text-[13px]">{t("auth.verifyNotice")}</p>
          <Link href="/login" className="btn btn-primary mt-2">
            {t("auth.login")}
          </Link>
        </div>
      </div>
    </div>
  );
}
