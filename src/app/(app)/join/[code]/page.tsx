import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { JoinScreen } from "@/components/join-screen";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  await requireUser();
  const { code } = await params;
  const { t } = await getT();
  return <JoinScreen code={code} title={t("join.title")} />;
}
