"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Spinner } from "./ui";

export function JoinScreen({ code, title }: { code: string; title: string }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "invalid" | "ready" | "pending" | "done">("loading");
  const [groupName, setGroupName] = useState<string | null>(null);

  useEffect(() => {
    void api<{ valid: boolean; group?: { name: string } | null }>(`/api/invites?code=${encodeURIComponent(code)}`).then((result) => {
      if (result.ok && result.data.valid) {
        setGroupName(result.data.group?.name ?? null);
        setState("ready");
      } else setState("invalid");
    });
  }, [code]);

  return (
    <div className="screen flex flex-col gap-2.5 pt-8">
      <div className="g-card flex flex-col items-center gap-2 p-5 text-center">
        <Users size={24} className="text-[var(--electric)]" />
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="muted tiny">{t("join.body")}</p>
        <p className="text-[12px] font-mono">{code}</p>
        {groupName ? <p className="muted text-[12px]">{groupName}</p> : null}
        {state === "loading" ? <Spinner /> : null}
        {state === "invalid" ? <p className="text-[12px]" style={{ color: "var(--danger)" }}>{t("join.invalid")}</p> : null}
        {state === "pending" ? <p className="text-[12px]" style={{ color: "var(--warning)" }}>{t("join.pending")}</p> : null}
        {state === "done" ? <p className="text-[12px]" style={{ color: "var(--success)" }}>{t("join.joined")}</p> : null}
        {state === "ready" ? (
          <button
            type="button"
            className="btn btn-primary mt-1"
            onClick={async () => {
              const result = await api<{ pending?: boolean; groupId?: string | null }>("/api/invites", { method: "POST", body: { action: "join", code } });
              if (!result.ok) {
                toast(t("join.invalid"), "error");
                return;
              }
              if (result.data.pending) {
                setState("pending");
                return;
              }
              setState("done");
              toast(t("join.joined"), "success");
              router.push(result.data.groupId ? `/groups/${result.data.groupId}` : "/home");
            }}
          >
            {t("join.submit")}
          </button>
        ) : null}
        <Link href="/home" className="muted mt-1 text-[11.5px] underline">{t("errors.home")}</Link>
      </div>
    </div>
  );
}
